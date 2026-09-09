'use client'

import { Icon } from '@tindivo/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { construirSaludo, type SaludoApertura } from '@/lib/saludo'
import { playNewOrderTone, speak, unlockAudio } from '@/lib/use-audio-alert'

/**
 * LA PRUEBA DE SONIDO DE LA APERTURA.
 *
 * Nace de una noche concreta. El 8 de septiembre, Pizza Priamo perdió tres
 * pedidos seguidos —`DTH7CQFV` a las 20:17, `VHRTX2ML` a las 20:45, `X9MV4TED`
 * a las 20:54, S/99 en treinta y siete minutos— y a las 21:07 la cajera tecleó
 * tres pedidos manuales: los clientes habían llamado y hubo que volver a
 * tomarlos a mano. Preguntado por el sonido, el negocio contestó que tenía el
 * parlante prendido.
 *
 * Y probablemente era verdad. `push_delivery_log` dice que los tres avisos se
 * ENTREGARON bien a ese dispositivo, a los pocos segundos de cada pedido. El
 * aviso salió; lo que no sabemos es si sonó. Entre «el parlante está prendido» y
 * «esta tablet reproduce sonido ahora mismo» caben el volumen del sistema al
 * mínimo, el modo silencio, el canal de notificaciones apagado y —el más
 * traicionero— un `AudioContext` en `suspended`, que no falla ni avisa: se
 * limita a no sonar.
 *
 * NADIE PUEDE CONTESTAR ESA PREGUNTA DESDE EL CÓDIGO. El navegador no expone si
 * hay volumen ni si hay parlante. La única prueba que existe es hacer ruido y
 * preguntarle a la persona si lo oyó. Eso es esto.
 *
 * ES OBLIGATORIA PERO NO BLOQUEA LA APERTURA. El negocio queda declarado abierto
 * ANTES de que empiece la prueba: si el parlante estuviera roto, dejar el local
 * cerrado sería un remedio peor que la enfermedad. Lo que no se puede es
 * despacharla sin contestar — y si contesta que no oyó nada, la franja roja se
 * queda puesta todo el turno.
 */

export type ResultadoPrueba = 'oido' | 'sin-confirmar'

/** Cuántos intentos antes de ofrecer seguir sin sonido. */
const INTENTOS_ANTES_DE_RENDIRSE = 2

const ULTIMA_FRASE_KEY = 'tindivo_ultima_frase_apertura'

export function SoundCheck({
  bizName,
  onDone,
}: {
  bizName: string
  /**
   * Cómo acabó. `sin-confirmar` no es un fallo del componente: es la respuesta
   * «no escuché nada» aceptada, y quien lo recibe tiene que dejar el aviso
   * puesto.
   */
  onDone: (resultado: ResultadoPrueba) => void
}) {
  const [paso, setPaso] = useState<'sonando' | 'ayuda'>('sonando')
  const [intentos, setIntentos] = useState(0)
  const [saludo, setSaludo] = useState<SaludoApertura | null>(null)
  const temporizadores = useRef<ReturnType<typeof setTimeout>[]>([])

  const sonar = useCallback(() => {
    // El desbloqueo va DENTRO del gesto que abrió la prueba: si el
    // `AudioContext` estaba suspendido, este es el momento en que el navegador
    // permite reanudarlo. Es, de hecho, media reparación por sí solo.
    unlockAudio()

    const anterior =
      typeof window === 'undefined' ? null : window.localStorage.getItem(ULTIMA_FRASE_KEY)
    const nuevo = construirSaludo({ negocio: bizName, anterior })
    setSaludo(nuevo)
    try {
      window.localStorage.setItem(ULTIMA_FRASE_KEY, nuevo.frase)
    } catch {
      // Sin `localStorage` la frase puede repetirse. No es motivo para no sonar.
    }

    playNewOrderTone()
    // La voz se desfasa para no hablar encima del bip, igual que en las alertas
    // reales. Los dos tonos duran ~0.4 s.
    speak(nuevo.completo, 700)

    setIntentos((n) => n + 1)
  }, [bizName])

  // Suena en cuanto aparece: la prueba no tiene un botón «empezar», porque un
  // botón más es un botón que se pulsa sin escuchar.
  useEffect(() => {
    sonar()
    const timers = temporizadores.current
    return () => {
      for (const t of timers) clearTimeout(t)
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [sonar])

  const rendirse = intentos >= INTENTOS_ANTES_DE_RENDIRSE

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Prueba de sonido"
      className="fixed inset-0 z-[330] flex items-center justify-center bg-ink/60 p-5"
    >
      <div className="w-full max-w-[400px] rounded-[20px] bg-card p-6 text-center shadow-elev-4">
        {paso === 'sonando' ? (
          <>
            <span className="mx-auto mb-3.5 flex h-[56px] w-[56px] items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <Icon name="notifications_active" size={28} filled />
            </span>

            {/* El saludo se VE además de oírse: si la voz no sale, la frase en
                pantalla deja claro qué tendría que haberse escuchado. */}
            {saludo && (
              <div className="mb-4">
                <p className="text-[15px] font-bold text-ink">{saludo.cabecera}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-brand">{saludo.frase}</p>
              </div>
            )}

            <p className="mb-1 text-[17px] font-bold text-ink">¿Escuchaste la alerta?</p>
            <p className="mb-5 text-[13px] leading-relaxed text-ink-muted">
              Es el mismo sonido que avisa de un pedido nuevo. Tiene que oírse desde la cocina.
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => onDone('oido')}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-4 text-[15px] font-bold text-white transition-all active:scale-[0.97]"
              >
                <Icon name="check_circle" size={18} filled />
                Sí, se escuchó bien
              </button>
              <button
                type="button"
                onClick={() => setPaso('ayuda')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink/[0.06] px-4 text-[15px] font-bold text-ink transition-colors hover:bg-ink/[0.1]"
              >
                No escuché nada
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="mx-auto mb-3.5 flex h-[56px] w-[56px] items-center justify-center rounded-2xl bg-warning-soft text-amber-900">
              <Icon name="warning" size={28} filled />
            </span>

            <h3 className="mb-2 text-[17px] font-bold text-ink">Revisa esto y prueba otra vez</h3>

            {/* La lista va en el orden en que se rompe de verdad, no en el
                orden en que se le ocurre a quien programa. */}
            <ul className="mb-5 space-y-2 text-left text-[14px] leading-snug text-ink-muted">
              {[
                'Sube el volumen del equipo hasta el máximo.',
                'Quita el modo silencio o vibración.',
                'Revisa que el parlante esté encendido y conectado.',
                'Si la tablet está en otra aplicación, vuelve a Tindivo.',
              ].map((linea) => (
                <li key={linea} className="flex gap-2">
                  <Icon name="chevron_right" size={18} className="mt-px shrink-0 text-brand" />
                  <span>{linea}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setPaso('sonando')
                  sonar()
                }}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-4 text-[15px] font-bold text-white transition-all active:scale-[0.97]"
              >
                <Icon name="replay" size={18} filled />
                Probar otra vez
              </button>
              {/* La salida aparece solo tras insistir. Que exista es
                  imprescindible —el turno no se puede quedar rehén de un
                  parlante roto—, pero que sea lo primero que se ve convertiría
                  la prueba en un trámite de un toque. */}
              {rendirse && (
                <button
                  type="button"
                  onClick={() => onDone('sin-confirmar')}
                  className="text-[13px] font-semibold text-ink-subtle underline-offset-2 hover:underline"
                >
                  Seguir sin sonido por ahora
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
