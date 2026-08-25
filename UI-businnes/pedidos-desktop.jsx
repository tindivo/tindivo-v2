// pedidos-desktop.jsx v3 — 3 columnas: Nuevos / En cocina / En reparto

function PedidosHeaderDesktopV3({ isPaused, pauseMinLeft, soundOn, counts, onPause }) {
  const hasWaiting = ORDERS_COOKING.some(o => o.state === 'waiting');
  const totalDelivered = HISTORY_SHIFT.filter(h => h.state === 'delivered').length;

  return (
    <div>
      {isPaused && (
        <div style={{ background: '#FDE68A', color: '#78350F', padding: '9px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <MS name="pause_circle" size={20} filled />
          <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>
            PEDIDOS PAUSADOS{pauseMinLeft ? ` · Reactiva en ${pauseMinLeft}m` : ''}
          </div>
          <button className="tv-btn tv-btn-dark tv-btn-sm">
            <MS name="play_circle" size={16} filled /> Reanudar ahora
          </button>
        </div>
      )}
      {hasWaiting && (
        <div style={{ background: '#16A34A', color: '#fff', padding: '9px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <MS name="two_wheeler" size={20} filled />
          <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>
            Motorizado en el local — entrégale el pedido
          </div>
          <button className="tv-btn tv-btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none' }}>
            Ver pedido
          </button>
        </div>
      )}
      <div className="tv-glass" style={{ padding: '11px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: RESTAURANT_STATE.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, fontFamily: 'Bricolage Grotesque, sans-serif', flexShrink: 0 }}>
            {RESTAURANT_STATE.name[0]}
          </div>
          <div>
            <div className="tv-display" style={{ fontSize: 17, lineHeight: 1.1 }}>{RESTAURANT_STATE.name}</div>
            <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
              <span style={{ color: isPaused ? '#B45309' : '#16A34A', fontWeight: 700 }}>
                {isPaused ? '⏸ Pausado' : '● Abierto'}
              </span>
              {' · '}{counts.new} nuevos · {counts.cooking} cocina · {counts.route} reparto · {totalDelivered} hoy
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="tv-btn tv-btn-ghost tv-btn-sm">
            <MS name="history" size={15} /> Historial
          </button>
          <button className="tv-btn tv-btn-dark tv-btn-sm">
            <MS name="add" size={15} /> Pedido directo
          </button>
          <button onClick={onPause} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 600, border: 'none',
            background: isPaused ? '#FDE68A' : 'rgba(26,22,20,0.08)',
            color: isPaused ? '#78350F' : 'var(--tv-ink)',
          }}>
            <MS name={isPaused ? 'play_circle' : 'pause_circle'} size={16} filled />
            {isPaused ? 'Reanudar' : 'Pausar pedidos'}
          </button>
          <button className={`tv-btn tv-btn-sm ${soundOn ? 'tv-btn-brand' : 'tv-btn-ghost'} ${counts.new > 0 ? 'tv-pulse-brand' : ''}`}>
            <MS name={soundOn ? 'notifications_active' : 'notifications_off'} size={15} filled={soundOn} />
            Alertas {soundOn ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
    </div>
  );
}

function KanbanColV3({ title, count, accentColor, alertColor, subtitle, children }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--tv-surface)', borderRadius: 16, border: '1px solid var(--tv-border)' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--tv-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: accentColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: 'var(--tv-ink-muted)', marginTop: 1 }}>{subtitle}</div>}
        </div>
        <span style={{
          minWidth: 22, height: 22, padding: '0 6px', borderRadius: 999,
          background: count > 0 && alertColor ? alertColor : 'rgba(26,22,20,0.08)',
          color: count > 0 && alertColor ? '#fff' : 'var(--tv-ink)',
          fontSize: 11, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{count}</span>
      </div>
      <div style={{ flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function ColEmptyDesktopV3({ message }) {
  return (
    <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--tv-ink-subtle)', fontSize: 12 }}>
      {message}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
function PedidosDesktopV3({ isPaused = false, showPauseModal = false, showDetailId = null }) {
  const counts = V3_COUNTS;
  const hasUrgent = ORDERS_NEW.length > 0;

  const allOrders = [...ORDERS_NEW, ...ORDERS_COOKING, ...ORDERS_ROUTE];
  const detailOrder = showDetailId ? allOrders.find(o => o.id === showDetailId) : null;

  const desktopNavCounts = {
    pedidos: counts.new,
    efectivo: (window.CASH_SETTLEMENTS || []).filter(s => s.state === 'pending_confirmation').length,
  };

  const sortedCooking = [...ORDERS_COOKING].sort((a, b) => {
    const pri = { waiting: 0, buffer_p3: 1, buffer_p2: 2, heading: 3, buffer_p1: 4, cooking: 5 };
    return (pri[a.state] ?? 6) - (pri[b.state] ?? 6);
  });

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--tv-surface)', position: 'relative' }}>
      {showPauseModal && <PausarModal />}

      <DesktopSidebar active="pedidos" counts={desktopNavCounts} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        <PedidosHeaderDesktopV3 isPaused={isPaused} pauseMinLeft={isPaused ? 23 : null} soundOn counts={counts} />

        {/* Urgent bar */}
        {hasUrgent && (
          <div style={{
            margin: '10px 20px 0', background: '#fff', borderRadius: 12,
            border: '1.5px solid #FCA5A5', padding: '9px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <MS name="notifications_active" size={20} filled style={{ color: 'var(--tv-danger)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {counts.new} {counts.new === 1 ? 'pedido nuevo requiere' : 'pedidos nuevos requieren'} revisión
              </div>
              <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>
                Toca cada card para ver el detalle y aceptar o rechazar. Se cancelan automáticamente en 5 min.
              </div>
            </div>
          </div>
        )}

        {/* 3-col kanban */}
        <div style={{
          flex: 1, padding: '12px 20px 20px',
          display: 'grid', gridTemplateColumns: '1fr 1.4fr 0.9fr',
          gap: 12, alignItems: 'flex-start', minHeight: 0,
          overflowY: 'auto',
        }}>
          {/* Col 1: Nuevos */}
          <KanbanColV3
            title="Nuevos" count={counts.new}
            accentColor="#DC2626"
            alertColor={counts.new > 0 ? '#DC2626' : null}
            subtitle="Solo Online · revisar antes de aceptar">
            {ORDERS_NEW.length > 0
              ? ORDERS_NEW.map(o => <NuevoCard key={o.id} order={o} compact onOpen={() => {}} />)
              : <ColEmptyDesktopV3 message="Sin pedidos nuevos · te avisaremos cuando lleguen" />}
          </KanbanColV3>

          {/* Col 2: En cocina */}
          <KanbanColV3
            title="En cocina" count={counts.cooking}
            accentColor="#C2410C"
            subtitle="Cocinando + esperando moto · sub-estados internos">
            {sortedCooking.length > 0
              ? sortedCooking.map(o => <CocinaCard key={o.id} order={o} compact onOpen={() => {}} />)
              : <ColEmptyDesktopV3 message="Nada en preparación" />}
          </KanbanColV3>

          {/* Col 3: En reparto */}
          <KanbanColV3
            title="En reparto" count={counts.route}
            accentColor="#6D28D9"
            subtitle="Solo monitoreo · timer desde recogida">
            {ORDERS_ROUTE.length > 0
              ? ORDERS_ROUTE.map(o => <RepartoCard key={o.id} order={o} compact onOpen={() => {}} />)
              : <ColEmptyDesktopV3 message="Sin pedidos en camino" />}
          </KanbanColV3>
        </div>

        {/* Detail panel */}
        {detailOrder && <DetailScreen order={detailOrder} onClose={() => {}} proofVerified={detailOrder.payment === 'pending_cash'} />}
      </div>
    </div>
  );
}

function PedidosEmptyDesktopV3() {
  const desktopNavCounts = { pedidos: 0, efectivo: 0 };
  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--tv-surface)' }}>
      <DesktopSidebar active="pedidos" counts={desktopNavCounts} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <PedidosHeaderDesktopV3 soundOn counts={{ new: 0, cooking: 0, route: 0, today: 0 }} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <MS name="restaurant" size={56} style={{ color: 'var(--tv-ink-subtle)' }} />
            <div className="tv-display" style={{ fontSize: 26, marginTop: 14 }}>Sin pedidos activos</div>
            <div style={{ fontSize: 15, color: 'var(--tv-ink-muted)', marginTop: 8 }}>¡Buen momento para tomarte un respiro!</div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PedidosDesktopV3, PedidosEmptyDesktopV3 });
