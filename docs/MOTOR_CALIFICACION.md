# MOTOR DE CALIFICACIÓN

El corazón del sistema. Decide qué solicitudes llegan al equipo de Solo Laboral
y cuáles no.

Código: `src/lib/domain/qualification.ts` · Pruebas: `tests/qualification.test.ts`

---

## 1. Las dos condiciones

Ambas son obligatorias.

| # | Condición | Dónde vive |
|---|---|---|
| 1 | La entidad federativa es **Ciudad de México** o **Estado de México** | `QUALIFYING_STATES` en `src/lib/domain/states.ts` |
| 2 | El despido ocurrió hace **menos de 60 días** | `RECENCY_LIMIT_DAYS` en `qualification.ts` |

```
qualified = allowed_state AND (dismissal_days_ago < 60)
```

**Exactamente 60 días NO califica.** La regla es "menos de 60", y la
comparación es estricta (`<`, no `<=`). Hay una prueba que fija los tres casos
vecinos: 59 califica, 60 no, 61 no.

---

## 2. Lo que el motor NO hace

- **No usa IA.** Es una función pura de tres entradas. Mismas entradas, mismo
  resultado, siempre.
- **No corre en el navegador.** La decisión ocurre en la server action, del
  lado del servidor. La validación del formulario en el cliente solo ahorra un
  viaje; cualquiera puede saltársela.
- **No juzga el fondo del asunto.** Un caso calificado pasó un filtro de dos
  condiciones objetivas; que el despacho lo tome es otra decisión, humana, y
  fuera del alcance de esta versión.

---

## 3. Fechas

Todo el cálculo usa **fechas civiles** `"YYYY-MM-DD"` sin hora (`PlainDate` en
`src/lib/dates.ts`), nunca `Date` ni UTC.

Con un límite de exactamente 60 días, un desplazamiento de un día por zona
horaria decide si un caso entra o no. Por eso:

- la fecha de "hoy" se resuelve **siempre en `America/Mexico_City`**
  (`today()`), no en la zona del servidor;
- la diferencia se calcula con `daysBetween`, sobre días civiles, sin DST de
  por medio;
- el envío guarda la fecha civil que usó (`submittedOn`) además del instante
  real (`submittedAt`), para que la decisión sea reproducible después.

Una **fecha futura no es "no calificado"**: es un dato imposible. Se rechaza en
la validación del formulario con un error de campo, y si algo la dejara pasar,
el motor lanza `FutureDismissalDateError` en vez de guardar un registro malo.

---

## 4. Motivos

Cada envío guarda por qué se decidió lo que se decidió. Sirve para responder
más adelante "¿por qué no nos llegan solicitudes?" sin volver a calcular nada.

| `qualification_reason` | Significado |
|---|---|
| `qualified_allowed_state_and_recent_dismissal` | Cumplió las dos condiciones |
| `unqualified_state` | Entidad fuera de cobertura |
| `unqualified_dismissal_date` | Despido de 60 días o más |
| `unqualified_state_and_dismissal_date` | Fallaron las dos |

---

## 5. Días congelados

`dismissal_days_at_submission` guarda los días **al momento del envío** y no se
recalcula al leer.

Si se recalculara, un caso que entró con 20 días acabaría mostrando 70, 80 y 90
conforme pasa el tiempo, y parecería que el filtro dejó pasar algo que no
debía. El dato responde "¿qué tan reciente era el despido cuando esta persona
nos escribió?", que es la pregunta que importa.

---

## 6. Si el despacho cambia los criterios

Solo hay dos constantes que tocar, y cada una vive en un único lugar:

1. **Cobertura territorial** → `QUALIFYING_STATES` en `src/lib/domain/states.ts`
2. **Antigüedad máxima** → `RECENCY_LIMIT_DAYS` en `src/lib/domain/qualification.ts`

Las pruebas fijan ambos valores a propósito: cambiarlos hace fallar un test que
dice explícitamente que se está cambiando el alcance del despacho. Eso es
deliberado — no es un test frágil, es un seguro.

Los registros ya guardados **no** se recalculan. Cada uno conserva el veredicto
y el motivo con que entró.
