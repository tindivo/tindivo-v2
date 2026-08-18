'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

export interface HomeBanner {
  id: string
  title: string
  imageUrl: string
  href?: string | null
}

const DEFAULT_BANNERS: HomeBanner[] = [
  {
    id: 'san-jacinto',
    title: 'San Jacinto — Pide directo de los mejores negocios',
    imageUrl: '/banners/banner-sanjacinto.png',
    href: null,
  },
  {
    id: 'priamo',
    title: 'Priamo — Conoce sus especialidades y promociones',
    imageUrl: '/banners/banner-priamo.png',
    href: '/negocio/pizza-priamo',
  },
]

export function HomeCarousel({ banners = DEFAULT_BANNERS }: { banners?: HomeBanner[] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isInteracting = useRef(false)

  // Escuchar el scroll del carrusel para actualizar los indicadores (dots)
  function handleScroll() {
    if (!scrollRef.current) return
    const { scrollLeft, clientWidth } = scrollRef.current
    if (clientWidth === 0) return
    const index = Math.round(scrollLeft / clientWidth)
    setActiveIndex(index)
  }

  function scrollToIndex(index: number) {
    if (!scrollRef.current) return
    const width = scrollRef.current.clientWidth
    scrollRef.current.scrollTo({
      left: index * width,
      behavior: 'smooth',
    })
    setActiveIndex(index)
  }

  // Autoplay suave cada 5.5s cuando el usuario no está interactuando
  useEffect(() => {
    if (banners.length <= 1) return

    const interval = setInterval(() => {
      if (isInteracting.current) return
      setActiveIndex((prev) => {
        const next = (prev + 1) % banners.length
        if (scrollRef.current) {
          const width = scrollRef.current.clientWidth
          scrollRef.current.scrollTo({
            left: next * width,
            behavior: 'smooth',
          })
        }
        return next
      })
    }, 5500)

    return () => clearInterval(interval)
  }, [banners.length])

  if (banners.length === 0) return null

  return (
    <section
      className="px-4 pb-2"
      aria-label="Novedades y promociones"
      onMouseEnter={() => {
        isInteracting.current = true
      }}
      onMouseLeave={() => {
        isInteracting.current = false
      }}
      onTouchStart={() => {
        isInteracting.current = true
      }}
      onTouchEnd={() => {
        // Breve delay para reanudar autoplay tras soltar
        setTimeout(() => {
          isInteracting.current = false
        }, 3000)
      }}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex w-full snap-x snap-mandatory gap-3 overflow-x-auto scrollbar-hide"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {banners.map((banner, index) => {
          const isFirst = index === 0
          const content = (
            <div className="relative aspect-[2/1] w-full overflow-hidden rounded-2xl bg-ink/[0.04] shadow-sm transition-transform duration-200 active:scale-[0.99] sm:aspect-[2.4/1]">
              <Image
                src={banner.imageUrl}
                alt={banner.title}
                fill
                sizes="100vw"
                decoding="async"
                draggable={false}
                priority={isFirst}
                loading={isFirst ? undefined : 'lazy'}
                className="object-cover select-none"
              />
            </div>
          )

          return (
            <div
              key={banner.id}
              className="w-full shrink-0 snap-center snap-always"
              style={{ minWidth: '100%' }}
            >
              {banner.href ? (
                <Link
                  href={banner.href}
                  className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  aria-label={banner.title}
                >
                  {content}
                </Link>
              ) : (
                content
              )}
            </div>
          )
        })}
      </div>

      {/* Dots de paginación */}
      {banners.length > 1 && (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          {banners.map((banner, index) => (
            <button
              key={banner.id}
              type="button"
              onClick={() => scrollToIndex(index)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === activeIndex ? 'w-5 bg-brand' : 'w-1.5 bg-ink/20 hover:bg-ink/35'
              }`}
              aria-label={`Ir al banner ${index + 1}: ${banner.title}`}
              aria-current={index === activeIndex ? 'true' : undefined}
            />
          ))}
        </div>
      )}
    </section>
  )
}
