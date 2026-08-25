// pedidos-detail.jsx — Pantalla detalle + modal rechazo
// Abre al tocar cualquier card. Muestra info completa + secciones de pago + acciones.

// ── Payment section variants ──────────────────────────────────────────────────
function PaySectionCash({ order }) {
  return (
    <div style={{ background: '#F0FDF4', borderRadius: 12, padding: '12px 14px', border: '1px solid #BBF7D0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <MS name="payments" size={18} filled style={{ color: '#16A34A' }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Pago en efectivo</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Row label="Total a cobrar" value={soles(order.total || order.amount || 0)} mono bold />
        {order.paysWith && <Row label="Cliente paga con" value={soles(order.paysWith)} mono />}
        {order.cashChange > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#DCFCE7', borderRadius: 8, padding: '6px 10px', marginTop: 4,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>Vuelto a preparar</span>
            <span className="tv-mono" style={{ fontSize: 16, fontWeight: 700, color: '#15803D' }}>
              {soles(order.cashChange)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function PaySectionWallet({ order }) {
  return (
    <div style={{ background: '#F5F3FF', borderRadius: 12, padding: '12px 14px', border: '1px solid #DDD6FE' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <MS name="qr_code_2" size={18} filled style={{ color: '#7C3AED' }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: '#5B21B6' }}>Cobrar con billetera digital</div>
      </div>
      <Row label="Total a cobrar" value={soles(order.total || 0)} mono bold />
      <div style={{ marginTop: 10, background: '#fff', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tv-ink-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          QR del restaurante
        </div>
        <div className="tv-ph" style={{ width: 90, height: 90, borderRadius: 10, margin: '0 auto 8px' }}>
          <span style={{ fontSize: 10 }}>QR Yape/Plin</span>
        </div>
        <button className="tv-btn tv-btn-ghost tv-btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
          <MS name="share" size={13} /> Compartir por WhatsApp
        </button>
      </div>
    </div>
  );
}

function PaySectionPrepaid({ order, verified, onVerify, onReject }) {
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: verified ? '1.5px solid #4ADE80' : '1px solid #E0F2FE' }}>
      <div style={{
        padding: '10px 14px', background: verified ? '#F0FDF4' : '#E0F2FE',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <MS name={verified ? 'verified' : 'schedule'} size={18} filled style={{ color: verified ? '#16A34A' : '#0369A1' }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: verified ? '#166534' : '#0C4A6E' }}>
          {verified ? 'Pago verificado ✓' : 'Verificar comprobante de pago'}
        </div>
      </div>
      <div style={{ padding: '12px 14px', background: '#fff' }}>
        <Row label="Total pagado" value={soles(order.total || 0)} mono bold />
        <div style={{ marginTop: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginBottom: 6, fontWeight: 600 }}>COMPROBANTE DEL CLIENTE</div>
          <div className="tv-ph" style={{ width: '100%', height: 130, borderRadius: 10, position: 'relative' }}>
            <span>Captura de pantalla de Yape / transferencia</span>
            {verified && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(22,163,74,0.15)',
                borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <MS name="check_circle" size={40} filled style={{ color: '#16A34A' }} />
              </div>
            )}
          </div>
        </div>
        {!verified && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={onReject} className="tv-btn tv-btn-sm" style={{ border: '1.5px solid #FCA5A5', background: '#FFF5F5', color: '#DC2626' }}>
              <MS name="cancel" size={14} /> Inválido
            </button>
            <button onClick={onVerify} className="tv-btn tv-btn-sm" style={{ background: '#16A34A', color: '#fff', border: 'none' }}>
              <MS name="check_circle" size={14} /> Correcto
            </button>
          </div>
        )}
        {verified && (
          <div style={{ fontSize: 12, color: '#15803D', fontWeight: 600, textAlign: 'center' }}>
            Comprobante verificado · puedes aceptar el pedido
          </div>
        )}
      </div>
    </div>
  );
}

function PaySectionMixed({ order }) {
  return (
    <div style={{ background: '#FFFBEB', borderRadius: 12, padding: '12px 14px', border: '1px solid #FDE68A' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <MS name="shuffle" size={18} filled style={{ color: '#B45309' }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>Pago combinado</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Row label="Billetera digital" value={soles(order.walletPart || 0)} mono />
        <Row label="Efectivo" value={soles(order.cashPart || 0)} mono />
        <div style={{ height: 1, background: 'var(--tv-border)', margin: '2px 0' }} />
        <Row label="Total" value={soles(order.total || 0)} mono bold />
        {order.paysWith && <Row label="Cliente paga efectivo con" value={soles(order.paysWith)} mono />}
        {order.cashChange > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#D1FAE5', borderRadius: 8, padding: '6px 10px', marginTop: 4,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>Vuelto (efectivo)</span>
            <span className="tv-mono" style={{ fontSize: 15, fontWeight: 700, color: '#15803D' }}>
              {soles(order.cashChange)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
      <span style={{ color: 'var(--tv-ink-muted)' }}>{label}</span>
      <span className={mono ? 'tv-mono' : ''} style={{ fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

// ── Reject modal ──────────────────────────────────────────────────────────────
function RejectModal({ order, onClose, onConfirm, isPrepaid = false }) {
  const reasons = [
    'Producto agotado',
    'Restaurante cerrado / fuera de horario',
    'Dirección fuera de zona de cobertura',
    ...(isPrepaid ? ['Comprobante de pago inválido'] : []),
    'Cliente no responde llamada',
    'Otro',
  ];
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 18px 28px',
        width: '100%', maxWidth: 440,
        boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: 'var(--tv-danger-soft)', color: 'var(--tv-danger)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MS name="cancel" size={20} filled />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Rechazar pedido</div>
            <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 1 }}>
              #{order?.id} · {order?.customer}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(26,22,20,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MS name="close" size={16} />
          </button>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tv-ink-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Motivo del rechazo
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {reasons.map((r, i) => (
            <button key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10,
              background: i === 0 ? 'var(--tv-ink)' : 'var(--tv-surface)',
              color: i === 0 ? '#fff' : 'var(--tv-ink)',
              border: 'none', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', fontSize: 13,
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: 999, border: `2px solid ${i === 0 ? '#fff' : 'var(--tv-border)'}`,
                background: i === 0 ? '#fff' : 'transparent', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {i === 0 && <div style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--tv-ink)' }} />}
              </div>
              {r}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={onClose} className="tv-btn tv-btn-ghost">Cancelar</button>
          <button onClick={onConfirm} className="tv-btn" style={{ background: 'var(--tv-danger)', color: '#fff', border: 'none' }}>
            Confirmar rechazo
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail screen ─────────────────────────────────────────────────────────────
function DetailScreen({ order, onClose, mobile = false, showRejectModal = false, proofVerified = false }) {
  if (!order) return null;
  const isPending = order.state === 'pending_acceptance';
  const isPrepaid = order.payment === 'prepaid';
  const isOnline  = order.source === 'web';
  const total     = order.total || order.amount || 0;

  // Disabled accept for prepaid if not verified
  const acceptDisabled = isPrepaid && !proofVerified;

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', position: 'relative' }}>
      {showRejectModal && (
        <RejectModal
          order={order}
          isPrepaid={isPrepaid}
          onClose={() => {}}
          onConfirm={() => {}}
        />
      )}

      {/* Header */}
      <div style={{
        padding: mobile ? '10px 14px' : '12px 18px',
        borderBottom: '1px solid var(--tv-border)',
        position: 'sticky', top: 0, background: '#fff', zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {mobile && (
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(26,22,20,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MS name="arrow_back" size={20} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 3 }}>
            <span className="tv-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--tv-ink-muted)' }}>#{order.id}</span>
            {isPending && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 11, color: 'var(--tv-ink-muted)' }}>· acepta antes de</span>
                <span className="tv-mono" style={{ fontSize: 12, fontWeight: 700, color: order.countdownSec < 60 ? 'var(--tv-danger)' : 'var(--tv-ink)' }}>
                  {mmss(order.countdownSec)}
                </span>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SourceBadgeMini source={order.source} />
            <PayBadgeMini payment={order.payment} />
          </div>
        </div>
        <span className="tv-mono" style={{ fontSize: mobile ? 18 : 20, fontWeight: 700, color: 'var(--tv-ink)', flexShrink: 0 }}>
          {soles(total)}
        </span>
        {!mobile && (
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(26,22,20,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MS name="close" size={18} />
          </button>
        )}
      </div>

      {/* Driver arrived banner */}
      {order.state === 'waiting' && (
        <div style={{ background: '#16A34A', color: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <MS name="check_circle" size={20} filled />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{order.driver?.name} llegó al local · Entregar pedido</div>
            {order.cashChange > 0 && (
              <div style={{ fontSize: 12, marginTop: 2 }}>
                Prepara el vuelto: <span className="tv-mono" style={{ fontWeight: 700 }}>{soles(order.cashChange)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scroll content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: mobile ? '14px 14px 20px' : '16px 18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Customer */}
        <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tv-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>Cliente</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 5 }}>{order.customer || 'Cliente'}</div>
          {order.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <a href={`tel:${order.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--tv-brand)', textDecoration: 'none', fontWeight: 600 }}>
                <MS name="call" size={15} filled /> {order.phone}
              </a>
            </div>
          )}
        </div>

        {/* Address */}
        {order.addressRef && (
          <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tv-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>Dirección</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <MS name="location_on" size={16} style={{ color: 'var(--tv-brand)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>{order.addressRef}</div>
            </div>
            <div className="tv-ph" style={{ width: '100%', height: 90, borderRadius: 10, marginTop: 10 }}>
              <span>Mapa estático · OpenStreetMap</span>
            </div>
          </div>
        )}

        {/* Items (Online only) */}
        {isOnline && order.items && order.items.length > 0 && (
          <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tv-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>Pedido</div>
            {order.items.map((it, i) => (
              <div key={i} style={{ padding: '7px 0', borderBottom: i < order.items.length - 1 ? '1px solid var(--tv-border)' : 'none' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span className="tv-mono" style={{ color: 'var(--tv-ink-muted)', width: 22, flexShrink: 0, fontWeight: 700 }}>{it.qty}×</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{it.name}</div>
                    {it.mods && <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>{it.mods}</div>}
                    {it.note && (
                      <div style={{ fontSize: 12, color: '#B45309', marginTop: 2 }}>
                        <MS name="info" size={11} /> {it.note}
                      </div>
                    )}
                  </div>
                  <span className="tv-mono" style={{ fontSize: 13, fontWeight: 600, flexShrink: 0, color: 'var(--tv-ink-muted)' }}>{soles(it.price)}</span>
                </div>
              </div>
            ))}
            {/* Subtotals */}
            <div style={{ marginTop: 10, padding: '8px 0 0', borderTop: '1px solid var(--tv-border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Row label="Subtotal" value={soles(order.subtotal || 0)} mono />
              <Row label="Delivery" value={soles(order.deliveryFee || 3)} mono />
              <Row label="Total" value={soles(order.total || 0)} mono bold />
            </div>
          </div>
        )}

        {/* Directo: solo desglose de cobro */}
        {!isOnline && (
          <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tv-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Cobro</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Row label="Total del pedido" value={soles(order.amount || order.subtotal || total)} mono />
              <Row label="Delivery" value={soles(order.deliveryFee || 3)} mono />
              <div style={{ height: 1, background: 'var(--tv-border)', margin: '2px 0' }} />
              <Row label="Total a cobrar" value={soles(total)} mono bold />
            </div>
          </div>
        )}

        {/* Payment section */}
        {order.payment === 'pending_cash'   && <PaySectionCash order={order} />}
        {order.payment === 'pending_wallet' && <PaySectionWallet order={order} />}
        {order.payment === 'prepaid'        && <PaySectionPrepaid order={order} verified={proofVerified} onVerify={() => {}} onReject={() => {}} />}
        {order.payment === 'pending_mixed'  && <PaySectionMixed order={order} />}

        {/* Cooking extension if applicable */}
        {order.state === 'cooking' && !order.extensionUsed && (
          <div style={{ background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>¿Necesitas más tiempo?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="tv-btn tv-btn-ghost tv-btn-sm" style={{ flex: 1 }}>
                <MS name="add" size={14} /> +5 min
              </button>
              <button className="tv-btn tv-btn-ghost tv-btn-sm" style={{ flex: 1 }}>
                <MS name="add" size={14} /> +10 min
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 6 }}>Solo disponible una vez y antes de que llegue el motorizado.</div>
          </div>
        )}
        {order.state === 'cooking' && order.extensionUsed && (
          <div style={{ fontSize: 12, color: 'var(--tv-warning)', fontWeight: 600, textAlign: 'center', padding: '4px 0' }}>
            Prórroga +{order.extensionMin}m usada · no se puede volver a extender
          </div>
        )}

        {/* Buffer p3: call driver button */}
        {order.state === 'buffer_p3' && (
          <button className="tv-btn tv-btn-sm tv-btn-block" style={{ background: 'var(--tv-danger)', color: '#fff', border: 'none' }}>
            <MS name="call" size={15} /> Llamar a un motorizado manualmente
          </button>
        )}

        {/* Otras acciones */}
        <div style={{ borderRadius: 12, padding: '12px 14px', border: '1px solid var(--tv-border)', background: 'var(--tv-surface)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tv-ink-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Otras acciones</div>
          <button className="tv-btn tv-btn-sm tv-btn-block" style={{ background: 'transparent', border: '1.5px solid var(--tv-danger)', color: 'var(--tv-danger)' }}>
            <MS name="cancel" size={14} /> Cancelar este pedido
          </button>
        </div>
      </div>

      {/* Pending actions (sticky bottom) */}
      {isPending && (
        <div style={{
          background: '#fff', borderTop: '1px solid var(--tv-border)',
          padding: '12px 14px 14px',
          boxShadow: '0 -6px 20px rgba(0,0,0,0.06)',
          display: 'flex', gap: 10,
        }}>
          <button className="tv-btn tv-btn-ghost" style={{ flex: 1, color: 'var(--tv-danger)' }}>
            <MS name="close" size={18} /> Rechazar
          </button>
          <button
            className="tv-btn tv-btn-brand"
            style={{ flex: 2, opacity: acceptDisabled ? 0.5 : 1, cursor: acceptDisabled ? 'not-allowed' : 'pointer' }}
          >
            <MS name="check" size={18} filled />
            {acceptDisabled ? 'Verifica el comprobante' : 'Aceptar pedido'}
          </button>
        </div>
      )}
    </div>
  );

  if (mobile) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: '#fff' }}>
        {content}
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 50,
      width: 380, background: '#fff',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.1)',
    }}>
      {content}
    </div>
  );
}

// ── Cancel modal (pedido ya aceptado) ───────────────────────────────────────
function CancelModal({ order, onClose, onConfirm }) {
  const reasons = [
    'Producto agotado',
    'Cliente canceló por teléfono',
    'Dirección incorrecta o imposible',
    'Restaurante no puede continuar',
    'Sin motorizado disponible después de mucho tiempo',
    'Otro',
  ];
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 18px 28px',
        width: '100%', maxWidth: 440, boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: 'var(--tv-danger-soft)', color: 'var(--tv-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MS name="cancel" size={20} filled />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Cancelar pedido</div>
            <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 1 }}>#{order?.id} · {order?.customer}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(26,22,20,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MS name="close" size={16} />
          </button>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tv-ink-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Motivo</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {reasons.map((r, i) => (
            <button key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10,
              background: i === 0 ? 'var(--tv-ink)' : 'var(--tv-surface)',
              color: i === 0 ? '#fff' : 'var(--tv-ink)',
              border: 'none', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', fontSize: 13,
            }}>
              <div style={{ width: 16, height: 16, borderRadius: 999, border: `2px solid ${i === 0 ? '#fff' : 'var(--tv-border)'}`, background: i === 0 ? '#fff' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {i === 0 && <div style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--tv-ink)' }} />}
              </div>
              {r}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={onClose} className="tv-btn tv-btn-ghost">Cancelar acción</button>
          <button onClick={onConfirm} className="tv-btn" style={{ background: 'var(--tv-danger)', color: '#fff', border: 'none' }}>Confirmar cancelación</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DetailScreen, RejectModal, CancelModal, PaySectionCash, PaySectionWallet, PaySectionPrepaid, PaySectionMixed });
