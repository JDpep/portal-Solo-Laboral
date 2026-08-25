# DECISIONES PENDIENTES DEL CLIENTE

Cosas que **faltan** o que se resolvieron con un supuesto provisional. Ninguna
se inventó en silencio: cada una dice con qué se construyó y qué cambia cuando
Solo Laboral responda.

Este es el documento que hay que revisar antes de retomar el proyecto.

---

## BLOQUEANTES PARA SALIR A PRODUCCIÓN

### 1. Aviso de privacidad (LFPDPPP)

**Falta:** el aviso de privacidad del despacho.

El formulario recoge datos personales de identificación y de contacto de
terceros. La Ley Federal de Protección de Datos Personales en Posesión de los
Particulares exige poner el aviso a disposición del titular **en el momento de
la recolección**, y Solo Laboral es el responsable del tratamiento.

**Provisional:** bajo el botón de envío hay una línea que dice para qué se usan
los datos y que no se comparten. **No es un aviso de privacidad**; es lo mínimo
para no dejar la pantalla muda.

**Al recibirlo:** se publica en `/aviso-de-privacidad` y se enlaza desde el
formulario y el pie. **No salir a producción sin esto.**

---

### 2. Cuentas del despacho

**Falta:** quiénes entran al portal, con qué correos.

**Provisional:** una sola cuenta sembrada, visible en `/acceso` mientras dure la
Fase 1 (`abogados@sololaboral.demo` / `SoloLaboral2026`).

**Decisión tomada:** no se construyó pantalla de administración de usuarios. En
Fase 1 los cambios se perderían al reiniciar el proceso, y el alcance pedido no
la incluye. En Fase 2 las cuentas se dan de alta en la base.

**Si el despacho quiere administrar sus cuentas desde el portal**, es una
pantalla nueva y hay que pedirla.

---

### 3. Qué pasa cuando llega un caso calificado

**Falta:** ¿alguien debe **enterarse** al instante?

Hoy el caso aparece en `/portal` y ya. Si nadie abre el portal, nadie se entera.
Para un filtro cuyo valor es la rapidez del contacto, eso puede ser un hueco
grande.

**Opciones:** correo al despacho, WhatsApp, o nada (revisión manual del portal
varias veces al día).

**Provisional:** nada. No se eligió proveedor de correo ni de mensajería, y
elegirlo sin preguntar habría metido una dependencia y un costo recurrente que
el despacho no pidió.

---

## IMPORTANTES

### 4. ¿El estado es dónde trabajaba o dónde vive?

El alcance dice "Estado" y "no vive / no seleccionó Ciudad de México o Estado
de México".

**Provisional:** la etiqueta del campo dice **"Estado donde trabajabas"**,
porque la competencia laboral sigue al centro de trabajo, no al domicilio del
trabajador. Si el criterio del despacho es el domicilio, es cambiar una cadena
de texto en `src/components/public/LeadForm.tsx`.

---

### 5. La descripción es opcional

**Decisión tomada (2026-08-24):** el campo "Cuéntanos qué pasó" dejó de ser
obligatorio y tampoco tiene longitud mínima. Antes exigía 15 caracteres.

El motor de calificación **no lee la descripción**: decide con la entidad y la
fecha de despido. Todo lo que la obligatoriedad producía, entonces, era
abandono — redactar es la parte cara del formulario y la mayoría lo llena desde
el teléfono, recién despedida. El contexto que el despacho pierde cuando el
campo llega vacío es contexto para la llamada, no la llamada.

Cuando falta, el detalle del caso lo dice explícitamente y lo convierte en la
primera pregunta del abogado, en vez de mostrar un hueco.

**Si el despacho prefiere exigirla**, se vuelve a marcar `required` en
`LeadForm.tsx` y se restaura la validación en `parseLeadForm` — a costa de que
más gente abandone el formulario.

---

### 6. Envíos repetidos: ventana de 6 horas

**Provisional:** el mismo teléfono con la misma fecha de despido dentro de 6 h
recibe la misma respuesta sin crear un segundo registro.

Cubre el doble clic y el "no vi la confirmación". Si el despacho prefiere ver
cada intento, se quita; si prefiere una ventana más larga, se cambia
`DUPLICATE_WINDOW_MS`.

---

### 7. Límite de 5 envíos por hora y por IP

**Provisional:** generoso a propósito. Detrás de una misma IP puede haber un
cibercafé o el NAT de una operadora móvil, y este formulario es la puerta de
entrada de alguien que acaba de perder su trabajo: cerrar de más es peor que
dejar pasar un envío repetido.

**Ojo, Fase 1:** el conteo es por instancia. En serverless el límite efectivo es
más flojo que el número declarado. Se arregla al mover el contador a la base.

---

### 8. Se guardan los no calificados

**Decisión tomada:** sí, se guardan todos, con su motivo.

Sin ellos nadie puede responder "¿cuánta gente nos busca y por qué la dejamos
fuera?" — que es justo la información que permitiría al despacho decidir si
vale la pena ampliar la cobertura o el plazo. **Nunca aparecen en el portal.**

**Si el despacho prefiere no conservarlos**, hay que decirlo: implica cambiar la
decisión, no solo ocultar una pantalla.

---

### 9. Qué sigue después de la llamada

Fuera de alcance por ahora, y el paso natural siguiente: que el abogado marque
**Contactado / No respondió / Cliente potencial / Contratado / Descartado**.

El esquema ya prevé cómo entraría (tabla `lead_contacts` append-only, ver
`ESQUEMA_BASE_DATOS.md`) para no perder el historial de intentos.

---

### 11. Agendar la llamada: hora exacta, pero sigue siendo una preferencia

