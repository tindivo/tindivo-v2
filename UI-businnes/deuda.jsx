// Deuda — Mobile + Desktop

function AdvanceCard({ a }) {
  const stateMeta = {
    activo: { chip: 'tv-chip-warning', label: 'Activo' },
    disputado: { chip: 'tv-chip-info', label: 'En disputa' },
    cancelado: { chip: 'tv-chip-success', label: 'Anulado' },
  }[a.state];
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: 12,
      border: '1px solid var(--tv-border)', boxShadow: 'var(--tv-elev-1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div className="tv-mono" style={{ fontSize: 18, fontWeight: 700 }}>− {soles(a.amount)}</div>
        <div style={{ flex: 1 }} />
        <span className={`tv-chip ${stateMeta.chip}`}>{stateMeta.label}</span>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.4, marginBottom: 8 }}>{a.reason}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--tv-ink-muted)' }}>
        <MS name="receipt_long" size={12} />
        <span className="tv-mono">#{a.orderId}</span>
        <span>·</span>
        <span>{a.date}</span>
      </div>
      {a.state === 'activo' && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--tv-border)' }}>
          {a.canDispute ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, fontSize: 11, color: 'var(--tv-ink-muted)' }}>
                Ventana de disputa: <strong style={{ color: 'var(--tv-ink)' }}>{a.hoursLeft}h</strong> restantes
              </div>
              <button className="tv-btn tv-btn-dark tv-btn-sm">
                <MS name="gavel" size={14} /> Disputar
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--tv-ink-subtle)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <MS name="lock" size={12} />
              Ventana de disputa (48 h) vencida
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SettlementHistoryRow({ s }) {
  const stateMeta = {
    paid: { chip: 'tv-chip-success', label: 'Pagado' },
    pending: { chip: 'tv-chip-warning', label: 'Por pagar' },
    overdue: { chip: 'tv-chip-danger', label: 'Vencido' },
    cancelled: { chip: '', label: 'Cancelado' },
  }[s.state];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 14px', background: '#fff',
      borderRadius: 12, border: '1px solid var(--tv-border)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.week}</div>
        <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
          {s.orders} pedidos · pagado el {s.paidAt}
        </div>
      </div>
      <div className="tv-mono" style={{ fontSize: 14, fontWeight: 700 }}>{soles(s.amount)}</div>
      <span className={`tv-chip ${stateMeta.chip}`} style={{ fontSize: 11 }}>{stateMeta.label}</span>
    </div>
  );
}

function DeudaMobile() {
  const d = window.DEBT;
  const pct = Math.min(d.balance / d.blockThreshold, 1) * 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--tv-surface)' }}>
      <MobileTopBar title="Deuda" subtitle="Comisiones con Tindivo" soundOn />

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {/* Hero balance */}
        <div style={{
          background: 'linear-gradient(180deg, #1A1614 0%, #2A2422 100%)',
          color: '#fff', borderRadius: 20, padding: '20px 18px',
          marginBottom: 14,
        }}>
          <div className="tv-label" style={{ color: 'rgba(255,255,255,0.6)' }}>DEBES AHORA</div>
          <div className="tv-mono" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, margin: '6px 0 14px' }}>
            {soles(d.balance)}
          </div>

          {/* progress to suspension threshold */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
              <span>Suspensión a las {soles(d.blockThreshold)}</span>
              <span>{Math.round(pct)}%</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--tv-brand)' }} />
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '8px 10px',
            fontSize: 12,
          }}>
            <MS name="event" size={14} />
            <span>Próximo cobro: <strong>{d.nextSettlement}</strong></span>
          </div>
        </div>

        <button className="tv-btn tv-btn-brand tv-btn-block tv-btn-lg" style={{ marginBottom: 14 }}>
          <MS name="chat" size={18} /> Pagar por WhatsApp a Tindivo
        </button>

        <SectionTitle>ADELANTOS DEL FONDO</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {d.advances.map(a => <AdvanceCard key={a.id} a={a} />)}
        </div>

        <SectionTitle>HISTORIAL SEMANAL</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {d.settlements.map((s, i) => <SettlementHistoryRow key={i} s={s} />)}
        </div>
      </div>

      <MobileBottomNav active="mas" />
    </div>
  );
}

