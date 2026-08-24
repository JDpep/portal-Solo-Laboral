# ARQUITECTURA

Cliente: **Solo Laboral Abogados** · Desarrollo: **FORJA Estudio**
Fase actual: **1 — captación y filtro, con almacén en memoria**

---

## 1. Qué es este sistema

Un filtro previo que evita que el despacho gaste tiempo llamando a gente que,
por criterios objetivos, no puede atender.

Tiene dos caras:

| Cara | Ruta | Quién entra |
|---|---|---|
| Pública | `/` | Cualquiera. Un formulario de cinco campos. |
| Interna | `/portal` | Solo el despacho, con sesión. La lista de casos por contactar. |

```
PERSONA → FORMULARIO → VALIDACIÓN → MOTOR DE CALIFICACIÓN
                                          │
                          ┌───────────────┴───────────────┐
                      CALIFICA                        NO CALIFICA
                          │                                │
                  folio SL-000001                   mensaje de
                  + confirmación                   no elegibilidad
                          │                                │
                  visible en /portal                  fin (se guarda,
                          │                          no se muestra)
                  el abogado llama
```

**El principio no negociable**: no todos los formularios llegan al portal. Se
guardan todos, se muestran solo los calificados.

---

## 2. Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Framework | Next.js 14 (App Router) | Server actions permiten validar y decidir en servidor sin construir una API aparte |
| Lenguaje | TypeScript `strict` | El motor decide quién recibe atención jurídica: los tipos son parte de la garantía |
| Estilos | Tailwind + design tokens CSS | Ambas caras usan los tokens `--sl-*` con la identidad real del despacho |
| Tests | Vitest | Corre el motor y la server action reales, no imitaciones |

**No se introdujo**: IA, ORM, gestor de estado global, ni librería de
formularios. El sistema tiene cinco campos y una regla.

Se **quitaron** del proyecto anterior, por quedar fuera de este alcance:
Recharts, PDFKit, docx, iconv-lite y Zod (la validación necesita mensajes por
campo escritos a mano, en español y sin jerga).

---

## 3. Capas

```
src/app/
  page.tsx              Página pública
  solicitud/actions.ts  Server action: recibe el formulario (única entrada desde internet)
  acceso/               Inicio de sesión del despacho
  portal/               Casos por contactar + detalle (todo bajo sesión)
src/components/
  public/               Formulario y pantallas de resultado
  portal/               Cabecera del portal
  ui/                   Campos, tabla, estados, insignias
  brand/                Logotipo oficial
src/lib/
  domain/
    qualification.ts    MOTOR DE CALIFICACIÓN — puro y determinístico
    states.ts           Entidades federativas y cobertura territorial
    lead-form.ts        Validación y saneamiento del formulario (puro)
    phone.ts            Normalización de teléfonos mexicanos
    sanitize.ts         Limpieza de texto libre
    types.ts            Entidades
  db/                   Repositorios. Nadie más toca el almacén.
  auth/                 Sesión, contraseñas, guarda, límites de intentos
  dates.ts              Fechas civiles sin hora
```

Regla de dependencia: `app` → `lib`. `lib` nunca importa de `app`.
`components` nunca importa de `db`.

La decisión de negocio no vive en la capa HTTP: `submitLeadAction` valida,
protege y guarda, pero **delega el veredicto** a `qualifyLead`, que es una
función pura probada aparte.

---

## 4. La garantía central, y dónde vive

El filtro está en el **repositorio**, no en la página:

```ts
// src/lib/db/leads.ts
listQualifiedLeads()      // filtra qualificationStatus === 'qualified'
findQualifiedLeadById(id) // null si el registro existe pero NO calificó
```

Está ahí a propósito. Si el filtro viviera en `portal/page.tsx`, la siguiente
pantalla que alguien agregue tendría que acordarse de aplicarlo. Así lo hereda
por construcción, y adivinar un id no sirve para leer lo que quedó fuera.

---

## 5. Privacidad y seguridad

Los datos de un prospecto son personales: nombre, teléfono y el relato de su
despido. Nada de eso sale del servidor sin sesión.

- **Portal completo bajo guarda.** `requireStaff()` corre en el layout de
  `/portal`, así que cubre la lista, el detalle y cualquier ruta futura del
  grupo. Sin sesión, redirección a `/acceso`.
- **El estado de la cuenta se relee en cada petición.** Una baja surte efecto
  de inmediato sobre sesiones ya abiertas.
- **Contraseñas** con `scrypt` + sal por usuario y comparación en tiempo
  constante. Se verifica siempre, incluso cuando el correo no existe, para que
  el tiempo de respuesta no revele qué cuentas están dadas de alta.
