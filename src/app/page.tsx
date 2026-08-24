import Link from 'next/link'
import { Clock, HandCoins, Lock, MessageSquareText, ShieldCheck } from 'lucide-react'
import { today } from '@/lib/dates'
import { Logo } from '@/components/brand/Logo'
import { LeadForm } from '@/components/public/LeadForm'

/**
 * Página pública. Su único trabajo es llevar a la persona al formulario.
 *
 * Está escrita para el TELÉFONO primero: es de donde llega la mayoría. Eso
 * manda dos cosas en el diseño —
 *   · el encabezado es corto, para que el primer campo aparezca casi sin
 *     desplazar (antes había una pantalla entera de texto antes del formulario);
 *   · el formulario es la superficie con más peso visual de la página, no una
 *     tarjeta más al final de un folleto.
 * En pantallas grandes el relato pasa a la izquierda y el formulario a la
 * derecha, lo que además le quita a los campos el ancho absurdo que tenían al
 * ocupar la columna completa.
 *
 * `force-dynamic` porque la fecha de hoy —el tope del selector de fecha— tiene
 * que ser la de Ciudad de México ahora mismo, no la del último build.
 */
export const dynamic = 'force-dynamic'

/**
 * Las tres primeras quitan fricción del formulario. La cuarta quita la
 * objeción que frena a quien acaba de quedarse sin ingreso: cuánto le va a
 * costar. Por eso va al final, ya con el formulario a la vista.
 */
const REASSURANCES = [
  { icon: Clock, text: 'Te toma menos de dos minutos.' },
  { icon: MessageSquareText, text: 'Solo te pedimos lo indispensable.' },
  { icon: Lock, text: 'Tu información es privada y no se comparte.' },
  { icon: HandCoins, text: 'Pide asesoramiento sobre tu caso, es gratis.' },
]

export default function PublicPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sl-background">
      <div className="sl-rule" />

      <header className="bg-sl-surface">
        <div className="mx-auto flex max-w-6xl items-center px-5 py-3.5 sm:px-6 sm:py-4">
          <Logo width={104} priority />
        </div>
      </header>

      <main className="sl-wash flex-1 border-b border-sl-border/60">
        <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-6 sm:py-12 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-14">
            {/* --- Relato. En lg se queda a la vista mientras se llena el formulario. --- */}
            <div className="sl-in lg:sticky lg:top-12 lg:self-start">
              <h1 className="text-[1.75rem] font-semibold leading-[1.15] text-sl-primary sm:text-4xl lg:text-[2.75rem]">
                Cuéntanos sobre tu caso
              </h1>
              <p className="mt-3 max-w-lg text-base leading-relaxed text-sl-text sm:mt-4 sm:text-lg">
                Si te despidieron y no sabes qué sigue, cuéntanos qué pasó. Solo Laboral revisará la
                información que nos compartas para determinar si puede ayudarte.
              </p>

              <ul className="mt-5 grid gap-2 sm:mt-7 sm:grid-cols-2 lg:grid-cols-1 lg:gap-2.5">
                {REASSURANCES.map(({ icon: Icon, text }) => (
                  <li key={text} className="sl-chip">
                    <span className="sl-chip-icon">
                      <Icon className="h-3.5 w-3.5 lg:h-4 lg:w-4" aria-hidden />
                    </span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* --- Formulario. En móvil arranca aquí, ya cerca del pulgar. --- */}
            <section
              aria-labelledby="formulario"
              className="sl-card sl-in p-5 sm:p-7 lg:p-8"
              style={{ animationDelay: '70ms' }}
            >
              <h2 id="formulario" className="sr-only">
                Formulario de solicitud
              </h2>
              <LeadForm todayDate={today()} />
            </section>
          </div>
        </div>
      </main>

      <footer className="bg-sl-surface">
        <div className="mx-auto max-w-6xl px-5 py-7 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl text-xs leading-relaxed text-sl-muted">
              <p className="flex items-center gap-1.5 text-sm font-medium text-sl-text">
                <ShieldCheck className="h-4 w-4 text-sl-secondary-strong" aria-hidden />
                Solo Laboral Abogados
              </p>
              <p className="mt-1.5">
                Enviar este formulario no crea una relación abogado-cliente ni constituye asesoría
                jurídica.
              </p>
            </div>
            {/*
              El acceso del despacho vive en el pie y sin destacar: es una puerta
              de servicio, no una llamada a la acción para quien llega buscando ayuda.
            */}
            <Link
              href="/acceso"
              className="shrink-0 text-xs text-sl-muted underline-offset-2 hover:text-sl-primary hover:underline"
            >
              Acceso para el despacho
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
