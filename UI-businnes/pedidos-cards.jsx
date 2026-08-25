// pedidos-cards.jsx v3 — cards limpias, una señal visual por estado
// Principios: info mínima en lista, sin items detallados, sin botones en Nuevos

// ── Micro badges ──────────────────────────────────────────────────────────────
function SourceBadgeMini({ source }) {
  const d = SOURCE_DISPLAY[source] || SOURCE_DISPLAY.web;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
      background: d.bg, color: d.color, letterSpacing: '0.02em',
    }}>
      <MS name={d.icon} size={10} />
      {d.label}
    </span>
  );
}

function PayBadgeMini({ payment }) {
  const d = PAY_DISPLAY[payment] || PAY_DISPLAY.pending_cash;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 999,
      background: d.bg, color: d.color,
    }}>{d.label}</span>
  );
}

// ── Items summary (no detail in list) ────────────────────────────────────────
function ItemsSummary({ order }) {
  if (order.source === 'manual') return null; // Directo: no items
  if (!order.items || order.items.length === 0) return null;
  const first = order.items[0].name;
  const extra = order.items.length - 1;
  const text = extra > 0 ? `${first} +${extra} más` : first;
  return (
    <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {text}
    </div>
  );
}

// ── Cooking status line ───────────────────────────────────────────────────────
function CookingStatusLine({ order }) {
  const s = order.state;
  const d = order.driver;

  if (s === 'cooking') {
    const pct = order.prepMinutes > 0 ? (order.minutesLeft / order.prepMinutes) : 0;
    const textColor = pct < 0.15 ? '#C2410C' : '#57534E';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <MS name="timer" size={12} style={{ color: textColor }} />
        <span style={{ fontSize: 11, color: textColor, fontWeight: 500 }}>
          Cocinando · <span className="tv-mono" style={{ fontWeight: 700 }}>{order.minutesLeft}m</span> restantes
          {order.extensionUsed && (
            <span style={{ color: '#B45309', marginLeft: 5 }}>+{order.extensionMin}m</span>
          )}
        </span>
      </div>
    );
  }

  if (s === 'buffer_p1') return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: '#EAB308', flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: '#B45309', fontWeight: 500 }}>
        Listo · Esperando motorizado · <span className="tv-mono">{order.bufferMinutes}m</span>
      </span>
    </div>
  );

  if (s === 'buffer_p2') return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: '#F97316', flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: '#C2410C', fontWeight: 600 }}>
        Sin motorizado · <span className="tv-mono">{order.bufferMinutes}m</span>
      </span>
    </div>
  );

  if (s === 'buffer_p3') return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: '#EF4444', flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 700 }}>
        Sin motorizado hace <span className="tv-mono">{order.bufferMinutes}m</span>
      </span>
    </div>
  );

  if (s === 'heading') return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <MS name="two_wheeler" size={13} style={{ color: '#6D28D9', flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: '#6D28D9', fontWeight: 500 }}>
        {d?.name || 'Motorizado'} viene a recoger
      </span>
    </div>
  );

  if (s === 'waiting') return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <MS name="check_circle" size={13} filled style={{ color: '#16A34A', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#15803D', fontWeight: 700 }}>
          {d?.name || 'Motorizado'} llegó · Entregar pedido
        </span>
      </div>
      {order.cashChange > 0 && (
        <div style={{ fontSize: 11, color: '#15803D', fontWeight: 600, marginTop: 3, marginLeft: 18 }}>
          Vuelto a preparar: <span className="tv-mono">{soles(order.cashChange)}</span>
        </div>
      )}
    </div>
  );

  return null;
}

