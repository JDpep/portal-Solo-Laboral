-- ============================================================================
-- LA PLANTILLA SE EDITA DESDE EL PORTAL
--
-- Hasta aquí los pasos de la ruta se cambiaban con SQL a mano. Al abrirlos a
-- una pantalla aparecen dos agujeros que la base tiene que tapar ANTES, porque
-- una vez que alguien pueda pulsar el botón ya será tarde:
--
--   1. BORRAR UN PASO DE LA PLANTILLA rompía los casos que lo usaron. La clave
--      ajena era ON DELETE SET NULL: al borrar el paso, todos los casos que lo
--      llevaban perdían la referencia. Y esa referencia es justo con la que la
--      cuadrícula de Seguimiento empareja cada casilla con su columna, así que
--      un solo borrado habría vaciado una columna entera de casos vivos.
--
--      Ahora es RESTRICT: un paso que algún caso usó NO SE PUEDE BORRAR, ni
--      desde la aplicación ni desde una consola. Se RETIRA.
--
--   2. RETIRAR no existía. Un paso retirado deja de copiarse a los casos
--      nuevos, pero sigue existiendo entero en los casos que ya lo llevan:
--      cambiar el procedimiento del despacho no puede reescribir el expediente
--      de un asunto en curso.
-- ============================================================================

-- Un paso retirado no se borra: deja de aplicarse a lo que venga.
ALTER TABLE case_checklist_template_items
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- El orden se lee siempre entre los vigentes; el índice lo acompaña.
CREATE INDEX pasos_plantilla_vigentes
  ON case_checklist_template_items (template_id, position)
  WHERE is_active;

-- ------------------------------------------------------- el borrado, cerrado
ALTER TABLE case_checklist_items
  DROP CONSTRAINT case_checklist_items_template_item_id_fkey;

ALTER TABLE case_checklist_items
  ADD CONSTRAINT case_checklist_items_template_item_id_fkey
  FOREIGN KEY (template_item_id)
  REFERENCES case_checklist_template_items(id) ON DELETE RESTRICT;

-- ------------------------------------- la conversión solo copia lo vigente
-- Se reemplaza entera para cambiar una línea: un paso retirado no entra en los
-- casos nuevos. Las posiciones se renumeran con row_number() para que la ruta
-- de un caso quede 1..N sin huecos aunque la plantilla los tenga.
CREATE OR REPLACE FUNCTION convert_lead_to_case(
  p_lead_id     uuid,
  p_user_id     uuid,
  p_assigned_to uuid DEFAULT NULL,
  p_template_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_lead     leads%ROWTYPE;
  v_template uuid;
  v_case_id  uuid;
BEGIN
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_no_encontrado';
  END IF;
  IF NOT v_lead.visible_to_staff THEN
    RAISE EXCEPTION 'lead_no_visible';
  END IF;
  IF EXISTS (SELECT 1 FROM cases WHERE lead_id = p_lead_id) THEN
    RAISE EXCEPTION 'lead_ya_convertido';
  END IF;

  v_template := COALESCE(
    p_template_id,
    (SELECT id FROM case_checklist_templates WHERE is_default AND is_active LIMIT 1)
  );
  IF v_template IS NULL THEN
    RAISE EXCEPTION 'plantilla_no_encontrada';
  END IF;

  INSERT INTO cases (folio, lead_id, assigned_user_id, created_by)
  VALUES (v_lead.folio, v_lead.id, p_assigned_to, p_user_id)
  RETURNING id INTO v_case_id;

  -- Se COPIAN los pasos, no se referencian: si mañana cambia la plantilla, los
  -- casos en curso no cambian solos debajo de quien los está trabajando.
  INSERT INTO case_checklist_items (case_id, template_item_id, title, description, position)
  SELECT v_case_id, i.id, i.title, i.description,
         row_number() OVER (ORDER BY i.position)
  FROM case_checklist_template_items i
  WHERE i.template_id = v_template AND i.is_active;

  UPDATE leads
  SET status = 'converted', case_id = v_case_id, converted_to_case_at = now()
  WHERE id = v_lead.id;

  -- Las llamadas y eventos que ya tenía el lead siguen al caso. No se
  -- recapturan y no se pierden: se les añade el caso, conservando el lead.
  UPDATE calendar_events SET case_id = v_case_id
  WHERE lead_id = v_lead.id AND case_id IS NULL;

  INSERT INTO case_status_history (case_id, previous_status, new_status, changed_by, reason)
  VALUES (v_case_id, NULL, 'active', p_user_id, 'Conversión desde lead');

  INSERT INTO audit_logs (user_id, action, entity, entity_id, after)
  VALUES (
    p_user_id, 'lead_convert_to_case', 'case', v_case_id,
    jsonb_build_object('leadId', v_lead.id, 'folio', v_lead.folio)
  );

  RETURN v_case_id;
END;
$$;

-- --------------------------------------------- al menos un paso vigente
-- Una plantilla sin pasos vigentes produce casos sin ruta: se convierten, no
-- fallan, y aparecen en Seguimiento con una cuadrícula sin columnas y un
-- progreso 0/0 que nadie puede avanzar. Es peor que un error, porque no avisa.
CREATE OR REPLACE FUNCTION exigir_paso_vigente() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM case_checklist_template_items
    WHERE template_id = COALESCE(NEW.template_id, OLD.template_id) AND is_active
  ) THEN
    RAISE EXCEPTION 'plantilla_sin_pasos';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER plantilla_con_al_menos_un_paso
  AFTER UPDATE OR DELETE ON case_checklist_template_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION exigir_paso_vigente();
