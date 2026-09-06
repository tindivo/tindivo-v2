'use client'

import { BottomSheet } from '@tindivo/ui'
import { useState } from 'react'
import { usePwaInstall } from '@/hooks/use-pwa-install'
import { descartarInstalacion, sePuedeOfrecerInstalacion } from '@/lib/pwa-install'

const TITULO_IOS = 'En iPhone hay un paso más'

/** El icono de compartir de Safari, que es lo que hay que tocar en el paso 1. */
function IconoCompartir() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
    </svg>
  )
}

interface TrackingInstallProps {
  /** El pedido recién entregado por el que se ofrece. */
  shortId: string
}

/**
 * OFRECER LA INSTALACIÓN, Y SOLO CUANDO SE PUEDE ARGUMENTAR.
 *
 * EL MOMENTO. Con el pedido ya entregado. El cliente acaba de recibir su comida
 * y sabe que esto le sirve; ofrecerlo al entrar, antes de que haya pedido nada,
 * es pedirle sitio en su pantalla de inicio a cambio de una promesa que todavía
 * no ha visto cumplirse. Lo decide la página, que es la que conoce el estado.
 *
 * DOS CAMINOS CON DOS MOTIVOS DISTINTOS, y por eso no comparten texto:
 *
 *   · Chromium → «pide otra vez en un toque». Instalar es comodidad: los avisos
 *     ya le funcionan en el navegador, así que prometer que así "recibirá
 *     notificaciones" sería mentira.
 *   · iOS → «para que te lleguen los avisos». Aquí sí es el requisito: Safari
 *     solo los entrega a apps que están en la pantalla de inicio. Y como no hay
 *     evento que disparar, lo único que se puede hacer es enseñar los pasos.
 *
 * No se pinta si ya está instalada, si el navegador no lo admite, o si el
 * cliente ya lo descartó dos veces (`lib/pwa-install.ts`).
 */
export function TrackingInstall({ shortId }: TrackingInstallProps) {
  const pwa = usePwaInstall()
  const [oculta, setOculta] = useState(false)
  const [pasosIOS, setPasosIOS] = useState(false)

  const descartar = () => {
    descartarInstalacion(shortId)
    setOculta(true)
  }

  if (!pwa.listo || pwa.instalada || oculta) return null
  // En iOS no hay evento, así que `puedeInstalar` nunca es true: el camino se
  // abre por plataforma, no por capacidad.
  if (!pwa.puedeInstalar && !pwa.isIOS) return null
  if (!sePuedeOfrecerInstalacion(shortId)) return null

  return (
    <div className="mt-3 flex flex-col gap-3.5 rounded-[18px] border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-[linear-gradient(135deg,var(--color-brand),var(--gradient-brand-to))] font-display font-bold text-[26px] text-white leading-none shadow-[0_6px_18px_rgba(249,115,22,0.3)]">
          t
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-display font-bold text-lead leading-tight tracking-tight">
            {pwa.isIOS ? 'Pon Tindivo en tu inicio' : 'Pide otra vez en un toque'}
          </p>
          <p className="text-label text-ink-muted leading-relaxed">
            {pwa.isIOS
              ? 'En iPhone, los avisos de tu pedido solo llegan si Tindivo está en tu pantalla de inicio.'
              : 'Ponlo en tu pantalla de inicio. Pesa menos que una foto y abre directo en el catálogo.'}
          </p>
        </div>
      </div>

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => {
            if (pwa.isIOS) setPasosIOS(true)
            else void pwa.instalar().then((ok) => ok && setOculta(true))
          }}
          className="h-11 flex-grow rounded-[14px] bg-[linear-gradient(135deg,var(--color-brand),var(--gradient-brand-to))] font-semibold text-body-lg text-white"
        >
          {pwa.isIOS ? 'Ver cómo' : 'Instalar'}
        </button>
        <button
          type="button"
          onClick={descartar}
          className="h-11 w-[118px] rounded-[14px] border border-border bg-card font-medium text-body-lg text-ink-muted"
        >
          Ahora no
        </button>
      </div>

      <BottomSheet open={pasosIOS} onClose={() => setPasosIOS(false)} label={TITULO_IOS}>
        <div className="flex flex-col gap-4.5 px-5 pt-2 pb-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-[22px] font-bold leading-tight tracking-tight">
              {TITULO_IOS}
            </h2>
            <p className="text-body text-ink-muted leading-relaxed">
              Safari solo entrega avisos si Tindivo está en tu pantalla de inicio. Se hace una vez y
              queda para siempre.
            </p>
          </div>

          <ol className="flex flex-col gap-3.5">
            <li className="flex items-center gap-3">
              <span className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full bg-ink font-mono font-semibold text-label text-white">
                1
              </span>
              <span className="flex flex-wrap items-center gap-1.5 text-body leading-snug">
                Toca
                <span className="flex h-7.5 w-7.5 items-center justify-center rounded-[9px] bg-surface-low text-info">
                  <IconoCompartir />
                </span>
                abajo en Safari
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full bg-ink font-mono font-semibold text-label text-white">
                2
              </span>
              <span className="text-body leading-snug">
                Baja y elige <strong className="font-semibold">Añadir a pantalla de inicio</strong>
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full bg-ink font-mono font-semibold text-label text-white">
                3
              </span>
              <span className="text-body leading-snug">
                Abre Tindivo desde ese icono y activa los avisos
              </span>
            </li>
          </ol>

          <div className="flex items-center gap-2.5 rounded-[14px] bg-surface-low p-3.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,var(--color-brand),var(--gradient-brand-to))] font-display font-bold text-[19px] text-white leading-none">
              t
            </span>
            <p className="text-caption text-ink-muted leading-relaxed">
              Así se verá en tu inicio, junto a tus otras apps.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setPasosIOS(false)
              descartar()
            }}
            className="h-12 rounded-[16px] bg-[linear-gradient(135deg,var(--color-brand),var(--gradient-brand-to))] font-semibold text-base text-white"
          >
            Entendido
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
