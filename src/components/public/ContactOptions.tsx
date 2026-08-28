'use client'

import { useState, useTransition } from 'react'
import { useFormState } from 'react-dom'
import { CircleAlert, MessageCircle, PhoneCall } from 'lucide-react'
import { openWhatsAppAction, requestQuickCallAction } from '@/app/solicitud/actions'
import { INITIAL_QUICK_CALL_STATE } from '@/lib/domain/lead-submission'
import type { ContactOptions as Options } from '@/lib/domain/lead-submission'

/**
 * ¿CÓMO PREFIERES CONTINUAR?
 *
 * Solo se ve tras calificar. Quien no pasó el filtro no llega aquí: ofrecerle
 * tres formas de seguir a alguien a quien se le acaba de decir que no se puede
 * atender su caso sería cruel, y además falso.
 *
 * Dos caminos, no tres. Escribir por WhatsApp no obliga a hablar y deja el
 * mensaje ya redactado; pedir la llamada sirve a quien prefiere que le
 * marquen. Elegir una hora para más tarde —que existió aquí— se quitó por
 * decisión del despacho el 2026-08-28: multiplicaba las opciones justo en el
 * momento en que la persona ya hizo lo difícil, y las dos que quedan cubren
 * "quiero resolverlo ya" y "prefiero que me llamen".
 *
 * NINGUNA promete que el caso esté aceptado, porque no lo está: pasó un filtro
 * automático de dos condiciones y ningún abogado lo ha visto todavía.
 */
export function ContactOptions({ contact }: { contact: Options }) {
  const [whatsappOpened, setWhatsappOpened] = useState(false)
  const [, startTransition] = useTransition()
  const [quickCall, quickCallAction] = useFormState(
    requestQuickCallAction,
    INITIAL_QUICK_CALL_STATE,
  )

  if (quickCall.status === 'requested') {
    return (
      <div className="sl-in mt-7 rounded-sl border border-sl-success/25 bg-sl-success/5 px-5 py-5 text-left">
        <p className="flex items-center gap-2 text-sm font-semibold text-sl-success">
          <PhoneCall className="h-4 w-4 shrink-0" aria-hidden />
          Te vamos a llamar
        </p>
        <p className="mt-2 text-sm leading-relaxed text-sl-text">
          Intentaremos marcarte al número que nos diste en los próximos{' '}
          <strong className="font-semibold">
            {quickCall.window.min} a {quickCall.window.max} minutos
          </strong>
          .
        </p>
        {/* Se dice el límite del compromiso en la misma pantalla en que se
            adquiere: si a los veinte minutos no ha sonado el teléfono, la
            persona ya sabe que no se le olvidó a nadie. */}
        <p className="mt-2 text-xs leading-relaxed text-sl-muted">
          Si en ese rato no podemos, te llamaremos igual en cuanto se libere un abogado. Tu
          solicitud ya está registrada.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-7 text-left">
      <h3 className="text-center text-base font-semibold text-sl-text">
        ¿Cómo prefieres continuar?
      </h3>

      <div className="mt-4 space-y-3">
        {/* ─────────────────────────────── 1. WhatsApp ─────────────────────
            Va primero y con el botón lleno: es el camino con menos fricción
            —no obliga a hablar ni a esperar— y el único donde la persona no
            tiene que volver a contar nada, porque el mensaje va escrito. */}
        {contact.whatsappUrl ? (
          <section className="rounded-sl border border-sl-success/30 bg-sl-success/5 px-5 py-5">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-sl-text">
              <MessageCircle className="h-4 w-4 shrink-0 text-sl-success" aria-hidden />
              Hablar por WhatsApp
            </h4>
            <p className="mt-1.5 text-sm leading-relaxed text-sl-muted">
              Abre una conversación con nuestro equipo. Prepararemos un mensaje con tus datos
              básicos para que no tengas que explicar todo nuevamente.
            </p>

            <a
              href={contact.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setWhatsappOpened(true)
                // El registro va aparte y sin bloquear: la navegación a
                // WhatsApp ocurre igual aunque esto falle o llegue tarde. Lo
                // que se anota es que ABRIÓ — el sistema no puede saber si
                // llegó a enviar el mensaje, y no va a fingir que sí.
                startTransition(() => {
                  void openWhatsAppAction()
                })
              }}
              className="sl-btn-primary mt-4 w-full bg-sl-success hover:bg-sl-success/90 active:bg-sl-success"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              Hablar por WhatsApp
            </a>

            {whatsappOpened ? (
              <p className="sl-in mt-3 text-xs leading-relaxed text-sl-muted">
                Abrimos WhatsApp con el mensaje listo.{' '}
                <strong className="font-medium text-sl-text">Revísalo y envíalo tú</strong>: puedes
                cambiarlo o añadir lo que quieras antes de mandarlo. Si no se abrió, vuelve a tocar
                el botón.
              </p>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-sl-muted">
                Podrás revisar el mensaje antes de enviarlo.
              </p>
            )}
          </section>
        ) : null}

        {/* ─────────────────────── 2. Llamada próxima ───────────────────── */}
        <section className="rounded-sl border border-sl-border bg-sl-background px-5 py-5">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-sl-text">
            <PhoneCall className="h-4 w-4 shrink-0 text-sl-primary" aria-hidden />
            Prefiero que me llamen
          </h4>
          <p className="mt-1.5 text-sm leading-relaxed text-sl-muted">
            Podemos contactarte aproximadamente en los próximos {contact.quickCallWindow.min}–
            {contact.quickCallWindow.max} minutos.
          </p>

          {quickCall.status === 'error' ? (
            <p
              role="alert"
              className="sl-in mt-3 flex items-start gap-2 rounded-sl border border-sl-danger/30 bg-sl-danger/5 px-3 py-2.5 text-xs leading-relaxed text-sl-danger"
            >
              <CircleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden />
              <span>{quickCall.message}</span>
            </p>
          ) : null}

          <form action={quickCallAction}>
            <button type="submit" className="sl-btn-secondary mt-4 w-full">
              Solicitar llamada
            </button>
          </form>
        </section>
      </div>

      <p className="mt-4 text-center text-xs leading-relaxed text-sl-muted">
        Elijas lo que elijas, tu solicitud ya quedó registrada con tu folio.
      </p>
    </div>
  )
}
