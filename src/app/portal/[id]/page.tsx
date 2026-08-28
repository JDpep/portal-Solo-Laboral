import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarClock, MessageCircle, Phone } from 'lucide-react'
import { requireStaff } from '@/lib/auth/guard'
import { findLeadForStaff } from '@/lib/db/leads'
import { findCaseByLeadId } from '@/lib/db/cases'
import { listActiveUsers } from '@/lib/db/users'
import { ConvertLead } from '@/components/portal/ConvertLead'
import {
  CONTACT_METHOD_LABEL,
  LEAD_SOURCE_LABEL,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_TONE,
} from '@/lib/domain/labels'
import { formatDate, formatDateLong, formatDateTime } from '@/lib/dates'
import { formatPhone, telHref, whatsappHref } from '@/lib/domain/phone'
import { stateLabel } from '@/lib/domain/states'
import { formatCallTime } from '@/lib/domain/call-time'
import { Badge, DaysBadge, DemoBadge } from '@/components/ui/Badge'
import { DemoNotice } from '@/components/ui/States'

export const dynamic = 'force-dynamic'

/**
 * DETALLE DEL CASO. Todo lo que la persona escribió, para que el abogado
 * entienda el contexto antes de marcar el teléfono.
 *
 * `findLeadForStaff` devuelve null también cuando el registro existe pero
 * NO calificó: adivinar un id no puede convertirse en una forma de leer las
 * solicitudes que el filtro dejó fuera.
 *
 * La pantalla se lee de arriba abajo en el orden en que sirve: quién es y cómo
 * marcarle → qué contó → los datos con que se calificó. La descripción subió
 * al segundo lugar porque es lo único que el abogado necesita HABER LEÍDO
 * antes de que contesten la llamada; abajo del todo no la alcanzaba a leer.
 */
