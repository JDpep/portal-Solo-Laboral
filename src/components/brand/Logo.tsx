import Image from 'next/image'

/**
 * Logotipo oficial de Solo Laboral Abogados.
 *
 * Los SVG de `public/brand/` se tomaron sin modificar del sitio oficial
 * (sololaboral.mx). No se redibujan, no se recolorean y no se reconstruye el
 * lockup con texto: el brief (§57) lo prohíbe expresamente.
 *
 * `logo.svg` es la única versión que entrega el despacho y es vertical
 * (500 × 305), así que se usa tal cual en tamaños discretos.
 */

const LOGO_RATIO = 305 / 500
const ISOTIPO_RATIO = 191 / 300

export function Logo({ width = 148, priority = false }: { width?: number; priority?: boolean }) {
  return (
    <Image
      src="/brand/logo.svg"
      alt="Solo Laboral Abogados"
      width={width}
      height={Math.round(width * LOGO_RATIO)}
      priority={priority}
      unoptimized
    />
  )
}

/** Marca sin texto: para espacios estrechos y encabezados compactos. */
export function Isotipo({ width = 28 }: { width?: number }) {
  return (
    <Image
      src="/brand/isotipo.svg"
      alt=""
      aria-hidden
      width={width}
      height={Math.round(width * ISOTIPO_RATIO)}
      unoptimized
    />
  )
}
