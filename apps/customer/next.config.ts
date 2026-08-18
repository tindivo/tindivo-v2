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
   * SOLO las que corresponden a un negocio **activo**. Un 301 es `permanent`:
   * los navegadores lo cachean indefinidamente y Google lo trata como
   * definitivo, así que mandar una URL con historial a una página que responde
   * «Negocio no encontrado» convierte el rescate en lo contrario — y no se
   * puede deshacer retirando el redirect, porque el cacheado ya salió.
   *
   * `la-florencia` estuvo aquí y se retiró: el negocio existe en la base pero
   * tiene `is_active = false`, y `/public/businesses/:id` filtra por ese campo,
   * así que el destino responde 200 con «no encontrado» — un soft 404. **En
   * cuanto La Florencia vuelva a estar activa, esta línea vuelve:**
   *
   *   { source: '/restaurantes/la-florencia', destination: '/negocio/la-florencia', permanent: true },
   *
   * Mientras tanto el 404 es la respuesta honesta y, a diferencia del 301, es
   * reversible: Google reintenta esa URL, un permanente cacheado no.
   *
   * Los otros seis slugs del v1 (`veneburguer`, `sumaq-restaurante`,
   * `almuerzos-don-chipi`, `el-nidito-restobar`, `club-de-bienestar-nutret`,
   * `polleria-la-nonna`) no migraron: para esos el 404 es definitivo. Mandarlos
   * todos a la portada con un comodín sería peor — Google lo trata como soft
   * 404 y además al visitante le mentiría sobre lo que iba a encontrar.
   */
  async redirects() {
    return [
      { source: '/restaurantes/priamo', destination: '/negocio/pizza-priamo', permanent: true },
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
