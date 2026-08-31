# Solo Laboral — Captación y precalificación de casos

Cliente: **Solo Laboral Abogados** · Desarrollo: **FORJA Estudio**

Un filtro previo que evita que el despacho gaste tiempo llamando a gente que,
por criterios objetivos, no puede atender.

```
PERSONA → FORMULARIO PÚBLICO → MOTOR DE CALIFICACIÓN → ¿CALIFICA?
                                                       │
                                        SÍ ────────────┴──────────── NO
                                        │                            │
                                 folio SL-000001              se le dice cuál
                                        │                    condición falló
                          ┌─────────────┼─────────────┐      (se guarda, no
                          │             │             │       se muestra)
                     WhatsApp      agendar      "que me
                    con contexto   llamada     llamen ya"
                          └─────────────┼─────────────┘
                                        │
                                 visible en /portal
                                        │
                                 el abogado llama
                                        │
                              CONVERTIR EN CASO (un clic)
                                        │
                              ruta del caso · seguimiento
                                        │
                                     cierre
                                        │
                                    histórico
```

**NO TODOS LOS FORMULARIOS LLEGAN AL PORTAL.** Ese es el punto del producto.

El formulario pide **cuatro datos obligatorios** —nombre, teléfono, estado y
fecha de despido— y uno **opcional**: la descripción de lo que pasó. El motor
no la usa; sirve para que el abogado llegue con contexto a la llamada.

Quien califica puede, además, elegir **cuándo quiere que le llamen**: uno de
los próximos cinco días —fin de semana incluido— y una **hora exacta** entre las
9:30 y las 17:30, de diez en diez minutos. Es una **preferencia, no una
reserva**: el sistema no conoce la agenda de los abogados y no bloquea el hueco,
así que el texto promete "haremos lo posible" y nunca una cita. La hora aparece
junto al nombre en el portal. Detalle en [`docs/DECISIONES_PENDIENTES.md`](docs/DECISIONES_PENDIENTES.md), punto 11.

---

## Las dos condiciones

Ambas obligatorias:

1. La entidad es **Ciudad de México** o **Estado de México**.
2. El despido ocurrió hace **menos de 60 días** (exactamente 60 **no** califica).

Sin IA. Regla determinística, del lado del servidor, en
`src/lib/domain/qualification.ts`. Detalle en [`docs/MOTOR_CALIFICACION.md`](docs/MOTOR_CALIFICACION.md).

---

## Rutas

| Ruta | Qué es | Acceso |
|---|---|---|
| `/` | Página pública y formulario | Abierto, indexable |
| `/acceso` | Inicio de sesión del despacho | Abierto, `noindex` |
| `/portal` | Leads: gente por revisar | Requiere sesión |
| `/portal/[id]` | Ficha del lead · convertir en caso | Requiere sesión |
| `/portal/seguimiento` | Casos abiertos y su avance | Requiere sesión |
| `/portal/seguimiento/[id]` | Ruta del caso, paso a paso | Requiere sesión |
| `/portal/calendario` | Agenda operativa | Requiere sesión · en construcción |
| `/portal/historico` | Casos cerrados y métricas | Requiere sesión · en construcción |
| `/portal/administracion` | Cuentas y plantillas | Requiere rol `admin` · en construcción |

**LEAD y CASO son cosas distintas.** Un lead es alguien que escribió y está
siendo revisado; un caso es un asunto que el despacho decidió llevar. La
conversión la pulsa una persona —nada la dispara solo— y a partir de ahí el
caso hereda el folio, los datos y las llamadas ya agendadas, sin recapturar
nada.

---

## Cómo levantarlo

```bash
npm install
cp .env.example .env.local     # y rellena la conexión a Postgres
echo 'POSTGRES_SCHEMA=dev' >> .env.local   # NO trabajes contra producción
npm run db:migrate             # crea el esquema (el de POSTGRES_SCHEMA)
npm run db:seed -- --demo      # cuentas de demostración + ejemplos
npm run dev                    # http://localhost:3000
```

### Desarrollo NO toca los datos del despacho

`POSTGRES_SCHEMA=dev` es la línea que separa tu servidor de desarrollo de los
datos reales. Sin ella, `next dev` abre la conexión en `public` —producción— y
cualquier cosa que pruebes en el portal queda escrita en la agenda del despacho.

`dev` es una **réplica completa** del esquema dentro de la misma base: mismas
tablas, mismos triggers, mismas restricciones, ni un dato real. `db:migrate` y
`db:seed` siguen esa misma variable, de modo que migrar, sembrar y leer no
pueden acabar apuntando a sitios distintos; `--schema` los fuerza cuando hace
falta ser explícito. Al abrir la conexión, el servidor imprime contra qué
esquema trabaja siempre que no sea `public`.

Vercel no define la variable, así que **el portal desplegado siempre sale en
`public`**. Para tocar producción a propósito desde la línea de comandos:

```bash
POSTGRES_SCHEMA=public npm run db:migrate -- --dry   # qué le falta a producción
```

`db:seed` deja dos cuentas de **demostración** —`Admin@SL.mx` (rol `admin`) y
`User@SL.mx` (rol `lawyer`)— con la contraseña que pongas en
`SEED_DEMO_PASSWORD` dentro de `.env.local`. **La contraseña no se escribe en el
repositorio**: este repo es público y esas cuentas entran al portal real, donde
hay datos personales de prospectos.

La pantalla de acceso tampoco las muestra: hay que saberlas. Antes de operar con
clientes reales, dar de baja estas dos y crear las del despacho con contraseñas
propias.

### Verificación

```bash
npm run typecheck    # tsc --noEmit
npm run lint
npm test             # 87 pruebas puras: motor, fechas, agenda, mensajes, validación
npm run test:db      # 117 de integración contra Postgres real (esquema `test`)
npm run build
```

Las de integración corren sobre una **réplica completa del esquema** en la
misma base: mismas tablas, mismos triggers, mismas restricciones. Comprueban lo
que garantiza Postgres —el folio único, el caso irrepetible, la bitácora que no
se deja reescribir— sin poder rozar un dato del despacho.

### Variables de entorno

```
SESSION_SECRET=...              # obligatorio en producción; el portal no arranca sin él
POSTGRES_URL=...                # pooler (6543): la conexión de la aplicación
POSTGRES_URL_NON_POOLING=...    # sesión (5432): migraciones y scripts
POSTGRES_SCHEMA=dev             # SOLO en local. Réplica del esquema: desarrollo
                                # no escribe sobre los datos del despacho.
                                # En Vercel no se define: producción es `public`

SOLO_LABORAL_WHATSAPP_NUMBER=   # 52 + 10 dígitos. SIN ESTO la opción de
                                # WhatsApp no se ofrece — nunca un botón roto
WHATSAPP_MESSAGE_TEMPLATE=      # opcional; por defecto, la plantilla neutra
QUICK_CALL_MIN_DELAY=10         # ventana de la llamada próxima, en minutos
QUICK_CALL_MAX_DELAY=15
```

---

## Estado

**En Postgres, en producción.** El almacén en memoria de la Fase 1 desapareció:
los datos viven en Supabase y las nueve tablas llevan RLS activo sin ninguna
política, así que el navegador no puede leer nada — la única puerta es el
servidor.

**Funciona hoy:** formulario público con su filtro, tres vías de contacto
después de calificar, leads, conversión a caso, ruta del caso, cierre con
motivo e historia de estados. Todo con bitácora.

**Falta:** calendario, histórico con métricas, alta manual de leads y la
pantalla de administración. Sus datos ya se están guardando.

**Antes de publicitar el formulario**, ver
[`docs/DECISIONES_PENDIENTES.md`](docs/DECISIONES_PENDIENTES.md). Dos puntos
bloquean: el **1**, el aviso de privacidad del despacho; y el **3**, que nadie
se entera al instante de que entró un caso — y ahora se promete una llamada en
diez minutos.

---

## Documentación

| Documento | Qué contiene |
|---|---|
| [`docs/MOTOR_CALIFICACION.md`](docs/MOTOR_CALIFICACION.md) | Las dos condiciones, el manejo de fechas, los motivos, qué tocar si cambian los criterios |
| [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) | Capas, seguridad, protección del formulario, qué no existe a propósito |
| [`docs/ESQUEMA_BASE_DATOS.md`](docs/ESQUEMA_BASE_DATOS.md) | SQL de la Fase 2 |
| [`docs/DECISIONES_PENDIENTES.md`](docs/DECISIONES_PENDIENTES.md) | Lo que falta del cliente y con qué supuesto se construyó |
| [`docs/BRAND.md`](docs/BRAND.md) | Identidad oficial: colores, tipografía, logotipo |
| `db/migrations/` | El esquema real. Fuente de verdad, aplicado con `npm run db:migrate` |

---

## Historia

El 2026-08-27 el portal pasó de almacén en memoria a Postgres y creció con
Casos, Ruta del Caso, calendario y bitácora; el 2026-08-28 se añadieron las
tres vías de contacto tras calificar. El módulo de Leads se conservó tal cual:
lo único que cambió en él fue el nombre del campo `caseNumber` → `folio` —un
lead no es un caso— y el bloque nuevo para convertirlo.

Este repositorio contuvo antes un portal interno más amplio (Empresas,
Propuestas, calculadora de finiquito, Dashboard, Bitácora, Usuarios). El
2026-08-21 el alcance cambió a captación y precalificación, y esos módulos
salieron del proyecto.

Se conservó la base técnica que seguía sirviendo: autenticación, tokens de
diseño y branding, componentes de UI, manejo de fechas civiles y el patrón de
repositorios.

El código anterior está respaldado íntegro en
`~/Desktop/respaldo-portal-solo-laboral-fase-anterior-20260821.tar.gz`.