**Decisión tomada (2026-08-24), REVISADA el 2026-08-25:** tras calificar, la
persona elige uno de los próximos cinco días y una **hora exacta**, de 9:30 a
17:30 en pasos de diez minutos. Se guarda en el caso y el abogado la ve en la
lista y en el detalle.

La versión original pedía solo una franja (mañana / tarde). El despacho pidió
hora exacta: una franja de cinco horas obliga a quien espera la llamada a estar
pendiente toda la mañana, que era justo el problema que esto venía a resolver.

**Se ofrecen los cinco días corridos, sábado y domingo incluidos.** Quien acaba
de perder su trabajo suele estar disponible justo el fin de semana, y esto no
es una agenda que bloquee huecos: es una preferencia que el abogado lee antes
de marcar. Si el despacho no atiende sábados, el costo de que alguien lo pida
es una llamada el lunes — bastante menor que el de esconder los dos días en que
más gente puede contestar el teléfono.

**Sigue sin ser una reserva, y el texto lo dice.** Detrás de la hora elegida no
hay nada: el sistema no conoce la disponibilidad de los abogados, no sabe quién
atiende, y no bloquea el hueco. Dos personas pueden pedir las 10:00 del mismo
día y ninguna de las dos se entera. Por eso el copy dice "haremos lo posible por
marcarte en ella" y en ningún momento "tienes una cita".

**Este es el riesgo vivo de esta decisión.** Una hora exacta se lee como un
compromiso aunque el texto diga otra cosa: quien pide las 10:00 va a sentirse
incumplido a las 10:15 de una forma en que no se sentía cuando había pedido "por
la mañana". El producto entero está construido sobre no prometer de más, así que
esto conviene vigilarlo con las primeras llamadas reales. Si duele, hay dos
salidas: agenda de verdad (punto 3 de la lista de abajo) o volver a franjas.

**El paso es opcional** y también se dice: el abogado llama igual. Quien no
quiera pensar en horarios en ese momento se lo salta sin perder nada.

**Autorización:** cookie httpOnly firmada con el id del caso, 30 minutos. El id
no viaja al HTML ni a la URL, así que nadie puede agendar sobre la solicitud de
otra persona adivinando identificadores.

**Lo que hay que preguntarle al despacho:**

1. **El horario de atención.** Hoy se ofrece 9:30–17:30, el mismo para todos los
   días, incluido el fin de semana. Se cambia en `CALL_TIME_FIRST_MINUTE`,
   `CALL_TIME_LAST_MINUTE` y `CALL_TIME_STEP_MINUTES`
   (`src/lib/domain/call-time.ts`), que es de donde salen a la vez las opciones
   que se pintan y las que el servidor acepta.
   **Falta saber si el sábado y el domingo tienen el mismo horario**, porque hoy
   se ofrece el horario completo también esos días.
2. **Qué pasa con lo que se pide en fin de semana o en festivo.** No se excluye
   ningún día: hoy se puede pedir domingo, o el 16 de septiembre. Si el despacho
   quiere excluir alguno, se filtra en `callDayOptions` — misma función que
   valida en el servidor, así que no hay forma de saltárselo desde el navegador.
3. **Si quieren agenda de verdad** —con disponibilidad, huecos y confirmación—
   es otra pieza, no un ajuste de esta: implica saber quién atiende y cuándo.

**Sigue pendiente el punto 3 de este documento**: nadie se entera al instante
de que entró un caso, tenga hora pedida o no. Que alguien pida "mañana a las
9:30" no sirve si nadie abre el portal antes — y con hora exacta este pendiente
pesa más que antes, no menos.

---

### 12. El no dice por qué

**Decisión tomada (2026-08-24):** la pantalla de no elegibilidad ya no da un
motivo general. Dice cuál de las dos condiciones falló, con el texto del
despacho:

- **Fuera de cobertura:** "…actualmente solo trabajamos en la Ciudad de México
  y en el área metropolitana."
- **Despido no reciente:** "…lamentablemente tu despido ocurrió hace 60 días o
  más, por lo que no podríamos proceder con tu caso."
- **Ambas:** las dos en un solo párrafo.

Antes se callaba a propósito, para no enseñar qué contestar para pasar el
filtro. El despacho decidió lo contrario: quien queda fuera merece saber por
qué, y saberlo es lo que le permite buscar ayuda donde sí puedan atenderla.

**El costo sigue ahí y es conocido:** el texto también le enseña a quien
quiera insistir qué estado o qué fecha poner. El motor no puede distinguirlo,
porque no verifica ninguno de los dos datos. Si empiezan a llegar casos
falseados, el remedio no es volver al mensaje mudo: es verificar en la llamada.

**Dos precisiones de redacción**, por si el despacho quiere revisarlas:

1. Se dice **"60 días o más"** y no "mayor a 60 días". El motor exige *menos*
   de 60, así que quien lleva exactamente 60 tampoco pasa: decirle "mayor a
   60" sería falso justo en el borde.
2. El texto dice **"área metropolitana"**, pero el motor acepta **todo el
   Estado de México**, no solo la zona conurbada. Quien lea el mensaje ya está
   fuera de ambos, así que nadie se queda sin atención por esto — pero si el
   despacho sí atiende Toluca o Tejupilco, conviene decir "Estado de México".

---

## RESUELTO

### 10. Identidad visual

Tomada de **sololaboral.mx** el 2026-08-20: logotipo sin modificar, colores
`#2B346B` marino / `#00A9F3` cian / `#00E7AD` menta, tipografía Poppins.
Detalle en `BRAND.md`. Si el despacho entrega un manual de marca, solo cambian
valores, no componentes.
