/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      /*
       * La página pública SÍ debe indexarse: es la puerta por la que llegan los
       * prospectos. El portal y su acceso, no. El `noindex` va por cabecera
       * además de por metadatos, porque un buscador que solo hace HEAD sobre
       * /portal/<id> nunca llegaría a leer la etiqueta del HTML.
       */
      {
        source: '/portal/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/acceso',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]
  },
}
export default nextConfig
