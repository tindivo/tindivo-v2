import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { conditionScoreLabel, discountPercent, formatStorePrice } from '@tindivo/contracts'
import { ImageResponse } from 'next/og'
import { fetchStoreDetail } from '@/features/store/lib/api'
import { toCore } from '@/features/store/lib/present'
import { SITE_URL } from '@/lib/seo'

/**
 * La tarjeta que se ve al pegar un artículo en WhatsApp o Facebook (PRD §5.5):
 * foto, título, precio y estado. Sin ella el link sale vacío.
 *
 * Mismo problema que la de los restaurantes (`app/negocio/[id]/opengraph-image`):
 * las fotos viven en Storage como WebP y ni WhatsApp las pinta de forma fiable en
 * la vista previa ni Satori las decodifica. Por eso la foto se pide al
 * optimizador de Next, que transcodifica a JPEG, y se incrusta como data URI.
 * `q=75` y `w=828` no son azar: Next 16 solo acepta las calidades declaradas en
 * `images.qualities` (por defecto, solo 75) y un PNG de 1200x630 con una foto
 * grande pesa más de 1,5 MB, con lo que WhatsApp se arriesga a descartarlo.
 *
 * Si la foto no se puede obtener, sale una tarjeta de marca con el texto: un
 * enlace con tarjeta sobria vale más que un 500 sin ninguna imagen.
 */
export const alt = 'Artículo en Tindivo Store'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const INK = '#1c1b1a'
const ORANGE = '#ea580c'

const LOGO_DATA_URI = `data:image/png;base64,${readFileSync(
  join(process.cwd(), 'public', 'icon-192x192.png'),
).toString('base64')}`

async function photoDataUri(url: string | undefined): Promise<string | null> {
  if (!url) return null
  const candidates = [
    {
      href: `${SITE_URL}/_next/image?url=${encodeURIComponent(url)}&w=828&q=75`,
      accept: 'image/jpeg',
    },
    { href: url, accept: 'image/png,image/jpeg' },
  ]
  for (const c of candidates) {
    try {
      const res = await fetch(c.href, { headers: { accept: c.accept }, next: { revalidate: 300 } })
      if (!res.ok) continue
      const type = res.headers.get('content-type') ?? ''
      if (!/image\/(png|jpe?g)/i.test(type)) continue
      return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
    } catch {
      // siguiente candidato
    }
  }
  return null
}

export default async function StoreOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await fetchStoreDetail(slug)
  const core = data ? toCore(data.product) : null
  const photo = await photoDataUri(data?.product.images[0]?.url)

  const percent = core ? discountPercent(core.price, core.originalPrice) : null
  const state =
    data?.product.status === 'sold'
      ? 'Vendido'
      : data?.product.status === 'reserved'
        ? 'Reservado'
        : core?.condition === 'used' && core.conditionScore !== null
          ? `Usado · ${core.conditionScore}/10 · ${conditionScoreLabel(core.conditionScore)}`
          : core?.condition === 'new_with_tag'
            ? 'Nuevo con etiqueta'
            : core
              ? 'Nuevo'
              : ''

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: '#ffffff',
        color: INK,
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          width: 630,
          height: 630,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f2f2f0',
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            width={630}
            height={630}
            style={{ width: 630, height: 630, objectFit: 'contain' }}
          />
        ) : (
          <img src={LOGO_DATA_URI} alt="" width={160} height={160} />
        )}
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px 52px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, fontWeight: 700 }}>
          <span style={{ color: ORANGE }}>Tindivo</span>
          <span style={{ margin: '0 10px', color: '#6b6762' }}>·</span>
          <span>Store</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 52, fontWeight: 700, lineHeight: 1.1 }}>
            {core?.title ?? 'Nuevo y de segunda en San Jacinto'}
          </div>
          {core && (
            <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 20 }}>
              <span style={{ fontSize: 76, fontWeight: 800 }}>{formatStorePrice(core.price)}</span>
              {percent !== null && core.originalPrice !== null && (
                <span
                  style={{
                    marginLeft: 18,
                    fontSize: 34,
                    color: '#6b6762',
                    textDecoration: 'line-through',
                  }}
                >
                  {formatStorePrice(core.originalPrice)}
                </span>
              )}
            </div>
          )}
          {state && (
            <div style={{ display: 'flex', marginTop: 14, fontSize: 28, color: '#4a4744' }}>
              {state}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            padding: '14px 26px',
            borderRadius: 999,
            background: INK,
            color: '#ffffff',
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          Te lo llevamos y pagas al recibir
        </div>
      </div>
    </div>,
    { ...size },
  )
}
