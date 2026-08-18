import type { Metadata } from 'next'
import Link from 'next/link'
import { permanentRedirect } from 'next/navigation'
import { cache } from 'react'
import { NegocioShell } from '@/features/catalog/components/negocio-shell'
import type { BusinessDetail } from '@/features/catalog/types'
import { absoluteUrl, SITE_NAME } from '@/lib/seo'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

/**
 * El segmento acepta uuid y slug. Se distinguen por forma: `slugify` (0165)
 * solo produce `[a-z0-9-]` y nunca los guiones en estas posiciones.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `cache()` porque Next llama primero a `generateMetadata` y después al
 * componente: sin esto el negocio se pediría dos veces por visita. El `fetch`
 * de Next ya deduplica por URL dentro de un mismo render, pero envolverlo lo
 * deja explícito y sobrevive a que alguien cambie las opciones de `fetch`.
 */
const fetchInitialBusiness = cache(async (id: string): Promise<BusinessDetail | null> => {
  try {
    const res = await fetch(`${API_BASE}/public/businesses/${id}`, {
      next: { revalidate: 15 },
    })
    if (!res.ok) return null
    const envelope = (await res.json()) as { data: BusinessDetail | null }
    return envelope.data ?? null
  } catch {
    return null
  }
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const data = await fetchInitialBusiness(id)

  // Un negocio despublicado, bloqueado o inexistente no debe quedar indexado.
  if (data === null) {
    return {
      title: 'Negocio no disponible',
      robots: { index: false, follow: false },
    }
  }

  const b = data.business
  // Siempre el slug, aunque hayan entrado por uuid: la canónica no puede
  // depender de por cuál de las dos formas llegó la visita.
  const path = `/negocio/${b.slug ?? id}`
  const description =
    b.tagline?.trim() ||
    `Pide de ${b.name} en San Jacinto y recíbelo en tu puerta en ${b.estimated_eta_min}–${b.estimated_eta_max} minutos. Paga por Yape, Plin o en efectivo.`

  // El título de Open Graph NO hereda la plantilla `%s — Tindivo` del layout
  // raíz, así que el sufijo va a mano o el enlace compartido sale sin marca.
  const socialTitle = `${b.name} — ${SITE_NAME}`

  return {
    title: b.name,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: path,
      title: socialTitle,
      description,
      // `images` lo inyecta Next desde `./opengraph-image.tsx`. NO apuntar aquí
      // a `banner_url` directamente: los banners son WebP y WhatsApp no los
      // renderiza en la vista previa. Ver el comentario de ese archivo.
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
    },
  }
}

/**
 * Datos estructurados de schema.org. Es lo que le da a Google la ficha rica
 * (nombre, foto, horario) en vez de un enlace azul suelto. Se omite todo campo
 * que no tengamos: un JSON-LD con nulos vale menos que uno corto.
 */
function restaurantJsonLd(b: BusinessDetail['business']): string {
  const url = absoluteUrl(`/negocio/${b.slug}`)
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': url,
    name: b.name,
    url,
    priceRange: 'S/',
    currenciesAccepted: 'PEN',
    paymentAccepted: 'Efectivo, Yape, Plin',
  }

  if (b.tagline) jsonLd.description = b.tagline
  if (b.banner_url) jsonLd.image = b.banner_url
  if (b.logo_url) jsonLd.logo = b.logo_url
  // `categoria` es `text[]` y llega como `[]` cuando está vacío — y un array
  // vacío es truthy, así que sin el `.length` esto emitiría `servesCuisine: []`.
  if (b.categoria && b.categoria.length > 0) jsonLd.servesCuisine = b.categoria

  jsonLd.address = {
    '@type': 'PostalAddress',
    ...(b.address ? { streetAddress: b.address } : {}),
    addressLocality: 'San Jacinto',
    addressRegion: 'Áncash',
    addressCountry: 'PE',
  }

  if (b.coordinates_lat != null && b.coordinates_lng != null) {
    jsonLd.geo = {
      '@type': 'GeoCoordinates',
      latitude: b.coordinates_lat,
      longitude: b.coordinates_lng,
    }
  }

  if (b.accepts_web_delivery || b.accepts_web_pickup) {
    jsonLd.hasDeliveryMethod = [
      ...(b.accepts_web_delivery ? ['http://purl.org/goodrelations/v1#DeliveryModeOwnFleet'] : []),
      ...(b.accepts_web_pickup ? ['http://purl.org/goodrelations/v1#DeliveryModePickUp'] : []),
    ]
  }

  return JSON.stringify(jsonLd)
}

export default async function NegocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const initialData = await fetchInitialBusiness(id)

  if (initialData === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[768px] flex-col items-center justify-center px-4 text-center md:max-w-[860px]">
        <p className="text-ink-muted">Negocio no encontrado o no disponible.</p>
        <Link href="/" className="mt-3 inline-block text-sm font-semibold text-brand underline">
          Volver al inicio
        </Link>
      </main>
    )
  }

  // Una sola URL por negocio. Los enlaces con uuid repartidos por WhatsApp
  // siguen abriendo, pero acaban en el slug con un 308 permanente: si ambas
  // formas sirvieran un 200, Google las contaría como contenido duplicado —
  // que es justo el aviso que ya llegó por el apex y el www.
  if (UUID_RE.test(id) && initialData.business.slug && initialData.business.slug !== id) {
    permanentRedirect(`/negocio/${initialData.business.slug}`)
  }

  return (
    <>
      {/* JSON-LD serializado con JSON.stringify, no HTML de usuario. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: restaurantJsonLd(initialData.business) }}
      />
      <NegocioShell id={id} initialData={initialData} />
    </>
  )
}
