'use client'

import { useId, useState } from 'react'
import clsx from 'clsx'
import { formatPhone, normalizePhone } from '@/lib/domain/phone'

/**
 * Campos de formulario.
 *
 * Reglas que aplican a todos, porque el formulario público lo llena gente en
 * el peor día de su año y desde el teléfono:
 *  - la etiqueta siempre está visible, nunca es solo un placeholder;
 *  - el error va pegado al campo y se anuncia con `aria-describedby`;
 *  - el campo con error queda marcado con `aria-invalid`, no solo con color;
 *  - lo opcional se rotula "opcional", no se deduce de la ausencia del
 *    asterisco: nadie audita asteriscos mientras llena un formulario.
 */

interface BaseProps {
  name: string
  label: string
  hint?: string
  error?: string
  required?: boolean
  /** Rotula el campo como prescindible. Excluyente con `required`. */
  optional?: boolean
  disabled?: boolean
}

function Wrapper({
  id,
  label,
  hint,
  error,
  required,
  optional,
  children,
  footer,
}: BaseProps & { id: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="sl-label">
        {label}
        {required ? (
          <span className="ml-0.5 text-sl-danger" aria-hidden>
            *
          </span>
        ) : null}
        {optional ? (
          <span className="ml-1.5 text-xs font-normal text-sl-muted">(opcional)</span>
        ) : null}
      </label>
      {children}
      {footer}
      {hint ? (
        <p id={`${id}-hint`} className="sl-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="sl-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function describedBy(id: string, props: BaseProps): string | undefined {
  const ids = [props.hint ? `${id}-hint` : null, props.error ? `${id}-error` : null].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}

export function TextField(
  props: BaseProps & {
    defaultValue?: string
    placeholder?: string
    type?: 'text' | 'email' | 'password' | 'tel'
    autoComplete?: string
    inputMode?: 'text' | 'tel' | 'email' | 'numeric'
    maxLength?: number
  },
) {
  const id = useId()
  return (
    <Wrapper {...props} id={id}>
      <input
        id={id}
        name={props.name}
        type={props.type ?? 'text'}
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        maxLength={props.maxLength}
        required={props.required}
        disabled={props.disabled}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy(id, props)}
        className={clsx('sl-input', props.error && 'border-sl-danger')}
      />
    </Wrapper>
  )
}

/**
 * Teléfono con separadores en vivo.
 *
 * Agrupa mientras la persona teclea ("5512345678" → "55 1234 5678") usando la
 * MISMA función que usa el portal para mostrarlo, así que lo que se ve al
 * escribir es idéntico a lo que verá el abogado. El valor que viaja al
 * servidor sigue siendo el texto con espacios: `normalizePhone` lo limpia allá,
 * que es donde manda la validación. Formatear aquí no valida nada — solo hace
 * evidente el error de haber tecleado nueve dígitos.
 */
export function PhoneField(
  props: BaseProps & {
    defaultValue?: string
    placeholder?: string
    autoComplete?: string
    maxLength?: number
  },
) {
  const id = useId()
  const [value, setValue] = useState(() => group(props.defaultValue ?? ''))

  function group(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 10)
    // Solo agrupa cuando ya hay 10 dígitos; antes, cualquier corte sería adivinar
    // la longitud de la LADA y movería el cursor bajo los dedos de la persona.
    return digits.length === 10 ? formatPhone(normalizePhone(digits) ?? digits) : raw
  }

  return (
    <Wrapper {...props} id={id}>
      <input
        id={id}
        name={props.name}
        type="tel"
        inputMode="tel"
        value={value}
        onChange={(e) => setValue(group(e.target.value))}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        maxLength={props.maxLength}
        required={props.required}
        disabled={props.disabled}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy(id, props)}
        className={clsx('sl-input tabular-nums', props.error && 'border-sl-danger')}
      />
    </Wrapper>
  )
}

/**
 * FECHA DE DESPIDO — día, mes y año, en tres listas.
 *
 * Antes era un `<input type="date">`. El problema no era el selector sino lo
 * que se lee ANTES de tocarlo: el navegador pinta el formato según SU idioma,
 * y un Chrome en inglés muestra "mm/dd/yyyy" a una persona en México. No hay
 * atributo que lo cambie — el formato no es del sitio, es del navegador. Quien
 * escribiera 09/08 pensando en el 9 de agosto habría enviado el 8 de
 * septiembre, y con el límite de 60 días esa confusión decide si el despacho
 * puede tomar el caso.
 *
 * Con el mes por su NOMBRE no hay forma de equivocarse: "agosto" no se puede
 * leer como día. Y en el teléfono son tres toques sobre la rueda del sistema,
 * sin teclear nada.
 *
 * El valor que viaja al servidor sigue siendo "YYYY-MM-DD" en un campo oculto,
 * así que la validación de allá no cambia ni una línea.
 */
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function DateField(
  props: BaseProps & {
    defaultValue?: string | null
    min?: string
    max?: string
  },
) {
  const id = useId()
  const [year, setYear] = useState(() => props.defaultValue?.slice(0, 4) ?? '')
  const [month, setMonth] = useState(() => props.defaultValue?.slice(5, 7) ?? '')
  const [day, setDay] = useState(() => props.defaultValue?.slice(8, 10) ?? '')

  // El tope llega como "YYYY-MM-DD" (hoy). Se ofrecen los últimos once años:
  // cubre cualquier despido real y mantiene la lista corta. Uno más viejo no
  // calificaría de todos modos, y el servidor sigue rechazando el futuro.
  const lastYear = Number((props.max ?? '').slice(0, 4)) || new Date().getFullYear()
  const years = Array.from({ length: 11 }, (_, i) => String(lastYear - i))

  // Los días que existen en ese mes. Sin esto se podría elegir 31 de febrero,
  // y el error llegaría hasta el servidor en vez de no poder ni escogerse.
  const daysInMonth =
    year && month ? new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate() : 31
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'))

  const complete = year && month && day && Number(day) <= daysInMonth
  const value = complete ? `${year}-${month}-${day}` : ''

  return (
    <div>
      <span id={`${id}-label`} className="sl-label block">
        {props.label}
        {props.required ? (
          <span className="ml-0.5 text-sl-danger" aria-hidden>
            *
          </span>
        ) : null}
      </span>

      {/* `required` en cada lista: si falta una, el navegador lo dice antes de
          gastar un viaje al servidor. El valor real va en el campo oculto. */}
      <div role="group" aria-labelledby={`${id}-label`} className="flex gap-2">
        <select
          aria-label="Día"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          required={props.required}
          disabled={props.disabled}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={describedBy(id, props)}
          className={clsx('sl-input w-24', props.error && 'border-sl-danger')}
        >
          <option value="" disabled>
            Día
          </option>
          {days.map((d) => (
            <option key={d} value={d}>
              {Number(d)}
            </option>
          ))}
        </select>

        <select
          aria-label="Mes"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          required={props.required}
          disabled={props.disabled}
          aria-invalid={props.error ? true : undefined}
          className={clsx('sl-input flex-1 capitalize', props.error && 'border-sl-danger')}
        >
          <option value="" disabled>
            Mes
          </option>
          {MESES.map((name, i) => (
            <option key={name} value={String(i + 1).padStart(2, '0')}>
              {name}
            </option>
          ))}
        </select>

        <select
          aria-label="Año"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          required={props.required}
          disabled={props.disabled}
          aria-invalid={props.error ? true : undefined}
          className={clsx('sl-input w-28', props.error && 'border-sl-danger')}
        >
          <option value="" disabled>
            Año
          </option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <input type="hidden" name={props.name} value={value} />

      {props.hint ? (
        <p id={`${id}-hint`} className="sl-hint">
          {props.hint}
        </p>
      ) : null}
      {props.error ? (
        <p id={`${id}-error`} className="sl-error" role="alert">
          {props.error}
        </p>
      ) : null}
    </div>
  )
}

export function SelectField(
  props: BaseProps & {
    defaultValue?: string
    placeholder?: string
    options: Array<{ value: string; label: string }>
  },
) {
  const id = useId()
  return (
    <Wrapper {...props} id={id}>
      <select
        id={id}
        name={props.name}
        defaultValue={props.defaultValue ?? ''}
        required={props.required}
        disabled={props.disabled}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy(id, props)}
        className={clsx('sl-input', props.error && 'border-sl-danger')}
      >
        {props.placeholder ? (
          <option value="" disabled>
            {props.placeholder}
          </option>
        ) : null}
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  )
}

