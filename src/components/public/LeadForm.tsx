'use client'

import { useEffect, useRef } from 'react'
import { useFormState } from 'react-dom'
import { submitLeadAction } from '@/app/solicitud/actions'
import { HONEYPOT_FIELD, INITIAL_LEAD_STATE } from '@/lib/domain/lead-submission'
import { LIMITS } from '@/lib/domain/lead-form'
import { STATE_OPTIONS } from '@/lib/domain/states'
import { DateField, PhoneField, SelectField, TextAreaField, TextField } from '@/components/ui/Field'
import { FormError, SubmitButton } from '@/components/ui/Form'
import { SubmissionResult } from '@/components/public/SubmissionResult'

/**
 * Formulario público.
 *
 * Cuatro campos obligatorios y uno opcional, en una sola columna. El orden es
 * el del guion: nombre → contacto → estado → fecha de despido → (descripción)
 * → enviar.
 *
 * Cuando el servidor responde, el formulario se sustituye por el resultado: la
 * persona no tiene que entender si "ya se envió", y no puede reenviar sin
 * querer. Nada de la decisión ocurre en este archivo — aquí solo se pinta.
 */
export function LeadForm({ todayDate }: { todayDate: string }) {
  const [state, formAction] = useFormState(submitLeadAction, INITIAL_LEAD_STATE)
  const headingRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const finished = state.status === 'qualified' || state.status === 'unqualified'

  // Tras enviar, el resultado queda arriba y con el foco: en el teléfono, la
  // respuesta aparecería fuera de pantalla si no se lleva a la persona a ella.
  useEffect(() => {
    if (finished) headingRef.current?.focus()
  }, [finished])

  /*
   * Si el envío vuelve con errores, el foco salta al PRIMER campo malo.
   *
   * En el teléfono esto es la diferencia entre arreglar el formulario y
   * abandonarlo: el botón está al final, el error puede estar cuatro campos
   * más arriba, y sin esto la persona ve la pantalla igual que antes de
   * tocar "Enviar" y concluye que la página no funciona.
   */
  useEffect(() => {
    if (state.status !== 'invalid') return
    const firstBad = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
    firstBad?.focus()
    firstBad?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [state])

  if (finished) {
    return (
      <div ref={headingRef} tabIndex={-1} className="sl-in outline-none">
        <SubmissionResult state={state} />
      </div>
    )
  }

  const fieldErrors = state.status === 'invalid' ? state.fieldErrors : {}
  const values = state.status === 'invalid' || state.status === 'blocked' ? state.values : undefined
  const topMessage =
    state.status === 'invalid' ? state.message : state.status === 'blocked' ? state.message : null

  return (
    <form ref={formRef} action={formAction} className="space-y-5" noValidate>
      <FormError message={topMessage} />

      <TextField
        name="fullName"
        label="Nombre completo"
        autoComplete="name"
        maxLength={LIMITS.nameMax}
        placeholder="Como aparece en tu identificación"
        required
        defaultValue={values?.fullName}
        error={fieldErrors.fullName}
      />

      <PhoneField
        name="phone"
        label="Teléfono o WhatsApp"
        autoComplete="tel-national"
        maxLength={LIMITS.phoneRawMax}
        placeholder="55 1234 5678"
        hint="Usaremos este número para contactarte una vez nuestro equipo revise tu caso."
        required
        defaultValue={values?.phone}
        error={fieldErrors.phone}
      />

      <SelectField
        name="state"
        label="Estado donde trabajabas"
        placeholder="Selecciona tu estado"
        options={STATE_OPTIONS}
        required
        defaultValue={values?.state}
        error={fieldErrors.state}
      />

      <DateField
        name="dismissalDate"
        label="Fecha de despido"
        max={todayDate}
        hint="El día en que te dijeron que ya no te presentaras."
        required
        defaultValue={values?.dismissalDate}
        error={fieldErrors.dismissalDate}
      />

      {/*
        OPCIONAL a propósito. El motor decide con la entidad y la fecha; esto
        solo le da contexto al abogado antes de marcar. Exigirlo costaba
        envíos de gente que escribe desde el teléfono y no sabe cuánto contar.
      */}
      <TextAreaField
        name="description"
        label="Cuéntanos qué pasó"
        rows={4}
        maxLength={LIMITS.descriptionMax}
        placeholder="¿Dónde trabajabas, cuánto tiempo y qué pasó?"
        hint="Con unas líneas basta. Si prefieres contarlo por teléfono, deja este espacio en blanco."
        optional
        defaultValue={values?.description}
        error={fieldErrors.description}
      />

      {/*
        Campo señuelo para bots. Oculto de la vista, del lector de pantalla y
        del tabulador; ninguna persona puede llenarlo por accidente.
        `display:none` va en línea para que no dependa de que cargue el CSS.
      */}
      <div style={{ display: 'none' }} aria-hidden>
        <label htmlFor={HONEYPOT_FIELD}>Sitio web</label>
        <input
          id={HONEYPOT_FIELD}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="pt-1">
        <SubmitButton size="lg">Enviar mi caso</SubmitButton>
        <p className="mt-3 text-xs leading-relaxed text-sl-muted">
          Al enviar, Solo Laboral usará estos datos únicamente para revisar tu situación y ponerse
          en contacto contigo. No se publican ni se comparten con terceros.
        </p>
      </div>
    </form>
  )
}
