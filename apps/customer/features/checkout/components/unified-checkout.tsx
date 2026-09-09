'use client'

import { Button, cn, Icon, IconButton } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { OtpVerificationSheet } from '@/components/otp-verification-sheet'
import { CartValidationBanner } from '@/features/cart/components/cart-validation-banner'
import { CashSelector } from '@/features/checkout/components/cash-selector'
import { DeliveryCard } from '@/features/checkout/components/delivery-card'
import { GeoBlockSheet } from '@/features/checkout/components/geo-block-sheet'
import { OrderDetail } from '@/features/checkout/components/order-detail'
import { PaymentMethodList } from '@/features/checkout/components/payment-method-list'
import { PrepayExplainer } from '@/features/checkout/components/prepay-explainer'
import type { CheckoutViewModel } from '@/features/checkout/hooks/use-checkout'
import type { UseCheckoutValidationReturn } from '@/features/checkout/hooks/use-checkout-validation'
import { soles } from '@/features/checkout/lib/format'
import {
  type CheckoutField,
  PICKUP_ENABLED,
  paymentOptionsFor,
  promoAviso,
} from '@/features/checkout/types'
import { AddressSelectorSheet } from './address-selector-sheet'
import { NameEditSheet } from './name-edit-sheet'

interface UnifiedCheckoutProps {
  checkout: CheckoutViewModel
  validation: UseCheckoutValidationReturn
}

