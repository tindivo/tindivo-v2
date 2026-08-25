// menu-editor.jsx v2 — 10 ajustes aplicados:
// 1. "Sin cargo" en admin (no "Gratis")
// 2. Sin íconos en categorías (sidebar menu.jsx)
// 3. Columna "+ PRECIO" (no "DELTA")
// 4. Selector natural de reglas (4 opciones) en lugar de min/max numéricos
// 5. Eliminar movido a zona de peligro + modal de confirmación
// 6. Indicador • de cambios sin guardar + modal "¿Guardar antes de salir?"
// 7. Preview con scroll independiente (height fijo + overflowY auto)
// 8. Botón "Agregar grupo" con outline naranja prominente
// 9. Precio dinámico en CTA según opciones seleccionadas (mock)
// 10. Solo primer grupo expandido cuando hay >1

// ── Modals ───────────────────────────────────────────────────────────────────

function ConfirmDeleteModal({ itemName, onCancel }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '24px 22px',
        maxWidth: 360, width: '100%', textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 16,
          background: 'var(--tv-danger-soft)', color: 'var(--tv-danger)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 14px',
        }}>
          <MS name="delete" size={26} filled />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
          ¿Eliminar "{itemName}"?
        </div>
        <div style={{ fontSize: 14, color: 'var(--tv-ink-muted)', lineHeight: 1.5, marginBottom: 22 }}>
          Esta acción no se puede deshacer. El plato desaparecerá del menú y del historial de pedidos futuros.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button className="tv-btn tv-btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button className="tv-btn tv-btn-danger">
            <MS name="delete" size={16} /> Sí, eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

function UnsavedChangesModal({ onDiscard, onCancel }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '24px 22px',
        maxWidth: 360, width: '100%', textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 16,
          background: 'var(--tv-warning-soft)', color: '#B45309',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 14px',
        }}>
          <MS name="edit_note" size={26} filled />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
          Tienes cambios sin guardar
        </div>
        <div style={{ fontSize: 14, color: 'var(--tv-ink-muted)', lineHeight: 1.5, marginBottom: 22 }}>
          ¿Qué quieres hacer antes de salir?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="tv-btn tv-btn-brand tv-btn-block">
            <MS name="save" size={18} filled /> Guardar y salir
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button className="tv-btn tv-btn-ghost" onClick={onCancel}>
              Seguir editando
            </button>
            <button className="tv-btn tv-btn-ghost" onClick={onDiscard} style={{ color: 'var(--tv-danger)' }}>
              Descartar cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Natural language rule selector — select dropdown (ajuste 4 v2) ───────────
function GroupRuleSelector({ group }) {
  const getMode = (g) => {
    if (g.min >= 1 && g.max === 1) return 'required-one';
    if (g.min >= 1 && g.max > 1)  return 'required-many';
    if (g.min === 0 && g.max === 1) return 'optional-one';
    return 'optional-many';
  };
  const mode = getMode(group);
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="tv-label-input">TIPO DE SELECCIÓN</label>
      <div style={{ position: 'relative' }}>
        <select style={{
          width: '100%', appearance: 'none',
          background: '#fff',
          border: '1.5px solid var(--tv-border)',
          borderRadius: 12,
          padding: '12px 40px 12px 14px',
          fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
          color: 'var(--tv-ink)', cursor: 'pointer', outline: 'none',
          lineHeight: 1.4,
        }} defaultValue={mode}>
          <option value="required-one">Obligatorio, elegir 1</option>
          <option value="required-many">Obligatorio, elegir varios</option>
          <option value="optional-one">Opcional, elegir 1</option>
          <option value="optional-many">Opcional, elegir varios</option>
        </select>
        <div style={{
          position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
          pointerEvents: 'none',
        }}>
          <MS name="expand_more" size={20} style={{ color: 'var(--tv-ink-muted)' }} />
        </div>
      </div>
      {/* Max field if "many" */}
      {(mode === 'required-many' || mode === 'optional-many') && (
        <div style={{
          marginTop: 8, display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--tv-surface)', borderRadius: 10, padding: '8px 12px',
        }}>
          <label className="tv-label-input" style={{ margin: 0 }}>MÁXIMO A ELEGIR</label>
          <div className="tv-input tv-mono" style={{ width: 64, textAlign: 'center', fontWeight: 700, padding: '6px 10px' }}>
            {group.max}
          </div>
          <span style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>opciones</span>
        </div>
      )}
    </div>
  );
}

