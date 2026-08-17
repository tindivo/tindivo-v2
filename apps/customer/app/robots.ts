import type { MetadataRoute } from 'next'
import { absoluteUrl, SITE_URL } from '@/lib/seo'

/**
 * El `disallow` cubre lo que no tiene sentido en un buscador y lo que además
 * es privado: `/pedido/<shortId>` es el seguimiento de UNA persona, con su
 * dirección dentro. Las páginas ya mandan `noindex` por metadata; esto es el
 * segundo cinturón, para el crawler que ni siquiera llega a renderizarlas.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/checkout', '/cuenta', '/pedidos', '/pedido/', '/entrar', '/auth/'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: SITE_URL,
  }
}
