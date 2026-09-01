'use client'

import Image from 'next/image'

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
        <Image
          src={src}
          alt={label ?? ''}
          width={size}
          height={size}
          sizes={`${size}px`}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        /*
         * Sin foto, el recuadro se queda liso.
         *
         * Antes escribía aquí el nombre del plato, que ya está a 14 px a la
         * izquierda y con mejor tipografía: el mismo texto dos veces, el
         * segundo más pequeño y peor contrastado. No se leía como «falta la
         * foto», se leía como roto — y en una sección donde faltan seis fotos
         * de once, como en Pescados y mariscos, se leía roto seis veces
         * seguidas. El hueco tintado dice lo mismo sin fingir contenido.
         *
         * `label` sigue existiendo porque es el `alt` cuando SÍ hay foto.
         */
        <div
          className="absolute inset-0"
          style={{ background: `oklch(0.88 0.035 ${hue})` }}
          aria-hidden
        />
      )}
    </div>
  )
}