// ── Option row (ajuste 1: "Sin cargo"; ajuste 3: columna "+ PRECIO") ──────────
function ModifierOptionRow({ opt }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 0',
      borderBottom: '1px solid var(--tv-border)',
      opacity: opt.available ? 1 : 0.55,
    }}>
      <MS name="drag_indicator" size={16} style={{ color: 'var(--tv-ink-subtle)', cursor: 'grab', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tv-input" style={{
          padding: '7px 10px', fontSize: 14,
          border: 'none', background: 'var(--tv-surface)', borderRadius: 8,
        }}>{opt.name}</div>
      </div>
      {/* "+ PRECIO" column — ajuste 1 + 3 */}
      <div style={{ width: 78, flexShrink: 0 }}>
        <div className="tv-input" style={{
          padding: '7px 10px', fontSize: 13, border: 'none',
          background: 'var(--tv-surface)', borderRadius: 8, textAlign: 'right',
          fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
          color: opt.delta > 0 ? 'var(--tv-success)' : 'var(--tv-ink-muted)',
        }}>
          {opt.delta > 0 ? `+S/${opt.delta}` : 'Sin cargo'}
        </div>
      </div>
      <button style={{
        width: 34, height: 20, borderRadius: 999,
        background: opt.available ? 'var(--tv-success)' : 'var(--tv-ink-subtle)',
        border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 2, left: opt.available ? 16 : 2,
          width: 16, height: 16, borderRadius: 999, background: '#fff',
        }} />
      </button>
      <button style={{
        width: 28, height: 28, borderRadius: 8,
        background: 'var(--tv-danger-soft)', color: 'var(--tv-danger)',
        border: 'none', cursor: 'pointer', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MS name="close" size={14} />
      </button>
    </div>
  );
}

