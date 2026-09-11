'use client'

import type { MoodLevel, PerformanceMood } from '@tindivo/core'
import { Card } from '@tindivo/ui'

/**
 * Lo primero que se lee al abrir «Rendimiento»: cómo le fue, dicho en una
 * frase y con una cara.
 *
 * POR QUÉ UN EMOJI Y NO UN ICONO DEL SISTEMA. Los `Icon` de la casa son
 * geometría —una flecha, un check— y no tienen registro emocional; aquí hace
 * falta exactamente eso. Quien abre esta pantalla es el dueño mirando cómo fue
 * la semana en su teléfono, y una carita le da el tono antes de que empiece a
 * leer. Es también el único sitio del panel donde se permite: en las cifras
 * sería ruido.
 *
 * EL COLOR DEL MAL MOMENTO NO ES ROJO. Un periodo flojo no es un error del
 * sistema ni algo que el dueño hizo mal, y pintarlo como una alerta convierte
 * esta pantalla en algo que se evita abrir. Lo malo va en naranja de marca o
 * ámbar —el color de «estamos contigo»—, y el rojo se queda para lo que de
 * verdad está roto en otras pantallas.
 */
const LEVEL: Record<MoodLevel, { wrap: string; ink: string }> = {
  celebrating: { wrap: 'bg-success-soft border-success/25', ink: 'text-success' },
  good: { wrap: 'bg-success-soft/60 border-success/20', ink: 'text-success' },
  steady: { wrap: 'bg-surface border-ink/[0.06]', ink: 'text-ink' },
  soft: { wrap: 'bg-warning-soft/70 border-warning/25', ink: 'text-ink' },
  worried: { wrap: 'bg-brand-soft border-brand/25', ink: 'text-brand-dark' },
}

export function MoodBanner({ mood }: { mood: PerformanceMood }) {
  const tone = LEVEL[mood.level]
  return (
    <Card className={`border p-4 sm:p-5 ${tone.wrap}`}>
      <div className="flex items-start gap-3 sm:gap-4">
        {/* `aria-hidden`: el titular que va al lado ya dice lo mismo en
            palabras, y un lector de pantalla leyendo «cara sonriente» antes de
            la frase estorba más de lo que aporta. */}
        <span aria-hidden className="text-[34px] leading-none sm:text-[40px]">
          {mood.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={`text-[15px] font-extrabold leading-snug sm:text-base ${tone.ink}`}>
            {mood.headline}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{mood.body}</p>
        </div>
      </div>
    </Card>
  )
}
