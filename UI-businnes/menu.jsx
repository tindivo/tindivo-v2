// menu.jsx (v2) — Lista de menú refactorizada + estado vacío
// Cambios vs v1:
//   · Botón "Editar" prominente en cada item (no solo more_vert)
//   · Indicador de complejidad: "3 grupos · desde S/15"
//   · Badge "Directo al carrito" para items sin modificadores
//   · Estado vacío con invitación a crear primer plato
//   · Categorías con contador de agotados y "Agregar plato"

// ── Item row (lista admin) ────────────────────────────────────────────────────
function MenuAdminItemRow({ item, onEdit, compact = false }) {
  const groups = item.modifierGroups || [];
  const minP = itemMinPrice(item);
  const maxP = itemMaxPrice(item);
  const hasGroups = groups.length > 0;
  const agotadoCount = groups.reduce((n, g) => n + g.options.filter(o => !o.available).length, 0);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: compact ? '10px 12px' : '12px 14px',
      background: '#fff', borderRadius: 12,
      border: '1px solid var(--tv-border)',
      opacity: item.available ? 1 : 0.65,
    }}>
      {/* Thumbnail placeholder */}
      <div className="tv-ph" style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 10 }}>
        <span style={{ fontSize: 9 }}>{item.name.slice(0, 6).toUpperCase()}</span>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
          <div style={{
            fontSize: 14, fontWeight: 600,
            color: item.available ? 'var(--tv-ink)' : 'var(--tv-ink-subtle)',
            textDecoration: item.available ? 'none' : 'line-through',
          }}>{item.name}</div>
          {item.featured && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              background: 'var(--tv-brand-soft)', color: 'var(--tv-brand-dark)',
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
            }}>
              <MS name="star" size={10} filled /> Destacado
            </span>
          )}
          {!item.available && (
            <span style={{
              background: 'var(--tv-danger-soft)', color: '#991B1B',
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
            }}>Agotado</span>
          )}
        </div>

        {/* Price + complexity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="tv-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--tv-ink)' }}>
            {minP === maxP ? soles(minP) : `${soles(minP)} – ${soles(maxP)}`}
          </span>
          {hasGroups ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: '#E0F2FE', color: '#0369A1',
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
            }}>
              <MS name="tune" size={10} /> {groups.length} grupo{groups.length > 1 ? 's' : ''}
            </span>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'var(--tv-success-soft)', color: '#166534',
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
            }}>
              <MS name="shopping_cart" size={10} /> Directo al carrito
            </span>
          )}
          {agotadoCount > 0 && (
            <span style={{ fontSize: 10, color: 'var(--tv-warning)', fontWeight: 600 }}>
              {agotadoCount} opción{agotadoCount > 1 ? 'es' : ''} agotada{agotadoCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Availability toggle */}
      <button style={{
        width: 40, height: 24, borderRadius: 999,
        background: item.available ? 'var(--tv-success)' : 'var(--tv-ink-subtle)',
        border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 3, left: item.available ? 19 : 3,
          width: 18, height: 18, borderRadius: 999, background: '#fff',
          transition: 'left 140ms ease',
        }} />
      </button>

      {/* Edit button — prominente, no escondido */}
      <button
        onClick={onEdit}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '7px 10px', borderRadius: 10,
          background: 'rgba(26,22,20,0.06)', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--tv-ink)',
          flexShrink: 0,
        }}>
        <MS name="edit" size={15} /> Editar
      </button>
    </div>
  );
}

