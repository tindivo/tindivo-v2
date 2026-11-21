import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'

export const dynamic = 'force-static'

// El Libro no entra mientras esté cerrado (CUS-LIB-008).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl('/'), changeFrequency: 'monthly', priority: 1 },
    { url: absoluteUrl('/terminos/'), changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/privacidad/'), changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/borrar-cuenta/'), changeFrequency: 'yearly', priority: 0.3 },
  ]
}
