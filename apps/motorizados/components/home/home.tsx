'use client'

import { Segmented } from '@tindivo/ui'
import { useEffect, useRef, useState } from 'react'
import { useCourierBoard } from '@/hooks/use-courier-board'
import { useDriverOrders } from '@/hooks/use-driver-orders'
import { useNow } from '@/hooks/use-now'
import { useTeam } from '@/hooks/use-team'
import { AvailableTab } from './available-tab'
import { CourierAvailableList, CourierMineList } from './courier-section'
import { MineTab } from './mine-tab'
import { TeamTab } from './team-tab'

type Tab = 'available' | 'mine' | 'team'

const TABS: Tab[] = ['available', 'mine', 'team']

/** Lo que hay que arrastrar en horizontal, y cuánto más que en vertical. */
const TAB_SWIPE_MIN_PX = 64
const TAB_SWIPE_DOMINANCE = 1.6
const TAB_SWIPE_MAX_MS = 700

/**
 * El iPhone reserva el borde izquierdo para «atrás»: un arrastre que empieza
 * ahí es del sistema, no nuestro. Con margen de sobra sobre sus ~20 px.
 */
const SYSTEM_EDGE_PX = 24

/** Board principal del motorizado: estado + tabs + bandejas. */
export function Home() {
  const now = useNow()
  const board = useDriverOrders(now)
  // El contador de Equipo se lee AQUÍ, no dentro de `TeamTab`. Antes llegaba por
  // un `onCount` que solo disparaba con la pestaña montada: el badge que debía
  // llevarte a Equipo exigía que ya estuvieras en Equipo.
  const team = useTeam()
  // Tindivo Entregas: su propio tablero (otra tabla, otra API), pintado encima
  // de la comida en «En espera» y en «Míos».
  const courier = useCourierBoard()
  const [tab, setTab] = useState<Tab>('available')

  // ── GESTO ENTRE PESTAÑAS.
  //
  // Arrastrar en horizontal por FUERA de las tarjetas cambia de pestaña: hacia
  // la izquierda avanza (En espera → Míos → Equipo), hacia la derecha retrocede.
  //
  // LAS TARJETAS QUEDAN FUERA A PROPÓSITO. Las de Disponibles y Míos ya usan el
  // arrastre para avanzar o soltar el pedido (`data-swipe-card`); si además
  // cambiaran de pestaña, rozar una tarjeta te sacaría de la bandeja. El gesto
  // vive en la franja de pestañas, los avisos, los huecos entre tarjetas y el
  // espacio bajo la lista. Las pestañas siguen siendo tocables, como siempre.
  const contentRef = useRef<HTMLDivElement>(null)
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null)
  const prevTab = useRef<Tab>(tab)

  function go(delta: 1 | -1) {
    const next = TABS[TABS.indexOf(tab) + delta]
    if (!next) return
    if (typeof navigator.vibrate === 'function') navigator.vibrate(8)
    setTab(next)
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    swipeStart.current = null
    if (e.pointerType === 'mouse') return
    if (e.clientX < SYSTEM_EDGE_PX) return
    if ((e.target as Element).closest('[data-swipe-card],input,textarea,select,[aria-modal]')) {
      return
    }
    swipeStart.current = { x: e.clientX, y: e.clientY, t: Date.now() }
  }

  function onPointerUp(e: React.PointerEvent<HTMLElement>) {
    const s = swipeStart.current
    swipeStart.current = null
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Date.now() - s.t > TAB_SWIPE_MAX_MS) return
    if (Math.abs(dx) < TAB_SWIPE_MIN_PX) return
    if (Math.abs(dx) < Math.abs(dy) * TAB_SWIPE_DOMINANCE) return
    go(dx < 0 ? 1 : -1)
  }

  // El contenido entra desde el lado hacia el que se fue: la pestaña nueva está
  // «al lado», no aparece de golpe. Vale igual para el toque en la franja.
  useEffect(() => {
    if (prevTab.current === tab) return
    const dir = TABS.indexOf(tab) > TABS.indexOf(prevTab.current) ? 1 : -1
    prevTab.current = tab
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    contentRef.current?.animate(
      [
        { opacity: 0, transform: `translateX(${dir * 28}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
  }, [tab])

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
  const resolved = !board.loading && !team.loading && !courier.loading && board.myDriverId !== null
  useEffect(() => {
    if (initialized || !resolved) return
    if (board.mine.length > 0 || courier.mine.length > 0) setTab('mine')
    setInitialized(true)
  }, [initialized, resolved, board.mine.length, courier.mine.length])

  // El badge de Equipo cuenta lo que la pestaña MUESTRA: pedidos de compañeros
  // que se pueden pedir. Las solicitudes entrantes viven en el banner y no se
  // cuentan aquí — un badge es censo, no alarma.
  const transferableCount = team.teamOrders.filter((o) => o.transferable).length

  return (
    // NO HAY `--drv-transfer-h`. El comentario que vivía aquí decía que la
    // publicaba `TransferWatcher` con la altura de la pila de solicitudes, y
    // hace tiempo que no la publica nadie: ese componente pasó a ser un modal a
    // pantalla completa y ya no mide nada. Las dos lecturas caían siempre al
    // fallback `0px`, así que los `max()` daban el valor fijo de siempre —
    // dos cálculos muertos y un comentario que mentía sobre el contrato.
    <main
      className="mx-auto min-h-dvh max-w-[480px] touch-pan-y px-4 pt-20 pb-10"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        swipeStart.current = null
      }}
    >
      {/* El saludo y la fila de estado («Disponible», «Avisos activos») vivían
          aquí y se han ido a la barra superior: se perdían al bajar por la
          bandeja y no existían en Efectivo ni en Historial. Ver `ShiftStatus`. */}

      {/* Las pestañas se pegan bajo la barra superior. Ya no compiten con la
          pila de solicitudes: desde que es un modal a pantalla completa, tapa el
          tablero entero a propósito y no hay nada debajo que reposicionar. */}
      <div className="sticky top-[calc(44px+env(safe-area-inset-top))] z-30 -mx-4 mb-4 bg-surface/95 px-4 py-2 backdrop-blur-sm">
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
              badge: board.available.length + courier.available.length || undefined,
            },
            {
              value: 'mine',
              label: 'Míos',
              badge: board.mine.length + courier.mine.length || undefined,
            },
            { value: 'team', label: 'Equipo', badge: transferableCount || undefined },
          ]}
        />
      </div>

      <div ref={contentRef}>
        {tab === 'available' && (
          <CourierAvailableList
            orders={courier.available}
            mineCount={courier.mine.length}
            maxActive={courier.maxActivePerDriver}
            onChanged={courier.refetch}
          />
        )}
        {tab === 'mine' && <CourierMineList orders={courier.mine} onChanged={courier.refetch} />}
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
        {tab === 'mine' && (
          <MineTab mine={board.mine} loading={board.loading} now={now} onChanged={board.refetch} />
        )}
        {tab === 'team' && <TeamTab mySlots={board.mySlots} />}
      </div>
    </main>
  )
}