// ── Category section ──────────────────────────────────────────────────────────
function MenuAdminCategory({ cat, onEditItem, onAddItem }) {
  const unavailable = cat.items.filter(i => !i.available).length;
  const withGroups = cat.items.filter(i => i.modifierGroups.length > 0).length;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 4px 8px',
      }}>
        <div style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>{cat.name}</div>
        <span className="tv-chip" style={{ fontSize: 11 }}>{cat.items.length}</span>
        {withGroups > 0 && (
          <span style={{
            background: '#E0F2FE', color: '#0369A1',
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
          }}>
            {withGroups} con opciones
          </span>
        )}
        {unavailable > 0 && (
          <span className="tv-chip tv-chip-warning" style={{ fontSize: 10 }}>
            {unavailable} agotado{unavailable > 1 ? 's' : ''}
          </span>
        )}
        <button
          onClick={onAddItem}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 10px', borderRadius: 10,
            background: 'var(--tv-brand)', color: '#fff',
            border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
          }}>
          <MS name="add" size={14} /> Plato
        </button>
        <button style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(26,22,20,0.06)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MS name="more_vert" size={16} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {cat.items.map(item => (
          <MenuAdminItemRow
            key={item.id}
            item={item}
            onEdit={() => onEditItem && onEditItem(item)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function MenuEmptyState({ onAdd }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '48px 24px', background: '#fff', borderRadius: 20,
      border: '2px dashed var(--tv-border)', textAlign: 'center',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: 'var(--tv-brand-soft)', color: 'var(--tv-brand)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
      }}>
        <MS name="restaurant_menu" size={36} />
      </div>
      <div className="tv-display" style={{ fontSize: 22, marginBottom: 8 }}>
        Tu menú está vacío
      </div>
      <div style={{ fontSize: 14, color: 'var(--tv-ink-muted)', maxWidth: 300, lineHeight: 1.6, marginBottom: 24 }}>
        Agrega tus platos para que los clientes puedan pedirlos. Puedes empezar con bebidas y platos simples.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280, marginBottom: 24 }}>
        {[
          { icon: 'looks_one', text: 'Crea una categoría (ej. "Pizzas")' },
          { icon: 'looks_two', text: 'Agrega platos con precio' },
          { icon: 'looks_3', text: 'Actívalos para que aparezcan online' },
        ].map((tip, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--tv-surface)', borderRadius: 10, padding: '8px 12px',
            textAlign: 'left',
          }}>
            <MS name={tip.icon} size={18} style={{ color: 'var(--tv-brand)', flexShrink: 0 }} filled />
            <span style={{ fontSize: 13 }}>{tip.text}</span>
          </div>
        ))}
      </div>

      <button onClick={onAdd} className="tv-btn tv-btn-brand tv-btn-lg">
        <MS name="add" size={20} filled /> Agregar el primer plato
      </button>
    </div>
  );
}

