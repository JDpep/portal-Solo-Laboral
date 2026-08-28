import { CircleCheck, Info } from 'lucide-react'
import { ContactOptions } from '@/components/public/ContactOptions'
import type { LeadSubmissionState, UnqualifiedReason } from '@/lib/domain/lead-submission'

/**
 * Las dos respuestas posibles al enviar el formulario.
 *
 * El texto está medido con cuidado en ambos casos y NO se toca al rediseñar:
 *
 *  · CALIFICA — dice "cumple con los criterios iniciales de revisión", NUNCA
 *    "tu caso fue aceptado". El asunto pasó un filtro automático de dos
 *    condiciones; ningún abogado lo ha visto todavía y prometer lo contrario
 *    sería comprometer al despacho con algo que aún no decidió. Tampoco se
 *    promete un plazo, porque no hay ninguno acordado.
 *
 *  · NO CALIFICA — es un no claro, para que la persona no se quede esperando
 *    una llamada, pero sin regañarla ni explicarle jurisprudencia. Desde el
 *    2026-08-24, por decisión del despacho, SÍ se le dice cuál de las dos
 *    condiciones falló: quien queda fuera merece saber por qué, y saberlo es
 *    lo que le permite buscar ayuda en el lugar correcto. El costo conocido es
 *    que también le enseña qué contestar para pasar el filtro.
 *
 * El folio es el objeto central de la pantalla: es lo que hay que guardar, lo
 * que en el teléfono se lee (o se captura) antes que cualquier párrafo, y lo
 * que después convierte un WhatsApp suelto en un caso con historia — el
 * abogado lo teclea en el portal y tiene delante todo lo que la persona
 * contestó.
 *
 * Debajo del folio, las tres formas de continuar. Ver `ContactOptions`.
 */
export function SubmissionResult({ state }: { state: LeadSubmissionState }) {
  if (state.status === 'qualified') {
    return (
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sl-success/10">
          <CircleCheck className="h-8 w-8 text-sl-success" aria-hidden />
        </span>

        <h2 className="mt-4 text-xl font-semibold text-sl-text sm:text-2xl">
          Tu información cumple con nuestros criterios iniciales
        </h2>

        <div className="mx-auto mt-3 max-w-sm space-y-3 text-sm leading-relaxed text-sl-text sm:text-base">
          <p>Gracias por compartir tu situación.</p>
          <p>
            Un abogado de Solo Laboral podrá revisar la información que nos proporcionaste.
          </p>
        </div>

        <dl className="mt-7 rounded-sl border border-sl-success/25 bg-sl-success/5 px-5 py-5">
          <dt className="sl-eyebrow">Folio de referencia</dt>
          <dd className="mt-1.5 font-mono text-2xl font-semibold tracking-tight text-sl-text sm:text-3xl">
            {state.folio}
          </dd>
          <dd className="mt-2 text-xs leading-relaxed text-sl-muted">
            Guárdalo o toma una captura de pantalla, por si necesitas mencionarlo cuando te
            llamemos.
          </dd>
        </dl>

        {/*
          Las vías de contacto SOLO se ofrecen aquí, en la rama que calificó.
          En la otra sería cruel: proponerle horario —o una conversación— a
          alguien a quien se le acaba de decir que no se puede atender su caso.
        */}
        <ContactOptions contact={state.contact} />
      </div>
    )
  }

  return (
    <div className="text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sl-primary-soft">
        <Info className="h-8 w-8 text-sl-primary" aria-hidden />
      </span>

      <h2 className="mt-4 text-xl font-semibold text-sl-text sm:text-2xl">
        Gracias por compartirnos tu caso.
      </h2>

      <div className="mx-auto mt-3 max-w-sm space-y-3 text-sm leading-relaxed text-sl-text sm:text-base">
        {unqualifiedParagraphs(state.status === 'unqualified' ? state.reason : undefined).map(
          (paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ),
        )}
      </div>

      <p className="mx-auto mt-6 max-w-sm border-t border-sl-border pt-5 text-sm text-sl-muted">
        Te deseamos mucha suerte y esperamos que encuentres la orientación que necesitas.
      </p>
    </div>
  )
}

/**
 * El texto del no, según la condición que falló.
 *
 * Todos abren igual —"por más que nos encantaría asesorarte"— porque el motivo
 * no es una falta de la persona: es el alcance del despacho.
 *
 * Sobre los días: el motor exige MENOS de 60, así que exactamente 60 tampoco
 * pasa. Por eso el texto dice "60 días o más" y no "más de 60": decirle lo
 * segundo a quien lleva justo 60 sería falso.
 */
function unqualifiedParagraphs(reason: UnqualifiedReason | undefined): string[] {
  const COVERAGE =
    'Por más que nos encantaría asesorarte, actualmente solo trabajamos en la Ciudad de México y en el área metropolitana.'
  const RECENCY =
    'Por más que nos encantaría asesorarte, lamentablemente tu despido ocurrió hace 60 días o más, por lo que no podríamos proceder con tu caso.'

  switch (reason) {
    case 'unqualified_state':
      return [COVERAGE]
    case 'unqualified_dismissal_date':
      return [RECENCY]
    case 'unqualified_state_and_dismissal_date':
      return [
        'Por más que nos encantaría asesorarte, actualmente solo trabajamos en la Ciudad de México y en el área metropolitana, y además tu despido ocurrió hace 60 días o más, por lo que no podríamos proceder con tu caso.',
      ]
    default:
      // Sin motivo: el mensaje general de siempre. Nunca se afirma cuál falló.
      return [
        'Con base en los datos proporcionados, en este momento tu situación no cumple con los criterios iniciales de atención de Solo Laboral.',
        'Por esta razón no podremos continuar con la revisión de tu caso.',
      ]
  }
}
