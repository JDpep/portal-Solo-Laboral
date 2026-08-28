-- ============================================================================
-- LA AGENDA SE ALIMENTA SOLA
--
-- Hasta aquí el calendario solo recibía lo que pedía el prospecto desde la web
-- (la llamada agendada y la llamada próxima). Todo lo demás —una audiencia, una
-- conciliación, la fecha en que hay que tener la documentación— habría habido
-- que capturarlo dos veces: una en la ruta del caso y otra en el calendario. Un
-- dato capturado dos veces son dos datos, y a la semana no coinciden.
--
-- Así que no hay dos capturas. El paso de la ruta ES el evento: se le pone
-- fecha al paso y el calendario lo muestra. Lo hace un TRIGGER y no la
-- aplicación, porque la aplicación no es la única puerta: un script de
-- corrección o una consulta a mano tienen que producir el mismo calendario.
--
--   fecha en el paso        -> evento agendado
--   se quita la fecha       -> evento cancelado (no se borra: nada se borra)
--   paso completado         -> evento realizado
--   paso marcado "no aplica"-> evento cancelado
-- ============================================================================

-- ------------------------------------------------------------------ la ruta
-- Cuándo toca. NULL = el paso no tiene fecha comprometida, que es lo normal en
-- la mayoría: "solicitar documentación" se hace cuando se puede, "audiencia"
-- tiene día y hora.
ALTER TABLE case_checklist_items
  ADD COLUMN due_at timestamptz;

-- Qué clase de cita es, para que la agenda la sepa pintar y filtrar. El valor
-- por omisión es el más inocuo: un seguimiento. Quien ponga la fecha elige.
ALTER TABLE case_checklist_items
  ADD COLUMN event_type event_type NOT NULL DEFAULT 'follow_up';

-- -------------------------------------------------------------- el calendario
ALTER TABLE calendar_events
  ADD COLUMN checklist_item_id uuid REFERENCES case_checklist_items(id) ON DELETE CASCADE;

-- UN evento por paso. Es lo que permite que el trigger haga UPSERT en vez de
-- consultar antes: mover la fecha de una audiencia tres veces deja UNA
-- audiencia en la agenda, no tres.
CREATE UNIQUE INDEX un_evento_por_paso
  ON calendar_events (checklist_item_id)
  WHERE checklist_item_id IS NOT NULL;

-- ------------------------------------------------------------------ el enlace
CREATE OR REPLACE FUNCTION sync_checklist_event() RETURNS trigger AS $$
DECLARE
  estado_evento event_status;
BEGIN
  -- Un paso sin fecha que sigue sin fecha no tiene nada que sincronizar. Sin
  -- esta salida temprana, cada vez que alguien escribiera una nota se lanzaría
  -- un UPDATE sobre el calendario para no cambiar nada.
  IF NEW.due_at IS NULL AND (TG_OP = 'INSERT' OR OLD.due_at IS NULL) THEN
    RETURN NEW;
  END IF;

  -- Se quitó la fecha: el evento se cancela, no se borra. Si alguien preguntara
  -- mañana "¿no teníamos audiencia el jueves?", la respuesta tiene que existir.
  IF NEW.due_at IS NULL THEN
    UPDATE calendar_events
       SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, now())
     WHERE checklist_item_id = NEW.id AND status <> 'cancelled';
    RETURN NEW;
  END IF;

  estado_evento := CASE
    WHEN NEW.status = 'completed'       THEN 'done'
    WHEN NEW.status = 'not_applicable'  THEN 'cancelled'
    ELSE 'scheduled'
  END;

  INSERT INTO calendar_events (
    case_id, checklist_item_id, event_type, title, description,
    start_at, status, source, assigned_user_id, cancelled_at
  ) VALUES (
    NEW.case_id, NEW.id, NEW.event_type, NEW.title, NEW.description,
    NEW.due_at, estado_evento, 'system', NEW.assigned_user_id,
    CASE WHEN estado_evento = 'cancelled' THEN now() ELSE NULL END
  )
  ON CONFLICT (checklist_item_id) WHERE checklist_item_id IS NOT NULL
  DO UPDATE SET
    event_type       = EXCLUDED.event_type,
    title            = EXCLUDED.title,
    description      = EXCLUDED.description,
    start_at         = EXCLUDED.start_at,
    status           = EXCLUDED.status,
    assigned_user_id = EXCLUDED.assigned_user_id,
    cancelled_at     = EXCLUDED.cancelled_at;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- AFTER: el paso ya está escrito y validado cuando se refleja en la agenda.
-- Si el paso no entra, el evento tampoco — que es justo lo que se quiere.
CREATE TRIGGER checklist_items_alimentan_agenda
  AFTER INSERT OR UPDATE ON case_checklist_items
  FOR EACH ROW EXECUTE FUNCTION sync_checklist_event();

-- ------------------------------------------------------- índice de la agenda
-- La agenda pregunta siempre lo mismo: "qué hay entre estas dos fechas".
CREATE INDEX eventos_agenda ON calendar_events (start_at, status)
  WHERE status <> 'cancelled';
