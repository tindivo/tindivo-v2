'use client'

/**
 * Imagen de producto. Si hay `src` (foto subida por el negocio) la renderiza
 * cubriendo el recuadro; si no, cae al placeholder rayado derivado del `hue`.
 */
export function ProductImage({
  label,
  hue = 14,
  size = 88,
  src,
}: {
  label?: string
  hue?: number
  size?: number
  src?: string | null
}) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[16px]"
      style={{
        width: size,
        height: size,
        background: `oklch(0.92 0.03 ${hue})`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, transparent 0, transparent 9px, rgba(26,22,20,0.04) 9px, rgba(26,22,20,0.04) 10px)',
        }}
      />
      {src ? (
        <img
          src={src}
          alt={label ?? ''}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center p-1.5 text-center font-sans text-[10px] tracking-wider"
          style={{
            color: `oklch(0.35 0.1 ${hue})`,
          }}
        >
          {label}
        </div>
      )}
    </div>
  )
}
