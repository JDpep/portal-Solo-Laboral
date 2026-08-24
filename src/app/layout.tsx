import type { Metadata, Viewport } from 'next'
import { Poppins } from 'next/font/google'
import '@/app/globals.css'

/**
 * Poppins es la tipografía del sitio oficial de Solo Laboral.
 * next/font la descarga en tiempo de build y la sirve desde el propio
 * dominio: la página no hace ninguna petición a Google en runtime.
 */
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

/**
 * Metadatos de la CARA PÚBLICA. Esta sí debe encontrarse: es la puerta por la
 * que llegan los prospectos. Las rutas internas (/acceso y /portal) invierten
 * `robots` en su propio layout.
 */
export const metadata: Metadata = {
  title: 'Cuéntanos sobre tu caso · Solo Laboral Abogados',
  description:
    'Cuéntale a Solo Laboral Abogados qué pasó con tu despido. Revisaremos tu información para determinar si podemos ayudarte.',
  icons: { icon: '/favicon.ico', apple: '/apple-icon.png' },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2B346B', // azul marino oficial
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={poppins.variable}>
      <body>{children}</body>
    </html>
  )
}
