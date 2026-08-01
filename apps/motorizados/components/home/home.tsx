'use client'

import { Segmented } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { useDriverOrders } from '@/hooks/use-driver-orders'
import { useNow } from '@/hooks/use-now'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { AvailableTab } from './available-tab'
import { MineTab } from './mine-tab'
import { StatusIndicators } from './status-indicators'
import { TeamTab } from './team-tab'

type Tab = 'available' | 'mine' | 'team'

/** Board principal del motorizado: estado + tabs + bandejas. */
export function Home() {
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
    <main className="mx-auto max-w-[480px] px-4 pt-20 pb-10">
      {firstName && (
        <p className="t-eyebrow mb-3">
          Hola, <span className="text-ink">{firstName}</span>
        </p>
      )}

      <StatusIndicators />

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
    </main>
  )
}
