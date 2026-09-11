'use client'

import { type OrderStatus, toTrackingStep } from '@tindivo/contracts'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { PushPermissionSheet } from '@/components/push-permission-sheet'
import { ReviewCard } from '@/features/reviews/components/review-card'
import { usePendingReview } from '@/features/reviews/hooks/use-pending-review'
import { CancelledView } from '@/features/tracking/components/cancelled-view'
import { PrepayRail } from '@/features/tracking/components/prepay-rail'
import { TrackingActions } from '@/features/tracking/components/tracking-actions'
import { TrackingAlertChannel } from '@/features/tracking/components/tracking-alert-channel'
import { TrackingAlertToast } from '@/features/tracking/components/tracking-alert-toast'
import { TrackingAppealView } from '@/features/tracking/components/tracking-appeal-view'
import { TrackingCancelRow } from '@/features/tracking/components/tracking-cancel-row'
import { TrackingDriver } from '@/features/tracking/components/tracking-driver'
import { TrackingHero } from '@/features/tracking/components/tracking-hero'
import { TrackingInstall } from '@/features/tracking/components/tracking-install'
import { TrackingItems } from '@/features/tracking/components/tracking-items'
import { TrackingNote } from '@/features/tracking/components/tracking-note'
import { TrackingPrepay } from '@/features/tracking/components/tracking-prepay'
import { TrackingShell } from '@/features/tracking/components/tracking-shell'
import { TrackingSoundToggle } from '@/features/tracking/components/tracking-sound-toggle'
import { TrackingSteps } from '@/features/tracking/components/tracking-steps'
import { useAlertChannel } from '@/features/tracking/hooks/use-alert-channel'
import { useCountdown } from '@/features/tracking/hooks/use-countdown'
import { usePushOffer } from '@/features/tracking/hooks/use-push-offer'
import { useStatusAlerts } from '@/features/tracking/hooks/use-status-alerts'
import { useTracking } from '@/features/tracking/hooks/use-tracking'
import { useWakeLock } from '@/features/tracking/hooks/use-wake-lock'
import { isCancellable, stepsFor } from '@/features/tracking/lib/format'
import { prepayStage } from '@/features/tracking/lib/prepay-stage'

/**
 * El seguimiento del pedido, en tres zonas y en este orden:
 *
 *   1. ESTADO — el hero: en qué punto está y cuándo llega.
 *   2. AHORA MISMO — una sola cosa, la que el cliente puede hacer en este
 *      instante: cancelar mientras se pueda, pagar, o escribir al motorizado que
 *      está en su puerta. Va inmediatamente debajo del hero.
 *   3. REFERENCIA — el camino completo, quién trae el pedido y el detalle. Se
 *      consulta, no se vigila, así que va después y en tono tranquilo.
 *
 * El orden anterior tenía la acción al final: cancelar estaba tras el detalle
 * del pedido, es decir, fuera de pantalla justo durante los cinco minutos en que
 * sirve para algo.
 */