// ── MOBILE ─────────────────────────────────────────────────────────────────────
function MenuMobile({ showEmpty = false }) {
  const grouped = groupedByCategory(window.PRIAMO_ITEMS);
  const totalItems = window.PRIAMO_ITEMS.length;
  const unavailableTotal = window.PRIAMO_ITEMS.filter(i => !i.available).length;
  const withGroups = window.PRIAMO_ITEMS.filter(i => i.modifierGroups.length > 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--tv-surface)' }}>
      <MobileTopBar title="Menú" subtitle={`${totalItems} platos · ${unavailableTotal} agotados`} soundOn />

      <div style={{ padding: '12px 14px', display: 'flex', gap: 8 }}>
        <div className="tv-input" style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        }}>
          <MS name="search" size={18} style={{ color: 'var(--tv-ink-muted)' }} />
          <span style={{ color: 'var(--tv-ink-subtle)', fontSize: 14 }}>Buscar plato</span>
        </div>
        <button className="tv-btn tv-btn-dark tv-btn-sm" style={{ padding: '10px 14px' }}>
          <MS name="add" size={18} /> Categoría
        </button>
      </div>

      {/* Legend strip */}
      <div style={{ padding: '0 14px 10px', display: 'flex', gap: 8 }}>
        <span style={{ background: '#E0F2FE', color: '#0369A1', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <MS name="tune" size={10} /> {withGroups} con opciones
        </span>
        <span style={{ background: 'var(--tv-success-soft)', color: '#166534', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <MS name="shopping_cart" size={10} /> {totalItems - withGroups} directos al carrito
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 80px' }}>
        {showEmpty ? (
          <MenuEmptyState />
        ) : (
          grouped.map(cat => (
            <MenuAdminCategory key={cat.id} cat={cat} />
          ))
        )}
      </div>

      <MobileBottomNav active="menu" />
    </div>
  );
}

// ── DESKTOP ───────────────────────────────────────────────────────────────────
function MenuDesktop({ showEmpty = false }) {
  const grouped = groupedByCategory(window.PRIAMO_ITEMS);
  const totalItems = window.PRIAMO_ITEMS.length;
  const unavailableTotal = window.PRIAMO_ITEMS.filter(i => !i.available).length;
  const withGroups = window.PRIAMO_ITEMS.filter(i => i.modifierGroups.length > 0).length;

  const counts = {
    pedidos:  window.ORDERS.filter(o => o.state === 'pending_acceptance').length,
    efectivo: window.CASH_SETTLEMENTS.filter(s => s.state === 'pending_confirmation').length,
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--tv-surface)' }}>
      <DesktopSidebar active="menu" counts={counts} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <DesktopTopBar
          title="Menú"
          subtitle={`${totalItems} platos · ${unavailableTotal} agotados · ${withGroups} con grupos de opciones`}
          right={
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="tv-btn tv-btn-ghost">
                <MS name="visibility" size={18} /> Vista cliente
              </button>
              <button className="tv-btn tv-btn-dark">
                <MS name="add" size={18} /> Nueva categoría
              </button>
              <button className="tv-btn tv-btn-brand">
                <MS name="add" size={18} /> Nuevo plato
              </button>
            </div>
          }
        />

        <div style={{ flex: 1, padding: '20px 24px', display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, overflowY: 'auto', alignItems: 'flex-start' }}>
          {/* Left rail — categories */}
          <aside style={{ background: '#fff', borderRadius: 16, padding: 14, border: '1px solid var(--tv-border)', position: 'sticky', top: 0 }}>
            <div className="tv-label" style={{ marginBottom: 8, padding: '0 4px' }}>CATEGORÍAS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {grouped.map((cat, i) => (
                <div key={cat.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  background: i === 0 ? 'var(--tv-ink)' : 'transparent',
                  color: i === 0 ? '#fff' : 'var(--tv-ink)',
                }}>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{cat.name}</div>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    background: i === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(26,22,20,0.08)',
                    padding: '2px 7px', borderRadius: 999,
                  }}>{cat.items.length}</span>
                </div>
              ))}
            </div>
            <button className="tv-btn tv-btn-ghost tv-btn-sm tv-btn-block" style={{ marginTop: 10 }}>
              <MS name="add" size={14} /> Nueva categoría
            </button>
            {/* Legend */}
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--tv-border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="tv-label" style={{ fontSize: 9 }}>LEYENDA</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ background: '#E0F2FE', color: '#0369A1', padding: '2px 6px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                  <MS name="tune" size={10} /> Con opciones
                </span>
                <span style={{ color: 'var(--tv-ink-muted)' }}>grupos de modificadores</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span style={{ background: 'var(--tv-success-soft)', color: '#166534', padding: '2px 6px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                  <MS name="shopping_cart" size={10} /> Directo
                </span>
                <span style={{ color: 'var(--tv-ink-muted)' }}>va al carrito sin modal</span>
              </div>
            </div>
          </aside>

          {/* Items */}
          <div>
            {showEmpty ? (
              <MenuEmptyState />
            ) : (
              grouped.map(cat => (
                <MenuAdminCategory key={cat.id} cat={cat} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  MenuMobile, MenuDesktop, MenuEmptyState,
  MenuAdminCategory, MenuAdminItemRow,
});
