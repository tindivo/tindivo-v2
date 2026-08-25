// menu-customer-preview.jsx — Preview del cliente (modal bottom-sheet style)
// Muestra cómo ve el cliente el item con sus grupos de modificadores
// Estilo: PWA del cliente Tindivo (warm surface, naranja, tarjetas limpias)

function CustomerOptionPill({ opt, selected, required, multi }) {
  const isSelected = selected;
  return (
    <button style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 14px', borderRadius: 12, width: '100%',
      border: isSelected ? '2px solid var(--tv-brand)' : '1.5px solid var(--tv-border)',
      background: isSelected ? 'var(--tv-brand-soft)' : '#fff',
      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      marginBottom: 6,
    }}>
      {/* Radio / Checkbox visual */}
      <div style={{
        width: 20, height: 20, borderRadius: multi ? 6 : 999, flexShrink: 0,
        border: isSelected ? `2px solid var(--tv-brand)` : '2px solid var(--tv-border)',
        background: isSelected ? 'var(--tv-brand)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isSelected && <MS name="check" size={12} style={{ color: '#fff' }} />}
      </div>

      <span style={{
        flex: 1, fontSize: 15,
        fontWeight: isSelected ? 600 : 400,
        color: opt.available ? 'var(--tv-ink)' : 'var(--tv-ink-subtle)',
        textDecoration: opt.available ? 'none' : 'line-through',
      }}>
        {opt.name}
        {!opt.available && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--tv-ink-subtle)' }}>Agotado</span>}
      </span>

      {opt.delta > 0 && (
        <span className="tv-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--tv-ink-muted)', flexShrink: 0 }}>
          +{soles(opt.delta)}
        </span>
      )}
      {opt.delta === 0 && (
        <span style={{ fontSize: 12, color: 'var(--tv-success)', fontWeight: 600, flexShrink: 0 }}>
          Incluido
        </span>
      )}
    </button>
  );
}

function CustomerModifierGroup({ group, selectedOptions = [] }) {
  const isRequired = group.required;
  const ruleLabel = isRequired
    ? group.max === 1 ? 'Elige 1 opción' : `Elige ${group.min}–${group.max} opciones`
    : group.max === 1 ? 'Elige 1 (opcional)' : `Hasta ${group.max} opciones`;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{group.name}</div>
          <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 2 }}>{ruleLabel}</div>
        </div>
        {isRequired ? (
          <span style={{
            background: '#FEF3C7', color: '#92400E',
            fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
          }}>Obligatorio</span>
        ) : (
          <span style={{
            background: 'var(--tv-surface)', color: 'var(--tv-ink-muted)',
            fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
          }}>Opcional</span>
        )}
      </div>
      {group.options.map((opt, i) => (
        <CustomerOptionPill
          key={opt.id}
          opt={opt}
          selected={i === 0 && isRequired} // Mock: first option pre-selected if required
          required={isRequired}
          multi={group.max > 1}
        />
      ))}
    </div>
  );
}

