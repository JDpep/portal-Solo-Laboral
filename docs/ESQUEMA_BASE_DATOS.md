# ESQUEMA DE BASE DE DATOS — Fase 2

En Fase 1 los datos viven en memoria (`src/lib/db/store.ts`). Este es el
esquema que los sustituye, sin cambiar ninguna firma de repositorio.

---

## `lead_submissions`

Guarda **todos** los envíos, califiquen o no. Sin los no calificados nadie
puede responder después "¿cuánta gente nos busca y por qué la dejamos fuera?".

```sql
CREATE TYPE qualification_status AS ENUM ('qualified', 'unqualified');

CREATE TYPE qualification_reason AS ENUM (
  'qualified_allowed_state_and_recent_dismissal',
  'unqualified_state',
  'unqualified_dismissal_date',
  'unqualified_state_and_dismissal_date'
);

CREATE TABLE lead_submissions (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Folio visible. NULL para los no calificados: es un recurso escaso y
  -- visible, solo lo consume quien pasa el filtro.
  case_number                   text UNIQUE,

  full_name                     text        NOT NULL,
  -- 10 dígitos normalizados, sin lada de país ni separadores.
  phone                         char(10)    NOT NULL,
  -- Clave de 3 letras del catálogo de src/lib/domain/states.ts ('CMX', 'MEX'…).
  state                         char(3)     NOT NULL,
  -- DATE, no timestamptz: es una fecha civil sin hora. Convertirla a UTC la
  -- corre un día según la zona del servidor, y con un límite de exactamente
  -- 60 días ese día decide si el caso entra o no.
  dismissal_date                date        NOT NULL,
  case_description              text        NOT NULL,

  submitted_at                  timestamptz NOT NULL DEFAULT now(),
  -- Fecha civil de CDMX que usó el motor. Hace reproducible la decisión.
  submitted_on                  date        NOT NULL,

  qualification_status          qualification_status NOT NULL,
  qualification_reason          qualification_reason NOT NULL,
  -- Congelado a propósito: NO se recalcula al leer (ver MOTOR_CALIFICACION.md §5).
  dismissal_days_at_submission  integer     NOT NULL CHECK (dismissal_days_at_submission >= 0),

  -- Registro sembrado para demostración. Siempre false en datos reales.
  is_demo                       boolean     NOT NULL DEFAULT false,

  created_at                    timestamptz NOT NULL DEFAULT now(),

  -- El folio y el veredicto no pueden contradecirse.
  CONSTRAINT case_number_solo_si_califica CHECK (
    (qualification_status = 'qualified'   AND case_number IS NOT NULL) OR
    (qualification_status = 'unqualified' AND case_number IS NULL)
  )
);

-- La consulta del portal: calificados, más recientes primero.
CREATE INDEX lead_submissions_por_contactar
  ON lead_submissions (submitted_at DESC)
  WHERE qualification_status = 'qualified';

-- Detección de envíos repetidos.
CREATE INDEX lead_submissions_repetidos
  ON lead_submissions (phone, dismissal_date, submitted_at DESC);
```

### Folio

```sql
CREATE SEQUENCE lead_case_number_seq;
-- 'SL-' || lpad(nextval('lead_case_number_seq')::text, 6, '0')
```

Se consume **solo** al insertar un calificado. Seis dígitos alcanzan para
999 999 solicitudes.

---

## `staff_users`

```sql
CREATE TABLE staff_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  email         citext      NOT NULL UNIQUE,
  status        text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'inactive')),
  password_hash text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
```

No hay borrado: una cuenta se desactiva. `password_hash` es `scrypt$sal$hash`.

---

## Si se usa Supabase (RLS)

`lead_submissions` contiene datos personales. Con RLS activo:

```sql
ALTER TABLE lead_submissions ENABLE ROW LEVEL SECURITY;
-- Sin políticas de SELECT para anon ni authenticated: el portal lee con la
-- clave de servicio desde el servidor, nunca desde el navegador.
```

La inserción del formulario público también debe ocurrir **en el servidor**: si
el navegador pudiera insertar directo, podría insertar con
`qualification_status = 'qualified'` y saltarse el motor por completo.

---

## Lo que NO tiene el esquema

- **Ninguna función de borrado.** La ausencia es la garantía.
- **Estados de seguimiento** (contactado / no respondió / contratado). Es el
  siguiente paso natural del producto; cuando se pida, entra como tabla
  `lead_contacts` append-only en vez de como columna mutable, para no perder el
  historial de intentos.