function DeudaDesktop() {
  const d = window.DEBT;
  const pct = Math.min(d.balance / d.blockThreshold, 1) * 100;

  const counts = {
    pedidos: window.ORDERS.filter(o => o.state === 'pending_acceptance' || o.state === 'validando').length,
    efectivo: window.CASH_SETTLEMENTS.filter(s => s.state === 'pending_confirmation').length,
    deuda: d.advances.filter(a => a.state === 'activo' && a.canDispute).length || undefined,
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--tv-surface)' }}>
      <DesktopSidebar active="deuda" counts={counts} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <DesktopTopBar
          title="Deuda con Tindivo"
          subtitle="Comisiones acumuladas y fondo de contingencia"
          right={
            <a className="tv-btn tv-btn-brand">
              <MS name="chat" size={18} /> WhatsApp a Tindivo
            </a>
          }
        />

        <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 18 }}>
            {/* Balance hero */}
            <div style={{
              background: 'linear-gradient(135deg, #1A1614 0%, #2A2422 100%)',
              color: '#fff', borderRadius: 20, padding: 22,
            }}>
              <div className="tv-label" style={{ color: 'rgba(255,255,255,0.6)' }}>DEBES AHORA</div>
              <div className="tv-mono" style={{ fontSize: 54, fontWeight: 700, lineHeight: 1, margin: '8px 0 16px' }}>
                {soles(d.balance)}
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>
                  <span>0</span>
                  <span>Suspensión a {soles(d.blockThreshold)}</span>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.12)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--tv-brand)' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 13 }}>
                <div style={{ background: 'rgba(255,255,255,0.06)', padding: '8px 12px', borderRadius: 10, flex: 1 }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>PRÓXIMO CORTE</div>
                  <div style={{ marginTop: 2, fontWeight: 600 }}>{d.nextSettlement}</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.06)', padding: '8px 12px', borderRadius: 10, flex: 1 }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>COMISIÓN</div>
                  <div style={{ marginTop: 2, fontWeight: 600 }}>{Math.round(d.weeklyCommission * 100)}% por pedido</div>
                </div>
              </div>
            </div>

            {/* Quick info card */}
            <div style={{
              background: '#fff', borderRadius: 20, padding: 22, border: '1px solid var(--tv-border)',
            }}>
              <div className="tv-label">CÓMO PAGAR</div>
              <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, color: 'var(--tv-ink-muted)' }}>
                Coordina el pago con Tindivo a través de WhatsApp. Una vez confirmado, tu saldo se actualiza en segundos.
              </div>
              <div style={{
                background: 'var(--tv-surface)', borderRadius: 12, padding: '12px 14px',
                marginTop: 12, display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <MS name="chat" size={20} style={{ color: 'var(--tv-success)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Soporte Tindivo</div>
                  <div className="tv-mono" style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>+51 987 100 200</div>
                </div>
                <button className="tv-btn tv-btn-brand tv-btn-sm">Abrir</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12, color: 'var(--tv-ink-muted)' }}>
                <MS name="info" size={14} />
                Si tu deuda llega a S/300, tu cuenta queda suspendida automáticamente.
              </div>
            </div>
          </div>

          {/* Two columns: Advances + History */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <MS name="report_problem" size={20} style={{ color: 'var(--tv-warning)' }} filled />
                <div style={{ fontSize: 16, fontWeight: 700 }}>Adelantos del fondo</div>
                <span className="tv-chip">{d.advances.length}</span>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>
                  Tienes 48h para disputar después del cobro
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                {d.advances.map(a => <AdvanceCard key={a.id} a={a} />)}
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <MS name="history" size={20} style={{ color: 'var(--tv-ink-muted)' }} />
                <div style={{ fontSize: 16, fontWeight: 700 }}>Liquidaciones semanales</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {d.settlements.map((s, i) => <SettlementHistoryRow key={i} s={s} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DeudaMobile, DeudaDesktop, AdvanceCard, SettlementHistoryRow });
