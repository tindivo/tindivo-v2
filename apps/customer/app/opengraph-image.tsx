import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { BRAND, SITE_DESCRIPTION, SITE_TAGLINE } from '@/lib/seo'

/**
 * Imagen que ven WhatsApp, Facebook y Google al compartir el enlace de la
 * portada. Se genera en el build en vez de subir un PNG a `public/` para que
 * no se desincronice del texto de la marca.
 *
 * Satori (el motor detrás de `next/og`) NO soporta el modelo de cajas completo:
 * todo `div` con más de un hijo necesita `display: flex` explícito. De ahí el
 * estilo verboso.
 */
export const alt = 'Tindivo — Delivery de tu barrio en San Jacinto, Áncash'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * El logo va embebido como data URI, no como `<img src="/icon-512x512.png">`:
 * Satori no resuelve rutas relativas y en el build no hay servidor al que
 * pedirle el archivo. Se lee una sola vez al cargar el módulo.
 */
const LOGO_DATA_URI = `data:image/png;base64,${readFileSync(
  join(process.cwd(), 'public', 'icon-512x512.png'),
).toString('base64')}`

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 80px',
        // Naranja a naranja claro y nada más. Meter el `ink` al final ensucia
        // la esquina hacia un marrón-rojo — es el mismo defecto que documenta
        // `--gradient-brand-to` en `packages/ui/src/theme.css`.
        background: `linear-gradient(135deg, ${BRAND.orange} 0%, ${BRAND.orangeLight} 100%)`,
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Logo + palabra, en fila. */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img
            src={LOGO_DATA_URI}
            width={104}
            height={104}
            alt=""
            style={{ borderRadius: 26, background: '#ffffff' }}
          />
          <div
            style={{
              marginLeft: 26,
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
            }}
          >
            Tindivo
          </div>
        </div>

        <div
          style={{
            marginTop: 40,
            fontSize: 88,
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: '-0.035em',
            maxWidth: 940,
          }}
        >
          {SITE_TAGLINE}
        </div>
        <div
          style={{
            marginTop: 22,
            fontSize: 34,
            lineHeight: 1.35,
            maxWidth: 900,
            opacity: 0.94,
          }}
        >
          {SITE_DESCRIPTION}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', fontSize: 29, opacity: 0.92 }}>
        <div
          style={{
            display: 'flex',
            width: 13,
            height: 13,
            borderRadius: 999,
            background: '#ffffff',
            marginRight: 15,
          }}
        />
        San Jacinto · Áncash · Perú
      </div>
    </div>,
    size,
  )
}
