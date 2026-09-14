/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /*
   * Los convenios suben el documento firmado por una server action, y Next
   * corta el cuerpo en 1 MB por omisión: un PDF escaneado no pasaba. El tope
   * real lo pone Vercel (4.5 MB por petición); la aplicación admite 4 MB por
   * archivo y lo avisa en el formulario antes de enviar.
   */
  experimental: {
    serverActions: { bodySizeLimit: '4.5mb' },
  },
  /*
   * La puerta del despacho se escribe /acceso, en singular. Quien la teclea en
   * plural (o con los nombres que uno espera de un login) llegaba a un 404 sin
   * pista de a dónde ir. Estas redirecciones son permanentes porque la ruta
   * buena no va a cambiar.
   */
  async redirects() {
    return [
      { source: '/accesos', destination: '/acceso', permanent: true },
      { source: '/login', destination: '/acceso', permanent: true },
      { source: '/acceder', destination: '/acceso', permanent: true },
      { source: '/entrar', destination: '/acceso', permanent: true },
    ]
  },
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
