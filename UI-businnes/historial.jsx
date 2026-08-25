// Historial de pedidos — Mobile + Desktop
// Filtros: Todos / Entregados / Cancelados
// Tipos: WEB / MANUAL
// Solo lectura — tap en fila abre detalle (estático en mock)

function HistorialOrderRow({ row, compact = false }) {
  const isCancel = row.state === 'cancelled';
  const payMeta = window.PAYMENT_META[row.payment] || window.PAYMENT_META.pending_cash;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: compact ? '10px 12px' : '12px 14px',
      background: '#fff', borderRadius: 12,
      border: '1px solid var(--tv-border)',
      cursor: 'pointer',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: isCancel ? 'var(--tv-surface)' : 'var(--tv-success-soft)',
        color: isCancel ? 'var(--tv-ink-subtle)' : 'var(--tv-success)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MS name={isCancel ? 'cancel' : 'check_circle'} size={20} filled />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{row.customer}</span>
          <SourceBadge source={row.source} small />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--tv-ink-muted)', flexWrap: 'wrap' }}>
          <span className="tv-mono">#{row.id}</span>
          <span>·</span>
          <span>{row.closedAt}</span>
          <span>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <MS name={payMeta.icon} size={11} /> {payMeta.short}
          </span>
          {row.method === 'pickup' && (
            <><span>·</span><span>Recojo</span></>
          )}
          {isCancel && (
            <><span>·</span><span style={{ color: 'var(--tv-danger)' }}>{row.reason}</span></>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="tv-mono" style={{
          fontSize: 15, fontWeight: 700,
          color: isCancel ? 'var(--tv-ink-subtle)' : 'var(--tv-ink)',
          textDecoration: isCancel ? 'line-through' : 'none',
        }}>
          {soles(row.total)}
        </div>
        <div style={{ fontSize: 10, color: isCancel ? 'var(--tv-danger)' : 'var(--tv-success)', fontWeight: 600, marginTop: 2 }}>
          {isCancel ? 'Cancelado' : 'Entregado'}
        </div>
      </div>
    </div>
  );
}

// Summary strip
function HistorialSummary({ history }) {
  const delivered = history.filter(h => h.state === 'delivered');
  const cancelled = history.filter(h => h.state === 'cancelled');
  const revenue   = delivered.reduce((s, h) => s + h.total, 0);
  const webOrders = history.filter(h => h.source === 'web').length;
  const manOrders = history.filter(h => h.source === 'manual').length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '10px 12px', border: '1px solid var(--tv-border)' }}>
        <div className="tv-label" style={{ fontSize: 9, marginBottom: 4 }}>VENTAS HOY</div>
        <div className="tv-mono" style={{ fontSize: 18, fontWeight: 700 }}>{soles(revenue)}</div>
        <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>{delivered.length} entregados</div>
      </div>
      <div style={{ background: '#fff', borderRadius: 12, padding: '10px 12px', border: '1px solid var(--tv-border)' }}>
        <div className="tv-label" style={{ fontSize: 9, marginBottom: 4 }}>WEB / MANUAL</div>
        <div className="tv-mono" style={{ fontSize: 18, fontWeight: 700 }}>{webOrders}/{manOrders}</div>
        <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>{history.length} total</div>
      </div>
      <div style={{ background: '#fff', borderRadius: 12, padding: '10px 12px', border: '1px solid var(--tv-border)' }}>
        <div className="tv-label" style={{ fontSize: 9, marginBottom: 4 }}>CANCELADOS</div>
        <div className="tv-mono" style={{ fontSize: 18, fontWeight: 700, color: cancelled.length > 0 ? 'var(--tv-danger)' : 'var(--tv-ink)' }}>
          {cancelled.length}
        </div>
        <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
          {history.length > 0 ? Math.round(cancelled.length / history.length * 100) : 0}% del total
        </div>
      </div>
    </div>
  );
}

