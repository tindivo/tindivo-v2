/**
 * Lee los `val X = Color(color = 0xAARRGGBB)` de TindivoColors.kt de Android. Un color con alfa distinto de FF
 * se devuelve como `#RRGGBB (alfa AA)`; uno que no se puede leer lanza, para que el test de paridad no lo ignore.
 */
export function parseAndroidPalette(source: string): Record<string, string> {
  const palette: Record<string, string> = {}
  for (const m of source.matchAll(/val (\w+)(?::\s*\w+)?\s*=\s*Color\(([^)]*)\)/g)) {
    const name = m[1] as string
    const hex = /^color\s*=\s*0x([0-9A-Fa-f]{8})$/.exec((m[2] as string).trim())
    if (!hex) throw new Error(`No se pudo leer el color Android ${name}: Color(${m[2]})`)
    const digits = (hex[1] as string).toUpperCase()
    const alpha = digits.slice(0, 2)
    palette[name] = alpha === 'FF' ? `#${digits.slice(2)}` : `#${digits.slice(2)} (alfa ${alpha})`
  }
  return palette
}
