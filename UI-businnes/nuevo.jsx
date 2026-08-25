// + Pedido manual — Mobile + Desktop (v2)
// Decisiones de producto respetadas:
//   · Sin selección de platos — solo monto total
//   · Un solo campo "Dirección o referencia" (textarea, máx 500 chars)
//   · Pagos: prepaid / pending_wallet / pending_cash (default) / pending_mixed
//   · Vuelto automático, muy visible
//   · Presets 10-50×5, default 20
//   · Teléfono: opcional, pero si se llena → ^9\d{8}$
//   · Mixto: wallet + cash = total exacto

function PrepPicker({ selected = 20, onChange }) {
  const presets = window.PREP_PRESETS;
  return (
    <div>
      <label className="tv-label-input">TIEMPO DE PREPARACIÓN</label>
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none',
        padding: '2px 0 6px',
      }}>
        {presets.map(m => (
          <button key={m}
            onClick={() => onChange && onChange(m)}
            style={{
              flexShrink: 0, minWidth: 52,
              border: m === selected ? 'none' : '1px solid var(--tv-border)',
              background: m === selected ? 'var(--tv-ink)' : '#fff',
              color: m === selected ? '#fff' : 'var(--tv-ink)',
              fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 14,
              padding: '10px 0', borderRadius: 12, cursor: 'pointer',
              textAlign: 'center',
            }}>
            {m}m
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
        El motorizado llegará ~{selected + 5}–{selected + 15} min desde ahora.
      </div>
    </div>
  );
}

function PaymentPicker({ selected = 'pending_cash', onChange }) {
  const opts = [
    { id: 'pending_cash',   icon: 'payments',   label: 'Efectivo',        sub: 'El motorizado cobra en efectivo' },
    { id: 'pending_wallet', icon: 'qr_code_2',  label: 'Billetera digital', sub: 'Yape, Plin u otra — el moto muestra QR' },
    { id: 'prepaid',        icon: 'verified',   label: 'Ya pagó',         sub: 'El cliente ya realizó la transferencia' },
    { id: 'pending_mixed',  icon: 'shuffle',    label: 'Mixto',           sub: 'Una parte con billetera, otra en efectivo' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {opts.map(o => (
        <button key={o.id}
          onClick={() => onChange && onChange(o.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
            background: '#fff', fontFamily: 'inherit', textAlign: 'left',
            border: selected === o.id ? '2px solid var(--tv-ink)' : '1px solid var(--tv-border)',
          }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: selected === o.id ? 'var(--tv-ink)' : 'rgba(26,22,20,0.06)',
            color: selected === o.id ? '#fff' : 'var(--tv-ink)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MS name={o.icon} size={20} filled={selected === o.id} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{o.label}</div>
            <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 2 }}>{o.sub}</div>
          </div>
          {selected === o.id && <MS name="check_circle" size={20} filled style={{ color: 'var(--tv-brand)' }} />}
        </button>
      ))}
    </div>
  );
}

// Muestra vuelto en verde llamativo
function ChangeDisplay({ change }) {
  if (!change || change <= 0) return null;
  return (
    <div style={{
      background: '#DCFCE7', color: '#14532D', borderRadius: 14,
      padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <MS name="shopping_bag" size={22} filled style={{ color: '#16A34A', flexShrink: 0, marginTop: 2 }} />
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>
          Vuelto a entregar al driver: <span className="tv-mono">{soles(change)}</span>
        </div>
        <div style={{ fontSize: 12, color: '#166534' }}>
          Prepáralo en efectivo y mételo en la bolsa antes de que llegue el motorizado.
        </div>
      </div>
    </div>
  );
}

// ── MOBILE ────────────────────────────────────────────────────────────────────
function NewOrderMobile() {
  // Mock state — payment selected + amounts filled
  const payment = 'pending_cash';
  const amount = 52;
  const paysWith = 60;
  const change = paysWith - amount; // 8

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--tv-surface)' }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px 12px', background: '#fff',
        borderBottom: '1px solid var(--tv-border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button style={{
          width: 40, height: 40, borderRadius: 12,
          background: 'rgba(26,22,20,0.06)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MS name="arrow_back" size={22} />
        </button>
        <div style={{ flex: 1 }}>
          <div className="tv-display" style={{ fontSize: 18, lineHeight: 1.1 }}>Solicitar motorizado</div>
          <div className="tv-label" style={{ marginTop: 2 }}>PEDIDO POR TELÉFONO</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 120px' }}>

  

        {/* 1. Prep time */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--tv-border)' }}>
          <PrepPicker selected={20} />
        </div>

        {/* 2. Cliente */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--tv-border)' }}>
          <div className="tv-label" style={{ marginBottom: 10 }}>DATOS DEL CLIENTE</div>
          <div style={{ marginBottom: 10 }}>
            <label className="tv-label-input">NOMBRE (OPCIONAL)</label>
            <div className="tv-input" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MS name="person" size={18} style={{ color: 'var(--tv-ink-muted)' }} />
              <span style={{ fontSize: 15 }}>María Quispe</span>
            </div>
          </div>
          <div>
            <label className="tv-label-input">TELÉFONO (OPCIONAL)</label>
            <div className="tv-input" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tv-ink-muted)', fontFamily: 'JetBrains Mono, monospace' }}>+51</span>
              <span className="tv-mono" style={{ fontSize: 15, flex: 1 }}>987 234 561</span>
              <MS name="check_circle" size={16} filled style={{ color: 'var(--tv-success)' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 4 }}>
              Si llenas este campo, debe tener 9 dígitos y empezar por 9.
            </div>
          </div>
        </div>

        {/* 3. Dirección o referencia — UN SOLO CAMPO */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--tv-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div className="tv-label" style={{ flex: 1 }}>DIRECCIÓN O REFERENCIA</div>
            <span style={{ fontSize: 11, color: 'var(--tv-ink-muted)', fontFamily: 'JetBrains Mono, monospace' }}>62/500</span>
          </div>
          <textarea className="tv-input" style={{ minHeight: 80, resize: 'none', lineHeight: 1.5 }}
            defaultValue="Jr. San Martín 245 — Casa azul, al lado de la bodega Lucy" />
          <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 4 }}>
            El motorizado verá este texto en su app al recoger el pedido.
          </div>
        </div>

        {/* 4. Pago */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--tv-border)' }}>
          <div className="tv-label" style={{ marginBottom: 10 }}>MÉTODO DE PAGO</div>
          <PaymentPicker selected={payment} />
        </div>

        {/* 5. Monto + vuelto (solo si no es prepaid) */}
        {payment !== 'prepaid' && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--tv-border)' }}>
            <div className="tv-label" style={{ marginBottom: 10 }}>MONTO DEL PEDIDO</div>
            <div>
              <label className="tv-label-input">TOTAL DEL PEDIDO (S/)</label>
              <div className="tv-input tv-mono" style={{ fontSize: 20, fontWeight: 700 }}>52.00</div>
            </div>

            {/* cash breakdown si es mixto — aquí mostramos solo cash como ejemplo */}
            {payment === 'pending_mixed' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <label className="tv-label-input">BILLETERA (S/)</label>
                  <div className="tv-input tv-mono">20.00</div>
                </div>
                <div>
                  <label className="tv-label-input">EFECTIVO (S/)</label>
                  <div className="tv-input tv-mono">25.00</div>
                </div>
                <div style={{ gridColumn: '1/-1', fontSize: 12, color: 'var(--tv-success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MS name="check_circle" size={14} filled /> S/20 + S/25 = S/45 · suma correcta
                </div>
              </div>
            )}

            {/* Cliente paga con (si incluye efectivo) */}
            {(payment === 'pending_cash' || payment === 'pending_mixed') && (
              <div style={{ marginTop: 10 }}>
                <label className="tv-label-input">CLIENTE PAGA CON (S/)</label>
                <div className="tv-input tv-mono" style={{ fontSize: 20, fontWeight: 700 }}>60.00</div>
              </div>
            )}

            {(payment === 'pending_cash' || payment === 'pending_mixed') && change > 0 && (
              <div style={{ marginTop: 12 }}>
                <ChangeDisplay change={change} />
              </div>
            )}
          </div>
        )}

        {payment === 'prepaid' && (
          <div style={{
            background: '#E0F2FE', color: '#0369A1', borderRadius: 12, padding: '10px 14px',
            display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, fontSize: 13,
          }}>
            <MS name="verified" size={18} filled />
            <span>El cliente ya pagó — el motorizado solo entrega, no cobra.</span>
          </div>
        )}
      </div>

      {/* Sticky bottom CTA */}
      <div style={{
        background: '#fff', borderTop: '1px solid var(--tv-border)',
        padding: '12px 14px 14px',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.06)',
      }}>
        {change > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            background: '#DCFCE7', borderRadius: 10, padding: '8px 12px',
          }}>
            <MS name="payments" size={16} filled style={{ color: '#16A34A' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>
              Prepara vuelto de {soles(change)}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="tv-label" style={{ fontSize: 10 }}>TOTAL · efectivo</div>
            <div className="tv-mono" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, marginTop: 4 }}>{soles(amount)}</div>
          </div>
        </div>
        <button className="tv-btn tv-btn-brand tv-btn-block tv-btn-xl">
          <MS name="two_wheeler" size={22} filled /> Pedir moto
        </button>
      </div>
    </div>
  );
}

