// Tindivo dashboard — shared components & helpers (v2)

const MS = ({ name, size = 20, filled = false, className = '', style = {} }) => (
  <span
    className={`material-symbols-rounded ${className}`}
    style={{ fontSize: size, fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 500`, ...style }}
  >{name}</span>
);

const soles = (n) => `S/ ${Number(n).toFixed(2).replace(/\.00$/, '')}`;
const solesPlain = (n) => `S/ ${Number(n).toFixed(2)}`;

// ─── Payment meta (v2 — generic) ─────────────────────────────────────────────
const PAYMENT_META = {
  prepaid:        { label: 'Ya pagó',                  short: 'Prepago',   icon: 'verified',      tone: '#0369A1' },
  pending_wallet: { label: 'Cobrar con billetera',     short: 'Billetera', icon: 'qr_code_2',     tone: '#7C3AED' },
  pending_cash:   { label: 'Cobrar en efectivo',       short: 'Efectivo',  icon: 'payments',      tone: '#15803D' },
  pending_mixed:  { label: 'Billetera + Efectivo',     short: 'Mixto',     icon: 'shuffle',       tone: '#92400E' },
};

// ─── State meta ───────────────────────────────────────────────────────────────
const STATE_META = {
  pending_acceptance:    { label: 'Por aceptar',       short: 'Por aceptar',  cls: 'tv-state-pending',   icon: 'notifications_active' },
  validando:             { label: 'Validar',            short: 'Validar',      cls: 'tv-state-validate',  icon: 'fact_check' },
  confirmed:             { label: 'Aceptado',           short: 'Aceptado',     cls: 'tv-state-confirmed', icon: 'check_circle' },
  preparing:             { label: 'En cocina',          short: 'Cocina',       cls: 'tv-state-cooking',   icon: 'soup_kitchen' },
  waiting_driver:        { label: 'Listo · espera moto', short: 'Listo',       cls: 'tv-state-ready',     icon: 'inventory_2' },
  heading_to_restaurant: { label: 'Moto en camino',    short: 'Moto',         cls: 'tv-state-driver',    icon: 'two_wheeler' },
  waiting_at_restaurant: { label: 'Moto en el local',  short: 'En local',     cls: 'tv-state-driver',    icon: 'storefront' },
  picked_up:             { label: 'En reparto',        short: 'En reparto',   cls: 'tv-state-driver',    icon: 'delivery_dining' },
  delivered:             { label: 'Entregado',         short: 'Entregado',    cls: 'tv-state-delivered', icon: 'check' },
  cancelled:             { label: 'Cancelado',         short: 'Cancelado',    cls: 'tv-state-delivered', icon: 'cancel' },
};

function StateChip({ state, small = false }) {
  const m = STATE_META[state] || STATE_META.confirmed;
  return (
    <span className={`tv-state-dot ${m.cls}`} style={{ fontSize: small ? 11 : 12, padding: small ? '3px 8px' : '4px 10px' }}>
      {m.short}
    </span>
  );
}

function PayChip({ payment }) {
  const m = PAYMENT_META[payment] || PAYMENT_META.pending_cash;
  return (
    <span className="tv-chip" style={{ background: 'rgba(26,22,20,0.06)', fontSize: 12 }}>
      <MS name={m.icon} size={13} />
      {m.short}
    </span>
  );
}

// ── Badge: origen del pedido ──────────────────────────────────────────────────
function SourceBadge({ source, small = false }) {
  const isWeb = source === 'web';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: small ? '2px 6px' : '3px 8px',
      borderRadius: 999,
      background: isWeb ? '#E0F2FE' : '#F5F5F4',
      color: isWeb ? '#0369A1' : '#57534E',
      fontSize: small ? 10 : 11,
      fontWeight: 700,
      fontFamily: 'JetBrains Mono, monospace',
      letterSpacing: '0.04em',
    }}>
      <MS name={isWeb ? 'language' : 'call'} size={small ? 10 : 12} />
      {isWeb ? 'WEB' : 'MANUAL'}
    </span>
  );
}

// ── Papelito stripe ───────────────────────────────────────────────────────────
function PapelitoStripe({ color }) {
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, bottom: 0, width: 5,
      background: color, borderRadius: '16px 0 0 16px',
    }} />
  );
}

function mmss(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Top app bar (mobile) ──────────────────────────────────────────────────────
function MobileTopBar({ title, subtitle, soundOn = true, glow }) {
  return (
    <div className="tv-glass" style={{ position: 'sticky', top: 0, zIndex: 10, padding: '10px 14px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: '#F472B6', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 16, fontFamily: 'Bricolage Grotesque',
        }}>T</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tv-display" style={{ fontSize: 17, lineHeight: 1.1, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          {subtitle && <div className="tv-label" style={{ marginTop: 2 }}>{subtitle}</div>}
        </div>
        <button className={`tv-btn ${soundOn ? 'tv-btn-brand' : 'tv-btn-ghost'} tv-btn-sm ${glow ? 'tv-pulse-brand' : ''}`}
          style={{ padding: '8px 10px' }}>
          <MS name={soundOn ? 'notifications_active' : 'notifications_off'} size={18} filled={soundOn} />
          {soundOn ? 'Alertas' : 'Activar'}
        </button>
      </div>
    </div>
  );
}

function MobileBottomNav({ active = 'pedidos' }) {
  const items = [
    { id: 'pedidos', label: 'Pedidos', icon: 'receipt_long' },
    { id: 'menu', label: 'Menú', icon: 'restaurant_menu' },
    { id: 'add',  label: 'Moto', icon: 'two_wheeler' },
    { id: 'efectivo', label: 'Efectivo', icon: 'payments' },
    { id: 'mas', label: 'Más', icon: 'more_horiz' },
  ];
  return (
    <div className="tv-bottom-nav">
      {items.map(it => it.id === 'add' ? (
        <button key={it.id} className="fab">
          <MS name="add" size={28} filled />
        </button>
      ) : (
        <button key={it.id} className={active === it.id ? 'active' : ''}>
          <MS name={it.icon} size={22} filled={active === it.id} />
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Desktop sidebar ───────────────────────────────────────────────────────────
function DesktopSidebar({ active = 'pedidos', counts = {} }) {
  const items = [
    { id: 'pedidos',   label: 'Pedidos',    icon: 'receipt_long',          badge: counts.pedidos },
    { id: 'menu',      label: 'Menú',       icon: 'restaurant_menu' },
    { id: 'add',       label: 'Pedir moto',   icon: 'two_wheeler' },
    { id: 'efectivo',  label: 'Efectivo',   icon: 'payments',              badge: counts.efectivo },
    { id: 'historial', label: 'Historial',  icon: 'history' },
    { id: 'deuda',     label: 'Deuda',      icon: 'account_balance_wallet', badge: counts.deuda },
    { id: 'config',    label: 'Config',     icon: 'settings' },
  ];
  return (
    <aside style={{
      width: 240, flexShrink: 0, background: '#fff',
      borderRight: '1px solid var(--tv-border)',
      display: 'flex', flexDirection: 'column',
      padding: '20px 14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 18px' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 12,
          background: '#F472B6', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 17, fontFamily: 'Bricolage Grotesque',
        }}>T</div>
        <div style={{ minWidth: 0 }}>
          <div className="tv-display" style={{ fontSize: 16, lineHeight: 1.1 }}>El Tumi</div>
          <div className="tv-label" style={{ marginTop: 2, fontSize: 9 }}>SAN JACINTO · ÁNCASH</div>
        </div>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(it => (
          <button key={it.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 12,
            background: active === it.id ? 'var(--tv-ink)' : 'transparent',
            color: active === it.id ? '#fff' : 'var(--tv-ink)',
            border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
            textAlign: 'left',
          }}>
            <MS name={it.icon} size={20} filled={active === it.id} />
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.badge != null && (
              <span style={{
                minWidth: 22, height: 22, borderRadius: 999,
                background: active === it.id ? 'var(--tv-brand)' : 'var(--tv-danger)',
                color: '#fff', fontSize: 11, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px',
              }}>{it.badge}</span>
            )}
          </button>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <div className="tv-card" style={{ padding: 12, marginBottom: 10, background: '#FFF4EC', boxShadow: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MS name="circle" size={10} filled style={{ color: '#16A34A' }} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Plataforma abierta</div>
        </div>
        <div className="tv-label" style={{ fontSize: 9, marginTop: 4 }}>HASTA LAS 23:00</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderTop: '1px solid var(--tv-border)' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 999, background: 'var(--tv-brand-soft)',
          color: 'var(--tv-brand-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 13,
        }}>JE</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Jesús (cajero)</div>
          <div className="tv-label" style={{ fontSize: 9, marginTop: 2 }}>SALIR</div>
        </div>
        <button style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(26,22,20,0.06)', border: 'none', cursor: 'pointer' }}>
          <MS name="logout" size={18} />
        </button>
      </div>
    </aside>
  );
}

function DesktopTopBar({ title, subtitle, right, soundOn = true, alertGlow }) {
  return (
    <div className="tv-glass" style={{
      position: 'sticky', top: 0, zIndex: 8,
      padding: '14px 24px',
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{ flex: 1 }}>
        <div className="tv-display" style={{ fontSize: 22, lineHeight: 1.1 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: 'var(--tv-ink-muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {right}
      <button className={`tv-btn ${soundOn ? 'tv-btn-brand' : 'tv-btn-ghost'} ${alertGlow ? 'tv-pulse-brand' : ''}`}>
        <MS name={soundOn ? 'notifications_active' : 'notifications_off'} size={18} filled={soundOn} />
        {soundOn ? 'Alertas ON' : 'Activar alertas'}
      </button>
    </div>
  );
}

function AddressRefLine({ order, color = 'var(--tv-ink-muted)' }) {
  if (order.method === 'pickup') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color, fontSize: 13 }}>
        <MS name="storefront" size={14} />
        <span style={{ fontWeight: 600 }}>Recojo en local</span>
      </div>
    );
  }
  if (!order.addressRef) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, color, fontSize: 13, lineHeight: 1.4 }}>
      <MS name="location_on" size={14} style={{ marginTop: 2, flexShrink: 0 }} />
      <span style={{ color: 'var(--tv-ink)' }}>{order.addressRef}</span>
    </div>
  );
}

function ItemsSummary({ items, dense = false }) {
  if (!items || !items.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: dense ? 2 : 4 }}>
      {items.slice(0, 4).map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, fontSize: dense ? 12 : 13, lineHeight: 1.35 }}>
          <span className="tv-mono" style={{ color: 'var(--tv-ink-muted)', minWidth: 18 }}>{it.qty}×</span>
          <span style={{ color: 'var(--tv-ink)' }}>{it.name}</span>
        </div>
      ))}
    </div>
  );
}

function StateTabs({ active = 'pending', counts, compact = false }) {
  const tabs = [
    { id: 'pending', label: 'Por aceptar', count: counts.pending, accent: '#DC2626' },
    { id: 'cooking', label: 'Cocina',      count: counts.cooking, accent: '#C2410C' },
    { id: 'ready',   label: 'Listos',      count: counts.ready,   accent: '#15803D' },
    { id: 'route',   label: 'En camino',   count: counts.route,   accent: '#6D28D9' },
    { id: 'today',   label: 'Hoy',         count: counts.today,   accent: '#57534E' },
  ];
  return (
    <div style={{
      display: 'flex', gap: 6, padding: compact ? '8px 14px' : '10px 16px',
      overflowX: 'auto', scrollbarWidth: 'none',
      position: 'sticky', top: 56, zIndex: 9,
      background: 'rgba(250,246,241,0.94)',
      backdropFilter: 'blur(14px)',
      borderBottom: '1px solid var(--tv-border)',
    }}>
      {tabs.map(t => (
        <button key={t.id} style={{
          border: active === t.id ? 'none' : '1px solid var(--tv-border)',
          cursor: 'pointer',
          background: active === t.id ? 'var(--tv-ink)' : '#fff',
          color: active === t.id ? '#fff' : 'var(--tv-ink)',
          padding: '8px 12px', borderRadius: 999,
          fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          whiteSpace: 'nowrap',
        }}>
          {t.label}
          {t.count != null && t.count > 0 && (
            <span style={{
              minWidth: 18, height: 18, borderRadius: 999,
              background: active === t.id ? t.accent : 'rgba(26,22,20,0.08)',
              color: active === t.id ? '#fff' : 'var(--tv-ink)',
              fontSize: 11, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
            }}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 6px' }}>
      <div className="tv-label" style={{ flex: 1 }}>{children}</div>
      {action}
    </div>
  );
}

// ── Extension picker (HU-R-020 / HU-R-007) ───────────────────────────────────
// Solo 1 vez por pedido, solo en waiting_driver y heading_to_restaurant
function canExtend(order) {
  return !order.extensionUsed &&
    (order.state === 'waiting_driver' || order.state === 'heading_to_restaurant');
}

Object.assign(window, {
  MS, soles, solesPlain, PAYMENT_META, STATE_META,
  StateChip, PayChip, SourceBadge, PapelitoStripe, mmss,
  MobileTopBar, MobileBottomNav, DesktopSidebar, DesktopTopBar,
  AddressRefLine, ItemsSummary, StateTabs, SectionTitle, canExtend,
});
