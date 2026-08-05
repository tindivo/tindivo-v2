'use client'

import { Button, Icon } from '@tindivo/ui'
import { DashboardShell } from '@/components/dashboard/shell'
import { DeudaList } from '@/features/deuda/components/deuda-list'
import { useAccountSummary } from '@/features/deuda/hooks/use-account-summary'

function whatsappHref(phone: string | null): string {
  const number = phone ? phone.replace(/\D/g, '') : '51906550166'
  return `https://wa.me/${number}?text=${encodeURIComponent('Hola Tindivo, quiero coordinar el pago de mi deuda.')}`
}

export default function DeudaPage() {
  const { data, loading, error, groupedUnits, balance } = useAccountSummary()

  return (
    <DashboardShell
      active="deuda"
      title="Mi cuenta"
      subtitle="Cuenta y cargos pendientes"
      headerRight={
        data ? (
          <div className="hidden lg:block">
            <Button
              as="a"
              href={whatsappHref(data.supportPhone)}
              target="_blank"
              rel="noopener noreferrer"
              variant="outline"
            >
              <Icon name="chat" size={18} /> WhatsApp a Tindivo
            </Button>
          </div>
        ) : null
      }
    >
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {loading || !data ? (
        <div className="flex flex-col gap-3">
          <div className="h-36 animate-pulse rounded-2xl bg-surface" />
          <div className="h-52 animate-pulse rounded-2xl bg-surface" />
        </div>
      ) : (
        <DeudaList
          data={data}
          groupedUnits={groupedUnits}
          balance={balance}
          supportHref={whatsappHref(data.supportPhone)}
        />
      )}
    </DashboardShell>
  )
}
