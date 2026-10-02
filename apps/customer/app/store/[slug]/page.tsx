import { conditionScoreLabel, formatStorePrice } from '@tindivo/contracts'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { DetailShell } from '@/features/store/components/detail-shell'
import { fetchStoreDetail } from '@/features/store/lib/api'
import { toCore } from '@/features/store/lib/present'
import { absoluteUrl, SITE_NAME } from '@/lib/seo'

/** `cache()`: Next llama a `generateMetadata` y luego al componente; una sola petición. */
const getDetail = cache(fetchStoreDetail)

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const data = await getDetail(slug)
  // Borrador, oculto o inexistente: sin título propio y sin indexar.
  if (!data) return { title: 'Artículo no disponible', robots: { index: false, follow: false } }

  const p = data.product
  const core = toCore(p)
  if (!core) return { title: 'Artículo no disponible', robots: { index: false, follow: false } }

  const state =
    p.status === 'sold' ? 'Vendido' : p.status === 'reserved' ? 'Reservado' : 'Disponible'
  const bits = [
    core.condition === 'used' && core.conditionScore !== null
      ? `Estado ${core.conditionScore}/10 (${conditionScoreLabel(core.conditionScore)})`
      : core.condition === 'new_with_tag'
        ? 'Nuevo con etiqueta'
        : core.condition === 'new_unused'
          ? 'Nuevo sin uso'
          : null,
    core.sizeLabel,
    state,
    'Te lo llevamos en San Jacinto y pagas al recibir',
  ].filter(Boolean)
  const description = `${core.title} — ${formatStorePrice(core.price)}. ${bits.join(' · ')}.`
  const socialTitle = `${core.title} — ${formatStorePrice(core.price)} · ${SITE_NAME} Store`
  const path = `/store/${p.slug}`

  return {
    title: `${core.title} — ${formatStorePrice(core.price)}`,
    description,
    alternates: { canonical: path },
    // Lo vendido ya no sirve en buscadores; sigue accesible por su link.
    robots: p.status === 'sold' ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: path,
      title: socialTitle,
      description,
      // `images` lo inyecta Next desde `./opengraph-image.tsx` (PNG: WhatsApp no
      // renderiza bien el WebP en que se guardan las fotos).
    },
    twitter: { card: 'summary_large_image', title: socialTitle, description },
  }
}

export default async function StoreProductPage({ params }: Params) {
  const { slug } = await params
  const data = await getDetail(slug)
  if (!data) notFound()

  const { product } = data
  const core = toCore(product)
  const availability =
    product.status === 'available'
      ? 'https://schema.org/InStock'
      : product.status === 'reserved'
        ? 'https://schema.org/LimitedAvailability'
        : 'https://schema.org/SoldOut'
  const jsonLd = core && {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: core.title,
    sku: core.code,
    ...(product.description ? { description: product.description } : {}),
    image: product.images.map((i) => i.url),
    itemCondition:
      core.condition === 'used'
        ? 'https://schema.org/UsedCondition'
        : 'https://schema.org/NewCondition',
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/store/${product.slug}`),
      priceCurrency: 'PEN',
      price: core.price.toFixed(2),
      availability,
    },
  }

  return (
    <>
      <DetailShell product={product} related={data.related} settings={data.settings} />
      {jsonLd && (
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD generado por nosotros; se escapa `<`
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      )}
    </>
  )
}
