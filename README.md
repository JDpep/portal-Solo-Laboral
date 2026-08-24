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
                                 elige cuándo                 (se guarda, no
                                 le llamamos                   se muestra)
                                        │
                                 visible en /portal
                                        │
                                el abogado llama
```

**NO TODOS LOS FORMULARIOS LLEGAN AL PORTAL.** Ese es el punto del producto.

El formulario pide **cuatro datos obligatorios** —nombre, teléfono, estado y
fecha de despido— y uno **opcional**: la descripción de lo que pasó. El motor
no la usa; sirve para que el abogado llegue con contexto a la llamada.

Quien califica puede, además, elegir **cuándo quiere que le llamen**: uno de
los próximos cinco días —fin de semana incluido— y mañana o tarde. Es una **franja solicitada, no
una cita**: el despacho no publica disponibilidad, así que comprometer una hora
exacta sería prometer algo que nadie firmó. La franja aparece junto al nombre
en el portal. Detalle en [`docs/DECISIONES_PENDIENTES.md`](docs/DECISIONES_PENDIENTES.md), punto 11.

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
| `/portal` | Casos por contactar | Requiere sesión |
| `/portal/[id]` | Detalle del caso | Requiere sesión |

---

## Cómo levantarlo

```bash
npm install
npm run dev          # http://localhost:3000
```

Acceso DEMO al portal (visible en `/acceso` mientras dure la Fase 1):

```
abogados@sololaboral.demo · SoloLaboral2026
```

### Verificación

```bash
npm run typecheck    # tsc --noEmit
npm run lint
npm test             # 61 pruebas
npm run build
```

### Variables de entorno

```
SESSION_SECRET=...   # obligatorio en producción; el portal no arranca sin él
```

---

## Estado

**Fase 1 terminada**: el flujo completo funciona, con almacén **en memoria**.
Los envíos se pierden al reiniciar el proceso.

**Fase 2**: sustituir el cuerpo de `src/lib/db/*.ts` por consultas SQL. El
esquema ya está escrito en [`docs/ESQUEMA_BASE_DATOS.md`](docs/ESQUEMA_BASE_DATOS.md);
ni las páginas ni las acciones cambian.

**Antes de producción**, ver [`docs/DECISIONES_PENDIENTES.md`](docs/DECISIONES_PENDIENTES.md).
El punto 1 —el aviso de privacidad del despacho— es bloqueante.

---

## Documentación

| Documento | Qué contiene |
|---|---|
| [`docs/MOTOR_CALIFICACION.md`](docs/MOTOR_CALIFICACION.md) | Las dos condiciones, el manejo de fechas, los motivos, qué tocar si cambian los criterios |
| [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) | Capas, seguridad, protección del formulario, qué no existe a propósito |
| [`docs/ESQUEMA_BASE_DATOS.md`](docs/ESQUEMA_BASE_DATOS.md) | SQL de la Fase 2 |
| [`docs/DECISIONES_PENDIENTES.md`](docs/DECISIONES_PENDIENTES.md) | Lo que falta del cliente y con qué supuesto se construyó |
| [`docs/BRAND.md`](docs/BRAND.md) | Identidad oficial: colores, tipografía, logotipo |

---

## Historia

Este repositorio contuvo antes un portal interno más amplio (Empresas,
Propuestas, calculadora de finiquito, Dashboard, Bitácora, Usuarios). El
2026-08-21 el alcance cambió a captación y precalificación, y esos módulos
salieron del proyecto.

Se conservó la base técnica que seguía sirviendo: autenticación, tokens de
diseño y branding, componentes de UI, manejo de fechas civiles y el patrón de
repositorios.

El código anterior está respaldado íntegro en
`~/Desktop/respaldo-portal-solo-laboral-fase-anterior-20260821.tar.gz`.
