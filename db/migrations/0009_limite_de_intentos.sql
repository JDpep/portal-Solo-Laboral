-- ============================================================================
-- EL LÍMITE DE INTENTOS PASA A LA BASE
--
-- Hasta ahora se contaba en memoria del proceso. En un servidor de toda la vida
-- eso habría bastado; aquí no. Cada petición puede caer en una instancia
-- distinta —y bajo carga, que es justo lo que provoca un ataque por fuerza
-- bruta, Vercel arranca más— y cada una empezaba a contar desde cero. El
-- portal decía "8 intentos por correo cada 10 minutos" y el límite real era ese
-- número multiplicado por cuantas instancias quisiera levantar el atacante.
--
-- Detrás de esa puerta hay nombres, teléfonos y el relato del despido de gente
-- real. La cuenta tiene que ser UNA, y el único sitio compartido por todas las
-- instancias es esta base.
--
-- UNA FILA POR INTENTO en vez de un contador por clave. Un contador obliga a
-- leer, decidir y escribir —tres pasos donde dos peticiones simultáneas se
-- pisan— y además no sabe CUÁNDO fueron los intentos, así que no puede hacer
-- una ventana deslizante: solo ventanas fijas, con el agujero clásico de gastar
-- el cupo entero al final de una y otra vez al principio de la siguiente.
-- Insertar es atómico y no compite consigo mismo.
--
-- `bucket` es opaco a propósito: lo compone quien llama ("login|correo|ip",
-- "lead|ip"). La base no tiene por qué saber qué se está limitando, y así el
-- correo del prospecto no queda escrito en una tabla de infraestructura.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket text        NOT NULL,
  hit_at timestamptz NOT NULL DEFAULT now()
);

-- La consulta siempre es "los intentos de ESTE bucket desde ESTA hora".
CREATE INDEX IF NOT EXISTS rate_limit_hits_bucket_idx
  ON rate_limit_hits (bucket, hit_at DESC);

-- Para que la purga del mantenimiento diario no recorra la tabla entera.
CREATE INDEX IF NOT EXISTS rate_limit_hits_hit_at_idx
  ON rate_limit_hits (hit_at);

-- Misma postura que el resto del esquema: RLS activo y ninguna política, así
-- que la llave publicable no llega. La única puerta es el servidor.
ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE rate_limit_hits IS
  'Un renglón por intento. Ventana deslizante compartida por todas las instancias.';
