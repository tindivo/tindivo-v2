'use client'

import { LoadingState } from '@tindivo/ui'
import { DashboardShell } from '@/components/dashboard/shell'
import { notifySuccess } from '@/components/dashboard/toast'
import { ConfigView } from '@/features/configuracion/components/config-view'
import { useBusinessConfig } from '@/features/configuracion/hooks/use-business-config'

export default function ConfiguracionPage() {
  const { form, capability, logoUrl, bannerUrl, msg, saving, save, set, setLogoUrl, setBannerUrl } =
    useBusinessConfig()

  return (
    <DashboardShell
      active="config"
      title="Configuración"
      subtitle="Perfil del restaurante, horarios y capacidades"
    >
      {!form ? (
        <LoadingState
          variant="card"
          label="Cargando configuración del local…"
          icon="settings"
          className="my-8"
        />
      ) : (
        <div data-config-form="">
          <ConfigView
            form={form}
            capability={capability}
            saving={saving}
            msg={msg}
            onSave={save}
            set={set}
            logoUrl={logoUrl}
            onLogoUploaded={(url) => {
              setLogoUrl(url)
              notifySuccess('Imagen actualizada')
            }}
            bannerUrl={bannerUrl}
            onBannerUploaded={(url) => {
              setBannerUrl(url)
              notifySuccess('Imagen actualizada')
            }}
          />
        </div>
      )}
    </DashboardShell>
  )
}