// ── DESKTOP ───────────────────────────────────────────────────────────────────
function NewOrderDesktop() {
  const payment = 'pending_mixed';
  const amount = 45;
  const walletPart = 20, cashPart = 25;
  const paysWith = 30;
  const change = paysWith - cashPart; // 5

  const counts = {
    pedidos: window.ORDERS.filter(o => o.state === 'pending_acceptance').length,
    efectivo: window.CASH_SETTLEMENTS.filter(s => s.state === 'pending_confirmation').length,
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--tv-surface)' }}>
      <DesktopSidebar active="add" counts={counts} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <DesktopTopBar
          title="Solicitar motorizado"
          subtitle="Pedido tomado por teléfono · el motorizado recoge y entrega"
        />

        <div style={{ flex: 1, padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, overflowY: 'auto', alignItems: 'flex-start' }}>
          {/* Left — form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>



            {/* 1 · Prep time */}
            <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: '1px solid var(--tv-border)' }}>
              <div className="tv-label" style={{ marginBottom: 12 }}>1 · TIEMPO DE PREPARACIÓN</div>
              <PrepPicker selected={20} />
            </div>

            {/* 2 · Cliente */}
            <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: '1px solid var(--tv-border)' }}>
              <div className="tv-label" style={{ marginBottom: 12 }}>2 · DATOS DEL CLIENTE (OPCIONALES)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="tv-label-input">NOMBRE</label>
                  <div className="tv-input">Diego Tapia</div>
                </div>
                <div>
                  <label className="tv-label-input">TELÉFONO</label>
                  <div style={{ position: 'relative' }}>
                    <div className="tv-input tv-mono" style={{ paddingLeft: 44 }}>978 220 901</div>
                    <span style={{
                      position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                      fontSize: 13, fontWeight: 600, color: 'var(--tv-ink-muted)', fontFamily: 'JetBrains Mono, monospace',
                    }}>+51</span>
                    <MS name="check_circle" size={16} filled style={{ color: 'var(--tv-success)', position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 4 }}>
                    9 dígitos, empezando por 9
                  </div>
                </div>
              </div>
            </div>

            {/* 3 · Dirección — UN SOLO CAMPO textarea */}
            <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: '1px solid var(--tv-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div className="tv-label" style={{ flex: 1 }}>3 · DIRECCIÓN O REFERENCIA (OPCIONAL)</div>
                <span style={{ fontSize: 11, color: 'var(--tv-ink-muted)', fontFamily: 'JetBrains Mono, monospace' }}>45/500</span>
              </div>
              <textarea className="tv-input" style={{ minHeight: 80, resize: 'none', lineHeight: 1.5 }}
                defaultValue="Av. Industrial 2045" />
              <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 6 }}>
                Un solo campo libre — el motorizado recibe esta indicación en su app al recoger el pedido.
              </div>
            </div>

            {/* 4 · Pago */}
            <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: '1px solid var(--tv-border)' }}>
              <div className="tv-label" style={{ marginBottom: 12 }}>4 · MÉTODO DE PAGO</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { id: 'pending_cash',   icon: 'payments',  label: 'Efectivo',        sub: 'El moto cobra en efectivo' },
                  { id: 'pending_wallet', icon: 'qr_code_2', label: 'Billetera',        sub: 'Yape, Plin, etc.' },
                  { id: 'prepaid',        icon: 'verified',  label: 'Ya pagó',          sub: 'Transferencia previa' },
                  { id: 'pending_mixed',  icon: 'shuffle',   label: 'Mixto',            sub: 'Billetera + Efectivo' },
                ].map(o => (
                  <button key={o.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                    background: '#fff', fontFamily: 'inherit', textAlign: 'left',
                    border: payment === o.id ? '2px solid var(--tv-ink)' : '1px solid var(--tv-border)',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      background: payment === o.id ? 'var(--tv-ink)' : 'rgba(26,22,20,0.06)',
                      color: payment === o.id ? '#fff' : 'var(--tv-ink)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <MS name={o.icon} size={18} filled={payment === o.id} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{o.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 1 }}>{o.sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 5 · Monto + desglose mixto + vuelto */}
            <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: '1px solid var(--tv-border)' }}>
              <div className="tv-label" style={{ marginBottom: 12 }}>5 · MONTO DEL PEDIDO</div>
              <div>
                <label className="tv-label-input">TOTAL DEL PEDIDO (S/)</label>
                <div className="tv-input tv-mono" style={{ fontSize: 20, fontWeight: 700 }}>45.00</div>
                <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 4 }}>
                  No necesitas desglosar los platos. Solo el total que el cliente debe.
                </div>
              </div>

              {/* Mixto breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div>
                  <label className="tv-label-input">PARTE BILLETERA (S/)</label>
                  <div className="tv-input tv-mono" style={{ fontSize: 17, fontWeight: 700 }}>20.00</div>
                </div>
                <div>
                  <label className="tv-label-input">PARTE EFECTIVO (S/)</label>
                  <div className="tv-input tv-mono" style={{ fontSize: 17, fontWeight: 700 }}>25.00</div>
                </div>
              </div>
              <div style={{
                marginTop: 8, padding: '8px 10px', borderRadius: 10,
                background: 'var(--tv-success-soft)', color: '#166534',
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600,
              }}>
                <MS name="check_circle" size={14} filled />
                S/20 + S/25 = S/45 — suma correcta ✓
              </div>

              <div style={{ marginTop: 12 }}>
                <label className="tv-label-input">CLIENTE PAGA EFECTIVO CON (S/)</label>
                <div className="tv-input tv-mono" style={{ fontSize: 17, fontWeight: 700 }}>30.00</div>
              </div>
              <div style={{ marginTop: 12 }}>
                <ChangeDisplay change={change} />
              </div>
            </div>
          </div>

          {/* Right — summary sticky */}
          <div style={{ position: 'sticky', top: 0 }}>
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--tv-border)' }}>
              <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--tv-border)' }}>
                <div className="tv-label">RESUMEN DEL PEDIDO</div>
                <div className="tv-display" style={{ fontSize: 20, marginTop: 4 }}>Diego · Av. Industrial 2045</div>
              </div>
              <div style={{ padding: '12px 18px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {[
                    { label: 'Preparación', val: '20 min' },
                    { label: 'Entrega', val: 'Delivery' },
                    { label: 'Pago', val: 'Billetera + Efectivo' },
                    { label: 'Billetera', val: soles(walletPart) },
                    { label: 'Efectivo', val: soles(cashPart) },
                    { label: 'Cliente paga con', val: soles(paysWith) },
                  ].map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--tv-ink-muted)' }}>{r.label}</span>
                      <span className="tv-mono" style={{ fontWeight: 600 }}>{r.val}</span>
                    </div>
                  ))}
                  <div style={{ height: 1, background: 'var(--tv-border)', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700 }}>
                    <span>Total</span>
                    <span className="tv-mono">{soles(amount)}</span>
                  </div>
                </div>

                {/* Vuelto en el resumen también */}
                {change > 0 && (
                  <div style={{
                    background: '#DCFCE7', borderRadius: 10, padding: '10px 12px',
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                  }}>
                    <MS name="payments" size={18} filled style={{ color: '#16A34A' }} />
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#15803D' }}>
                      Vuelto: {soles(change)}
                    </div>
                  </div>
                )}

                <button className="tv-btn tv-btn-brand tv-btn-block tv-btn-lg">
                  <MS name="two_wheeler" size={20} filled /> Pedir moto
                </button>
                <button className="tv-btn tv-btn-ghost tv-btn-block" style={{ marginTop: 8 }}>
                  Cancelar
                </button>
              </div>
            </div>

            {/* Platform closed notice example */}
            <div style={{
              marginTop: 12, background: 'var(--tv-brand-soft)', borderRadius: 12,
              padding: '10px 14px', fontSize: 12, color: 'var(--tv-brand-dark)',
              display: 'flex', gap: 8,
            }}>
              <MS name="info" size={16} filled />
              <div>El sistema <strong>bloquea automáticamente</strong> la creación de pedidos fuera del horario de la plataforma.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NewOrderMobile, NewOrderDesktop, PrepPicker, PaymentPicker, ChangeDisplay });
