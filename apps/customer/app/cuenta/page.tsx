'use client'

import { ScreenHeader } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AccountMenu } from '@/features/account/components/account-menu'
import { AccountSkeleton } from '@/features/account/components/account-skeleton'
import { AccountToast } from '@/features/account/components/account-toast'
import { AddressSheet } from '@/features/account/components/address-sheet'
import { DefaultAddressCard } from '@/features/account/components/default-address-card'
import { ProfileEditSheet } from '@/features/account/components/profile-edit-sheet'
import { ProfileHero } from '@/features/account/components/profile-hero'
import { QuickActionsGrid } from '@/features/account/components/quick-actions-grid'
import { RecentOrdersPreview } from '@/features/account/components/recent-orders-preview'
import { useAccountPage } from '@/features/account/hooks/use-account-page'
import type { Address } from '@/features/account/types'

export default function CuentaPage() {
  const router = useRouter()
  const {
    ready,
    profile,
    addresses,
    orders,
    appeals,
    stats,
    progress,
    loadData,
    remove,
    updateName,
    signOut,
  } = useAccountPage()
  const [editing, setEditing] = useState<Address | 'new' | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const defaultAddress = addresses.find((a) => a.is_default)

  async function handleUpdateName(name: string) {
    await updateName(name)
    setToast('Perfil actualizado')
  }

  async function handleDelete() {
    if (editing && editing !== 'new') {
      await remove(editing.id)
      setToast('Dirección eliminada')
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-4 lg:max-w-[880px]">
      <ScreenHeader title="Mi cuenta" onBack={() => router.push('/')} />

      {!ready ? (
        <AccountSkeleton />
      ) : (
        <div className="px-4 pt-2">
          <ProfileHero
            name={profile.name}
            email={profile.email}
            phone={profile.phone}
            progress={progress}
            onEdit={() => setEditingProfile(true)}
          />

          <QuickActionsGrid stats={stats} appeals={appeals} />

          <DefaultAddressCard
            address={defaultAddress}
            onAdd={() => setEditing('new')}
            onEdit={setEditing}
          />

          <RecentOrdersPreview orders={orders} />

          <AccountMenu onSignOut={signOut} />
        </div>
      )}

      {editing && (
        <AddressSheet
          address={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            loadData()
            setToast('Dirección guardada')
          }}
          onDelete={
            editing !== 'new'
              ? () => {
                  void handleDelete()
                  setEditing(null)
                }
              : undefined
          }
        />
      )}

      {editingProfile && (
        <ProfileEditSheet
          name={profile.name}
          onClose={() => setEditingProfile(false)}
          onSave={handleUpdateName}
        />
      )}

      {toast && <AccountToast message={toast} onDone={() => setToast(null)} />}
    </main>
  )
}
