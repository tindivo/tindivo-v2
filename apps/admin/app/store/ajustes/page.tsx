'use client'

import { formatStorePrice, type StoreSettings, storeSettingsSchema } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { storeApi } from '@/components/store/store-api'
import { errMsg } from '@/lib/api'

/** Lo que se edita como texto; los números se validan al guardar. */
interface Draft {
  whatsappNumber: string
  deliveryMin: string
  deliveryMax: string
  deliveryText: string
}

const toDraft = (s: StoreSettings): Draft => ({
  whatsappNumber: s.whatsappNumber,
  deliveryMin: String(s.deliveryMin),
  deliveryMax: String(s.deliveryMax),
  deliveryText: s.deliveryText ?? '',
})

const num = (v: string) => Number.parseFloat(v.replace(',', '.'))

/**
 * Ajustes de la tienda (PRD §6.4): número de WhatsApp, delivery mínimo y
 * máximo y texto de entrega, con la vista previa «Así se ve en la tienda».
 * Se guardan en `app_settings.store`: no hace falta desplegar para cambiarlos.
 */
export default function StoreSettingsPage() {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    storeApi
      .settings()
      .then((s) => setDraft(toDraft(s)))
      .catch((e) => setError(errMsg(e)))
  }, [])

  if (!draft) {
    return <div className="as-empty">{error ?? 'Cargando…'}</div>
  }

  const parsed = storeSettingsSchema.safeParse({
    whatsappNumber: draft.whatsappNumber,
    deliveryMin: num(draft.deliveryMin),
    deliveryMax: num(draft.deliveryMax),
    deliveryText: draft.deliveryText,
  })
  const issue = parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Revisa los datos')
  const set = (k: keyof Draft, v: string) => {
    setDraft({ ...draft, [k]: v })
    setState('idle')
  }

  async function save() {
    if (!parsed.success) return
    setState('saving')
    setError(null)
    try {
      await storeApi.saveSettings(parsed.data)
      setState('saved')
    } catch (e) {
      setError(errMsg(e))
      setState('idle')
    }
  }

  const min = Number.isFinite(num(draft.deliveryMin)) ? num(draft.deliveryMin) : 0
  const max = Number.isFinite(num(draft.deliveryMax)) ? num(draft.deliveryMax) : 0

  return (
    <>
      <div className="as-top">
        <Link href="/store" className="as-iconbtn" aria-label="Volver a la tienda">
          <Icon name="arrow_back" size={22} />
        </Link>
        <h1>Ajustes de la tienda</h1>
      </div>

      <div className="as-form">
        <div className="as-fld">
          <label htmlFor="wa">WhatsApp de pedidos</label>
          <input
            id="wa"
            className="as-inp"
            inputMode="tel"
            value={draft.whatsappNumber}
            onChange={(e) => set('whatsappNumber', e.target.value)}
          />
          <div className="as-help">Con código de país, sin +. Ej.: 51906550166.</div>
        </div>

        <div className="as-two">
          <div className="as-fld">
            <label htmlFor="dmin">Delivery mínimo</label>
            <div className="as-money">
              <span className="cur">S/</span>
              <input
                id="dmin"
                className="as-inp"
                inputMode="decimal"
                value={draft.deliveryMin}
                onChange={(e) => set('deliveryMin', e.target.value)}
              />
            </div>
          </div>
          <div className="as-fld">
            <label htmlFor="dmax">Delivery máximo</label>
            <div className="as-money">
              <span className="cur">S/</span>
              <input
                id="dmax"
                className="as-inp"
                inputMode="decimal"
                value={draft.deliveryMax}
                onChange={(e) => set('deliveryMax', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="as-fld">
          <label htmlFor="dtext">
            Texto de entrega <span className="opt">Opcional</span>
          </label>
          <textarea
            id="dtext"
            className="as-inp"
            maxLength={160}
            value={draft.deliveryText}
            onChange={(e) => set('deliveryText', e.target.value)}
            placeholder={`S/${min.toFixed(2)}–${max.toFixed(2)} según distancia · Pagas al recibir: efectivo o Yape`}
          />
          <div className="as-help">
            Si lo dejas vacío, se usa el texto estándar con los montos de arriba.
          </div>
        </div>

        <div className="as-pv">
          <div className="k">Así se ve en la tienda</div>
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            <Icon name="delivery_dining" size={22} />
            <div>
              <b style={{ display: 'block', fontSize: 15 }}>
                Te lo llevamos en San Jacinto desde {formatStorePrice(min)}
              </b>
              <span style={{ color: 'var(--color-ink-muted)' }}>
                {draft.deliveryText.trim() ||
                  `S/${min.toFixed(2)}–${max.toFixed(2)} según distancia · Pagas al recibir: efectivo o Yape`}
              </span>
            </div>
          </div>
        </div>

        {(issue || error) && <div className="as-err">{error ?? issue}</div>}
      </div>

      <div className="as-actbar">
        <div>
          <button
            type="button"
            className="as-publish"
            disabled={!parsed.success || state === 'saving'}
            onClick={save}
          >
            {state === 'saving'
              ? 'Guardando…'
              : state === 'saved'
                ? 'Guardado ✓'
                : 'Guardar ajustes'}
          </button>
        </div>
      </div>
    </>
  )
}
