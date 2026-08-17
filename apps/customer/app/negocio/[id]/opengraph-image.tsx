import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import type { BusinessDetail } from '@/features/catalog/types'
import { BRAND, SITE_URL } from '@/lib/seo'

/**
 * Tarjeta que se ve al compartir un restaurante por WhatsApp.
 *
 * Existe por el FORMATO, no por el diseño. Los banners viven en Storage como
 * **WebP**, y WhatsApp no renderiza WebP de forma fiable en la vista previa:
 * apuntar `og:image` directo al banner deja el enlace sin foto en el único
 * canal por el que se comparte Tindivo. Esto siempre sale PNG, y de paso
 * encuadra a 1200x630 en vez de dejar que cada scraper recorte a su gusto.
 *
 * Si el banner no se puede descargar o decodificar, cae a una tarjeta de marca
 * con el color del negocio. Un enlace con tarjeta sobria es mucho mejor que un
 * 500 que deja al scraper sin ninguna imagen.
 */
export const alt = 'Carta del restaurante en Tindivo'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

const LOGO_DATA_URI = `data:image/png;base64,${readFileSync(
  join(process.cwd(), 'public', 'icon-512x512.png'),
).toString('base64')}`

async function fetchBusiness(id: string): Promise<BusinessDetail['business'] | null> {
  try {
    const res = await fetch(`${API_BASE}/public/businesses/${id}`, { next: { revalidate: 300 } })
    if (!res.ok) return null
    const envelope = (await res.json()) as { data: BusinessDetail | null }
    return envelope.data?.business ?? null
  } catch {
    return null
  }
}

/**
 * Trae el banner y lo devuelve como data URI, o null si no se puede usar.
 *
 * SATORI NO DECODIFICA WEBP. Comprobado: al pasarle uno lanza
 * `TypeError: u2 is not iterable` y la ruta entera devuelve "failed to pipe
 * response" — o sea, el scraper se queda sin NINGUNA imagen. Y los banners de
 * Storage son justamente WebP, así que este no es un caso raro: es el normal.
 *
 * Por eso el banner se pide primero al optimizador de imágenes de Next, que sí
 * sabe transcodificar. Negocia por `Accept`, así que pidiendo solo JPEG
 * devuelve JPEG aunque el original sea WebP. El host de Storage ya está en
 * `images.remotePatterns` de `next.config.ts`, sin lo cual el optimizador
 * responde 400.
 */
async function fetchBannerDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null

  const candidates = [
    // Optimizador de Next: transcodifica a JPEG y de paso reescala.
    //
    // 828 y no 1200 a propósito. `ImageResponse` SOLO emite PNG, y un PNG de
    // 1200x630 con una foto encima pesaba 1.74 MB — tamaño con el que WhatsApp
    // se arriesga a descartar la vista previa, que es justo lo que este archivo
    // existe para evitar. Partir de una fuente más pequeña baja la entropía y
    // con ella el peso del PNG; a 1200x630 de salida la diferencia de nitidez
    // no se aprecia en una miniatura de chat.
    //
    // `q` SE QUEDA EN 75. Next 16 valida la calidad contra `images.qualities`,
    // que por defecto es solo `[75]`: pedir `q=60` devuelve **400**, el fetch
    // falla y la tarjeta sale sin foto. Ya pasó. Si algún día hace falta otra
    // calidad, hay que declararla en `next.config.ts` primero.
    {
      href: `${SITE_URL}/_next/image?url=${encodeURIComponent(url)}&w=828&q=75`,
      accept: 'image/jpeg',
    },
    // Directo, por si algún día los banners se suben ya en PNG/JPEG.
    { href: url, accept: 'image/png,image/jpeg' },
  ]

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate.href, {
        headers: { accept: candidate.accept },
        next: { revalidate: 300 },
      })
      if (!res.ok) continue
      const type = res.headers.get('content-type') ?? ''
      if (!/image\/(png|jpe?g)/i.test(type)) continue
      const buf = Buffer.from(await res.arrayBuffer())
      return `data:${type};base64,${buf.toString('base64')}`
    } catch {
      // Siguiente candidato; si se acaban, la tarjeta sale sin foto.
    }
  }
  return null
}

export default async function BusinessOpengraphImage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const business = await fetchBusiness(id)
  const banner = await fetchBannerDataUri(business?.banner_url)

  const name = business?.name ?? 'Tindivo'
  const tagline = business?.tagline ?? 'Delivery de tu barrio'
  const accent = business?.accent_color ? `#${business.accent_color}` : BRAND.orange

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        position: 'relative',
        background: `linear-gradient(135deg, ${accent} 0%, ${BRAND.orangeLight} 100%)`,
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      {banner && (
        <img
          src={banner}
          alt=""
          width={size.width}
          height={size.height}
          style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }}
        />
      )}

      {/*
        El mismo velo inferior que la portada del negocio en la app: el nombre
        es texto blanco y el banner puede ser una foto clara.

        Va con `top/left/width/height` y NO con `inset: 0`: Satori no soporta la
        abreviatura, el div se colapsaba a 0x0 y el velo no se pintaba. Se veía
        bien solo porque la foto de prueba era oscura.
      */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: size.width,
          height: size.height,
          display: 'flex',
          background: banner
            ? 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.70) 42%, rgba(0,0,0,0.10) 100%)'
            : 'linear-gradient(to top, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 100%)',
        }}
      />

      {/* Marca, arriba. */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          left: 64,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <img
          src={LOGO_DATA_URI}
          width={64}
          height={64}
          alt=""
          style={{ borderRadius: 16, background: '#ffffff' }}
        />
        <div
          style={{
            marginLeft: 18,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
          }}
        >
          Tindivo
        </div>
      </div>

      {/* Nombre del negocio, abajo. */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          padding: '0 64px 60px',
        }}
      >
        <div
          style={{
            fontSize: 82,
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: '-0.035em',
            maxWidth: 1020,
          }}
        >
          {name}
        </div>
        <div style={{ marginTop: 18, fontSize: 32, opacity: 0.94, maxWidth: 980 }}>{tagline}</div>
      </div>
    </div>,
    size,
  )
}
