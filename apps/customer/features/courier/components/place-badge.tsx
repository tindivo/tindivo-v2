import { LANDMARK_STYLE, type Landmark } from '@tindivo/map'

/**
 * La chapa de una referencia (disco de color + glifo), la MISMA que se ve en
 * el mapa (`LandmarkLayer`), para que la lista y el mapa se lean igual.
 *
 * El glifo es un SVG estático de `LANDMARK_STYLE` (código, no datos de
 * usuario): por eso puede ir como HTML.
 */
export function PlaceBadge({
  category,
  size = 44,
}: {
  category: Landmark['category']
  size?: number
}) {
  const { color, glyph } = LANDMARK_STYLE[category]
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="presentation"
      aria-hidden
      className="shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,.18)]"
    >
      <circle cx="12" cy="12" r="11" fill={color} />
      <g
        fill="#fff"
        style={{ color }}
        transform="translate(12 12) scale(.6) translate(-12 -12)"
        dangerouslySetInnerHTML={{ __html: glyph }}
      />
    </svg>
  )
}
