-- ============================================================================
-- TERMINAR LA RUTA CIERRA EL CASO
--
-- Hasta aquí completar los ocho pasos dejaba el caso en 8/8 y quieto en
-- Seguimiento: cerrarlo era un botón aparte que había que acordarse de pulsar.
-- El último paso de la plantilla se llama literalmente "Cerrar caso", así que
-- marcarlo YA ES la decisión de cerrar; pedir además un formulario era pedir
-- que la misma decisión se tomara dos veces, y la segunda se olvida.
--
-- El efecto: cuando no queda ningún paso pendiente ni en proceso, el caso pasa
-- a `completed`, se le pone motivo 'completed' y sale del seguimiento hacia el
-- histórico. No se pierde nada y no es irreversible: conserva su ruta, su
-- agenda y su historia, y el botón de reabrir sigue ahí.
--
-- QUÉ NO HACE. No cierra un caso donde todos los pasos quedaron en "no aplica":
-- eso no es haber terminado el trabajo, es no haber hecho ninguno, y cerrarlo
-- como concluido diría algo falso en las métricas del histórico.
-- ============================================================================

CREATE OR REPLACE FUNCTION cerrar_caso_si_la_ruta_termino() RETURNS trigger AS $$
DECLARE
  v_pendientes  integer;
  v_completados integer;
  v_estado      case_status;
BEGIN
  SELECT
    count(*) FILTER (WHERE status IN ('pending', 'in_progress')),
    count(*) FILTER (WHERE status = 'completed')
    INTO v_pendientes, v_completados
  FROM case_checklist_items
  WHERE case_id = NEW.case_id;

  -- Queda trabajo, o no se completó ni un paso: no hay nada que cerrar.
  IF v_pendientes > 0 OR v_completados = 0 THEN
    RETURN NULL;
  END IF;

  SELECT status INTO v_estado FROM cases WHERE id = NEW.case_id FOR UPDATE;

  -- Solo alcanza a los casos que siguen abiertos. Un caso ya cerrado —o
  -- descartado— no se reabre ni se reescribe porque alguien toque un paso.
  IF v_estado IS NULL
     OR v_estado NOT IN ('active', 'waiting_client', 'scheduled', 'in_process') THEN
    RETURN NULL;
  END IF;

  UPDATE cases SET
    status        = 'completed',
    closed_at     = now(),
    closed_reason = 'completed',
    closed_by     = NEW.completed_by,
    closed_note   = 'Cerrado solo al completarse todos los pasos de la ruta.'
  WHERE id = NEW.case_id;

  -- El historial no se salta este cierre: sin su renglón, el histórico no
  -- podría reconstruir cuándo dejó de trabajarse el asunto.
  INSERT INTO case_status_history (case_id, previous_status, new_status, changed_by, reason)
  VALUES (NEW.case_id, v_estado, 'completed', NEW.completed_by,
          'Ruta completada');

  -- Lo que quedara agendado por delante se cancela, igual que en un cierre a
  -- mano: dejarlo vivo llena la agenda de citas de asuntos que ya no existen.
  UPDATE calendar_events
     SET status = 'cancelled', cancelled_at = now()
   WHERE case_id = NEW.case_id AND status = 'scheduled' AND start_at >= now();

  INSERT INTO audit_logs (user_id, action, entity, entity_id, after)
  VALUES (NEW.completed_by, 'case_close', 'case', NEW.case_id,
          jsonb_build_object('reason', 'completed', 'automatico', true));

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- AFTER, y solo cuando un paso pasa a completado: es el único movimiento que
-- puede dejar la ruta terminada.
CREATE TRIGGER caso_se_cierra_al_terminar_la_ruta
  AFTER UPDATE OF status ON case_checklist_items
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION cerrar_caso_si_la_ruta_termino();

-- ------------------------------------------------- los que ya estaban al día
-- Un caso terminado antes de que existiera este trigger se quedó atrapado en
-- Seguimiento con su 8/8. Se cierran ahora, con la misma regla y dejando su
-- renglón en el historial.
WITH terminados AS (
  SELECT c.id, c.status
  FROM cases c
  WHERE c.status IN ('active', 'waiting_client', 'scheduled', 'in_process')
    AND EXISTS (
      SELECT 1 FROM case_checklist_items i
      WHERE i.case_id = c.id AND i.status = 'completed'
    )
    AND NOT EXISTS (
      SELECT 1 FROM case_checklist_items i
      WHERE i.case_id = c.id AND i.status IN ('pending', 'in_progress')
    )
),
historiado AS (
  INSERT INTO case_status_history (case_id, previous_status, new_status, reason)
  SELECT id, status, 'completed', 'Ruta completada' FROM terminados
  RETURNING case_id
)
UPDATE cases SET
  status        = 'completed',
  closed_at     = now(),
  closed_reason = 'completed',
  closed_note   = 'Cerrado al completarse todos los pasos de la ruta.'
WHERE id IN (SELECT id FROM terminados);