export function UnifiedCheckout({ checkout, validation }: UnifiedCheckoutProps) {
  const {
    name,
    setName,
    phone,
    setVerifiedPhone,
    addresses,
    addressId,
    setAddressId,
    deliveryMethod,
    setDeliveryMethod,
    acceptsPickup,
    pickupTiming,
    setPickupTiming,
    payment,
    setPayment,
    mustPrepay,
    prepayTimers,
    prepayReason,
    cashChoice,
    setCashChoice,
    cashCustom,
    setCashCustom,
    total,
    subtotal,
    deliveryFee,
    nominalDeliveryFee,
    promoApplies,
    promo,
    distanceBand,
    cart,
    loading,
    locating,
    error,
    setError,
    showOtpSheet,
    setShowOtpSheet,
    placeOrder,
    selectedAddress,
    cartHydrated,
    reloadAddresses,
    validating,
    maxCashBill,
    maxChange,
    maxDeclarable,
    geoBlock,
    setGeoBlock,
    customerNote,
    setCustomerNote,
    eta,
  } = checkout

  const { cashAmount, cashChange, issue, focus, attempted, validate } = validation

  const router = useRouter()
  const [showNameEdit, setShowNameEdit] = useState(false)
  const [showAddressSelector, setShowAddressSelector] = useState(false)
  const [addressSheetStartsAdding, setAddressSheetStartsAdding] = useState(false)
  const [showOrderDetail, setShowOrderDetail] = useState(false)

  const cartRef = useRef<HTMLDivElement>(null)
  const deliveryRef = useRef<HTMLDivElement>(null)
  const pickupRef = useRef<HTMLDivElement>(null)
  const paymentRef = useRef<HTMLDivElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)

  /**
   * LLEVAR AL CLIENTE HASTA LO QUE FALTA.
   *
   * Sin esto, tocar el CTA pintaba un párrafo rojo al final de la página. Y el
   * propio acto de llegar al CTA deja la pantalla scrolleada abajo del todo, así
   * que el mensaje hablaba de un campo que en ese momento no se veía: para
   * enterarse había que leer, deducir de qué sección hablaba y subir a buscarla.
   *
   * `block: 'center'` y no `'start'`: la barra del CTA es sticky y tapa la parte
   * baja de la pantalla, así que un campo alineado arriba puede quedar medio
   * escondido debajo de ella.
   */
  useEffect(() => {
    if (!focus) return
    const destino: Record<CheckoutField, HTMLElement | null> = {
      cart: cartRef.current,
      address: deliveryRef.current,
      name: deliveryRef.current,
      phone: deliveryRef.current,
      // Apunta al bloque, no a la seccion: el selector de recojo es lo primero
      // de "Entrega" y con `block: 'center'` la seccion entera deja la pregunta
      // arriba del todo, fuera de la mirada.
      pickup: pickupRef.current ?? deliveryRef.current,
      cash: paymentRef.current,
    }
    destino[focus.field]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focus])

  /** Un error del servidor llega sin campo al que ir: se lleva al aviso. */
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

  const busy = loading || locating || validating || !cartHydrated

  const ctaLabel = locating
    ? 'Verificando tu ubicación…'
    : validating
      ? 'Verificando el menú…'
      : loading
        ? 'Enviando tu pedido…'
        : issue
          ? issue.cta
          : `Confirmar pedido · ${soles(total)}`

  /**
   * El CTA NO se apaga cuando falta algo: cambia de trabajo.
   *
   * Un botón gris no dice qué falta ni deja hacer nada, y el aviso que sí lo
   * decía estaba a media pantalla de distancia. Diciendo «Agrega tu dirección»
   * y abriendo la hoja al tocarlo, el botón que antes solo confirmaba pasa a ser
   * también el camino más corto a lo que falta. Se apaga solo mientras hay algo
   * en curso —GPS, catálogo, envío—, que es cuando de verdad no se puede hacer
   * nada.
   */
  function handleCta() {
    if (!validate()) {
      // `validate()` ya fijó el foco, que dispara el scroll de arriba. Para lo
      // que se corrige en una hoja, además se abre: llevar al cliente hasta el
      // campo y dejarlo mirándolo sería medio favor.
      if (issue?.field === 'address') {
        setAddressSheetStartsAdding(addresses.length === 0)
        setShowAddressSelector(true)
      }
      if (issue?.field === 'name') setShowNameEdit(true)
      if (issue?.field === 'cart') setShowOrderDetail(true)
      return
    }
    placeOrder({ paymentIntent: payment })
  }

  const ctaPie = loading
    ? 'No cierres esta pantalla.'
    : payment === 'prepaid'
      ? 'Todavía no pagas nada. Te avisamos cuando el local confirme.'
      : deliveryMethod === 'pickup'
        ? // «En la caja» y no «al recoger»: desde la 0224 el cobro de un recojo
          // «ahora» pasa cuando el local confirma que te tiene delante, no al
          // entregarte la bolsa. El sitio es el mismo y el momento ya no.
          'Pagas en la caja del local.'
        : 'Pagas al recibir, directo al motorizado.'

  return (
    <main className="mx-auto flex min-h-dvh max-w-[768px] flex-col bg-surface lg:max-w-6xl">
      <div className="border-ink/[0.04] border-b px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-3">
          {/* Destino fijo, no historial: el checkout puede abrirse por deep
              link (retomar un pedido, un push) sin que haya un `back` de
              verdad al que volver. Mismo patrón que `/cuenta`. */}
          <IconButton
            type="button"
            variant="filled"
            onClick={() => router.push(cart.businessId ? `/negocio/${cart.businessId}` : '/')}
            aria-label="Volver"
            className="shrink-0"
          >
            <Icon name="arrow_back" size={22} />
          </IconButton>
          <div className="min-w-0 flex-1">
            <h1 className="font-display font-bold text-[22px] tracking-tight">Confirmar pedido</h1>
            {/* El negocio y, si lo tiene puesto, su ventana de entrega. Es el MISMO
                `estimated_eta_min/max` que el cliente ya vio en la card del catálogo
                y en la portada del negocio: si aquí desapareciera, el checkout sería
                la única pantalla del camino que deja de decir cuándo llega. Sin el
                dato no se pinta nada — nunca un rango inventado. */}
            {(cart.businessName || eta) && (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-muted">
                {cart.businessName && <span>{cart.businessName}</span>}
                {cart.businessName && eta && (
                  <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-ink-subtle" />
                )}
                {eta && (
                  <span className="inline-flex items-center gap-1 font-semibold text-ink">
                    <Icon name="schedule" size={13} aria-hidden />
                    Llega en {eta.min}–{eta.max} min
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 px-4 pt-3.5 pb-4">
        <CartValidationBanner />

        {/* ── 1 · TU PEDIDO ──
            Sube al primer lugar. Estaba al final, después de tres decisiones y
            además plegado: para ver qué llevabas había que bajar hasta el fondo
            y abrir un acordeón. Es el ancla de confianza de la pantalla, y en
            cualquier app de delivery se ve antes de decidir nada. El desglose de
            plata sí se queda abajo, pegado al CTA: contesta otra pregunta —qué
            pago— y su sitio es junto al botón que lo confirma. */}
        <section ref={cartRef}>
          <SectionTitle>Tu pedido</SectionTitle>
          <div className="overflow-hidden rounded-[18px] border border-ink/[0.04] bg-card shadow-elev-1">
            <button
              type="button"
              onClick={() => setShowOrderDetail((s) => !s)}
              aria-expanded={showOrderDetail}
              className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-ink/[0.02]"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink font-bold text-[14px] text-white tabular-nums"
              >
                {cart.count()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-[14px] text-ink">
                  {cart.count()} {cart.count() === 1 ? 'producto' : 'productos'}
                </span>
                <span className="block text-[12px] text-ink-muted">
                  {showOrderDetail ? 'Toca para cerrar el detalle' : 'Toca para ver el detalle'}
                </span>
              </span>
              <span className="shrink-0 font-bold text-[15px] tabular-nums">{soles(subtotal)}</span>
              <span
                aria-hidden
                className={cn(
                  'flex shrink-0 text-ink-subtle transition-transform duration-200',
                  showOrderDetail && 'rotate-180',
                )}
              >
                <Icon name="expand_more" size={20} />
              </span>
            </button>
            {showOrderDetail && <OrderDetail />}
          </div>
        </section>

        {/* ── 2 · ENTREGA ──
            Aquí vivían DOS secciones, «Entrega» y «Datos de contacto», con dos
            títulos del mismo tamaño que «Método de pago». Ahora son un solo
            objeto que dibuja la ruta. Ver `delivery-card.tsx`. */}
        <section ref={deliveryRef}>
          <SectionTitle>Entrega</SectionTitle>
          {/* DOS INTERRUPTORES, Y HACEN FALTA LOS DOS. `PICKUP_ENABLED` dice si
              el recojo existe en el producto; `acceptsPickup` dice si existe en
              ESTE restaurante (`businesses.accepts_web_pickup`). Faltaba el
              segundo: el selector se pintaba en todos, y el piloto abre el
              recojo restaurante por restaurante — el que no lo tuviera
              encendido dejaba elegir Recojo y devolvía 409 al confirmar. */}
          {PICKUP_ENABLED && acceptsPickup && (
            <div className="mb-2.5 flex gap-2">
              <DeliveryMethodButton
                active={deliveryMethod === 'delivery'}
                onClick={() => setDeliveryMethod('delivery')}
                icon="local_shipping"
                label="Delivery"
              />
              <DeliveryMethodButton
                active={deliveryMethod === 'pickup'}
                onClick={() => setDeliveryMethod('pickup')}
                icon="store"
                label="Recojo"
              />
            </div>
          )}
          {/* ── LA PREGUNTA DEL RECOJO ──
              Ninguna de las dos sale marcada, y no es un descuido de diseño: la
              respuesta gobierna si el pedido se salta la validación telefónica
              (ver `use-checkout-validation`), así que preseleccionar «ahora»
              sería regalar esa exención a quien nunca contestó.

              Las etiquetas dicen dónde está el cliente, no cuándo pasa por la
              comida: «Ahora, espero en el local» es comprobable —la cajera lo
              mira— mientras que «en 10 minutos» no lo es por nadie.

              Y el verbo es «espero», no «estoy». Con «estoy» la pregunta
              —«¿CUÁNDO recoges tu pedido?»— y la respuesta —«ahora»— se leían
              juntas como una promesa de comida inmediata, cuando lo que ocurre
              es lo contrario: se cobra primero y se cocina después, con el
              cliente ahí delante. La etiqueta que promete inmediatez y la caja
              que tarda veinte minutos es una discusión en el mostrador.

              No se pone un número de minutos porque aquí no se sabe: el tiempo
              de preparación lo elige la cajera al aceptar, no el checkout.
              Mismo criterio que `prepPhrase` en los avisos, que devuelve cadena
              vacía antes que inventar un «~20 min» que nadie prometió. */}
          {deliveryMethod === 'pickup' && (
            <div
              ref={pickupRef}
              className={cn(
                'mb-2.5 rounded-[14px] p-2.5',
                attempted && issue?.field === 'pickup'
                  ? 'bg-danger/[0.06] ring-1 ring-danger/40'
                  : 'bg-surface-low',
              )}
            >
              <p className="mb-2 font-semibold text-[13px] text-ink">¿Cuándo recoges tu pedido?</p>
              <div className="flex gap-2">
                <DeliveryMethodButton
                  active={pickupTiming === 'now'}
                  onClick={() => setPickupTiming('now')}
                  icon="storefront"
                  label="Ahora, espero en el local"
                />
                <DeliveryMethodButton
                  active={pickupTiming === 'later'}
                  onClick={() => setPickupTiming('later')}
                  icon="schedule"
                  label="Más tarde"
                />
              </div>
              {pickupTiming === 'now' && (
                <p className="mt-2 text-[12px] text-ink-soft">
                  Pagas en la caja y lo preparan mientras esperas ahí.
                </p>
              )}
              {/* ── LO QUE PASA SI NO VIENES, DICHO ANTES DE PAGAR ──
                  Es la pieza antidisputa, y por eso vive AQUÍ y no en los
                  términos: el cliente de un «más tarde» paga por adelantado y
                  la comida se hace sin él delante, así que las dos mitades
                  —cuánto se le guarda y qué pasa si no pasa— tienen que estar
                  delante de sus ojos ANTES de que yapee, no después.

                  Va la promesa primero. «No se devuelve» a secas se lee como
                  una amenaza en la pantalla donde se decide comprar; con lo que
                  el negocio SÍ se compromete a hacer delante, es una condición
                  y no un castigo. Y el plazo es «hasta que cierre el local»
                  porque es lo que de verdad va a pasar: el mostrador no
                  autocancela nada y la bolsa se queda ahí (0220). */}
              {pickupTiming === 'later' && (
                <p className="mt-2 text-[12px] text-ink-soft">
                  Te lo guardamos listo hasta que cierre el local. Si no pasas a recogerlo, no se
                  devuelve.
                </p>
              )}
              {attempted && issue?.field === 'pickup' && (
                <p className="mt-2 font-medium text-[12px] text-danger">{issue.message}</p>
              )}
            </div>
          )}
          <DeliveryCard
            businessName={cart.businessName ?? ''}
            deliveryMethod={deliveryMethod}
            address={selectedAddress}
            invalid={attempted && (issue?.field === 'address' || issue?.field === 'name')}
            invalidMessage={issue?.message ?? null}
            name={name}
            phone={phone}
            onEditAddress={() => {
              setAddressSheetStartsAdding(addresses.length === 0)
              setShowAddressSelector(true)
            }}
            onEditName={() => setShowNameEdit(true)}
            note={customerNote}
            onNote={setCustomerNote}
          />
        </section>

        {/* ── 3 · PAGO ── */}
        <section ref={paymentRef}>
          <SectionTitle>¿Cómo pagas?</SectionTitle>
          <PaymentMethodList
            options={paymentOptionsFor(deliveryMethod)}
            value={payment}
            onChange={(v) => {
              setPayment(v)
              if (v !== 'pending_cash') {
                setCashChoice('exact')
                setCashCustom('')
              }
              setError(null)
            }}
            mustPrepay={mustPrepay}
            prepayReason={prepayReason}
          />

          {payment === 'prepaid' && (
            <PrepayExplainer
              timers={prepayTimers}
              forzado={mustPrepay}
              businessName={cart.businessName ?? ''}
            />
          )}

          {/* EL BILLETE ES UNA PREGUNTA DEL DELIVERY, NO DEL PAGO EN EFECTIVO.
              Existe porque el motorizado sale del local con un sencillo que le
              adelanta la caja, y hay que saber cuanto llevarle (0146). En un
              recojo el cliente paga EN la caja, que tiene su propio sencillo:
              preguntarle con que billete viene es pedirle un dato que nadie va
              a usar, y encima puede rechazarle el pedido por un techo de vuelto
              que en el mostrador no aplica. */}
          {payment === 'pending_cash' && deliveryMethod !== 'pickup' && (
            <CashSelector
              total={total}
              cashChoice={cashChoice}
              setCashChoice={setCashChoice}
              cashCustom={cashCustom}
              setCashCustom={setCashCustom}
              cashAmount={cashAmount}
              cashChange={cashChange}
              maxCashBill={maxCashBill}
              maxChange={maxChange}
              maxDeclarable={maxDeclarable}
            />
          )}
        </section>

        {/* ── 4 · TOTALES ── */}
        <section className="space-y-2 px-1">
          <div className="flex justify-between text-[14px] text-ink-muted">
            <span>Subtotal</span>
            <span className="tabular-nums">{soles(subtotal)}</span>
          </div>
          <div className="flex justify-between text-[14px] text-ink-muted">
            <span>
              Delivery
              {distanceBand === 'far' && deliveryMethod !== 'pickup' && (
                <span className="ml-1.5 font-medium text-[11px] text-brand">(zona lejana)</span>
              )}
            </span>
            <span className="tabular-nums">
              {deliveryMethod === 'pickup' ? (
                'S/ 0.00'
              ) : promoApplies ? (
                <>
                  <span className="mr-1.5 text-ink-muted/60 line-through">
                    {soles(nominalDeliveryFee)}
                  </span>
                  <span className="font-bold text-brand-dark">GRATIS</span>
                </>
              ) : (
                soles(deliveryFee)
              )}
            </span>
          </div>
          {/* `promoAviso` devuelve null cuando la promo no está viva: en ese caso
              el checkout se ve exactamente como antes de que existiera. Ver la
              nota en `types.ts`. */}
          {deliveryMethod !== 'pickup' && promoAviso(promo.reason) && (
            <p
              className={cn(
                'flex items-center gap-1.5 text-[12px]',
                promo.reason === 'active' ? 'text-brand-dark' : 'text-ink-muted',
              )}
            >
              {promo.reason === 'active' && (
                <Icon name="local_activity" size={14} className="shrink-0" />
              )}
              {promoAviso(promo.reason)}
            </p>
          )}
          <div className="flex justify-between border-ink/[0.09] border-t pt-2.5 font-extrabold text-[18px] text-ink tracking-tight">
            <span>Total</span>
            <span className="tabular-nums">{soles(total)}</span>
          </div>
        </section>
      </div>

      {/* ── CTA ──
          `env(safe-area-inset-bottom)` en línea, como el `BottomActionBar` del
          DS: en un iPhone con barra de gestos el botón quedaba pegado al borde
          con un `pb-5` fijo. */}
      <div
        className="sticky bottom-0 z-10 border-ink/[0.05] border-t bg-surface/92 px-4 pt-3 backdrop-blur-md"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        {error && (
          <p
            ref={errorRef}
            role="alert"
            className="mb-2.5 flex items-start gap-2 rounded-[14px] bg-danger-soft px-3 py-2.5 font-semibold text-[12.5px] text-danger leading-snug"
          >
            <span aria-hidden className="mt-px flex shrink-0">
              <Icon name="error" size={15} />
            </span>
            {error}
          </p>
        )}
        <Button
          type="button"
          variant={issue && !busy ? 'secondary' : 'brand'}
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={handleCta}
        >
          {busy && (
            <span
              aria-hidden
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
            />
          )}
          {ctaLabel}
        </Button>
        <p className="mt-2 text-center text-[11px] text-ink-subtle leading-snug">{ctaPie}</p>
      </div>

      <NameEditSheet
        name={name}
        open={showNameEdit}
        onClose={() => setShowNameEdit(false)}
        onSave={setName}
      />

      <AddressSelectorSheet
        open={showAddressSelector}
        startAdding={addressSheetStartsAdding}
        onClose={() => setShowAddressSelector(false)}
        addresses={addresses}
        addressId={addressId}
        onSelect={(id) => {
          setAddressId(id)
          setError(null)
        }}
        onSaved={reloadAddresses}
      />

      <GeoBlockSheet
        kind={geoBlock}
        onClose={() => setGeoBlock(null)}
        onRetry={() => {
          setGeoBlock(null)
          void placeOrder()
        }}
        onPrepay={() => {
          setGeoBlock(null)
          setPayment('prepaid')
          void placeOrder({ paymentIntent: 'prepaid', skipGps: true })
        }}
      />

      <OtpVerificationSheet
        open={showOtpSheet}
        phone={phone}
        onVerified={() => {
          setVerifiedPhone(phone)
          setShowOtpSheet(false)
          setTimeout(() => {
            placeOrder({ paymentIntent: payment })
          }, 300)
        }}
        onClose={() => setShowOtpSheet(false)}
      />
    </main>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 px-1 font-display font-bold text-[15px] text-ink tracking-tight">
      {children}
    </h2>
  )
}

function DeliveryMethodButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: string
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-[14px] border py-3 font-semibold text-[14px] transition-all',
        active
          ? 'border-brand bg-brand text-white shadow-glow-brand'
          : 'border-ink/[0.04] bg-card text-ink hover:bg-surface-low',
      )}
    >
      <Icon name={icon} size={18} />
      {label}
    </button>
  )
}
