'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ScreenHeader } from '@/components/ui'
import { AccountMenu } from '@/features/account/components/account-menu'
import { AddressSheet } from '@/features/account/components/address-sheet'
import { AddressesList } from '@/features/account/components/addresses-list'
import { OrdersList } from '@/features/account/components/orders-list'
import { ProfileCard } from '@/features/account/components/profile-card'
import { useAccountPage } from '@/features/account/hooks/use-account-page'
import type { Address } from '@/features/account/types'

export default function CuentaPage() {
  const router = useRouter()
  const { ready, profile, addresses, orders, loadData, setDefault, remove, signOut } =
    useAccountPage()
  const [editing, setEditing] = useState<Address | 'new' | null>(null)

  if (!ready) return <div className="p-10 text-ink-muted">Cargando…</div>

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-16 lg:max-w-[880px]">
      <ScreenHeader title="Mi cuenta" onBack={() => router.push('/')} />

      <div className="px-4 pt-2">
        <ProfileCard name={profile.name} email={profile.email} phone={profile.phone} />
        <AddressesList
          addresses={addresses}
          onAdd={() => setEditing('new')}
          onEdit={setEditing}
          onSetDefault={setDefault}
        />
        <OrdersList orders={orders} />
        <AccountMenu onSignOut={signOut} />
      </div>

      {editing && (
        <AddressSheet
          address={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            loadData()
          }}
          onDelete={
            editing !== 'new'
              ? () => {
                  remove(editing.id)
                  setEditing(null)
                }
              : undefined
          }
        />
      )}
    </main>
  )
}