// ── Modifier group card (ajustes 4, 8, 10) ───────────────────────────────────
function ModifierGroupCard({ group, index, total, isExpanded }) {
  // Ajuste 10: solo primer grupo expandido por defecto cuando hay >1
  const expanded = isExpanded !== undefined ? isExpanded : index === 0;
  const isRequired = group.required;

  return (
    <div style={{
      background: '#fff', borderRadius: 14,
      border: `1.5px solid ${isRequired ? '#BFDBFE' : 'var(--tv-border)'}`,
      overflow: 'hidden', marginBottom: 10,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px',
        background: isRequired ? '#EFF6FF' : 'var(--tv-surface)',
        borderBottom: expanded ? '1px solid var(--tv-border)' : 'none',
      }}>
        <MS name="drag_indicator" size={18} style={{ color: 'var(--tv-ink-subtle)', cursor: 'grab', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>{group.name}</div>
          <div style={{ fontSize: 11, color: isRequired ? '#1D4ED8' : 'var(--tv-ink-muted)', marginTop: 2, fontWeight: 600 }}>
            {groupRuleLabel(group)}
          </div>
          {/* Ajuste 10: collapsed summary */}
          {!expanded && (
            <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
              {group.options.length} opciones
              {group.options.some(o => !o.available) && ` · ${group.options.filter(o => !o.available).length} agotada/s`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {index > 0 && (
            <button style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(26,22,20,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MS name="arrow_upward" size={13} />
            </button>
          )}
          {index < total - 1 && (
            <button style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(26,22,20,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MS name="arrow_downward" size={13} />
            </button>
          )}
          <button style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(26,22,20,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MS name="content_copy" size={13} />
          </button>
          {/* Ajuste 5: delete en header del grupo (no del item) sí se mantiene aquí */}
          <button style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--tv-danger-soft)', color: 'var(--tv-danger)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MS name="delete" size={13} />
          </button>
          <button style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(26,22,20,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MS name={expanded ? 'expand_less' : 'expand_more'} size={18} />
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '12px 14px 14px' }}>
          {/* Ajuste 4: natural language rule selector */}
          <GroupRuleSelector group={group} />

          {/* Ajuste 3: "+ PRECIO" header */}
          <div className="tv-label" style={{ marginBottom: 6 }}>OPCIONES</div>
          <div style={{ marginBottom: 8 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 78px 34px 28px',
              gap: 8, padding: '4px 0', marginLeft: 24,
            }}>
              <div className="tv-label" style={{ fontSize: 9 }}>NOMBRE</div>
              <div className="tv-label" style={{ fontSize: 9, textAlign: 'right' }}>+ PRECIO</div>
              <div />
              <div />
            </div>
            {group.options.map(opt => (
              <ModifierOptionRow key={opt.id} opt={opt} />
            ))}
          </div>
          <button style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 10, width: '100%',
            background: 'rgba(26,22,20,0.04)', border: '1.5px dashed var(--tv-border)',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
            color: 'var(--tv-ink-muted)', justifyContent: 'center',
          }}>
            <MS name="add" size={15} /> Agregar opción
          </button>
        </div>
      )}
    </div>
  );
}

// ── Ajuste 8: Botón "Agregar grupo" con outline naranja ───────────────────────
function AddGroupButton() {
  return (
    <button style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      padding: '14px 16px', borderRadius: 14, width: '100%',
      background: 'var(--tv-brand-soft)',
      border: '2px solid var(--tv-brand)',
      cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
      color: 'var(--tv-brand-dark)',
      transition: 'background 120ms',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        background: 'var(--tv-brand)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MS name="add" size={18} />
      </div>
      Agregar grupo de opciones
    </button>
  );
}

function PriceWarningCard({ item }) {
  const warn = priceWarning(item);
  if (!warn) return null;
  return (
    <div style={{
      background: 'var(--tv-warning-soft)', borderRadius: 12, padding: '12px 14px',
      border: '1px solid #FDE68A', display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <MS name="info" size={18} filled style={{ color: '#B45309', flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
        <strong>Revisa el precio base.</strong>{' '}
        El precio base es <span className="tv-mono" style={{ fontWeight: 700 }}>{soles(warn.current)}</span> pero la opción más barata del grupo "{warn.groupName}" tiene un precio adicional de{' '}
        <span className="tv-mono" style={{ fontWeight: 700 }}>+{soles(Math.abs(warn.delta))}</span>.{' '}
        Considera ajustarlo a <span className="tv-mono" style={{ fontWeight: 700 }}>{soles(warn.suggested)}</span> para que el cliente vea el precio mínimo correcto.
      </div>
    </div>
  );
}

function PriceLivePreview({ item }) {
  const minP = itemMinPrice(item);
  const maxP = itemMaxPrice(item);
  const groups = item.modifierGroups;
  return (
    <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px' }}>
      <div className="tv-label" style={{ marginBottom: 8 }}>RESUMEN DE PRECIOS</div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginBottom: 2 }}>Precio base</div>
          <div className="tv-mono" style={{ fontSize: 18, fontWeight: 700 }}>{soles(item.price)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginBottom: 2 }}>Mínimo cliente paga</div>
          <div className="tv-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--tv-success)' }}>{soles(minP)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginBottom: 2 }}>Máximo con extras</div>
          <div className="tv-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--tv-ink-muted)' }}>{soles(maxP)}</div>
        </div>
      </div>
      {groups.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {groups.filter(g => g.required).map(g => (
            <span key={g.id} style={{ background: '#DBEAFE', color: '#1E40AF', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999 }}>
              {g.name} · obligatorio
            </span>
          ))}
          {groups.filter(g => !g.required).map(g => (
            <span key={g.id} style={{ background: 'rgba(26,22,20,0.06)', color: 'var(--tv-ink-muted)', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 999 }}>
              {g.name} · opcional
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Danger zone at bottom (ajuste 5) ─────────────────────────────────────────
function DangerZone({ itemName }) {
  return (
    <div style={{
      borderRadius: 14, padding: '14px 16px',
      border: '1px solid #FCA5A5',
      background: '#FFF5F5',
    }}>
      <div className="tv-label" style={{ fontSize: 10, color: 'var(--tv-danger)', marginBottom: 10 }}>
        ZONA DE PELIGRO
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#7F1D1D' }}>Eliminar plato</div>
          <div style={{ fontSize: 12, color: '#9F1239', marginTop: 2 }}>
            Esta acción no se puede deshacer.
          </div>
        </div>
        <button className="tv-btn tv-btn-sm" style={{
          background: 'var(--tv-danger)', color: '#fff', border: 'none',
        }}>
          <MS name="delete" size={15} /> Eliminar "{itemName}"
        </button>
      </div>
    </div>
  );
}

// ── Unsaved indicator in title (ajuste 6) ─────────────────────────────────────
// Dot displayed when hasUnsaved = true
function UnsavedDot() {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: 999,
      background: 'var(--tv-brand)', marginLeft: 6,
      verticalAlign: 'middle',
    }} />
  );
}

// ── MOBILE EDITOR ─────────────────────────────────────────────────────────────
function ItemEditorMobile({ item, hasUnsaved = true, showDeleteModal = false, showUnsavedModal = false }) {
  const groups = item.modifierGroups;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--tv-surface)', position: 'relative' }}>
      {/* Ajuste 5+6: modals */}
      {showDeleteModal && <ConfirmDeleteModal itemName={item.name} />}
      {showUnsavedModal && <UnsavedChangesModal />}

      {/* Header — ajuste 6: unsaved dot */}
      <div style={{
        padding: '10px 14px 12px', background: '#fff',
        borderBottom: '1px solid var(--tv-border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(26,22,20,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MS name="arrow_back" size={22} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div className="tv-display" style={{ fontSize: 17, lineHeight: 1.1 }}>Editar plato</div>
            {hasUnsaved && <UnsavedDot />}
          </div>
          <div className="tv-label" style={{ marginTop: 2 }}>{item.name.toUpperCase()}</div>
        </div>
        <button className="tv-btn tv-btn-ghost tv-btn-sm">
          <MS name="visibility" size={16} /> Preview
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 24px' }}>

        {/* ── A: Info básica ──────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--tv-border)' }}>
          <div className="tv-label" style={{ marginBottom: 12 }}>A · INFORMACIÓN BÁSICA</div>

          <div style={{ marginBottom: 12 }}>
            <label className="tv-label-input">FOTO (OPCIONAL)</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'var(--tv-surface)', borderRadius: 12, padding: '10px 12px', border: '1.5px dashed var(--tv-border)' }}>
              <div className="tv-ph" style={{ width: 56, height: 56, borderRadius: 10, flexShrink: 0 }}>
                <span>FOTO</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Arrastra o selecciona</div>
                <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>JPG/PNG · máx 4 MB</div>
              </div>
              <button className="tv-btn tv-btn-ghost tv-btn-sm"><MS name="upload" size={14} /></button>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label className="tv-label-input">NOMBRE DEL PLATO</label>
            <div className="tv-input" style={{ fontSize: 15, fontWeight: 600 }}>{item.name}</div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label className="tv-label-input">DESCRIPCIÓN (OPCIONAL)</label>
            <textarea className="tv-input" style={{ minHeight: 60, resize: 'none', lineHeight: 1.5, fontSize: 13 }}
              defaultValue={item.description} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label className="tv-label-input">CATEGORÍA</label>
              <div className="tv-input" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 14 }}>{PRIAMO_CATEGORIES.find(c => c.id === item.categoryId)?.name || 'Pizzas'}</span>
                <MS name="expand_more" size={18} style={{ color: 'var(--tv-ink-muted)' }} />
              </div>
            </div>
            <div>
              <label className="tv-label-input">TIEMPO PREP (MIN)</label>
              <div className="tv-input tv-mono" style={{ fontSize: 15 }}>{item.prepTime || 'Default'}</div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="tv-label-input">PRECIO BASE (S/)</label>
            <div className="tv-input tv-mono" style={{ fontSize: 20, fontWeight: 700 }}>{item.price.toFixed(2)}</div>
            {groups.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 4 }}>
                Debe ser el precio de la opción más barata del grupo principal.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Disponible', sub: 'Aparece en el menú del cliente', on: item.available, icon: 'toggle_on' },
              { label: 'Destacado',  sub: 'Se muestra primero y con badge', on: item.featured, icon: 'star' },
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--tv-surface)', borderRadius: 10, padding: '10px 12px' }}>
                <MS name={t.icon} size={18} filled={t.on} style={{ color: t.on ? 'var(--tv-brand)' : 'var(--tv-ink-subtle)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 1 }}>{t.sub}</div>
                </div>
                <button style={{ width: 40, height: 24, borderRadius: 999, background: t.on ? 'var(--tv-brand)' : 'var(--tv-ink-subtle)', border: 'none', cursor: 'pointer', position: 'relative' }}>
                  <span style={{ position: 'absolute', top: 3, left: t.on ? 19 : 3, width: 18, height: 18, borderRadius: 999, background: '#fff' }} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── B: Modifier groups ─────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--tv-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div className="tv-label" style={{ flex: 1 }}>B · GRUPOS DE OPCIONES</div>
            <span className="tv-chip" style={{ fontSize: 11 }}>{groups.length}</span>
            {groups.length === 0 && (
              <span style={{ background: 'var(--tv-success-soft)', color: '#166534', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999 }}>Directo al carrito</span>
            )}
          </div>

          {groups.length === 0 && (
            <div style={{ background: 'var(--tv-surface)', borderRadius: 10, padding: '14px', textAlign: 'center', marginBottom: 12 }}>
              <MS name="shopping_cart" size={24} style={{ color: 'var(--tv-success)' }} />
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>Sin grupos de opciones</div>
              <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 4 }}>
                Se agrega directo al carrito. Si tiene tamaños o extras, agrégalos abajo.
              </div>
            </div>
          )}

          {/* Ajuste 10: solo primer grupo expandido */}
          {groups.map((g, i) => (
            <ModifierGroupCard key={g.id} group={g} index={i} total={groups.length} isExpanded={i === 0} />
          ))}

          {/* Ajuste 8: botón naranja outline */}
          <AddGroupButton />

          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--tv-ink-muted)', lineHeight: 1.5 }}>
            Ejemplos: "Tamaño" (obligatorio, 1 opción), "Extras" (opcional, hasta 5).
          </div>
        </div>

        {/* C: Price warning */}
        <PriceWarningCard item={item} />

        {groups.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <PriceLivePreview item={item} />
          </div>
        )}

        {/* Ajuste 5: Zona de peligro al final */}
        <div style={{ marginTop: 20 }}>
          <DangerZone itemName={item.name} />
        </div>
      </div>

      {/* Sticky CTA — solo Guardar (ajuste 5) */}
      <div style={{ background: '#fff', borderTop: '1px solid var(--tv-border)', padding: '12px 14px 14px', boxShadow: '0 -8px 24px rgba(0,0,0,0.06)' }}>
        <button className="tv-btn tv-btn-brand tv-btn-block tv-btn-lg">
          <MS name="save" size={20} filled /> Guardar cambios
        </button>
      </div>
    </div>
  );
}

// ── DESKTOP EDITOR ────────────────────────────────────────────────────────────
function ItemEditorDesktop({ item, hasUnsaved = true }) {
  const groups = item.modifierGroups;
  const counts = {
    pedidos:  window.ORDERS.filter(o => o.state === 'pending_acceptance').length,
    efectivo: window.CASH_SETTLEMENTS.filter(s => s.state === 'pending_confirmation').length,
  };

  // Ajuste 6: title with unsaved dot
  const editTitle = (
    <span>
      {item.id === 'new' ? 'Nuevo plato' : `Editar · ${item.name}`}
      {hasUnsaved && <UnsavedDot />}
    </span>
  );

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--tv-surface)' }}>
      <DesktopSidebar active="menu" counts={counts} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Ajuste 5: solo Guardar en topbar */}
        <div className="tv-glass" style={{ position: 'sticky', top: 0, zIndex: 8, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="tv-display" style={{ fontSize: 22, lineHeight: 1.1, display: 'flex', alignItems: 'center' }}>
              {item.id === 'new' ? 'Nuevo plato' : `Editar · ${item.name}`}
              {hasUnsaved && <UnsavedDot />}
            </div>
            <div style={{ fontSize: 13, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
              Menú · {PRIAMO_CATEGORIES.find(c => c.id === item.categoryId)?.name || 'Pizzas'}
            </div>
          </div>
          {/* Only Guardar in topbar */}
          <button className="tv-btn tv-btn-brand">
            <MS name="save" size={18} filled /> Guardar cambios
          </button>
        </div>

        <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto', display: 'grid', gridTemplateColumns: '680px 1fr', gap: 20, alignItems: 'flex-start' }}>

          {/* Left: form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* A: Info básica */}
            <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: '1px solid var(--tv-border)' }}>
              <div className="tv-label" style={{ marginBottom: 14 }}>A · INFORMACIÓN BÁSICA</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, alignItems: 'flex-start' }}>
                <div>
                  <label className="tv-label-input">FOTO</label>
                  <div style={{ background: 'var(--tv-surface)', borderRadius: 12, border: '1.5px dashed var(--tv-border)', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <div className="tv-ph" style={{ width: '100%', height: 100, borderRadius: 10 }}><span>480×480</span></div>
                    <button className="tv-btn tv-btn-ghost tv-btn-sm tv-btn-block"><MS name="upload" size={14} /> Subir foto</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label className="tv-label-input">NOMBRE</label>
                    <div className="tv-input" style={{ fontSize: 15, fontWeight: 600 }}>{item.name}</div>
                  </div>
                  <div>
                    <label className="tv-label-input">DESCRIPCIÓN (OPCIONAL)</label>
                    <textarea className="tv-input" style={{ minHeight: 56, resize: 'none', lineHeight: 1.5, fontSize: 13 }} defaultValue={item.description} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label className="tv-label-input">CATEGORÍA</label>
                      <div className="tv-input" style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ flex: 1, fontSize: 13 }}>{PRIAMO_CATEGORIES.find(c => c.id === item.categoryId)?.name}</span>
                        <MS name="expand_more" size={16} style={{ color: 'var(--tv-ink-muted)' }} />
                      </div>
                    </div>
                    <div>
                      <label className="tv-label-input">PRECIO BASE (S/)</label>
                      <div className="tv-input tv-mono" style={{ fontSize: 16, fontWeight: 700 }}>{item.price.toFixed(2)}</div>
                    </div>
                    <div>
                      <label className="tv-label-input">PREP (MIN)</label>
                      <div className="tv-input tv-mono">{item.prepTime || 'Default'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { label: 'Disponible', on: item.available },
                      { label: 'Destacado',  on: item.featured },
                    ].map((t, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--tv-surface)', borderRadius: 10, padding: '8px 12px' }}>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{t.label}</span>
                        <button style={{ width: 38, height: 22, borderRadius: 999, background: t.on ? 'var(--tv-brand)' : 'var(--tv-ink-subtle)', border: 'none', cursor: 'pointer', position: 'relative' }}>
                          <span style={{ position: 'absolute', top: 2, left: t.on ? 18 : 2, width: 18, height: 18, borderRadius: 999, background: '#fff' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* B: Modifier groups */}
            <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: '1px solid var(--tv-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div className="tv-label" style={{ flex: 1 }}>B · GRUPOS DE OPCIONES</div>
                <span className="tv-chip">{groups.length} grupo{groups.length !== 1 ? 's' : ''}</span>
                {groups.length === 0 && (
                  <span style={{ background: 'var(--tv-success-soft)', color: '#166634', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }}>Directo al carrito</span>
                )}
              </div>

              {groups.length === 0 && (
                <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '16px', textAlign: 'center', marginBottom: 14, border: '1px solid var(--tv-border)' }}>
                  <MS name="shopping_cart" size={28} style={{ color: 'var(--tv-success)' }} />
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>Sin modificadores</div>
                  <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 4, maxWidth: 320, margin: '4px auto 0' }}>
                    Se agrega al carrito sin abrir ningún modal. Ideal para bebidas y platos simples.
                  </div>
                </div>
              )}

              {/* Ajuste 10: first expanded only */}
              {groups.map((g, i) => (
                <ModifierGroupCard key={g.id} group={g} index={i} total={groups.length} isExpanded={i === 0} />
              ))}

              {/* Ajuste 8: orange outline button */}
              <AddGroupButton />

              <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--tv-surface)', borderRadius: 10, fontSize: 12, color: 'var(--tv-ink-muted)', lineHeight: 1.5 }}>
                <strong>Default al crear un grupo:</strong> "Obligatorio, elegir 1". Los grupos se evalúan en orden para el cliente.
              </div>
            </div>

            <PriceWarningCard item={item} />
            {groups.length > 0 && <PriceLivePreview item={item} />}

            {/* Ajuste 5: Danger zone al final del form */}
            <DangerZone itemName={item.name} />
          </div>

          {/* Right: auto-save + quick preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Auto-save — ajuste 6 */}
            <div style={{
              background: '#fff', borderRadius: 14, padding: '12px 14px',
              border: '1px solid var(--tv-border)', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {hasUnsaved ? (
                <>
                  <MS name="edit_note" size={18} style={{ color: 'var(--tv-warning)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>Cambios sin guardar</div>
                    <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 1 }}>Presiona "Guardar cambios" para confirmar</div>
                  </div>
                </>
              ) : (
                <>
                  <MS name="cloud_done" size={18} style={{ color: 'var(--tv-success)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Borrador guardado</div>
                    <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 1 }}>Hace 2 min · automático</div>
                  </div>
                </>
              )}
            </div>

            {/* Quick preview */}
            <div style={{ background: '#fff', borderRadius: 14, padding: '14px', border: '1px solid var(--tv-border)' }}>
              <div className="tv-label" style={{ marginBottom: 10 }}>VISTA RÁPIDA · CLIENTE</div>
              <div className="tv-ph" style={{ width: '100%', height: 120, borderRadius: 12, marginBottom: 10 }}>
                <span>Foto del plato</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{item.name}</div>
              {item.description && (
                <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginBottom: 8, lineHeight: 1.4 }}>{item.description.slice(0, 80)}{item.description.length > 80 ? '…' : ''}</div>
              )}
              <div className="tv-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--tv-brand)' }}>
                {itemMinPrice(item) !== itemMaxPrice(item) ? `Desde ${soles(itemMinPrice(item))}` : soles(itemMinPrice(item))}
              </div>
              {groups.length === 0 ? (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--tv-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MS name="check_circle" size={12} filled /> Directo al carrito
                </div>
              ) : (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--tv-info)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MS name="tune" size={12} /> Abre modal de opciones
                </div>
              )}
              <button className="tv-btn tv-btn-ghost tv-btn-sm tv-btn-block" style={{ marginTop: 12 }}>
                <MS name="open_in_full" size={14} /> Abrir preview completo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  ItemEditorMobile, ItemEditorDesktop,
  ModifierGroupCard, ModifierOptionRow,
  PriceWarningCard, PriceLivePreview,
  DangerZone, AddGroupButton,
  ConfirmDeleteModal, UnsavedChangesModal, GroupRuleSelector,
});