- **Sesión** en cookie `httpOnly`, `sameSite=lax`, `secure` en producción,
  firmada con HMAC-SHA256, vigencia de 12 h. `SESSION_SECRET` es obligatorio en
  producción: el portal se niega a arrancar sin él.
- **Mensaje único de error** en el acceso: no revela si el correo existe ni si
  la cuenta está inactiva.
- **Cabeceras**: `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`.
  `X-Robots-Tag: noindex` **solo** en `/portal/*` y `/acceso` — la página
  pública sí debe indexarse.

### Protección del formulario público

| Defensa | Cómo |
|---|---|
| Validación en servidor | `parseLeadForm`, siempre. La del navegador solo ahorra un viaje. |
| Saneamiento | Se quitan caracteres de control, invisibles y marcas bidi; se colapsan espacios |
| Topes de longitud | Nombre 120, teléfono 30 crudos, descripción 2 000. El HTML los repite, el servidor los obliga |
| Bots | Campo señuelo oculto (`sitioWeb`). Si viene lleno, el envío se descarta sin guardar nada |
| Límite por IP | 5 envíos por hora (`LEAD_POLICY`) |
| Envíos repetidos | Mismo teléfono + mismo despido en 6 h devuelve la misma respuesta sin duplicar registro |
| CSRF | Las server actions de Next.js solo aceptan POST con `Origin` == `Host`. Ninguna acción del proyecto se dispara con GET |
| XSS | React escapa todo. La descripción se pinta con `whitespace-pre-line`, nunca con `dangerouslySetInnerHTML` |
| Agendar la llamada | Cookie httpOnly **firmada** con el id del caso (`sl_lead`, 30 min). El id nunca viaja al HTML ni a la URL: sin esa cookie no existe forma de pedir "agenda para el caso X". El repositorio vuelve a exigir que el caso esté calificado |

---

## 6. Persistencia (y qué cambia en la Fase 2)

Hoy los datos viven en memoria (`src/lib/db/store.ts`) con registros DEMO
sembrados. Lo que ya está listo para la Fase 2:

- todo el acceso pasa por repositorios con firmas asíncronas;
- los repositorios devuelven **copias**, como devolvería Postgres filas;
- el esquema SQL ya está escrito en `ESQUEMA_BASE_DATOS.md`.

Lo que hay que hacer: sustituir el cuerpo de `src/lib/db/*.ts` por consultas.
Ni las páginas ni las acciones cambian.

**Limitaciones conocidas y aceptadas en Fase 1**: los envíos se pierden al
reiniciar el proceso, el consecutivo de folio cuenta por instancia, y los
límites de intentos también (en serverless cada instancia cuenta por separado,
así que el límite efectivo es más flojo que el número declarado).

---

## 7. Datos DEMO

La semilla crea seis solicitudes de ejemplo, tres calificadas y tres no —una de
ellas justo en el límite de 60 días—, para que el filtro sea **visible** en la
demostración: los tres no calificados no aparecen en el portal.

Pasan por el **mismo motor** que un envío real, así que si la regla cambia, la
demo cambia con ella y no queda un dato sembrado que mienta.

Van marcadas `isDemo` y la interfaz las rotula DEMO. En el detalle **no se
ofrece llamar ni escribir por WhatsApp**: los teléfonos sembrados tienen
formato válido y podrían pertenecer a alguien real ajeno al despacho.

---

## 8. Lo que NO existe, a propósito

- **Empresas, propuestas, calculadora de finiquito, bitácora, dashboard,
  gestión de usuarios.** Quedaron fuera del alcance de esta etapa. El código
  anterior está respaldado en
  `~/Desktop/respaldo-portal-solo-laboral-fase-anterior-20260821.tar.gz`.
- **Roles.** El portal tiene una pantalla y todos los que entran hacen lo mismo:
  ver y llamar. Una matriz de permisos para un solo permiso es ceremonia.
- **Borrado de solicitudes.** No hay ruta, acción ni función de repositorio que
  borre. La ausencia es la garantía.
- **Estados de seguimiento** (contactado / no respondió / contratado). Es el
  siguiente paso natural, pero no se pidió todavía.
- **Middleware de sesión.** La verificación de la cookie usa `node:crypto`, que
  no corre en el runtime edge. La guarda de servidor cubre todo `/portal`.

---

## 9. Identidad

Colores, tipografía (Poppins) y logotipo son los oficiales de Solo Laboral,
tomados de sololaboral.mx. Ningún componente tiene un color escrito a mano:
todo sale de los tokens `--sl-*`. Ver `BRAND.md`.
