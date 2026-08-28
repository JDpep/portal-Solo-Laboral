-- ============================================================================
-- SOLO LABORAL — Portal interno
-- Esquema base: usuarios, leads, casos, ruta del caso, calendario, histórico.
--
-- Principios que la BASE hace cumplir, no la aplicación:
--   · un lead se convierte en caso UNA sola vez  -> cases.lead_id UNIQUE
--   · nada se borra                              -> sin DELETE; estados archived
--   · el historial no se reescribe               -> triggers append-only
--   · los datos personales no salen por la API   -> RLS activo y SIN políticas
-- ============================================================================

-- En `extensions`, no en el esquema de trabajo: así el esquema de pruebas la
-- alcanza por search_path sin tener que incluir `public` — y sin que una tabla
-- que falte en pruebas acabe leyendo, en silencio, la de producción.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;

-- ---------------------------------------------------------------- catálogos
CREATE TYPE staff_role AS ENUM ('admin', 'lawyer');

CREATE TYPE qualification_status AS ENUM ('qualified', 'unqualified');

CREATE TYPE qualification_reason AS ENUM (
  'qualified_allowed_state_and_recent_dismissal',
  'unqualified_state',
  'unqualified_dismissal_date',
  'unqualified_state_and_dismissal_date'
);

-- Cómo llegó el lead. Permite medir después de dónde vienen los casos.
CREATE TYPE lead_source AS ENUM ('web_form', 'manual', 'phone', 'whatsapp', 'other');

-- Estado del LEAD, distinto del estado del CASO: mientras es lead se le revisa
-- y se le contacta; en cuanto se decide continuar, nace el caso.
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'converted', 'discarded', 'no_response');

CREATE TYPE case_status AS ENUM (
  'active', 'waiting_client', 'scheduled', 'in_process',
  'completed', 'discontinued', 'archived'
);

CREATE TYPE checklist_item_status AS ENUM ('pending', 'in_progress', 'completed', 'not_applicable');

CREATE TYPE event_type AS ENUM (
  'call', 'hearing', 'conciliation', 'meeting', 'follow_up', 'deadline', 'other'
);

CREATE TYPE event_status AS ENUM ('scheduled', 'done', 'cancelled');

-- 'system' = lo creó una automatización, no una persona.
CREATE TYPE event_source AS ENUM ('web_form', 'manual', 'system');

CREATE TYPE case_close_reason AS ENUM (
  'client_declined',      -- el cliente decidió no continuar
  'client_unresponsive',  -- dejó de responder
  'not_viable',           -- no procedió después de revisión
  'completed',            -- concluido
  'other'
);

-- ------------------------------------------------------------------ sellos
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Historia inmutable: aplica también a la clave de servicio, a propósito.
-- La garantía no puede depender de que la aplicación se porte bien.
CREATE OR REPLACE FUNCTION forbid_rewrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción: no se puede % su historia.',
    TG_TABLE_NAME, lower(TG_OP);
END $$;

-- ================================================================ usuarios
CREATE TABLE staff_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL CHECK (length(btrim(name)) > 0),
  email         citext      NOT NULL UNIQUE,
  role          staff_role  NOT NULL DEFAULT 'lawyer',
  status        text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  -- 'scrypt$sal$hash'. Nunca sale del servidor.
  password_hash text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
-- No hay borrado de cuentas: se desactivan. Un usuario borrado se llevaría
-- consigo la autoría de todo lo que hizo.
CREATE TRIGGER staff_users_touch BEFORE UPDATE ON staff_users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- =================================================================== folio
-- 'SL-000001'. Seis dígitos alcanzan para 999 999 registros.
-- Lo consume el servidor; el usuario nunca escribe un folio.
CREATE SEQUENCE folio_seq;

CREATE OR REPLACE FUNCTION next_folio() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT 'SL-' || lpad(nextval('folio_seq')::text, 6, '0')
$$;

