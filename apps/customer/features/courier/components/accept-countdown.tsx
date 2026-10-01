'use client'

import { Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'

/** Desde aquí el reloj se pone rojo. Mismo umbral que la tarjeta del motorizado. */
const LATE_SEC = 5 * 60

function secondsLeft(deadline: string): number {
  return Math.max(0, Math.round((Date.parse(deadline) - Date.now()) / 1000))
}

function mmss(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

/**
 * «Buscando motorizado» con el reloj a la vista.
 *
 * Antes decía «15 minutos» escrito a mano y el cliente no sabía cuánto
 * quedaba. Ahora cuenta hacia atrás desde el plazo que pone la base
 * (`acceptDeadline`, 0236) — el MISMO que el motorizado ve en su tarjeta, y se
 * dice: saber que el otro lado mira el mismo número es lo que quita la
 * discusión.
 *
 * El intervalo solo vive mientras queda tiempo: a cero el texto es fijo y un
 * tick por segundo solo gastaría batería.
 */
export function AcceptCountdown({ deadline, minutes }: { deadline: string; minutes: number }) {
  const [left, setLeft] = useState(() => secondsLeft(deadline))

  useEffect(() => {
    setLeft(secondsLeft(deadline))
    if (secondsLeft(deadline) === 0) return
    const id = setInterval(() => {
      const next = secondsLeft(deadline)
      setLeft(next)
      if (next === 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [deadline])

  const total = minutes * 60
  const pct = total > 0 ? Math.min(100, (left / total) * 100) : 0
  const late = left <= LATE_SEC
  const ink = late ? 'text-[#B91C1C]' : 'text-[#2E3236]'
  const bar = late ? 'bg-[#DC2626]' : 'bg-brand'

  return (
    <div className="mb-4 rounded-2xl bg-[#F4F4F2] p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[#5C6368]">
            {left === 0 ? 'Se acabó el tiempo' : 'Esperando que un motorizado la acepte'}
          </div>
          <div className="text-[12px] font-medium text-[#5C6368]">
            {left === 0 ? 'Cancelando, sin cobrarte nada…' : 'Se cancela sola en'}
          </div>
        </div>
        {left > 0 && (
          <div
            role="timer"
            className={`font-mono text-[28px] font-extrabold leading-none tabular-nums ${ink}`}
            aria-label={`Se cancela sola en ${mmss(left)}`}
          >
            {mmss(left)}
          </div>
        )}
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#E8E9EB]">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-2.5 flex items-start gap-1.5 text-[12px] font-medium leading-snug text-[#5C6368]">
        <Icon name="visibility" size={14} className="mt-px shrink-0" />
        Los motorizados ven este mismo reloj. Si nadie la toma en {minutes} min, se cancela y no se
        cobra nada.
      </p>
    </div>
  )
}
