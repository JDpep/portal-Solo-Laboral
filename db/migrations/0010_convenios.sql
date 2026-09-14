-- ============================================================================
-- CONVENIOS
--
-- Cuando un caso termina en convenio con el patrón, el abogado lo registra: el
-- documento firmado, cuánto se acordó y el porcentaje que cobra Solo Laboral
-- —35 % por omisión— SOBRE LO ACORDADO CON EL PATRÓN.
--
-- EL DINERO VA EN CENTAVOS ENTEROS (bigint). Un `numeric` también sería exacto,
-- pero el driver lo devuelve como texto y la aplicación acabaría haciendo
-- aritmética con `Number()` sobre pesos con decimales, que es justo como se
-- pierde un centavo. En centavos no hay decimales que perder.
--
-- LOS HONORARIOS LOS CALCULA LA BASE (columna generada). Guardarlos a mano
-- permitiría que un convenio dijera "35 % de $100,000 = $30,000" y nadie lo
-- notaría hasta la conciliación del mes. Redondeo al centavo, mitad hacia
-- arriba; src/lib/domain/convenio.ts replica exactamente la misma regla para la
-- vista previa del formulario, y hay una prueba que las compara.
--
-- NADA SE BORRA. Un convenio capturado por error se ANULA con su motivo: los
-- honorarios ya pudieron haberse facturado, y un registro que desaparece deja
-- una factura sin respaldo.
-- ============================================================================

CREATE TABLE settlements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             uuid        NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  -- El abogado que llevó el convenio. Puede no ser quien lo captura.
  lawyer_id           uuid        NOT NULL REFERENCES staff_users(id),

  -- Fecha civil de firma (sin hora: ver el comentario de leads.dismissal_date).
  signed_on           date        NOT NULL,

  -- Lo acordado con el patrón. Tope: cien mil millones de pesos, de sobra.
  agreed_amount_cents bigint      NOT NULL
    CHECK (agreed_amount_cents > 0 AND agreed_amount_cents <= 10000000000000),
  -- Puntos base: 3500 = 35.00 %.
  fee_rate_bp         integer     NOT NULL DEFAULT 3500
    CHECK (fee_rate_bp BETWEEN 0 AND 10000),
  fee_amount_cents    bigint GENERATED ALWAYS AS
    (round(agreed_amount_cents::numeric * fee_rate_bp / 10000)::bigint) STORED,

  -- Cuándo cobró Solo Laboral sus honorarios. NULL = por cobrar.
  fee_collected_at    timestamptz,
  fee_collected_by    uuid REFERENCES staff_users(id),

  notes               text        NOT NULL DEFAULT '',

  status              text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'voided')),
  voided_at           timestamptz,
  voided_by           uuid REFERENCES staff_users(id),
  void_reason         text        NOT NULL DEFAULT '',

  created_by          uuid REFERENCES staff_users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT anulacion_coherente CHECK (
    (status = 'voided') = (voided_at IS NOT NULL)
  ),
  CONSTRAINT anulacion_con_motivo CHECK (
    status <> 'voided' OR length(btrim(void_reason)) > 0
  ),
  CONSTRAINT cobro_coherente CHECK (
    (fee_collected_at IS NULL) = (fee_collected_by IS NULL)
  )
);

CREATE TRIGGER settlements_touch BEFORE UPDATE ON settlements
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX convenios_por_caso ON settlements (case_id, signed_on DESC);
CREATE INDEX convenios_por_abogado ON settlements (lawyer_id, signed_on DESC);
CREATE INDEX convenios_por_fecha ON settlements (signed_on DESC) WHERE status = 'active';

-- ------------------------------------------------------------ documentos
-- Tabla aparte para que listar convenios nunca arrastre los bytes. Se guardan
-- en la base y no en un almacenamiento externo: el portal ya entra a Postgres
-- por el servidor con RLS cerrado, y un segundo sitio con documentos firmados
-- sería una segunda puerta que proteger.
CREATE TABLE settlement_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid        NOT NULL REFERENCES settlements(id) ON DELETE RESTRICT,
  file_name     text        NOT NULL CHECK (length(btrim(file_name)) > 0),
  mime_type     text        NOT NULL
    CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes    integer     NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 4500000),
  sha256        text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  content       bytea       NOT NULL,
  uploaded_by   uuid REFERENCES staff_users(id),
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX documentos_por_convenio ON settlement_files (settlement_id, uploaded_at);

-- El documento firmado es evidencia: no se reescribe ni se borra.
CREATE TRIGGER settlement_files_inmutable
  BEFORE UPDATE OR DELETE ON settlement_files
  FOR EACH ROW EXECUTE FUNCTION forbid_rewrite();

-- ==================================================================== RLS
-- Mismo criterio que el resto: activo y sin políticas. Solo el servidor entra.
ALTER TABLE settlements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_files ENABLE ROW LEVEL SECURITY;
-- Y sin privilegios para los roles de la API: los documentos firmados llevan
-- montos y nombres; que RLS sea la única capa no basta.
REVOKE ALL ON settlements, settlement_files FROM anon, authenticated;
