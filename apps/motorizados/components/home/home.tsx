'use client'

import { Icon, Segmented } from '@tindivo/ui'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useDriverOrders } from '@/hooks/use-driver-orders'
import { useNow } from '@/hooks/use-now'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { AvailabilityCard } from './availability-card'
import { AvailableTab } from './available-tab'
import { MineTab } from './mine-tab'
import { TeamTab } from './team-tab'

type Tab = 'available' | 'mine' | 'team'

/** Board principal del motorizado: disponibilidad + tabs + bandejas. */
export function Home({ onSignOut }: { onSignOut: () => void }) {
  const now = useNow()
  const board = useDriverOrders(now)
  const [tab, setTab] = useState<Tab>('available')
  const [driverName, setDriverName] = useState<string | null>(null)
  const [teamCount, setTeamCount] = useState(0)

  useEffect(() => {
    getSupabaseBrowser()
      .from('drivers')
      .select('full_name')
      .maybeSingle()
      .then(({ data }) => setDriverName(data?.full_name ?? null))
  }, [])

  const firstName = driverName?.split(' ')[0]

  return (
    <div className="mx-auto min-h-dvh max-w-[480px] px-4 pb-10">
      <header className="flex items-start justify-between pt-5 pb-4">
        <div>
          <p className="t-eyebrow" style={{ marginBottom: 0 }}>
            Tindivo · Motorizado
          </p>
          <h1 className="t-display text-[26px]">
            {firstName ? `Hola, ${firstName}` : 'Mis entregas'}
          </h1>
          <p className="mt-0.5 font-mono text-[11px] text-ink-subtle">Mochila {board.mySlots}/3</p>
        </div>
        <div className="flex gap-2 pt-1">
          <Link
            href="/efectivo"
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: 'rgba(26,22,20,0.06)' }}
            aria-label="Efectivo"
          >
            <Icon.Bag />
          </Link>
          <button
            type="button"
            onClick={async () => {
              await getSupabaseBrowser().auth.signOut()
              onSignOut()
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: 'rgba(26,22,20,0.06)' }}
            aria-label="Salir"
          >
            <Icon.Close />
          </button>
        </div>
      </header>

      <AvailabilityCard />

      <div className="mb-4">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'available', label: `Disponibles (${board.available.length})` },
            { value: 'mine', label: `Míos (${board.mine.length})` },
            { value: 'team', label: teamCount > 0 ? `Equipo (${teamCount})` : 'Equipo' },
          ]}
        />
      </div>

      {tab === 'available' && (
        <AvailableTab
          available={board.available}
          upcoming={board.upcoming}
          mySlots={board.mySlots}
          hasOverdueAvailable={board.hasOverdueAvailable}
          lastSyncOk={board.lastSyncOk}
          now={now}
        />
      )}
      {tab === 'mine' && (
        <MineTab mine={board.mine} deliveredToday={board.deliveredToday} now={now} />
      )}
      {tab === 'team' && <TeamTab onCount={setTeamCount} />}
    </div>
  )
}