// Mobile customer preview (as a bottom sheet overlaid on phone frame)
function CustomerPreviewMobile({ item }) {
  const minP = itemMinPrice(item);
  const maxP = itemMaxPrice(item);

  // Mock computed price = base + first required option delta
  const mockPrice = item.price + (
    item.modifierGroups
      .filter(g => g.required)
      .reduce((sum, g) => sum + (g.options[0]?.delta || 0), 0)
  );

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      zIndex: 200,
    }}>
      {/* Bottom sheet — ajuste 7: scroll independiente */}
      <div style={{
        background: '#fff', borderRadius: '24px 24px 0 0',
        maxHeight: '88%', height: '88%',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, background: '#D4D0CA' }} />
        </div>

        {/* Header: photo + title */}
        <div style={{ padding: '0 16px 12px' }}>
          <div className="tv-ph" style={{ width: '100%', height: 140, borderRadius: 16, marginBottom: 14 }}>
            <span>{item.name.toUpperCase()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{item.name}</div>
              {item.description && (
                <div style={{ fontSize: 13, color: 'var(--tv-ink-muted)', marginTop: 4, lineHeight: 1.5 }}>
                  {item.description}
                </div>
              )}
            </div>
            <div className="tv-mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--tv-brand)', flexShrink: 0 }}>
              {minP !== maxP ? `Desde ${soles(minP)}` : soles(minP)}
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--tv-border)' }} />

        {/* Scrollable options */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0' }}>
          {item.modifierGroups.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '20px',
              color: 'var(--tv-ink-muted)', fontSize: 14,
            }}>
              <MS name="shopping_cart" size={28} style={{ color: 'var(--tv-success)' }} />
              <div style={{ marginTop: 8, fontWeight: 600 }}>Sin opciones adicionales</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Este plato se agrega directo al carrito.</div>
            </div>
          ) : (
            item.modifierGroups.map(group => (
              <CustomerModifierGroup key={group.id} group={group} />
            ))
          )}
        </div>

        {/* CTA + price */}
        <div style={{
          padding: '12px 16px 20px',
          borderTop: '1px solid var(--tv-border)',
          background: '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            {/* Quantity stepper */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 0,
              background: 'var(--tv-surface)', borderRadius: 12, padding: 3,
            }}>
              <button style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MS name="remove" size={16} />
              </button>
              <span className="tv-mono" style={{ minWidth: 28, textAlign: 'center', fontWeight: 700, fontSize: 16 }}>1</span>
              <button style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: 'var(--tv-ink)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MS name="add" size={16} />
              </button>
            </div>
            <button style={{
              flex: 1, background: 'var(--tv-brand)', color: '#fff',
              border: 'none', borderRadius: 14, padding: '14px 16px',
              fontFamily: 'inherit', fontWeight: 700, fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 4px 14px -4px rgba(249,115,22,0.5)',
            }}>
              <span>Agregar</span>
              <span className="tv-mono">{soles(mockPrice)}</span>
            </button>
          </div>
          {/* Admin tag */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 11, color: 'var(--tv-ink-subtle)',
          }}>
            <MS name="visibility" size={12} />
            Vista previa — así lo ve el cliente final
          </div>
        </div>
      </div>
    </div>
  );
}

