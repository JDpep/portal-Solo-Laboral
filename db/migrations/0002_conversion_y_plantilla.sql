-- ============================================================================
-- CONVERSIÓN LEAD → CASO, y la plantilla de la ruta del caso.
--
-- La conversión vive en la BASE, no en la aplicación, porque tiene que ser
-- una sola operación: crear el caso, copiar los pasos, mover el lead, anotar
-- el estado y firmar la bitácora. Si algo de eso falla a la mitad, queda un
-- caso a medias que nadie sabe reparar. Aquí, o entra todo o no entra nada.
-- ============================================================================

-- ------------------------------------------------- plantilla inicial (DEMO)
-- ESTOS NO SON LOS PASOS JURÍDICOS DEFINITIVOS. Son un punto de partida
-- editable: Solo Laboral define el flujo real después, y cambiarlo es cambiar
-- estas filas, no la aplicación.
INSERT INTO case_checklist_templates (name, description, is_default)
VALUES (
  'Ruta general del caso',
  'Plantilla inicial de demostración. Los pasos definitivos los define el despacho.',
  true
);

INSERT INTO case_checklist_template_items (template_id, title, description, position)
SELECT t.id, v.title, v.description, v.position
FROM case_checklist_templates t,
  (VALUES
    ('Contactar al cliente',            'Primera llamada tras la conversión.',                    1),
    ('Solicitar documentación',         'Contrato, recibos de nómina, identificación, pruebas.',  2),
    ('Revisar información recibida',    'Verificar que lo entregado sustente el asunto.',          3),
    ('Definir si procede continuar',    'Decisión del despacho sobre la viabilidad.',              4),
    ('Preparar siguiente actuación',    'Escrito, demanda o citatorio según corresponda.',         5),
    ('Audiencia o conciliación',        'Registrar la fecha en el calendario cuando se conozca.',  6),
    ('Registrar resultado',             'Qué se obtuvo y en qué términos.',                        7),
    ('Cerrar caso',                     'Cierre formal y paso al histórico.',                      8)
  ) AS v(title, description, position)
WHERE t.is_default;

-- ------------------------------------------------------------ etapa actual
-- `cases.current_stage` no se escribe a mano desde la aplicación: sale del
-- primer paso sin terminar de la ruta. Mantenerlo con un trigger evita que la
-- etapa que se lee en Seguimiento contradiga la ruta que se ve al abrir.
CREATE OR REPLACE FUNCTION refresh_case_stage() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_case uuid := COALESCE(NEW.case_id, OLD.case_id);
  stage text;
BEGIN
  SELECT title INTO stage
  FROM case_checklist_items
  WHERE case_id = target_case AND status IN ('in_progress', 'pending')
  ORDER BY
    -- El paso en curso manda sobre el siguiente pendiente.
    (status = 'in_progress') DESC, position
  LIMIT 1;

  UPDATE cases SET current_stage = COALESCE(stage, '') WHERE id = target_case;
  RETURN NULL;
END $$;

CREATE TRIGGER checklist_actualiza_etapa
  AFTER INSERT OR UPDATE OR DELETE ON case_checklist_items
  FOR EACH ROW EXECUTE FUNCTION refresh_case_stage();

-- ------------------------------------------------------------- conversión
-- Devuelve el id del caso creado. Falla —y deshace todo— si el lead no existe,
-- no es visible para el despacho, o ya se convirtió.
CREATE OR REPLACE FUNCTION convert_lead_to_case(
  p_lead_id     uuid,
  p_user_id     uuid,
  p_assigned_to uuid DEFAULT NULL,
  p_template_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_lead     leads%ROWTYPE;
  v_case_id  uuid;
  v_template uuid;
BEGIN
  -- FOR UPDATE: dos abogados pulsando "Convertir en caso" a la vez se serializan
  -- aquí. El segundo encuentra el lead ya convertido y se va con un error claro,
  -- en vez de chocar contra la UNIQUE con un mensaje de Postgres.
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_no_encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT v_lead.visible_to_staff THEN
    -- Un envío que no pasó el filtro no existe para el portal, así que tampoco
    -- puede convertirse adivinando su id.
    RAISE EXCEPTION 'lead_no_visible' USING ERRCODE = 'raise_exception';
  END IF;
  IF v_lead.case_id IS NOT NULL THEN
    RAISE EXCEPTION 'lead_ya_convertido' USING ERRCODE = 'unique_violation';
  END IF;

  -- El caso hereda el folio: una sola referencia para la misma persona desde
  -- que llega hasta que se cierra su asunto.
  INSERT INTO cases (folio, lead_id, status, assigned_user_id, created_by)
  VALUES (v_lead.folio, v_lead.id, 'active', p_assigned_to, p_user_id)
  RETURNING id INTO v_case_id;

  IF p_template_id IS NULL THEN
    SELECT id INTO v_template FROM case_checklist_templates WHERE is_default AND is_active;
  ELSE
    SELECT id INTO v_template FROM case_checklist_templates WHERE id = p_template_id AND is_active;
  END IF;

  IF v_template IS NULL THEN
    RAISE EXCEPTION 'plantilla_no_encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Se COPIAN los pasos, no se referencian: si mañana cambia la plantilla, los
  -- casos en curso no cambian solos debajo de quien los está trabajando.
  INSERT INTO case_checklist_items (case_id, template_item_id, title, description, position)
  SELECT v_case_id, i.id, i.title, i.description, i.position
  FROM case_checklist_template_items i
  WHERE i.template_id = v_template
  ORDER BY i.position;

  UPDATE leads
  SET status = 'converted', case_id = v_case_id, converted_to_case_at = now()
  WHERE id = v_lead.id;

  -- Las llamadas y eventos que ya tenía el lead siguen al caso. No se
  -- recapturan y no se pierden: se les añade el caso, conservando el lead.
  UPDATE calendar_events SET case_id = v_case_id
  WHERE lead_id = v_lead.id AND case_id IS NULL;

  INSERT INTO case_status_history (case_id, previous_status, new_status, changed_by, reason)
  VALUES (v_case_id, NULL, 'active', p_user_id, 'Conversión desde lead');

  INSERT INTO audit_logs (user_id, action, entity, entity_id, before, after)
  VALUES (
    p_user_id, 'lead_convert_to_case', 'case', v_case_id,
    jsonb_build_object('lead_id', v_lead.id, 'lead_status', v_lead.status),
    jsonb_build_object('case_id', v_case_id, 'folio', v_lead.folio, 'assigned_user_id', p_assigned_to)
  );

  RETURN v_case_id;
END $$;