-- =================================================================== leads
CREATE TABLE leads (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Folio visible. NULL solo en los envíos del formulario que NO calificaron:
  -- es un recurso escaso y visible. Un alta manual siempre lo lleva.
  folio                         text UNIQUE,

  full_name                     text        NOT NULL CHECK (length(btrim(full_name)) > 0),
  -- 10 dígitos normalizados, sin lada de país ni separadores.
  phone                         char(10)    NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
  -- Clave de 3 letras del catálogo de src/lib/domain/states.ts ('CMX', 'MEX'…).
  state                         char(3)     NOT NULL,
  -- DATE, no timestamptz: es una fecha civil sin hora. Convertirla a UTC la
  -- corre un día según la zona del servidor, y con el límite de exactamente
  -- 60 días ese día decide si el caso entra o no.
  dismissal_date                date        NOT NULL,
  description                   text        NOT NULL DEFAULT '',

  source                        lead_source NOT NULL DEFAULT 'web_form',
  status                        lead_status NOT NULL DEFAULT 'new',

  submitted_at                  timestamptz NOT NULL DEFAULT now(),
  -- Fecha civil de CDMX que usó el motor. Hace reproducible la decisión.
  submitted_on                  date        NOT NULL,

  qualification_status          qualification_status NOT NULL,
  qualification_reason          qualification_reason NOT NULL,
  -- Congelado a propósito: NO se recalcula al leer. Si se recalculara, un
  -- prospecto calificado empezaría a mostrar 70, 80, 90 días y parecería que
  -- el filtro falló.
  dismissal_days_at_submission  integer     NOT NULL CHECK (dismissal_days_at_submission >= 0),

  -- Hora pedida para la llamada. Preferencia, no reserva: el sistema no conoce
  -- la agenda de los abogados. Se refleja además como evento de calendario.
  call_preference_date          date,
  call_preference_time          text CHECK (call_preference_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  call_preference_set_at        timestamptz,

  -- Quién lo capturó. NULL en los envíos del formulario público: ahí no hay
  -- ninguna persona del despacho detrás.
  created_by                    uuid REFERENCES staff_users(id),
  notes                         text        NOT NULL DEFAULT '',

  converted_to_case_at          timestamptz,
  is_demo                       boolean     NOT NULL DEFAULT false,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),

  -- GARANTÍA CENTRAL, en la base y no en una consulta: el portal muestra
  -- exactamente esto. Un listado nuevo hereda el filtro por construcción en
  -- vez de tener que acordarse de aplicarlo.
  --   · del formulario público: solo los que pasaron el filtro;
  --   · capturado por un abogado: siempre — registrarlo YA fue la decisión.
  visible_to_staff boolean GENERATED ALWAYS AS
    (qualification_status = 'qualified' OR source <> 'web_form') STORED,

  -- El folio y la visibilidad no pueden contradecirse. Se escribe con la
  -- expresión cruda, no con la columna generada, porque PostgreSQL no permite
  -- referenciar una columna generada desde un CHECK.
  CONSTRAINT folio_solo_si_visible CHECK (
    (qualification_status = 'qualified' OR source <> 'web_form') = (folio IS NOT NULL)
  ),
  -- La hora pedida va completa o no va.
  CONSTRAINT call_preference_completa CHECK (
    (call_preference_date IS NULL) = (call_preference_time IS NULL)
  )
);

CREATE TRIGGER leads_touch BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- La consulta del portal: los que se ven, más recientes primero.
CREATE INDEX leads_por_contactar ON leads (submitted_at DESC) WHERE visible_to_staff;
-- Detección de envíos repetidos (mismo teléfono, mismo despido).
CREATE INDEX leads_repetidos ON leads (phone, dismissal_date, submitted_at DESC);
CREATE INDEX leads_por_estado ON leads (status);
CREATE INDEX leads_por_origen ON leads (source);
-- Métricas: leads recibidos por mes.
CREATE INDEX leads_por_fecha ON leads (submitted_on);

