'use client'

import { Segmented } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { useDriverOrders } from '@/hooks/use-driver-orders'
import { useNow } from '@/hooks/use-now'
import { useTeam } from '@/hooks/use-team'
import { AvailableTab } from './available-tab'
import { MineTab } from './mine-tab'
import { TeamTab } from './team-tab'

type Tab = 'available' | 'mine' | 'team'

/** Board principal del motorizado: estado + tabs + bandejas. */
export function Home() {
  const now = useNow()
  const board = useDriverOrders(now)
  // El contador de Equipo se lee AQUÍ, no dentro de `TeamTab`. Antes llegaba por
  // un `onCount` que solo disparaba con la pestaña montada: el badge que debía
  // llevarte a Equipo exigía que ya estuvieras en Equipo.
  const team = useTeam()
  const [tab, setTab] = useState<Tab>('available')

  // ── Pestaña de aterrizaje: donde hay trabajo, no siempre la primera.
  //
  // Se decide UNA sola vez y solo cuando las DOS fuentes resolvieron su primera
  // carga. Sin esa espera, el board arranca vacío, la regla decidiría
  // 'available' y saltaría a 'mine' medio segundo después: un parpadeo que
  // además mueve el contenido bajo el pulgar mientras alguien ya está tocando.
  //
  // Las solicitudes recibidas NO entran en la regla, a propósito. Se responden
  // en el banner global (`TransferWatcher`), que se ve desde cualquier pestaña;
  // llevar a 'team' depositaría al motorizado en una vista donde esa solicitud
  // ni siquiera se lista.
  // `myDriverId` ENTRA en la condición, y es lo que hacía falta: llega por una
  // consulta distinta a la de los pedidos, así que `board.loading` puede ser
  // `false` con el id todavía en `null`. En ese instante `mine` está vacío —no
  // porque no haya pedidos, sino porque no hay con qué comparar `driver_id`— y
  // la regla se congelaba en 'available' con trabajo activo en pantalla.
  const [initialized, setInitialized] = useState(false)
  const resolved = !board.loading && !team.loading && board.myDriverId !== null
  useEffect(() => {
    if (initialized || !resolved) return
    if (board.mine.length > 0) setTab('mine')
    setInitialized(true)
  }, [initialized, resolved, board.mine.length])

  // El badge de Equipo cuenta lo que la pestaña MUESTRA: pedidos de compañeros
  // que se pueden pedir. Las solicitudes entrantes viven en el banner y no se
  // cuentan aquí — un badge es censo, no alarma.
  const transferableCount = team.teamOrders.filter((o) => o.transferable).length

  return (
    // `--drv-transfer-h` la publica `TransferWatcher` con la altura real de la
    // pila de solicitudes (`0px` si no hay ninguna). El `max()` mantiene el
    // hueco de siempre para la barra superior y solo crece cuando la pila es más
    // alta que ese hueco — así no aparece una franja vacía con una sola
    // solicitud, ni el tablero queda debajo con tres.
    <main
      className="mx-auto max-w-[480px] px-4 pb-10"
      style={{ paddingTop: 'max(5rem, calc(var(--drv-transfer-h, 0px) + 0.75rem))' }}
    >
      {/* El saludo y la fila de estado («Disponible», «Avisos activos») vivían
          aquí y se han ido a la barra superior: se perdían al bajar por la
          bandeja y no existían en Efectivo ni en Historial. Ver `ShiftStatus`. */}

      {/* Las pestañas se pegan por DEBAJO de la pila de solicitudes. Antes se
          quedaban fijas a 44px y la pila las cubría: el motorizado no podía
          cambiar de bandeja mientras decidía. */}
      <div
        className="sticky z-30 -mx-4 mb-4 bg-surface/95 px-4 py-2 backdrop-blur-sm"
        style={{
          top: 'max(calc(44px + env(safe-area-inset-top)), calc(var(--drv-transfer-h, 0px) + 8px))',
        }}
      >
        {/* `sm`: tres pestañas en 361px de ancho. La talla base deja "En espera"
            y "Equipo" pegados a sus bordes y el bloque pesa más que las tarjetas
            que hay debajo, que son lo que el motorizado viene a leer. */}
        <Segmented<Tab>
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            // `undefined` en vez de `0`: el chip desaparece en cero. Ver la
            // nota de `Segmented`.
            {
              value: 'available',
              label: 'En espera',
              badge: board.available.length || undefined,
            },
            { value: 'mine', label: 'Míos', badge: board.mine.length || undefined },
            { value: 'team', label: 'Equipo', badge: transferableCount || undefined },
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
          loading={board.loading}
          now={now}
          onTaken={board.refetch}
        />
      )}
      {tab === 'mine' && <MineTab mine={board.mine} loading={board.loading} now={now} />}
      {tab === 'team' && <TeamTab mySlots={board.mySlots} />}
    </main>
  )
}