export function TextAreaField(
  props: BaseProps & {
    defaultValue?: string
    placeholder?: string
    rows?: number
    maxLength?: number
  },
) {
  const id = useId()
  const [length, setLength] = useState(props.defaultValue?.length ?? 0)
  const max = props.maxLength

  // El contador aparece solo cuando ya queda poco. Mostrar "0 / 2000" desde el
  // principio parece una cuota que hay que llenar, justo lo contrario de lo que
  // dice la etiqueta "opcional".
  const near = max !== undefined && length > max * 0.8

  return (
    <Wrapper
      {...props}
      id={id}
      footer={
        near ? (
          <p
            className={clsx(
              'mt-1 text-right text-xs tabular-nums',
              length >= (max as number) ? 'font-medium text-sl-warning' : 'text-sl-muted',
            )}
            aria-live="polite"
          >
            {length} / {max} caracteres
          </p>
        ) : null
      }
    >
      <textarea
        id={id}
        name={props.name}
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        rows={props.rows ?? 5}
        maxLength={max}
        required={props.required}
        disabled={props.disabled}
        onChange={(e) => setLength(e.target.value.length)}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy(id, props)}
        className={clsx('sl-input resize-y', props.error && 'border-sl-danger')}
      />
    </Wrapper>
  )
}
