import type { MetadataRoute } from 'next'
import { absoluteUrl, SITE_URL } from '@/lib/seo'

/**
 * Qué se bloquea aquí y qué NO, que no es lo mismo que parece.
 *
 * `/checkout`, `/cuenta`, `/pedidos`, `/pedido/<shortId>` y `/entrar` mandan
 * `noindex` por metadata y **no van en `disallow`**. Estuvieron, y era un error
 * que se leía como prudencia: «el segundo cinturón, para el crawler que ni
 * siquiera llega a renderizarlas». Los dos cinturones no se suman — se anulan.
 *
 * Un `Disallow` impide RASTREAR, no INDEXAR. Si Google no puede entrar, nunca
 * llega a leer el `noindex` que le está esperando dentro, así que una URL que ya
 * estuviera en el índice **se queda ahí para siempre**, mostrando lo que Google
 * recuerde de la última vez. Fue exactamente lo que pasó con `/entrar`: seguía
 * saliendo en los resultados de «tindivo» semanas después de ponerle `noindex`,
 * porque el bloqueo impedía que nadie leyera esa orden.
 *
 * Dejarlas rastreables no expone nada: lo que hay detrás sigue exigiendo sesión,
 * y `/pedido/<shortId>` ya llevaba `noindex` desde `409acc6`. Lo que cambia es
 * que ahora el buscador puede enterarse de que no las quiere.
 *
 * `/auth/` sí se queda: no es una página, es el callback de OAuth. No devuelve
 * HTML donde poner un `noindex`, así que el robots es el único sitio donde se
 * puede decir. Rastrearlo no aporta nada a nadie.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/auth/'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: SITE_URL,
  }
}
