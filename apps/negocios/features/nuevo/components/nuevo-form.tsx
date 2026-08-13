'use client'

import { BLACKLISTED_PHONES } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { soles } from '@/components/dashboard/primitives'
import { type DirectoryAddress, useAddressLookup } from '../hooks/use-address-lookup'
import { type DistanceBand, useCreateOrder } from '../hooks/use-create-order'
import { isReferenceValid, num } from '../lib/format'
import type { Payment } from '../types'
import { AddressPickerModal } from './address-picker-modal'
import { AmountForm } from './amount-form'
import { BandSelector } from './band-selector'
import { CustomerForm } from './customer-form'
import { PaymentSelector } from './payment-selector'
import { PrepSelector } from './prep-selector'
import { type AddressOrigin, ReferenceForm } from './reference-form'

export function NuevoForm() {
  const router = useRouter()
  const { submit, busy, error } = useCreateOrder()

  const [prep, setPrep] = useState(20)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [reference, setReference] = useState('')
  const [payment, setPayment] = useState<Payment>('pending_cash')
  const [amount, setAmount] = useState('')
  const [paysWith, setPaysWith] = useState('')
  const [walletPart, setWalletPart] = useState('')
  const [cashPart, setCashPart] = useState('')
  // Zona de entrega. Arranca en `null` — nadie ha elegido todavía — y `canSubmit`
  // la exige. Un default a `'near'` registraría como cercana cada entrega lejana
  // sin que nadie se entere.
  const [band, setBand] = useState<DistanceBand | null>(null)

  // ── Autocompletado por teléfono (spec_ui_cajera.md PARTE B) ────────────────
  const { state: lookup } = useAddressLookup(phone)

  /** La fila del directorio que se está usando, si el texto sigue coincidiendo.
   *  Guarda la referencia original para poder detectar la edición del B4. */
  const [linked, setLinked] = useState<{ address: DirectoryAddress; text: string } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  /** Un teléfono cuyo modal ya se resolvió no vuelve a abrirlo. Sin esto, el
   *  modal reaparece en cada render mientras el estado siga en `multiple`. */
  const resolvedFor = useRef<string | null>(null)

  const applyAddress = (address: DirectoryAddress) => {
    setReference(address.reference)
    setLinked({ address, text: address.reference })
    // B5 · FIX #3: el nombre del directorio solo RELLENA un campo vacío, nunca
    // pisa lo que la cajera ya escribió. En el legacy el nombre del pedido
    // terminaba sobrescribiendo el del directorio y propagándose a los otros
    // negocios sin que nadie se enterara.
    setName((current) => (current.trim().length === 0 ? (address.customerName ?? '') : current))
  }

  // Reacciona al resultado del lookup. Va en un efecto porque la respuesta
  // llega de forma asíncrona, no de un evento del usuario.
  useEffect(() => {
    const cleanPhoneKey = phone.replace(/\D/g, '')

    // EL POPUP SE ABRE SIEMPRE QUE HAYA RESULTADOS, aunque sea UNO SOLO.
    //
    // El spec (B2-b) decía autocompletar directo cuando hay una sola dirección.
    // No se sigue, por dos razones operativas que pesan más:
    //
    //   1. La cajera está al teléfono y tiene que CONFIRMAR con el cliente a
    //      dónde va el pedido. Rellenar el campo sin preguntar convierte un dato
    //      viejo en un hecho: si el cliente se mudó, el pedido sale a la casa
    //      equivocada y nadie lo mira porque el campo ya venía lleno.
    //   2. Es el único punto donde cabe "escribir dirección nueva" para un
    //      cliente CONOCIDO. Con autocompletado directo, un cliente con una sola
    //      dirección guardada no tendría por dónde pedir a otro sitio sin borrar
    //      a mano lo que el sistema acaba de escribir.
    //
    // Un toque de más en el 88% de los casos, a cambio de que la dirección
    // siempre la confirme una persona.
    if (lookup.status === 'single' || lookup.status === 'multiple') {
      if (resolvedFor.current === cleanPhoneKey) return
      resolvedFor.current = cleanPhoneKey
      setPickerOpen(true)
      return
    }

    // Cliente nuevo, error o teléfono incompleto: no hay nada vinculado. Los
    // campos quedan como estén — NO se borra lo que la cajera haya tecleado.
    if (lookup.status === 'idle' || lookup.status === 'empty' || lookup.status === 'error') {
      resolvedFor.current = null
      setLinked(null)
    }
    // `applyAddress` se recrea en cada render y no aporta nada a las
    // dependencias: lo que decide si hay que actuar es el estado del lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup, phone])

  // B4 · La cajera editó el texto y ya no coincide con la dirección vinculada:
  // se desvincula. El texto editado describe otro lugar, así que las
  // coordenadas de la fila vieja serían engañosas y no deben viajar.
  //
  // Desvincular NO pierde la dirección: al crear el pedido, el RPC la da de alta
  // como fila nueva del directorio (la cajera crea, nunca edita). Por eso el
  // texto editado tampoco pisa la fila original.
  const isUnlinked = linked !== null && reference !== linked.text
  const addressDirectoryId = linked !== null && !isUnlinked ? linked.address.id : null

  const origin: AddressOrigin = isUnlinked
    ? { kind: 'unlinked' }
    : linked !== null
      ? { kind: 'linked', hasGps: linked.address.hasGps }
      : lookup.status === 'error'
        ? { kind: 'degraded' }
        : { kind: 'manual' }

  const deliveryMethod = 'delivery'
  const amountN = num(amount)
  const cleanPhone = phone.replace(/\D/g, '')
  const isPhoneBlacklisted =
    cleanPhone.length > 0 && BLACKLISTED_PHONES.includes(cleanPhone as unknown as never)
  const isPhoneComplete = cleanPhone.length === 9 && /^9\d{8}$/.test(cleanPhone)
  const phoneFormatOk = cleanPhone === '' || isPhoneComplete
  const isPhoneValid = isPhoneComplete && !isPhoneBlacklisted
  const fieldsDisabled = !isPhoneValid
  const phoneOk = isPhoneValid
  const referenceOk = isReferenceValid(reference, deliveryMethod)

  // Desde la 0129 `amount` ES el total con envío incluido, así que estas dos
  // cuentas por fin coinciden con las del RPC. Antes no había número que pudiera
  // satisfacer a las dos: la pantalla exigía `billetera + efectivo = comida` y
  // el servidor `= comida + envío`, así que TODO pago mixto que la pantalla
  // marcaba en verde se rechazaba al enviar. Igual el vuelto, que salía S/2 de
  // más porque se restaba del monto sin envío. No hizo falta tocar la aritmética
  // para arreglarlo: bastó con que el número de entrada significara lo que el
  // rótulo decía.
  const centsTotal = Math.round(amountN * 100)
  const centsWallet = Math.round(num(walletPart) * 100)
  const centsCash = Math.round(num(cashPart) * 100)
  const mixedOk = payment !== 'pending_mixed' || centsWallet + centsCash === centsTotal

  const isCashish = payment === 'pending_cash' || payment === 'pending_mixed'
  const cashTarget = payment === 'pending_mixed' ? num(cashPart) : amountN
  const change = useMemo(() => {
    if (!isCashish) return 0
    const c = num(paysWith) - cashTarget
    return c > 0 ? c : 0
  }, [isCashish, paysWith, cashTarget])

  // `band !== null` cierra el botón hasta que se elija zona. El endpoint la
  // exige (zod sin `.optional()` desde la 0126), así que sin ella el POST
  // devolvería 422: mejor un botón que dice qué falta que un error tras
  // rellenar todo el formulario. Mismo criterio para el nombre, que desde ahora
  // también lo exige el endpoint: es cómo el motorizado identifica el pedido.
  const nameOk = name.trim().length > 0
  const canSubmit =
    amountN > 0 && nameOk && mixedOk && phoneOk && referenceOk && band !== null && !busy

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-border bg-card px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => router.replace('/')}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border-none bg-ink/[0.06] text-ink transition-colors hover:bg-ink/[0.1]"
        >
          <Icon name="arrow_back" size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-bold leading-tight text-ink">
            Solicitar motorizado
          </h1>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Pedido por teléfono
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[560px] flex-1 overflow-y-auto px-3.5 py-4 pb-36">
        <div className="flex flex-col gap-3">
          <CustomerForm
            name={name}
            onNameChange={setName}
            phone={phone}
            onPhoneChange={(v) => setPhone(v.replace(/\D/g, '').slice(0, 9))}
            isBlacklisted={isPhoneBlacklisted}
            phoneFormatOk={phoneFormatOk}
            lookup={lookup}
            disabled={fieldsDisabled}
          />
          <ReferenceForm
            reference={reference}
            onChange={setReference}
            isValid={referenceOk}
            origin={origin}
            disabled={fieldsDisabled}
          />
          <PrepSelector value={prep} onChange={setPrep} disabled={fieldsDisabled} />
          <PaymentSelector value={payment} onChange={setPayment} disabled={fieldsDisabled} />
          <AmountForm
            payment={payment}
            amount={amount}
            onAmountChange={setAmount}
            walletPart={walletPart}
            onWalletChange={setWalletPart}
            cashPart={cashPart}
            onCashChange={setCashPart}
            paysWith={paysWith}
            onPaysWithChange={setPaysWith}
            mixedOk={mixedOk}
            change={change}
            disabled={fieldsDisabled}
          />
          <BandSelector value={band} onChange={setBand} disabled={fieldsDisabled} />

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-danger-soft p-3 text-[13px] font-semibold text-danger">
              <Icon name="error" size={18} filled />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {pickerOpen && (lookup.status === 'single' || lookup.status === 'multiple') && (
        <AddressPickerModal
          addresses={lookup.status === 'single' ? [lookup.address] : lookup.addresses}
          onPick={(address) => {
            applyAddress(address)
            setPickerOpen(false)
          }}
          onWriteNew={() => {
            // Dirección nueva para un cliente conocido: se limpia el campo y se
            // suelta el vínculo, pero el nombre se conserva — es el mismo
            // cliente, solo que pide a otro sitio.
            setReference('')
            setLinked(null)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* Sticky CTA */}
      <div className="sticky bottom-0 border-t border-border bg-card px-3.5 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <div className="mx-auto max-w-[560px]">
          {isCashish && change > 0 && (
            <div className="mb-2.5 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2">
              <Icon name="payments" size={16} filled className="text-success" />
              <span className="text-[13px] font-semibold text-success">
                Entrega {soles(change)} de vuelto al motorizado junto con el pedido
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() =>
              submit(
                {
                  prep,
                  name,
                  phone,
                  reference,
                  payment,
                  amount,
                  paysWith,
                  walletPart,
                  cashPart,
                  band,
                  addressDirectoryId,
                },
                canSubmit,
              )
            }
            disabled={!canSubmit}
            className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand px-6 text-base font-bold text-white shadow-[0_6px_18px_rgba(249,115,22,0.16)] transition-all hover:shadow-[0_10px_30px_rgba(249,115,22,0.24)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
          >
            <Icon name="two_wheeler" size={22} filled />{' '}
            {/* El botón deshabilitado NOMBRA lo que falta en vez de quedarse gris
                sin explicación. La zona es lo único que puede faltar sin señal
                propia en el formulario: los demás campos avisan en su tarjeta. */}
            {busy ? 'Creando…' : band === null ? 'Falta elegir la zona de entrega' : 'Pedir moto'}
          </button>
        </div>
      </div>
    </div>
  )
}
