'use client'

import { Icon } from '@tindivo/ui'
import { useRef } from 'react'
import { PREP_PRESETS } from '../lib/constants'

export function PrepSelector({
  value,
  onChange,
}: {
  value: number
  onChange: (m: number) => void
}) {
  const carouselRef = useRef<HTMLDivElement>(null)

  const scrollCarousel = (direction: -1 | 1) => {
    if (carouselRef.current) {
      carouselRef.current.scrollBy({
        left: direction * 220,
        behavior: 'smooth',
      })
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-semibold text-ink">Tiempo de preparación</span>
        <span className="font-mono text-xs font-bold text-ink-muted">{value} min</span>
      </div>

      <div className="relative">
        {/* Desplazamiento izquierda (Desktop) */}
        <button
          type="button"
          aria-label="Desplazar izquierda"
          onClick={() => scrollCarousel(-1)}
          className="absolute -left-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-ink border border-orange-200/50 shadow-md backdrop-blur-md transition-transform duration-200 hover:scale-105 active:scale-95 md:flex"
        >
          <Icon name="chevron_left" size={20} />
        </button>

        {/* Desplazamiento derecha (Desktop) */}
        <button
          type="button"
          aria-label="Desplazar derecha"
          onClick={() => scrollCarousel(1)}
          className="absolute -right-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-ink border border-orange-200/50 shadow-md backdrop-blur-md transition-transform duration-200 hover:scale-105 active:scale-95 md:flex"
        >
          <Icon name="chevron_right" size={20} />
        </button>

        {/* Carrusel horizontal de tarjetas verticales */}
        <div
          ref={carouselRef}
          className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-3 pt-1 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [-webkit-overflow-scrolling:touch]"
          style={{ touchAction: 'pan-x' }}
        >
          {PREP_PRESETS.map((m, idx) => {
            const active = value === m
            return (
              <button
                key={m}
                type="button"
                data-prep={idx}
                onClick={() => onChange(m)}
                className={`flex shrink-0 flex-col items-center justify-center snap-center transition-all duration-300 ease-out active:scale-95 ${
                  active ? 'scale-100 z-1' : 'scale-95 opacity-70 hover:scale-100 hover:opacity-100'
                }`}
                style={{
                  width: '92px',
                  height: '108px',
                  borderRadius: '22px',
                  background: active
                    ? 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 55%, #FFA85C 100%)'
                    : 'rgba(255, 255, 255, 0.9)',
                  border: active
                    ? '1px solid rgba(255, 107, 53, 0.4)'
                    : '1px solid rgba(225, 191, 181, 0.35)',
                  boxShadow: active
                    ? '0 12px 28px -8px rgba(255, 107, 53, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                    : '0 2px 8px rgba(171, 53, 0, 0.06)',
                  color: active ? '#ffffff' : '#1a1c1b',
                }}
              >
                <span
                  className="font-black"
                  style={{
                    fontSize: '30px',
                    letterSpacing: '-0.04em',
                    lineHeight: 1,
                    textShadow: active ? '0 1px 2px rgba(95, 25, 0, 0.25)' : 'none',
                  }}
                >
                  {m}
                </span>
                <span
                  className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                  style={{ opacity: active ? 0.92 : 0.65 }}
                >
                  min
                </span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="mt-2 inline-block rounded-full"
                    style={{
                      width: '20px',
                      height: '3px',
                      background: 'rgba(255, 255, 255, 0.85)',
                      boxShadow: '0 1px 4px rgba(255, 255, 255, 0.4)',
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