// Desktop customer preview (right panel)
function CustomerPreviewDesktop({ item }) {
  const minP = itemMinPrice(item);

  // Ajuste 9: dynamic price — mock state shows Familiar selected + 2 extras for Hawaiana
  const mockSelections = (() => {
    let price = item.price;
    item.modifierGroups.forEach((g, gi) => {
      if (g.required) {
        // Select first option
        price += g.options[0]?.delta || 0;
      }
      // For Hawaiana (3 groups), add 2 extras from group 2
      if (gi === 2 && !g.required) {
        const extras = g.options.filter(o => o.delta > 0).slice(0, 2);
        extras.forEach(o => { price += o.delta; });
      }
    });
    return price;
  })();
  const qty = 1;
  const dynamicPrice = mockSelections * qty;

  return (
    <div style={{
      background: 'var(--tv-surface)', borderRadius: 20,
      border: '1px solid var(--tv-border)',
      overflow: 'hidden',
      height: '100%', display: 'flex', flexDirection: 'column',
    }}>
      {/* Label bar */}
      <div style={{
        background: 'var(--tv-ink)', color: '#fff',
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <MS name="smartphone" size={16} filled />
        <div style={{ fontSize: 13, fontWeight: 600 }}>Vista del cliente · PWA Tindivo</div>
        <div style={{ flex: 1 }} />
        <button style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}>
          Cerrar
        </button>
      </div>

      {/* Content — ajuste 7: independent scroll */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
        {/* Hero */}
        <div className="tv-ph" style={{ width: '100%', height: 180, borderRadius: 0 }}>
          <span>{item.name.toUpperCase()} · FOTO</span>
        </div>

        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{item.name}</div>
              {item.description && (
                <div style={{ fontSize: 14, color: 'var(--tv-ink-muted)', marginTop: 6, lineHeight: 1.5 }}>
                  {item.description}
                </div>
              )}
            </div>
            <div className="tv-mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--tv-brand)', flexShrink: 0 }}>
              {soles(minP)}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--tv-border)', marginBottom: 16 }} />

          {item.modifierGroups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--tv-ink-muted)' }}>
              <MS name="shopping_cart" size={32} style={{ color: 'var(--tv-success)' }} />
              <div style={{ fontWeight: 600, marginTop: 8 }}>Sin opciones adicionales</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Se agrega directamente al carrito.</div>
            </div>
          ) : (
            item.modifierGroups.map(group => (
              <CustomerModifierGroup key={group.id} group={group} />
            ))
          )}
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '14px 18px 18px', borderTop: '1px solid var(--tv-border)', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--tv-surface)', borderRadius: 12, padding: 3 }}>
            <button style={{ width: 36, height: 36, borderRadius: 9, border: 'none', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MS name="remove" size={16} />
            </button>
            <span className="tv-mono" style={{ minWidth: 30, textAlign: 'center', fontWeight: 700, fontSize: 16 }}>1</span>
            <button style={{ width: 36, height: 36, borderRadius: 9, border: 'none', background: 'var(--tv-ink)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MS name="add" size={16} />
            </button>
          </div>
          <button style={{
            flex: 1, background: 'var(--tv-brand)', color: '#fff',
            border: 'none', borderRadius: 14, padding: '14px 16px',
            fontFamily: 'inherit', fontWeight: 700, fontSize: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: '0 4px 14px -4px rgba(249,115,22,0.5)',
          }}>
            <span>Agregar al pedido</span>
            <span className="tv-mono">{soles(dynamicPrice)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Wrapper: editor + preview side-by-side (desktop artboard)
function ItemEditorWithPreviewDesktop({ item }) {
  const counts = {
    pedidos:  window.ORDERS.filter(o => o.state === 'pending_acceptance').length,
    efectivo: window.CASH_SETTLEMENTS.filter(s => s.state === 'pending_confirmation').length,
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--tv-surface)' }}>
      <DesktopSidebar active="menu" counts={counts} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <DesktopTopBar
          title={`Editar · ${item.name}`}
          subtitle={`Menú · ${PRIAMO_CATEGORIES.find(c => c.id === item.categoryId)?.name}`}
          right={
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="tv-btn tv-btn-brand">
                <MS name="save" size={18} filled /> Guardar
              </button>
            </div>
          }
        />
        <div style={{ flex: 1, padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, overflowY: 'auto', alignItems: 'flex-start' }}>
          {/* Editor form (compact) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Sections A + B inline */}
            <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: '1px solid var(--tv-border)' }}>
              <div className="tv-label" style={{ marginBottom: 12 }}>A · INFO BÁSICA</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="tv-label-input">NOMBRE</label>
                  <div className="tv-input" style={{ fontWeight: 600 }}>{item.name}</div>
                </div>
                <div>
                  <label className="tv-label-input">PRECIO BASE</label>
                  <div className="tv-input tv-mono" style={{ fontWeight: 700 }}>{soles(item.price)}</div>
                </div>
                <div>
                  <label className="tv-label-input">CATEGORÍA</label>
                  <div className="tv-input">{PRIAMO_CATEGORIES.find(c => c.id === item.categoryId)?.name}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <label className="tv-label-input">DISPONIBLE</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <button style={{ width: 38, height: 22, borderRadius: 999, background: item.available ? 'var(--tv-brand)' : 'var(--tv-ink-subtle)', border: 'none', cursor: 'pointer', position: 'relative' }}>
                        <span style={{ position: 'absolute', top: 2, left: item.available ? 18 : 2, width: 18, height: 18, borderRadius: 999, background: '#fff' }} />
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{item.available ? 'Sí' : 'No'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: '1px solid var(--tv-border)' }}>
              <div className="tv-label" style={{ marginBottom: 12 }}>B · GRUPOS DE OPCIONES</div>
              {item.modifierGroups.map((group, i) => (
                <ModifierGroupCard key={group.id} group={group} index={i} total={item.modifierGroups.length} />
              ))}
              {item.modifierGroups.length === 0 && (
                <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--tv-ink-muted)', fontSize: 13 }}>
                  Sin grupos — directo al carrito
                </div>
              )}
              <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px', borderRadius: 10, width: '100%', background: 'rgba(26,22,20,0.04)', border: '1.5px dashed var(--tv-border)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--tv-ink-muted)', justifyContent: 'center', marginTop: 8 }}>
                <MS name="add" size={16} /> Agregar grupo
              </button>
            </div>
            <PriceWarningCard item={item} />
            {item.modifierGroups.length > 0 && <PriceLivePreview item={item} />}
          </div>

          {/* Preview panel — ajuste 7: fixed height + independent scroll */}
          <div style={{ position: 'sticky', top: 0, height: 580, overflow: 'hidden' }}>
            <CustomerPreviewDesktop item={item} />
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  CustomerPreviewMobile, CustomerPreviewDesktop, ItemEditorWithPreviewDesktop,
  CustomerModifierGroup, CustomerOptionPill,
});
