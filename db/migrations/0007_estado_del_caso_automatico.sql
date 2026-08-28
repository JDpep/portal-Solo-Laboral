-- ============================================================================
-- EL ESTADO "EVENTO AGENDADO" SE MANTIENE SOLO
--
-- `cases.status` se movía a mano. Pero uno de sus valores no es un juicio de
-- nadie: "Evento agendado" es un HECHO comprobable —o hay una cita por delante
-- o no la hay— y mantenerlo a mano solo garantiza que quede desactualizado en
-- cuanto la cita pasa. En producción ya había un caso marcado "Evento agendado"
-- sin ningún evento vivo.
--
-- Así que ese lo lleva la base:
--
--   aparece un evento futuro  ->  'active'    pasa a 'scheduled'
--   se queda sin eventos      ->  'scheduled' vuelve a 'active'
--
-- SOLO ENTRE ESOS DOS. 'waiting_client' y 'in_process' SÍ son juicios de la
-- persona que lleva el asunto —"estoy esperando a que me manden el contrato" no
-- se deduce de ninguna tabla— y el trigger no los toca. Un caso cerrado tampoco.
-- Automatizar un juicio ajeno es peor que no automatizar nada: la próxima vez
-- que alguien escriba "esperando cliente" y lo vea desaparecer, deja de usar el
-- campo.
-- ============================================================================

CREATE OR REPLACE FUNCTION sincronizar_estado_por_agenda(p_case_id uuid) RETURNS void AS $$
DECLARE
  v_estado    case_status;
  v_pendiente boolean;
BEGIN
  IF p_case_id IS NULL THEN RETURN; END IF;

  SELECT status INTO v_estado FROM cases WHERE id = p_case_id FOR UPDATE;
  IF v_estado IS NULL OR v_estado NOT IN ('active', 'scheduled') THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM calendar_events
    WHERE case_id = p_case_id AND status = 'scheduled' AND start_at >= now()
  ) INTO v_pendiente;

  IF v_pendiente AND v_estado = 'active' THEN
    UPDATE cases SET status = 'scheduled' WHERE id = p_case_id;
    INSERT INTO case_status_history (case_id, previous_status, new_status, reason)
    VALUES (p_case_id, 'active', 'scheduled', 'Tiene un evento por delante');

  ELSIF NOT v_pendiente AND v_estado = 'scheduled' THEN
    UPDATE cases SET status = 'active' WHERE id = p_case_id;
    INSERT INTO case_status_history (case_id, previous_status, new_status, reason)
    VALUES (p_case_id, 'scheduled', 'active', 'Se quedó sin eventos por delante');
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION estado_por_agenda() RETURNS trigger AS $$
BEGIN
  -- En un UPDATE que mueve el evento de caso hay que revisar los DOS.
  IF TG_OP <> 'INSERT' AND OLD.case_id IS DISTINCT FROM NEW.case_id THEN
    PERFORM sincronizar_estado_por_agenda(OLD.case_id);
  END IF;
  PERFORM sincronizar_estado_por_agenda(NEW.case_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agenda_mueve_el_estado_del_caso
  AFTER INSERT OR UPDATE OF case_id, status, start_at ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION estado_por_agenda();

-- ------------------------------------------------------ los que ya estaban mal
-- "Evento agendado" sin ningún evento vivo por delante: se corrige ahora.
WITH desfasados AS (
  SELECT c.id
  FROM cases c
  WHERE c.status = 'scheduled'
    AND NOT EXISTS (
      SELECT 1 FROM calendar_events e
      WHERE e.case_id = c.id AND e.status = 'scheduled' AND e.start_at >= now()
    )
),
historiado AS (
  INSERT INTO case_status_history (case_id, previous_status, new_status, reason)
  SELECT id, 'scheduled', 'active', 'Se quedó sin eventos por delante' FROM desfasados
  RETURNING case_id
)
UPDATE cases SET status = 'active' WHERE id IN (SELECT id FROM desfasados);