export default function TrackingPage({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId } = use(params)
  const router = useRouter()
  const { data, error, ownedId, ownNote, load, cancel } = useTracking(shortId)
  const countdown = useCountdown(data)
  const { alerta, descartar, sonidoActivo, alternarSonido } = useStatusAlerts(data)
  const ofertaPush = usePushOffer(data, ownedId)
  /**
   * El pedido sigue vivo: hay algo que avisar todavía.
   *
   * Gobierna las DOS piezas del modo espera. La fila de «cómo te avisamos» no
   * tiene nada que prometer sobre un pedido terminado, y el bloqueo de pantalla
   * tiene que soltarse solo al entregar — que es justo lo que la tarjeta le
   * promete al cliente.
   */
  const enEspera = Boolean(data) && data?.status !== 'delivered' && data?.status !== 'cancelled'
  const canalAviso = useAlertChannel()
  const pantallaEncendida = useWakeLock(enEspera)
  /**
   * La pregunta por el pedido ANTERIOR, que solo cabe aquí.
   *
   * Se consulta con el pedido vivo porque la espera es el único rato en que el
   * cliente mira la pantalla sin tener nada que hacer. En `delivered` no: ahí
   * cierra la app y se va a comer, que es justo el motivo de que preguntar al
   * entregar no funcione.
   */
  const resena = usePendingReview(enEspera)

  const current = data ? toTrackingStep(data.status as OrderStatus) : null
  // Un solo sitio elige las palabras de los cuatro pasos, y de ahi salen tanto
  // el hero como el stepper. En recojo el tercero deja de hablar de motorizados.
  const steps = stepsFor(data?.deliveryMethod ?? 'delivery')
  const foundIdx = current ? steps.findIndex((s) => s.key === current) : -1
  const currentIdx = foundIdx < 0 ? 0 : foundIdx
  const step =
    steps[currentIdx] ??
    ({
      key: 'received' as const,
      label: 'Pedido recibido',
      sub: 'Estamos confirmándolo con el restaurante',
    } as {
      key: 'received'
      label: string
      sub: string
    })
  const progress = ((currentIdx + 1) / steps.length) * 100
  const cancellable = data ? isCancellable(data, ownedId) : false
  const enRuta = current === 'ontheway' || current === 'delivered'
  const etapaPrepago = data ? prepayStage(data) : null

  /**
   * ¿Hay algún plazo corriendo que NADIE esté pintando?
   *
   * Cada contador vive pegado a la acción que lo apaga (ver `TrackingHero`), y
   * esa regla no cambia. Pero las dos piezas que los pintan son condicionales:
   * la fila de cancelar solo aparece si `isCancellable`, y la tarjeta de
   * prepago solo en sus dos estados. Un pedido abierto desde un enlace
   * compartido —sin sesión, luego sin `ownedId`— mientras el negocio confirma
   * no cumple ninguna de las dos, y el reloj desaparece de la pantalla entera.
   *
   * Esta es la comprobación de ese hueco, y vive aquí porque la página es la
   * única que sabe qué está montado.
   */
  const prepagoPintaPlazo =
    data?.paymentIntent === 'prepaid' &&
    (data.status === 'awaiting_payment' || (data.status === 'validando' && Boolean(data.proofUrl)))
  const plazoHuerfano = Boolean(countdown) && !cancellable && !prepagoPintaPlazo

  if (data?.status === 'cancelled' && data.cancelReason !== 'proof_rejected_final') {
    return <CancelledView data={data} />
  }

  return (
    <TrackingShell
      title="Tu pedido"
      onBack={() => router.back()}
      error={error}
      data={data}
      right={<TrackingSoundToggle activo={sonidoActivo} onToggle={alternarSonido} />}
      // La barra fija de «subir captura» solo existe mientras el cliente tiene
      // que pagar; solo entonces hace falta reservarle sitio al final.
      pieFijo={data?.paymentIntent === 'prepaid' && data.status === 'awaiting_payment'}
    >
      <TrackingAlertToast alerta={alerta} onClose={descartar} />
      {data && (
        <PushPermissionSheet
          open={ofertaPush.abierta}
          shortId={data.shortId}
          onClose={ofertaPush.cerrar}
        />
      )}
      {data && (
        <div className="px-4 pt-1.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
          <div className="lg:min-w-0">
            {data.status === 'cancelled' && data.cancelReason === 'proof_rejected_final' ? (
              <TrackingAppealView data={data} ownedId={ownedId} onAppealCreated={load} />
            ) : (
              <>
                {/* 1 · Estado */}
                <TrackingHero
                  data={data}
                  step={step}
                  currentIdx={currentIdx}
                  progress={progress}
                  countdown={plazoHuerfano ? countdown : null}
                  pasoVisible={!etapaPrepago}
                />

                {/* De quién es el turno con el dinero. Va pegado al hero y sin
                    tarjeta porque es su pie, no una sección: dice lo único que
                    el hero no puede decir —«esto lo hace el negocio, no tú»— y
                    es justo lo que faltaba para que el prepago se entienda. */}
                {etapaPrepago && <PrepayRail stage={etapaPrepago} />}

                {/* Por dónde le va a llegar el aviso. Va pegado al estado y
                    encima de las acciones porque responde a la pregunta que
                    nace justo al leer «Preparando»: «¿y cómo me entero?». */}
                {enEspera && (
                  <TrackingAlertChannel canal={canalAviso} pantalla={pantallaEncendida} />
                )}

                {/* Y cuando ya comió, la instalación. El argumento solo existe
                    aquí: acaba de recibir su pedido y sabe que esto le sirve. */}
                {data.status === 'delivered' && <TrackingInstall shortId={data.shortId} />}

                {/* 2 · Ahora mismo */}
                {cancellable && (
                  <TrackingCancelRow data={data} countdown={countdown} cancel={cancel} />
                )}
                <TrackingPrepay
                  data={data}
                  ownedId={ownedId}
                  countdown={countdown}
                  onProofUploaded={load}
                />

                {/* Y solo cuando NO hay nada que hacer, la pregunta por el
                    pedido anterior. Va después de la zona de acción y no antes
                    porque compite con ella: con el plazo de cancelar corriendo
                    o un prepago sin resolver, la atención ya tiene dueño. Y
                    espera a que se cierre la hoja del permiso de avisos —dos
                    peticiones seguidas se descartan las dos—. */}
                {enEspera && !cancellable && !etapaPrepago && !ofertaPush.abierta && (
                  <ReviewCard estado={resena} />
                )}

                {/* 3 · Referencia
                    Los dos rieles NUNCA coinciden en pantalla, y no es por
                    estética: mientras el prepago está sin resolver, este de
                    aquí no dice nada. `STATUS_TO_TRACKING` colapsa `validando`,
                    `pending_acceptance`, `awaiting_payment` y `confirmed` en un
                    solo «Recibido», así que durante las tres esperas se queda
                    congelado en el paso 1 de 4 —justo lo que el hero ya escribe
                    dos dedos más arriba— y lo único que aporta es un segundo
                    stepper con la misma forma que el de arriba, a media pantalla
                    de distancia. Dos barras de progreso obligan a averiguar cuál
                    es la buena antes de leer ninguna.
                    Se reparten el turno solos: `prepayStage` devuelve `null` de
                    `preparing` en adelante, que es exactamente cuando este
                    empieza a moverse y el otro deja de tener sujeto. */}
                {!etapaPrepago && <TrackingSteps currentIdx={currentIdx} steps={steps} />}
              </>
            )}
          </div>

          <div className="lg:min-w-0">
            <TrackingDriver data={data} enRuta={enRuta} />
            {/* Va con el motorizado y no con el detalle del pedido: habla de
                como llegar a la puerta, no de lo que se pidio. */}
            <TrackingNote note={ownNote} entregado={data.status === 'delivered'} />
            <TrackingItems data={data} />
            <TrackingActions data={data} current={current} cancellable={cancellable} />
          </div>
        </div>
      )}
    </TrackingShell>
  )
}