-- =================================================================== casos
CREATE TABLE cases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Se hereda el folio del lead: una sola referencia para la misma persona
  -- desde que llega hasta que se cierra su asunto.
  folio            text        NOT NULL UNIQUE,

  -- UNIQUE es lo que impide convertir un lead dos veces. No es una
  -- comprobación de la aplicación que se pueda olvidar o ganar por carrera:
  -- dos conversiones simultáneas y una de las dos falla.
  lead_id          uuid        NOT NULL UNIQUE REFERENCES leads(id) ON DELETE RESTRICT,

  status           case_status NOT NULL DEFAULT 'active',
  -- Etapa legible: sale del paso en curso de la ruta del caso.
  current_stage    text        NOT NULL DEFAULT '',
  assigned_user_id uuid REFERENCES staff_users(id),

  opened_at        timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz,
  closed_reason    case_close_reason,
  -- Obligatoria cuando el motivo es 'other'.
  closed_note      text        NOT NULL DEFAULT '',
  closed_by        uuid REFERENCES staff_users(id),

  created_by       uuid REFERENCES staff_users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- Un caso cerrado dice cuándo y por qué; uno abierto no puede decirlo.
  CONSTRAINT cierre_coherente CHECK (
    (closed_at IS NULL AND closed_reason IS NULL) OR
    (closed_at IS NOT NULL AND closed_reason IS NOT NULL)
  ),
  CONSTRAINT motivo_otro_exige_nota CHECK (
    closed_reason IS DISTINCT FROM 'other' OR length(btrim(closed_note)) > 0
  )
);

CREATE TRIGGER cases_touch BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX cases_por_estado ON cases (status);
CREATE INDEX cases_por_responsable ON cases (assigned_user_id);
-- Seguimiento activo: lo que requiere trabajo hoy.
CREATE INDEX cases_en_seguimiento ON cases (opened_at DESC)
  WHERE status NOT IN ('completed', 'discontinued', 'archived');
CREATE INDEX cases_por_cierre ON cases (closed_at DESC) WHERE closed_at IS NOT NULL;

-- El lead sabe en qué caso acabó. FK añadida después de crear `cases`.
ALTER TABLE leads ADD COLUMN case_id uuid REFERENCES cases(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX leads_case_id_unico ON leads (case_id) WHERE case_id IS NOT NULL;

-- ====================================================== ruta del caso
-- Plantillas: los pasos definitivos los define el despacho después. No se
-- codifican en los componentes; se editan como datos.
CREATE TABLE case_checklist_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  -- La que se aplica al convertir un lead. Solo puede haber una.
  is_default  boolean     NOT NULL DEFAULT false,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX una_sola_plantilla_por_defecto
  ON case_checklist_templates ((is_default)) WHERE is_default;

CREATE TRIGGER templates_touch BEFORE UPDATE ON case_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE case_checklist_template_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES case_checklist_templates(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (length(btrim(title)) > 0),
  description text NOT NULL DEFAULT '',
  position    integer NOT NULL CHECK (position > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, position)
);

CREATE TRIGGER template_items_touch BEFORE UPDATE ON case_checklist_template_items
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Los pasos REALES de un caso. Se copian de la plantilla al convertir: si la
-- plantilla cambia después, los casos en curso no se alteran solos.
CREATE TABLE case_checklist_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  -- Referencia informativa al origen. NULL si el paso se añadió a mano.
  template_item_id uuid REFERENCES case_checklist_template_items(id) ON DELETE SET NULL,

  title            text NOT NULL CHECK (length(btrim(title)) > 0),
  description      text NOT NULL DEFAULT '',
  status           checklist_item_status NOT NULL DEFAULT 'pending',
  position         integer NOT NULL CHECK (position > 0),

  assigned_user_id uuid REFERENCES staff_users(id),
  started_at       timestamptz,
  completed_at     timestamptz,
  completed_by     uuid REFERENCES staff_users(id),
  notes            text NOT NULL DEFAULT '',

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (case_id, position),
  -- Un paso completado dice cuándo se completó.
  CONSTRAINT completado_tiene_fecha CHECK (
    (status = 'completed') = (completed_at IS NOT NULL)
  )
);

CREATE TRIGGER checklist_items_touch BEFORE UPDATE ON case_checklist_items
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX checklist_por_caso ON case_checklist_items (case_id, position);
CREATE INDEX checklist_por_responsable ON case_checklist_items (assigned_user_id);