// ── MOBILE ────────────────────────────────────────────────────────────────────
function HistorialMobile() {
  const history = window.HISTORY_TODAY;
  const activeFilter = 'all'; // mock

  const filters = [
    { id: 'all',       label: 'Todos',       count: history.length },
    { id: 'delivered', label: 'Entregados',  count: history.filter(h => h.state === 'delivered').length },
    { id: 'cancelled', label: 'Cancelados',  count: history.filter(h => h.state === 'cancelled').length },
    { id: 'web',       label: 'Web',         count: history.filter(h => h.source === 'web').length },
    { id: 'manual',    label: 'Manual',      count: history.filter(h => h.source === 'manual').length },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--tv-surface)' }}>
      <MobileTopBar title="Historial" subtitle="Pedidos del día" soundOn />

      {/* Summary */}
      <div style={{ padding: '12px 14px 0' }}>
        <HistorialSummary history={history} />
      </div>

      {/* Filter chips */}
      <div style={{
        display: 'flex', gap: 6, padding: '10px 14px',
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {filters.map(f => (
          <button key={f.id} style={{
            flexShrink: 0, border: activeFilter === f.id ? 'none' : '1px solid var(--tv-border)',
            background: activeFilter === f.id ? 'var(--tv-ink)' : '#fff',
            color: activeFilter === f.id ? '#fff' : 'var(--tv-ink)',
            padding: '7px 12px', borderRadius: 999,
            fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {f.label}
            <span style={{
              minWidth: 16, height: 16, borderRadius: 999, padding: '0 4px',
              background: activeFilter === f.id ? 'rgba(255,255,255,0.2)' : 'rgba(26,22,20,0.07)',
              color: 'inherit', fontSize: 10, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{f.count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 14px 8px' }}>
        <div className="tv-input" style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        }}>
          <MS name="search" size={18} style={{ color: 'var(--tv-ink-muted)' }} />
          <span style={{ color: 'var(--tv-ink-subtle)', fontSize: 14 }}>Buscar por nombre o ID</span>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {history.map(row => <HistorialOrderRow key={row.id} row={row} compact />)}
      </div>

      <MobileBottomNav active="mas" />
    </div>
  );
}

// ── DESKTOP ───────────────────────────────────────────────────────────────────
function HistorialDesktop() {
  const history = window.HISTORY_TODAY;
  const activeFilter = 'all';

  const counts = {
    pedidos:  window.ORDERS.filter(o => o.state === 'pending_acceptance').length,
    efectivo: window.CASH_SETTLEMENTS.filter(s => s.state === 'pending_confirmation').length,
  };

  const filters = [
    { id: 'all',       label: 'Todos',      count: history.length },
    { id: 'delivered', label: 'Entregados', count: history.filter(h => h.state === 'delivered').length },
    { id: 'cancelled', label: 'Cancelados', count: history.filter(h => h.state === 'cancelled').length },
    { id: 'web',       label: 'Solo web',   count: history.filter(h => h.source === 'web').length },
    { id: 'manual',    label: 'Solo manual', count: history.filter(h => h.source === 'manual').length },
  ];

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--tv-surface)' }}>
      <DesktopSidebar active="historial" counts={counts} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <DesktopTopBar
          title="Historial del día"
          subtitle="Pedidos completados y cancelados de la jornada actual — solo lectura"
          right={
            <button className="tv-btn tv-btn-ghost">
              <MS name="download" size={18} /> Exportar
            </button>
          }
        />

        <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
          {/* KPIs */}
          <div style={{ marginBottom: 18 }}>
            <HistorialSummary history={history} />
          </div>

          {/* Toolbar */}
          <div style={{
            background: '#fff', borderRadius: 14, padding: '10px 14px',
            border: '1px solid var(--tv-border)', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {/* Search */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MS name="search" size={18} style={{ color: 'var(--tv-ink-muted)' }} />
              <span style={{ color: 'var(--tv-ink-subtle)', fontSize: 14 }}>
                Buscar por nombre, #ID, teléfono…
              </span>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 6 }}>
              {filters.map(f => (
                <button key={f.id} style={{
                  border: activeFilter === f.id ? 'none' : '1px solid var(--tv-border)',
                  background: activeFilter === f.id ? 'var(--tv-ink)' : 'transparent',
                  color: activeFilter === f.id ? '#fff' : 'var(--tv-ink)',
                  padding: '6px 12px', borderRadius: 999,
                  fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                  {f.label}
                  <span style={{
                    minWidth: 16, height: 16, borderRadius: 999, padding: '0 4px',
                    background: activeFilter === f.id ? 'rgba(255,255,255,0.2)' : 'rgba(26,22,20,0.07)',
                    color: 'inherit', fontSize: 10, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>{f.count}</span>
                </button>
              ))}
            </div>

            {/* Date picker placeholder */}
            <button className="tv-btn tv-btn-outline tv-btn-sm">
              <MS name="calendar_today" size={14} /> Hoy
            </button>
          </div>

          {/* Table-style list */}
          <div style={{
            background: '#fff', borderRadius: 16, border: '1px solid var(--tv-border)', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr 120px 100px 100px 120px 80px',
              gap: 12, padding: '10px 16px',
              borderBottom: '1px solid var(--tv-border)',
              background: 'var(--tv-surface)',
            }}>
              {['', 'CLIENTE', 'ORIGEN', 'PAGO', 'ENTREGA', 'HORA', 'TOTAL'].map((h, i) => (
                <div key={i} className="tv-label" style={{ fontSize: 10 }}>{h}</div>
              ))}
            </div>

            {/* Rows */}
            {history.map((row, i) => {
              const isCancel = row.state === 'cancelled';
              const payMeta = window.PAYMENT_META[row.payment] || window.PAYMENT_META.pending_cash;
              return (
                <div key={row.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 1fr 120px 100px 100px 120px 80px',
                  gap: 12, padding: '12px 16px',
                  borderBottom: i < history.length - 1 ? '1px solid var(--tv-border)' : 'none',
                  alignItems: 'center',
                  cursor: 'pointer',
                  background: isCancel ? '#FAFAFA' : '#fff',
                }}>
                  {/* Icon */}
                  <div>
                    <MS name={isCancel ? 'cancel' : 'check_circle'} size={18} filled
                      style={{ color: isCancel ? 'var(--tv-ink-subtle)' : 'var(--tv-success)' }} />
                  </div>
                  {/* Customer */}
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{row.customer}</div>
                    <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', fontFamily: 'JetBrains Mono, monospace' }}>#{row.id}</div>
                  </div>
                  {/* Source */}
                  <div><SourceBadge source={row.source} /></div>
                  {/* Payment */}
                  <div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 12, color: 'var(--tv-ink-muted)',
                    }}>
                      <MS name={payMeta.icon} size={13} /> {payMeta.short}
                    </span>
                  </div>
                  {/* Method */}
                  <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MS name={row.method === 'pickup' ? 'storefront' : 'delivery_dining'} size={13} />
                    {row.method === 'pickup' ? 'Recojo' : 'Delivery'}
                  </div>
                  {/* Time */}
                  <div>
                    <div className="tv-mono" style={{ fontSize: 13, fontWeight: 600 }}>{row.closedAt}</div>
                    {isCancel && (
                      <div style={{ fontSize: 11, color: 'var(--tv-danger)', marginTop: 1 }}>{row.reason}</div>
                    )}
                  </div>
                  {/* Total */}
                  <div className="tv-mono" style={{
                    fontSize: 14, fontWeight: 700, textAlign: 'right',
                    color: isCancel ? 'var(--tv-ink-subtle)' : 'var(--tv-ink)',
                    textDecoration: isCancel ? 'line-through' : 'none',
                  }}>
                    {soles(row.total)}
                  </div>
                </div>
              );
            })}

            {/* Empty */}
            {history.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--tv-ink-subtle)' }}>
                <MS name="history" size={32} />
                <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600 }}>Sin pedidos registrados hoy</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HistorialMobile, HistorialDesktop, HistorialOrderRow, HistorialSummary });