export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  await requireStaff()

  const lead = await findLeadForStaff(params.id)
  if (!lead) notFound()

  // Si ya se convirtió, esta ficha deja de ofrecer convertir y pasa a ser la
  // puerta al caso: dos casos para la misma persona es justo lo que el
  // UNIQUE de la base impide, y la pantalla no debería ni sugerirlo.
  const existingCase = lead.caseId ? await findCaseByLeadId(lead.id) : null
  const users = existingCase ? [] : await listActiveUsers()

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/portal"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-sl-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Casos por contactar
      </Link>

      {/*
        Un registro sembrado NO ofrece llamar ni escribir. Los teléfonos de la
        demo tienen formato válido y podrían pertenecer a alguien real: un clic
        de más durante una demostración sería una llamada a un desconocido.
      */}
      {lead.isDemo ? (
        <div className="mb-4">
          <DemoNotice>
            <span className="text-sl-muted">
              Registro de demostración. No corresponde a una solicitud real y no se puede contactar.
            </span>
          </DemoNotice>
        </div>
      ) : null}

      <div className="sl-card sl-in overflow-hidden">
        <div className="border-b border-sl-border bg-sl-primary-soft/50 px-5 py-5 sm:px-7">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-sl-primary">
              {lead.folio}
            </span>
            <Badge tone={LEAD_STATUS_TONE[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
            {lead.isDemo ? <DemoBadge /> : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-sl-text">{lead.fullName}</h1>
          <p className="mt-1 text-sm text-sl-muted">
            Registrado el {formatDateTime(lead.submittedAt)}
          </p>

          {/*
            La acción que importa en esta pantalla es llamar. Va arriba, es
            grande, y en el teléfono ocupa el ancho completo: el abogado abre
            este caso con el mismo aparato con el que va a marcar.
          */}
          {lead.isDemo ? (
            <p className="mt-4 text-sm tabular-nums text-sl-muted">{formatPhone(lead.phone)}</p>
          ) : (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <a href={telHref(lead.phone)} className="sl-btn-primary sm:w-auto">
                <Phone className="h-4 w-4" aria-hidden />
                Llamar <span className="tabular-nums">{formatPhone(lead.phone)}</span>
              </a>
              <a
                href={whatsappHref(lead.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="sl-btn-secondary sm:w-auto"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                WhatsApp
              </a>
            </div>
          )}
        </div>

        {/*
          La hora pedida va ARRIBA del relato y pegada a los botones de
          contacto, porque no informa: condiciona la acción. Enterarse de que
          la persona pidió las cinco de la tarde después de haberle marcado a
          las diez de la mañana no sirve de nada.
        */}
        {lead.callPreference ? (
          <div className="flex items-start gap-2.5 border-b border-sl-border bg-sl-secondary/5 px-5 py-4 sm:px-7">
            <CalendarClock
              className="mt-0.5 h-4 w-4 shrink-0 text-sl-secondary-strong"
              aria-hidden
            />
            <div>
              <p className="text-sm text-sl-text">
                Pidió que le llamaran el{' '}
                <strong className="font-semibold">
                  {formatDateLong(lead.callPreference.date)}
                </strong>{' '}
                a las{' '}
                <strong className="font-semibold">
                  {formatCallTime(lead.callPreference.time)}
                </strong>
                .
              </p>
              <p className="mt-1 text-xs text-sl-muted">
                Es la hora que pidió. No hay agenda detrás: nadie más la tiene bloqueada y nadie
                confirmó que se pueda.
              </p>
            </div>
          </div>
        ) : null}

        <div className="border-b border-sl-border px-5 py-5 sm:px-7">
          <h2 className="sl-eyebrow">Qué nos contó</h2>
          {lead.description ? (
            /*
              `whitespace-pre-line` conserva los párrafos tal como los escribió la
              persona. El texto ya viene saneado del servidor y React lo escapa:
              aquí no se interpreta nada como marcado.
            */
            <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-sl-text">
              {lead.description}
            </p>
          ) : (
            /*
              La descripción es opcional en el formulario, así que puede faltar
              y eso NO es un error ni un caso peor: hay que decirlo sin alarma y
              convertirlo en la primera pregunta de la llamada.
            */
            <p className="mt-2 rounded-sl border border-dashed border-sl-border bg-sl-background px-4 py-3 text-sm text-sl-muted">
              No escribió una descripción; el campo es opcional. Es la primera pregunta de la
              llamada.
            </p>
          )}
        </div>

        {/*
          CÓMO PIDIÓ QUE LE HABLARAN.
          Va antes de la conversión porque es lo que decide qué hace el abogado
          en los próximos cinco minutos: escribirle, esperar a la hora que pidió
          o marcarle ya.
        */}
        {lead.preferredContactMethod ? (
          <div className="border-b border-sl-border px-5 py-5 sm:px-7">
            <h2 className="sl-eyebrow">Cómo prefiere que lo contacten</h2>
            <p className="mt-2 text-[15px] text-sl-text">
              Eligió{' '}
              <strong className="font-semibold">
                {CONTACT_METHOD_LABEL[lead.preferredContactMethod].toLowerCase()}
              </strong>
              .
            </p>

            {lead.whatsappOpenedAt ? (
              <p className="mt-1.5 text-sm text-sl-muted">
                Abrió WhatsApp con su mensaje preparado el {formatDateTime(lead.whatsappOpenedAt)}.{' '}
                {/*
                  Se dice explícitamente, y no es un matiz: con un enlace wa.me
                  el sistema deja de ver a la persona en cuanto salta a la
                  aplicación. Si el abogado creyera que hay un mensaje esperando
                  y no lo hay, dejaría de llamar a alguien que sí lo necesita.
                */}
                <span className="text-sl-text">
                  Eso no confirma que llegara a enviarlo: revisa el WhatsApp del despacho.
                </span>
              </p>
            ) : null}

            {lead.scheduledCallAt ? (
              <p className="mt-1.5 text-sm text-sl-muted">
                Pidió que le llamaran enseguida. Previsto para las{' '}
                {formatDateTime(lead.scheduledCallAt)}.
              </p>
            ) : null}

            {lead.contactedAt ? (
              <p className="mt-1.5 text-sm text-sl-success">
                Contactado el {formatDateTime(lead.contactedAt)}.
              </p>
            ) : null}
          </div>
        ) : null}

        {/*
          CONVERTIR EN CASO. Es la frontera del sistema: hasta aquí es una
          persona que escribió; a partir de aquí es un asunto que el despacho
          lleva, con su ruta y su seguimiento. Por eso no ocurre solo — lo
          decide una persona, y esta es la única puerta.
        */}
        <div className="border-b border-sl-border bg-sl-background px-5 py-5 sm:px-7">
          {existingCase ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="sl-eyebrow">Ya es un caso</h2>
                <p className="mt-1 text-sm text-sl-text">
                  Se convirtió el {formatDateTime(lead.convertedToCaseAt)}. El seguimiento vive
                  ahí; esta ficha conserva cómo llegó.
                </p>
              </div>
              <Link href={`/portal/seguimiento/${existingCase.id}`} className="sl-btn-primary">
                Ver seguimiento
              </Link>
            </div>
          ) : (
            <>
              <h2 className="sl-eyebrow">¿El despacho toma este caso?</h2>
              <p className="mb-3 mt-1 text-sm text-sl-muted">
                Al convertirlo se crea su ruta y nada se vuelve a capturar: el nombre, el contacto,
                el estado y la fecha de despido los hereda el caso.
              </p>
              <ConvertLead leadId={lead.id} users={users} />
            </>
          )}
        </div>

        <dl className="divide-y divide-sl-border">
          <Row label="Estado">{stateLabel(lead.state)}</Row>
          <Row label="Cómo llegó">{LEAD_SOURCE_LABEL[lead.source]}</Row>
          <Row label="Fecha de despido">{formatDate(lead.dismissalDate)}</Row>
          <Row label="Días desde el despido">
            <span className="flex flex-wrap items-center gap-2">
              <DaysBadge days={lead.dismissalDaysAtSubmission} />
              <span className="text-xs text-sl-muted">al momento del registro</span>
            </span>
          </Row>
        </dl>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-sl-muted">
        Esta solicitud pasó el filtro automático de dos condiciones: entidad dentro de cobertura y
        despido de menos de 60 días. La decisión de tomar el caso es del despacho.
      </p>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3.5 sm:flex sm:gap-6 sm:px-7">
      <dt className="sl-eyebrow sm:w-52 sm:shrink-0 sm:pt-0.5">{label}</dt>
      <dd className="mt-1 text-sm text-sl-text sm:mt-0">{children}</dd>
    </div>
  )
}
