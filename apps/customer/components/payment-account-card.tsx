'use client'

import { type PaymentQrView, walletLabel } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import { soles } from '@/lib/format'

/**
 * A quién le paga el cliente cuando prepaga (0184), y cuánto.
 *
 * UNA SOLA CUENTA. El negocio puede tener dada de alta una segunda, pero esa es
 * el repuesto de la puerta —si el QR impreso no escanea, el motorizado tiene que
 * poder cobrar igual—. Prepagando desde casa no hay esa urgencia, y ofrecer dos
 * cuentas solo abre la puerta a que el cliente pague a la que la cajera no está
 * conciliando.
 *
 * VESTIDA CON LA MARCA DE SU BILLETERA. Morado si es Yape, turquesa si es Plin.
 * No es decoración: es lo que el ojo busca. El cliente ya tiene una de las dos
 * apps abierta en la cabeza, y una tarjeta gris le obliga a leer la etiqueta
 * para saber si es la suya. Con el color, lo sabe antes de leer.
 *
 * LO QUE HACE FALTA PARA PAGAR, EN UNA SOLA CAJA. El monto vive aquí y no en un
 * recuadro aparte: son los dos datos que el cliente tiene que llevarse a la otra
 * app —cuánto y a quién— y separarlos era pedirle que memorizara en dos viajes.
 *
 * EL NOMBRE DEL TITULAR NO ES ADORNO. Al transferir por número, Yape y Plin
 * enseñan a quién le estás pagando justo antes de confirmar; sin ese nombre a la
 * vista, el cliente no tiene contra qué compararlo y solo puede confiar en que
 * tecleó bien los nueve dígitos.
 */
export function PaymentAccountCard({
  method,
  fallbackNumber,
  total,
  onZoom,
}: {
  /** La cuenta principal del local, o `null` si no hay ninguna dada de alta. */
  method: PaymentQrView | null
  /** Número suelto del negocio, para locales sin métodos dados de alta. */
  fallbackNumber: string | null
  /** Lo que hay que transferir, exacto. */
  total: number
  onZoom: (url: string) => void
}) {
  const [copied, setCopied] = useState(false)

  const numero = method?.accountNumber ?? fallbackNumber
  if (!numero) return null

  const esPlin = method?.wallet === 'plin'
  const marca = method ? walletLabel(method.wallet) : 'Yape / Plin'

  // Los colores de marca de cada billetera. Sin billetera dada de alta se cae a
  // la tinta de la app: inventarle un color a «Yape / Plin» sería peor que no
  // ponerle ninguno.
  const piel = !method
    ? { fondo: 'bg-surface', borde: 'border-ink/[0.06]', texto: 'text-ink', logo: null }
    : esPlin
      ? {
          fondo: 'bg-[#f0fbfc]',
          borde: 'border-[#bfeaef]',
          texto: 'text-[#0a5f73]',
          logo: '/pay/plin.svg',
        }
      : {
          fondo: 'bg-[#faf5fc]',
          borde: 'border-[#e7d8ee]',
          texto: 'text-[#5b1a68]',
          logo: '/pay/yape.svg',
        }

  function copy() {
    if (!numero) return
    navigator.clipboard.writeText(numero)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`mt-3 rounded-[20px] border ${piel.borde} ${piel.fondo} p-4`}>
      {/* Cabecera: de qué billetera es esta cuenta. */}
      <div className="flex items-center gap-2.5">
        {piel.logo && (
          <img src={piel.logo} alt="" width={30} height={30} className="rounded-[8px]" />
        )}
        <span className={`text-[15px] font-bold ${piel.texto}`}>{marca}</span>
        <span className="text-[12px] text-ink-muted">del restaurante</span>
      </div>

      {/* Cuánto. El dato que el cliente teclea en la otra app. */}
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
            Transfiere exacto
          </div>
          <div className="font-mono text-[30px] font-bold leading-none tracking-tight text-ink">
            {soles(total)}
          </div>
        </div>
      </div>

      {/* A quién. */}
      <div className="mt-3.5 rounded-[16px] bg-white/70 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className={`font-mono text-[22px] font-bold tracking-tight ${piel.texto}`}>
              {numero}
            </div>
            {method && (
              <div className="truncate text-[12px] text-ink-muted">{method.accountName}</div>
            )}
          </div>
          <button
            type="button"
            onClick={copy}
            className="flex shrink-0 items-center gap-1.5 rounded-[12px] bg-ink px-3.5 py-2.5 font-sans text-[13px] font-bold text-white"
          >
            <Icon name={copied ? 'check' : 'content_copy'} size={16} filled={copied} />
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>

        {method?.qrUrl && (
          <div className="mt-3.5 flex flex-col items-center border-t border-ink/[0.05] pt-3.5">
            <button
              type="button"
              onClick={() => onZoom(method.qrUrl as string)}
              className="group relative h-36 w-36 overflow-hidden rounded-xl bg-white p-1.5 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ink/20"
              aria-label={`Agrandar código QR de ${marca}`}
            >
              <img
                src={method.qrUrl}
                alt={`QR de ${marca}`}
                className="h-full w-full object-contain"
                decoding="async"
              />
            </button>
            <span className="mt-2 text-[12px] text-ink-muted">
              o escanea con {marca} · <span className="font-semibold">toca para agrandar</span>
            </span>
          </div>
        )}
      </div>

      {/* Un método puede existir sin imagen: se cobra dictando el número. */}
      {method && !method.qrUrl && (
        <p className="mt-2.5 text-[12px] text-ink-muted">
          Esta cuenta no tiene QR: transfiere al número desde {marca}.
        </p>
      )}
    </div>
  )
}