// ── CARD: En cocina (all sub-states) ─────────────────────────────────────────
function CocinaCard({ order, onOpen, compact = false }) {
  const ss = COOKING_STATE_STYLE[order.state] || COOKING_STATE_STYLE.cooking;
  const total = order.total || order.amount || 0;

  return (
    <div
      onClick={() => onOpen && onOpen(order)}
      style={{
        background: ss.bg,
        borderRadius: 12,
        border: `${ss.borderW} solid ${ss.border}`,
        padding: compact ? '9px 11px' : '11px 13px',
        cursor: 'pointer',
        transition: 'box-shadow 120ms',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Row 1: ID + source + total */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span className="tv-mono" style={{ fontSize: 10, color: 'var(--tv-ink-muted)', fontWeight: 700 }}>#{order.id}</span>
        <SourceBadgeMini source={order.source} />
        <div style={{ flex: 1 }} />
        <span className="tv-mono" style={{ fontSize: compact ? 13 : 14, fontWeight: 700 }}>
          {soles(total)}
        </span>
      </div>

      {/* Row 2: Customer + payment */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: compact ? 13 : 14, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {order.customer || 'Cliente'}
        </span>
        <PayBadgeMini payment={order.payment} />
      </div>

      {/* Row 3: Address */}
      {order.addressRef && (
        <div style={{
          display: 'flex', gap: 4, alignItems: 'flex-start',
          fontSize: 11, color: 'var(--tv-ink-muted)', marginBottom: 6,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <MS name="location_on" size={11} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.addressRef}</span>
        </div>
      )}

      {/* Row 4: Status / progress */}
      <CookingStatusLine order={order} />
    </div>
  );
}

// ── CARD: Nuevo (pending_acceptance) — sin botones, toda la card es clickeable ─
function NuevoCard({ order, onOpen, compact = false }) {
  const isUrgent = order.countdownSec < 60;
  const total = order.total || 0;
  const borderColor = isUrgent ? '#FCA5A5' : '#FDBA74'; // siempre con borde naranja/rojo para diferenciar de cocina

  return (
    <div
      onClick={() => onOpen && onOpen(order)}
      style={{
        background: '#fff', borderRadius: 12,
        border: `1px solid ${borderColor}`,
        padding: compact ? '9px 11px' : '11px 13px',
        cursor: 'pointer', transition: 'box-shadow 120ms',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Row 1: ID + countdown + source badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span className="tv-mono" style={{ fontSize: 10, color: 'var(--tv-ink-muted)', fontWeight: 700 }}>#{order.id}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <MS name="timer" size={11} style={{ color: isUrgent ? 'var(--tv-danger)' : 'var(--tv-brand)', flexShrink: 0 }} />
          <span className="tv-mono" style={{ fontSize: 11, fontWeight: 700, color: isUrgent ? 'var(--tv-danger)' : 'var(--tv-brand)' }}>
            {mmss(order.countdownSec)}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <SourceBadgeMini source={order.source} />
      </div>

      {/* Row 2: Customer + total */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: compact ? 13 : 14, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {order.customer || 'Cliente'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <PayBadgeMini payment={order.payment} />
          <span className="tv-mono" style={{ fontSize: compact ? 13 : 14, fontWeight: 700 }}>{soles(total)}</span>
        </div>
      </div>

      {/* Row 3: Address */}
      {order.addressRef && (
        <div style={{
          display: 'flex', gap: 4, alignItems: 'flex-start',
          fontSize: 11, color: 'var(--tv-ink-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <MS name="location_on" size={11} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.addressRef}</span>
        </div>
      )}
    </div>
  );
}

// ── CARD: En reparto ──────────────────────────────────────────────────────────
function RepartoCard({ order, onOpen, compact = false }) {
  const total = order.total || order.amount || 0;
  const mAgo = order.pickupMinAgo || 0;
  const isDemoradoMed  = mAgo >= 30 && mAgo < 45;
  const isDemoradoHigh = mAgo >= 45;
  const border = isDemoradoHigh ? '#FDBA74' : isDemoradoMed ? '#FDE68A' : 'var(--tv-border)';

  // Status line config (consistent with CookingStatusLine dot system)
  const driverName = order.driver?.name || 'Motorizado';
  const statusDot  = isDemoradoHigh ? '#F97316' : isDemoradoMed ? '#EAB308' : null;
  const statusColor = isDemoradoHigh ? '#C2410C' : isDemoradoMed ? '#B45309' : '#6D28D9';
  const statusText  = isDemoradoHigh
    ? `Reparto demorado · hace ${mAgo}m`
    : isDemoradoMed
    ? `En camino mucho tiempo · hace ${mAgo}m`
    : `${driverName} entregando · hace ${mAgo}m`;

  return (
    <div
      onClick={() => onOpen && onOpen(order)}
      style={{
        background: '#fff', borderRadius: 12,
        border: `1px solid ${border}`,
        padding: compact ? '9px 11px' : '11px 13px',
        cursor: 'pointer', transition: 'box-shadow 120ms',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Row 1: ID + source + total */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span className="tv-mono" style={{ fontSize: 10, color: 'var(--tv-ink-muted)', fontWeight: 700 }}>#{order.id}</span>
        <SourceBadgeMini source={order.source} />
        <div style={{ flex: 1 }} />
        <span className="tv-mono" style={{ fontSize: compact ? 13 : 14, fontWeight: 700 }}>{soles(total)}</span>
      </div>

      {/* Row 2: Customer + payment */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: compact ? 13 : 14, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {order.customer || 'Cliente'}
        </span>
        <PayBadgeMini payment={order.payment} />
      </div>

      {/* Row 3: Address */}
      {order.addressRef && (
        <div style={{
          fontSize: 11, color: 'var(--tv-ink-muted)', marginBottom: 6,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{order.addressRef}</div>
      )}

      {/* Row 4: Driver status line (consistent dot system) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {statusDot
          ? <span style={{ width: 7, height: 7, borderRadius: 999, background: statusDot, flexShrink: 0 }} />
          : <MS name="delivery_dining" size={13} style={{ color: statusColor, flexShrink: 0 }} />}
        <span style={{ fontSize: 11, color: statusColor, fontWeight: isDemoradoMed || isDemoradoHigh ? 600 : 500 }}>
          {statusText}
        </span>
      </div>
    </div>
  );
}

// ── CARD: Comparativa de estados (para canvas) ─────────────────────────────────
function CocinaStatesComparison({ compact = false }) {
  const sampleOrders = [
    // 1. Cocinando
    { id: 'AA1111', source: 'web', state: 'cooking', customer: 'María Quispe', payment: 'pending_cash',
      addressRef: 'Jr. San Martín 245 — Casa azul', total: 38.50,
      prepMinutes: 25, minutesLeft: 18, extensionUsed: false },
    // 2. Buffer p1
    { id: 'BB2222', source: 'manual', state: 'buffer_p1', bufferMinutes: 2,
      customer: 'José Mamani', payment: 'pending_wallet', addressRef: 'Av. Túpac Amaru 902', total: 47 },
    // 3. Buffer p2
    { id: 'CC3333', source: 'web', state: 'buffer_p2', bufferMinutes: 4,
      customer: 'Andrea Vargas', payment: 'pending_cash', addressRef: 'Pasaje Las Flores 14', total: 28 },
    // 4. Buffer p3
    { id: 'DD4444', source: 'web', state: 'buffer_p3', bufferMinutes: 7,
      customer: 'Luis Paredes', payment: 'pending_mixed', addressRef: 'Jr. Bolívar 412', total: 52 },
    // 5. Heading
    { id: 'EE5555', source: 'web', state: 'heading', driver: { name: 'Andy R.' },
      customer: 'Rosa Díaz', payment: 'prepaid', addressRef: 'Av. Industrial 1820', total: 18 },
    // 6. Waiting
    { id: 'FF6666', source: 'manual', state: 'waiting', driver: { name: 'Juan P.', arrivedMinAgo: 1 },
      customer: 'Marco Salinas', payment: 'pending_cash', addressRef: 'Jr. Libertad 303',
      total: 35, cashChange: 15 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tv-ink-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Comparativa de estados — columna "En cocina"
      </div>
      {sampleOrders.map(o => (
        <CocinaCard key={o.id} order={o} compact={compact} />
      ))}
    </div>
  );
}

// ── PausarModal ───────────────────────────────────────────────────────────────
function PausarModal({ onClose }) {
  const opts = [
    { label: '15 minutos', sub: 'Para un pico rápido', min: 15 },
    { label: '30 minutos', sub: 'La opción más común', min: 30, default: true },
    { label: '1 hora',     sub: 'Para horas de alta demanda', min: 60 },
    { label: '2 horas',    sub: 'Para el resto del turno', min: 120 },
    { label: 'Hasta que reactive', sub: 'Sin tiempo fijo', min: null },
  ];
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '20px',
        maxWidth: 340, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 11, flexShrink: 0,
            background: '#FEF3C7', color: '#92400E',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MS name="pause_circle" size={22} filled />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Pausar pedidos</div>
            <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 1 }}>¿Por cuánto tiempo?</div>
          </div>
          {onClose && (
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(26,22,20,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MS name="close" size={16} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
          {opts.map((o, i) => (
            <button key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9,
              background: o.default ? 'var(--tv-ink)' : 'var(--tv-surface)',
              color: o.default ? '#fff' : 'var(--tv-ink)',
              border: 'none', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{o.label}</div>
                <div style={{ fontSize: 11, opacity: 0.65 }}>{o.sub}</div>
              </div>
              {o.default && <MS name="check" size={16} />}
            </button>
          ))}
        </div>

        <div style={{ background: '#FEF3C7', borderRadius: 9, padding: '9px 12px', marginBottom: 12, fontSize: 12, color: '#92400E' }}>
          <strong>Los pedidos activos continúan</strong> su flujo. Solo se bloquean los nuevos desde la web.
        </div>
        <button className="tv-btn tv-btn-brand tv-btn-block tv-btn-lg">
          Confirmar pausa de 30 min
        </button>
      </div>
    </div>
  );
}

Object.assign(window, {
  SourceBadgeMini, PayBadgeMini, ItemsSummary, CookingStatusLine,
  CocinaCard, NuevoCard, RepartoCard, CocinaStatesComparison, PausarModal,
});
