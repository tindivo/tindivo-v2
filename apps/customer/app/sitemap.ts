import type { MetadataRoute } from 'next'
import type { PublicBusiness } from '@/features/catalog/types'
import { absoluteUrl } from '@/lib/seo'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

/** Una hora. El catálogo del piloto cambia por semanas, no por minutos. */
export const revalidate = 3600

async function fetchBusinesses(): Promise<PublicBusiness[]> {
  try {
    const res = await fetch(`${API_BASE}/public/businesses`, { next: { revalidate } })
    if (!res.ok) return []
    const envelope = (await res.json()) as { data: PublicBusiness[] | null }
    return envelope.data ?? []
  } catch {
    // Un sitemap corto es mejor que un build roto: si la API no responde,
    // salen las rutas fijas y el crawler vuelve en la próxima revalidación.
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const businesses = await fetchBusinesses()
  const now = new Date()

  return [
    {
      url: absoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    // Solo los que YA tienen slug. Si la API todavía no lo manda (despliega
    // aparte de esta app), la alternativa sería publicar `/negocio/undefined`
    // en el sitemap y pedirle a Google que lo rastree: un sitemap corto es
    // mejor, y en la próxima revalidación (1 h) entran solos.
    ...businesses
      .filter((b) => Boolean(b.slug))
      .map((b) => ({
        url: absoluteUrl(`/negocio/${b.slug}`),
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.8,
      })),
    {
      url: absoluteUrl('/terminos'),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    },
    {
      url: absoluteUrl('/privacidad'),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    },
  ]
}
