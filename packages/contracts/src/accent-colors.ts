import { z } from 'zod'

/**
 * Color de papelito del negocio (`businesses.accent_color`). Hex de 6 dígitos
 * en minúsculas SIN `#` — mismo formato que el CHECK `accent_color_format`
 * de la DB (migración 0002). Desde 0053 el color NO es único entre negocios
 * activos (DECISIONS §21).
 */
export const ACCENT_COLOR_RE = /^[0-9a-f]{6}$/

/** Normaliza `'#F97316'` / `' F97316 '` → `'f97316'` antes de validar. */
export const AccentColorSchema = z
  .string()
  .transform((v) => v.trim().replace(/^#/, '').toLowerCase())
  .pipe(
    z.string().regex(ACCENT_COLOR_RE, {
      message: 'Color inválido (6 dígitos hex)',
    }),
  )
export type AccentColor = z.infer<typeof AccentColorSchema>

/**
 * Paleta establecida de colores de papelito (Docs/06 §2). Fuente canónica:
 * los formularios de alta (admin) y configuración (negocio) muestran estos
 * 12 swatches; se admite hex personalizado fuera de la paleta.
 */
export const BUSINESS_ACCENT_PALETTE = [
  { name: 'Rosado', hex: 'f472b6' },
  { name: 'Azul cielo', hex: '38bdf8' },
  { name: 'Verde menta', hex: '4ade80' },
  { name: 'Amarillo limón', hex: 'facc15' },
  { name: 'Lavanda', hex: 'a78bfa' },
  { name: 'Naranja', hex: 'f97316' }, // = brand: reservarlo salvo pueblo sin operación Tindivo
  { name: 'Lila', hex: 'c084fc' },
  { name: 'Turquesa', hex: '2dd4bf' },
  { name: 'Rojo coral', hex: 'fb7185' },
  { name: 'Verde oliva', hex: '84cc16' },
  { name: 'Azul cobalto', hex: '3b82f6' },
  { name: 'Salmón', hex: 'fb923c' },
] as const

/** Default de la columna en DB (0002). Fallback del POST cuando no llega accentColor. */
export const DEFAULT_ACCENT_COLOR = 'f97316'

export const isPaletteAccentColor = (hex: string): boolean =>
  BUSINESS_ACCENT_PALETTE.some((c) => c.hex === hex)
