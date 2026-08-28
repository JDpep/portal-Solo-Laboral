# ESQUEMA DE BASE DE DATOS

**La fuente de verdad son las migraciones**, en `db/migrations/`. Este
documento explica POR QUÉ el esquema es como es; el SQL exacto vive allí y se
aplica con `npm run db:migrate`.

Postgres (Supabase, provisionado desde Vercel). El navegador nunca habla con la
base: todas las tablas tienen RLS activo y **ninguna política**, así que la
llave publicable no lee ni escribe nada. La única puerta es el servidor.

---

## Las nueve tablas

| Tabla | Qué guarda |
|---|---|
| `staff_users` | Cuentas del despacho. Roles `admin` y `lawyer`. |
| `leads` | Todos los envíos y las altas manuales. Califiquen o no. |
| `cases` | Los leads que el despacho decidió tomar. |
| `case_checklist_templates` · `_template_items` | La ruta del caso, como datos editables. |
| `case_checklist_items` | Los pasos REALES de un caso, copiados de la plantilla. |
| `calendar_events` | Llamadas, audiencias, conciliaciones, juntas. |
| `case_status_history` | Cada cambio de estado de un caso. Append-only. |
| `audit_logs` | Quién hizo qué. Append-only. |

---

## Lo que la BASE hace cumplir, y no la aplicación

Estas garantías están puestas en Postgres a propósito: una comprobación en el
código se puede olvidar al escribir la siguiente pantalla, y dos peticiones
simultáneas pueden ganarla las dos.

**Un lead se convierte en caso una sola vez** — `cases.lead_id UNIQUE`. Dos
abogados pulsando el botón a la vez: uno crea el caso, el otro recibe un error
claro. No hay forma de acabar con dos casos para la misma persona.

**El folio es único y consecutivo** — `folio_seq` + `next_folio()`. Diez altas
en el mismo milisegundo se llevan diez folios distintos. Nadie lo escribe a
mano.

**Lo que el despacho puede ver** — `leads.visible_to_staff`, columna generada:
`qualification_status = 'qualified' OR source <> 'web_form'`. Los envíos del
formulario solo si pasaron el filtro; lo capturado a mano siempre, porque
registrarlo ya fue la decisión. Un listado nuevo hereda el filtro por
construcción. El CHECK `folio_solo_si_visible` impide que folio y visibilidad
se contradigan.

**La historia no se reescribe** — `audit_logs` y `case_status_history` tienen
un trigger que RECHAZA `UPDATE` y `DELETE`. Aplica también a la clave de
servicio: ni la aplicación ni un administrador pueden borrar su rastro. (Las
pruebas de integración tienen que usar `TRUNCATE` para limpiarlas: que la
propia suite tenga que esquivarlo es la prueba de que el candado está puesto.)

**Nada se borra** — no hay `DELETE` en ningún repositorio, y las claves
foráneas son `ON DELETE RESTRICT`. Un caso que no continúa se cierra con su
motivo; una cuenta que se va se desactiva.

**Una sola llamada pedida por lead** — índice único parcial sobre
`calendar_events (lead_id) WHERE source = 'web_form' AND event_type = 'call'`.
Si la persona cambia de opinión, se mueve el mismo evento. Un formulario
reenviado dos veces por una conexión mala no llena la agenda de duplicados.

**La conversión es atómica** — `convert_lead_to_case()`, en plpgsql. Crea el
caso, copia la ruta desde la plantilla, mueve el lead, arrastra sus eventos,
anota el estado inicial y firma la bitácora. Si algo falla, no queda nada a
medias.

**La etapa actual no se escribe a mano** — un trigger la deriva del primer paso
sin terminar de la ruta, así que no puede contradecir lo que se ve al abrir el
caso.

---

## Decisiones de tipos

**`dismissal_date` es `date`, no `timestamptz`.** Es una fecha civil sin hora:
convertirla a UTC la corre un día según dónde viva el servidor, y con el límite
de exactamente 60 días ese día decide si el caso entra o no. Se lee siempre
como texto (`::text`) por la misma razón.

**`dismissal_days_at_submission` está congelado.** No se recalcula al leer. Si
lo hiciera, un prospecto calificado empezaría a mostrar 70, 80, 90 días y
parecería que el filtro falló.

**`phone` es `char(10)`** — diez dígitos normalizados, sin lada de país ni
separadores, con un CHECK que lo obliga.

**Los pasos de la ruta se COPIAN, no se referencian.** Si la plantilla cambia
mañana, los casos en curso no se alteran debajo de quien los está trabajando.

---

## Cómo se aplica

```bash
npm run db:migrate                    # aplica lo pendiente en public
npm run db:migrate -- --dry           # dice qué falta, sin tocar nada
npm run db:migrate -- --schema test   # réplica completa para las pruebas
npm run db:seed                       # cuentas del despacho
npm run db:seed -- --demo             # además, seis solicitudes de ejemplo
```

Cada migración corre **dentro de una transacción** y queda anotada en
`schema_migrations`: o entra entera o no entra.

El esquema `test` es una copia exacta —mismas tablas, mismos triggers, mismas
restricciones— en la misma base. Las pruebas de integración comprueban las
garantías de arriba contra Postgres de verdad sin poder rozar un dato del
despacho.

---

## Lo que NO tiene el esquema

- **Ninguna función de borrado.** La ausencia es la garantía.
- **`whatsapp_message_sent`.** Con un enlace `wa.me` el sistema no puede saber
  si la persona envió el mensaje: solo que abrió la aplicación. Se guarda
  `whatsapp_opened_at` y nada más. El día que exista WhatsApp Business API y
  llegue confirmación real, eso entra como dato aparte y con otro nombre.
- **`lead_contact_events`.** Los eventos con hora ya viven en
  `calendar_events` —que es lo que el abogado abre en su agenda— y el rastro de
  lo que hizo el prospecto ya vive en `audit_logs`. Una tercera tabla habría
  creado dos versiones de la misma verdad.
