// pedidos-mobile.jsx v3 — 3 tabs: Nuevos / En cocina / En reparto

function PedidosHeaderMobileV3({ isPaused, pauseMinLeft, soundOn, hasUrgent, hasWaiting, counts, onPause }) {
  return (
    <div>
      {isPaused && (
        <div style={{ background: '#FDE68A', color: '#78350F', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700 }}>
          <MS name="pause_circle" size={18} filled />
          <span style={{ flex: 1 }}>PAUSADO{pauseMinLeft ? ` · ${pauseMinLeft}m` : ''}</span>
          <button style={{ background: '#1A1614', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Reanudar</button>
        </div>
      )}
      {hasWaiting && !isPaused && (
        <div style={{ background: '#16A34A', color: '#fff', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700 }}>
          <MS name="two_wheeler" size={18} filled />
          Motorizado en el local · entrégale el pedido
        </div>
      )}
      <div className="tv-glass" style={{ padding: '10px 14px 0' }}>
        {/* Row 1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: RESTAURANT_STATE.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, fontFamily: 'Bricolage Grotesque, sans-serif', flexShrink: 0 }}>
            {RESTAURANT_STATE.name[0]}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tv-display" style={{ fontSize: 16, fontWeight: 700 }}>{RESTAURANT_STATE.name}</div>
            <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 1 }}>
              {counts.new + counts.cooking + counts.route} activos · {counts.today} entregados hoy
            </div>
          </div>
          <button className={`tv-btn tv-btn-sm ${soundOn ? 'tv-btn-brand' : 'tv-btn-ghost'} ${hasUrgent ? 'tv-pulse-brand' : ''}`} style={{ padding: '7px 10px', flexShrink: 0 }}>
            <MS name={soundOn ? 'notifications_active' : 'notifications_off'} size={17} filled={soundOn} />
          </button>
          <button onClick={onPause} style={{ background: isPaused ? '#FDE68A' : 'rgba(26,22,20,0.08)', border: 'none', borderRadius: 10, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: isPaused ? '#78350F' : 'var(--tv-ink)', flexShrink: 0 }}>
            <MS name={isPaused ? 'play_circle' : 'pause_circle'} size={17} />
          </button>
        </div>
        {/* Row 2 */}
        <div style={{ display: 'flex', gap: 6, paddingBottom: 10 }}>
          <button className="tv-btn tv-btn-ghost tv-btn-sm" style={{ flex: 1 }}>
            <MS name="history" size={14} /> Historial
          </button>
          <button className="tv-btn tv-btn-dark tv-btn-sm" style={{ flex: 1 }}>
            <MS name="add" size={14} /> Pedido directo
          </button>
        </div>
      </div>
    </div>
  );
}

function PedidosTabsMobileV3({ active, counts }) {
  const tabs = [
    { id: 'new',     label: 'Nuevos',   count: counts.new,     alert: counts.new > 0 },
    { id: 'cooking', label: 'En cocina', count: counts.cooking, alert: false },
    { id: 'route',   label: 'Reparto',  count: counts.route,   alert: false },
    { id: 'today',   label: 'Entregados', count: counts.today,   alert: false },
  ];
  return (
    <div style={{
      display: 'flex', gap: 5, padding: '8px 14px',
      overflowX: 'auto', scrollbarWidth: 'none',
      background: 'rgba(250,246,241,0.96)',
      backdropFilter: 'blur(14px)',
      borderBottom: '1px solid var(--tv-border)',
      position: 'sticky', top: 0, zIndex: 20,
    }}>
      {tabs.map(t => (
        <button key={t.id} style={{
          flexShrink: 0,
          background: active === t.id ? 'var(--tv-ink)' : '#fff',
          color: active === t.id ? '#fff' : 'var(--tv-ink)',
          border: active === t.id ? 'none' : '1px solid var(--tv-border)',
          padding: '8px 11px', borderRadius: 999,
          fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          {t.label}
          {t.count > 0 && (
            <span style={{
              minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999,
              background: t.alert ? '#DC2626' : (active === t.id ? 'rgba(255,255,255,0.2)' : 'rgba(26,22,20,0.08)'),
              color: t.alert ? '#fff' : (active === t.id ? '#fff' : 'var(--tv-ink)'),
              fontSize: 10, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function ColEmptyV3({ tab }) {
  const msgs = {
    new:     { icon: 'notifications',   title: 'Sin pedidos nuevos',     sub: 'Te avisaremos al instante cuando lleguen.' },
    cooking: { icon: 'soup_kitchen',    title: 'Nada en preparación',    sub: 'Los pedidos aceptados aparecerán aquí.' },
    route:   { icon: 'delivery_dining', title: 'Sin pedidos en camino',  sub: 'Aquí aparecen cuando el motorizado recoge.' },
    today:   { icon: 'check_circle',    title: 'Sin pedidos cerrados',   sub: 'El historial del turno aparece aquí.' },
  };
  const m = msgs[tab] || msgs.new;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px', textAlign: 'center', background: '#fff', borderRadius: 16, border: '1px solid var(--tv-border)' }}>
      <MS name={m.icon} size={32} style={{ color: 'var(--tv-ink-subtle)', marginBottom: 10 }} />
      <div style={{ fontWeight: 700, fontSize: 15 }}>{m.title}</div>
      <div style={{ fontSize: 13, color: 'var(--tv-ink-muted)', marginTop: 4 }}>{m.sub}</div>
    </div>
  );
}

function HistoryListMobile() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {HISTORY_SHIFT.map(h => (
        <div key={h.id} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
          background: '#fff', borderRadius: 12, border: '1px solid var(--tv-border)',
          opacity: h.state === 'cancelled' ? 0.65 : 1,
        }}>
          <MS name={h.state === 'delivered' ? 'check_circle' : 'cancel'} size={18} filled
            style={{ color: h.state === 'delivered' ? 'var(--tv-success)' : 'var(--tv-ink-subtle)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {h.customer}
              <SourceBadgeMini source={h.source} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              #{h.id} · {h.closedAt}
              {h.reason && <span style={{ color: 'var(--tv-danger)' }}> · {h.reason}</span>}
            </div>
          </div>
          <div className="tv-mono" style={{ fontSize: 14, fontWeight: 700, color: h.state === 'cancelled' ? 'var(--tv-ink-subtle)' : 'var(--tv-ink)', textDecoration: h.state === 'cancelled' ? 'line-through' : 'none', flexShrink: 0 }}>
            {soles(h.total)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
function PedidosMobileV3({ activeTab = 'new', isPaused = false, showPauseModal = false, showDetail = null, showRejectModal = false, proofVerified = false }) {
  const counts = V3_COUNTS;
  const hasUrgent  = ORDERS_NEW.length > 0;
  const hasWaiting = ORDERS_COOKING.some(o => o.state === 'waiting');

  const renderTab = () => {
    switch (activeTab) {
      case 'new':
        return ORDERS_NEW.length > 0
          ? ORDERS_NEW.map(o => <NuevoCard key={o.id} order={o} />)
          : <ColEmptyV3 tab="new" />;
      case 'cooking':
        return ORDERS_COOKING.length > 0
          ? ORDERS_COOKING
              .slice()
              .sort((a, b) => {
                const pri = { waiting: 0, buffer_p3: 1, buffer_p2: 2, heading: 3, buffer_p1: 4, cooking: 5 };
                return (pri[a.state] ?? 6) - (pri[b.state] ?? 6);
              })
              .map(o => <CocinaCard key={o.id} order={o} />)
          : <ColEmptyV3 tab="cooking" />;
      case 'route':
        return ORDERS_ROUTE.length > 0
          ? ORDERS_ROUTE.map(o => <RepartoCard key={o.id} order={o} />)
          : <ColEmptyV3 tab="route" />;
      case 'today':
        return <HistoryListMobile />;
      default: return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--tv-surface)', position: 'relative' }}>
      {showPauseModal && <PausarModal />}
      {showDetail && (
        <DetailScreen order={showDetail} onClose={() => {}} mobile showRejectModal={showRejectModal} proofVerified={proofVerified} />
      )}

      <PedidosHeaderMobileV3 isPaused={isPaused} pauseMinLeft={isPaused ? 23 : null} soundOn={true} hasUrgent={hasUrgent} hasWaiting={hasWaiting} counts={counts} />
      <PedidosTabsMobileV3 active={activeTab} counts={counts} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {renderTab()}
      </div>
      <MobileBottomNav active="pedidos" />
    </div>
  );
}

function PedidosEmptyMobileV3() {
  const emptyCounts = { new: 0, cooking: 0, route: 0, today: 0 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--tv-surface)' }}>
      <PedidosHeaderMobileV3 soundOn counts={emptyCounts} />
      <PedidosTabsMobileV3 active="new" counts={emptyCounts} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <MS name="restaurant" size={48} style={{ color: 'var(--tv-ink-subtle)' }} />
          <div className="tv-display" style={{ fontSize: 20, marginTop: 12 }}>Sin pedidos activos</div>
          <div style={{ fontSize: 14, color: 'var(--tv-ink-muted)', marginTop: 6, lineHeight: 1.6 }}>
            ¡Buen momento para tomarte un respiro!<br />Te avisaremos cuando llegue el próximo.
          </div>
        </div>
      </div>
      <MobileBottomNav active="pedidos" />
    </div>
  );
}

Object.assign(window, { PedidosMobileV3, PedidosEmptyMobileV3, PedidosHeaderMobileV3 });
