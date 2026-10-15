'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import {
  type ClientCompatSettings,
  ClientCompatSettingsSchema,
  type ClientFeature,
  type ClientFeaturesSettings,
  ClientFeaturesSettingsSchema,
  NATIVE_PLATFORMS,
} from '@tindivo/contracts'
import { Button, ToggleSwitch } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { SectionHeader } from '@/components/admin'
import { api, errMsg } from '@/lib/api'

const APP_LABEL = { customer: 'Cliente', negocios: 'Negocios', motorizados: 'Motorizados' } as const
const PLATFORM_LABEL = { ios: 'iOS', android: 'Android' } as const

/** Mínimos de versión y de sistema: solo lectura (se suben a mano, con cuidado). */
function MinimumsCard({ compat }: { compat: ClientCompatSettings }) {
  return (
    <div className="t-card">
      <p className="t-display mb-3 text-[15px] text-ink">Versiones mínimas</p>
      <div className="space-y-1 text-[14px] text-ink">
        {(Object.keys(APP_LABEL) as (keyof typeof APP_LABEL)[]).map((app) => (
          <p key={app}>
            <span className="font-semibold">{APP_LABEL[app]}:</span>{' '}
            {NATIVE_PLATFORMS.map(
              (p) => `${PLATFORM_LABEL[p]} ${compat.minAppVersion[app][p]}`,
            ).join(' · ')}
          </p>
        ))}
        <p>
          <span className="font-semibold">Sistema mínimo:</span> Android {compat.minOs.android} ·
          iOS {compat.minOs.ios}
        </p>
      </div>
      <p className="mt-3 text-[13px] text-ink-muted">
        Una app por debajo de su mínimo recibe «actualiza la app». Solo lectura: se cambia con un
        ajuste de base de datos, no desde aquí.
      </p>
    </div>
  )
}

function FeatureCard({
  name,
  feature,
  save,
}: {
  name: string
  feature: ClientFeature
  save: (name: string, next: ClientFeature) => Promise<void>
}) {
  const [enabled, setEnabled] = useState(feature.enabled)
  const [message, setMessage] = useState(feature.message ?? '')
  const [busy, setBusy] = useState(false)
  const trimmed = message.trim()
  return (
    <div className="t-card">
      <ToggleSwitch
        checked={enabled}
        onChange={setEnabled}
        label={name}
        description={enabled ? 'Encendida' : 'Apagada: las apps muestran el mensaje'}
      />
      <label className="mt-3 block text-[13px] text-ink-muted" htmlFor={`msg-${name}`}>
        Mensaje cuando está apagada
      </label>
      <input
        id={`msg-${name}`}
        className="t-field"
        maxLength={140}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ej.: Esta función volverá pronto"
      />
      <Button
        size="sm"
        className="mt-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await save(name, { enabled, ...(trimmed ? { message: trimmed } : {}) })
          setBusy(false)
        }}
      >
        Guardar
      </Button>
    </div>
  )
}

/**
 * Interruptores de las apps nativas (CLI-4/OPS-6). Muestra los mínimos de
 * `client_compat` y, por cada clave de `client_features`, el interruptor y su
 * mensaje. El admin NO crea ni borra claves: las declara una migración.
 */
export default function AppsPage() {
  const [compat, setCompat] = useState<ClientCompatSettings | null>(null)
  const [features, setFeatures] = useState<ClientFeaturesSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<{ key: string; value: unknown }[]>>('/admin/settings')
      .then((r) => {
        const byKey = Object.fromEntries(r.data.map((s) => [s.key, s.value]))
        setCompat(ClientCompatSettingsSchema.parse(byKey.client_compat))
        setFeatures(ClientFeaturesSettingsSchema.parse(byKey.client_features ?? { features: {} }))
      })
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const save = async (name: string, next: ClientFeature) => {
    if (!features) return
    setMsg(null)
    setError(null)
    const value = ClientFeaturesSettingsSchema.safeParse({
      features: { ...features.features, [name]: next },
    })
    if (!value.success) {
      setError(value.error.issues[0]?.message ?? 'Revisa los datos')
      return
    }
    try {
      await api.patch('/admin/settings', { key: 'client_features', value: value.data })
      setMsg(`Guardado: ${name}`)
      load()
    } catch (e) {
      setError(errMsg(e))
    }
  }

  const names = features ? Object.keys(features.features).sort() : []

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        eyebrow="Sistema"
        title="Apps"
        description="Versiones mínimas e interruptores de las apps nativas."
        right={
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        }
      />
      {msg && <p className="mb-2 text-[14px] text-success">{msg}</p>}
      {error && <p className="mb-2 text-[14px] text-danger">{error}</p>}
      {!compat || !features ? (
        <div className="h-40 animate-pulse rounded-[22px] bg-ink/[0.05]" />
      ) : (
        <div className="space-y-4" key={JSON.stringify([compat, features])}>
          <MinimumsCard compat={compat} />
          <p className="t-display text-[15px] text-ink">Funciones con interruptor</p>
          {names.length === 0 ? (
            <div className="t-card text-[14px] text-ink-muted">
              Todavía no hay funciones con interruptor
            </div>
          ) : (
            names.map((name) => (
              <FeatureCard
                key={name}
                name={name}
                feature={features.features[name] as ClientFeature}
                save={save}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
