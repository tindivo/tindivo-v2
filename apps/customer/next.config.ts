import type { NextConfig } from 'next'

const config: NextConfig = {
  // `@tindivo/supabase` entró aquí cuando el logout pasó a usar `signOutLocal`:
  // hasta entonces esta app solo importaba TIPOS del paquete, que se borran al
  // compilar y no necesitan transpilarse. Un import de runtime sí.
  transpilePackages: [
    '@tindivo/ui',
    '@tindivo/api-client',
    '@tindivo/contracts',
    '@tindivo/images',
    '@tindivo/supabase',
  ],
  poweredByHeader: false,
  /**
   * Rescate de las URLs del v1, que usaba `/restaurantes/<slug>`. Google las
   * tiene indexadas y hoy salen como 404 en Search Console; un 301 traslada al
   * destino nuevo lo que esas páginas tenían ganado.
   *
   * SOLO las dos que corresponden a un negocio que existe en v2. Los otros seis
   * slugs del v1 (`veneburguer`, `sumaq-restaurante`, `almuerzos-don-chipi`,
   * `el-nidito-restobar`, `club-de-bienestar-nutret`, `polleria-la-nonna`) no
   * migraron: para esos el 404 es la respuesta honesta. Mandarlos todos a la
   * portada con un comodín sería peor — Google lo trata como soft 404 y además
   * al visitante le mentiría sobre lo que iba a encontrar.
   */
  async redirects() {
    return [
      { source: '/restaurantes/priamo', destination: '/negocio/pizza-priamo', permanent: true },
      {
        source: '/restaurantes/la-florencia',
        destination: '/negocio/la-florencia',
        permanent: true,
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      /**
       * El Storage local sirve por `http://127.0.0.1:54321`, que no casa con el
       * patrón de arriba: `next/image` responde `Invalid src prop` y la portada
       * devuelve 500. Eso tumbaba `pnpm test:e2e` ENTERO, porque la sonda de
       * arranque de Playwright exige que esta app conteste < 400 aunque los
       * tests que corras no la usen.
       *
       * Solo fuera de producción: ahí este host no existe y no hay motivo para
       * declararlo como origen de imágenes permitido.
       */
      ...(process.env.NODE_ENV === 'production'
        ? []
        : [
            {
              protocol: 'http' as const,
              hostname: '127.0.0.1',
              port: '54321',
              pathname: '/storage/v1/object/public/**',
            },
          ]),
    ],
  },
}

export default config