-- =============================================================== calendario
CREATE TABLE calendar_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  lead_id           uuid REFERENCES leads(id) ON DELETE RESTRICT,
  case_id           uuid REFERENCES cases(id) ON DELETE RESTRICT,

  event_type        event_type   NOT NULL,
  title             text         NOT NULL CHECK (length(btrim(title)) > 0),
  description       text         NOT NULL DEFAULT '',

  start_at          timestamptz  NOT NULL,
  end_at            timestamptz,

  assigned_user_id  uuid REFERENCES staff_users(id),
  status            event_status NOT NULL DEFAULT 'scheduled',
  source            event_source NOT NULL DEFAULT 'manual',
  created_by        uuid REFERENCES staff_users(id),

  -- Preparados para CloudTalk / Google Calendar. Nada del núcleo depende de
  -- ellos: si la integración externa falla, el calendario sigue funcionando.
  external_provider text,
  external_event_id text,

  cancelled_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Un evento suelto, sin lead ni caso ni responsable, no le sirve a nadie.
  CONSTRAINT evento_tiene_dueno CHECK (
    lead_id IS NOT NULL OR case_id IS NOT NULL OR assigned_user_id IS NOT NULL
  ),
  CONSTRAINT fin_despues_del_inicio CHECK (end_at IS NULL OR end_at >= start_at),
  CONSTRAINT cancelado_tiene_fecha CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);

CREATE TRIGGER calendar_events_touch BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX eventos_por_fecha ON calendar_events (start_at) WHERE status <> 'cancelled';
CREATE INDEX eventos_por_caso ON calendar_events (case_id, start_at);
CREATE INDEX eventos_por_lead ON calendar_events (lead_id, start_at);
CREATE INDEX eventos_por_responsable ON calendar_events (assigned_user_id, start_at);

-- IDEMPOTENCIA: la llamada pedida desde el formulario es UNA por lead. Si la
-- persona vuelve a elegir horario, se actualiza el mismo evento en vez de
-- sembrar duplicados en la agenda del abogado.
CREATE UNIQUE INDEX una_llamada_web_por_lead
  ON calendar_events (lead_id)
  WHERE source = 'web_form' AND event_type = 'call';

-- =========================================================== historial
-- Append-only de verdad: los triggers de abajo rechazan UPDATE y DELETE.
CREATE TABLE case_status_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  previous_status case_status,
  new_status      case_status NOT NULL,
  changed_by      uuid REFERENCES staff_users(id),
  changed_at      timestamptz NOT NULL DEFAULT now(),
  reason          text NOT NULL DEFAULT ''
);
CREATE INDEX historial_por_caso ON case_status_history (case_id, changed_at);

CREATE TRIGGER case_status_history_inmutable
  BEFORE UPDATE OR DELETE ON case_status_history
  FOR EACH ROW EXECUTE FUNCTION forbid_rewrite();

-- =============================================================== bitácora
CREATE TABLE audit_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES staff_users(id),
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  uuid,
  -- Estado antes y después, para las modificaciones importantes.
  before     jsonb,
  after      jsonb,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bitacora_por_entidad ON audit_logs (entity, entity_id, created_at DESC);
CREATE INDEX bitacora_por_usuario ON audit_logs (user_id, created_at DESC);
CREATE INDEX bitacora_por_fecha ON audit_logs (created_at DESC);

-- Nadie edita su propio historial: ni el usuario, ni la aplicación.
CREATE TRIGGER audit_logs_inmutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_rewrite();

-- ==================================================================== RLS
-- Todas las tablas llevan datos privados: nombres, teléfonos, el relato de un
-- despido, la agenda del despacho. RLS activo y SIN NINGUNA POLÍTICA: con la
-- llave publicable no se lee ni se escribe nada, ni siquiera por accidente.
-- El servidor entra por conexión Postgres directa; el navegador nunca habla
-- con la base. El formulario público inserta a través de una server action que
-- valida el payload y ejecuta el motor de calificación.
ALTER TABLE staff_users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_checklist_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_checklist_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_status_history           ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                    ENABLE ROW LEVEL SECURITY;

-- Cinturón y tirantes: aunque alguien creara una política por descuido, los
-- roles del navegador no tienen permiso sobre las tablas.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
