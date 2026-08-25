// Efectivo (cash settlements) — Mobile + Desktop

function SettlementCard({ s, mobile = false }) {
  const isPending = s.state === 'pending_confirmation';
  const isDisputed = s.state === 'disputed';
  const isConfirmed = s.state === 'confirmed';
  const diff = s.reportedCash - s.expectedCash;
  const hasDiff = diff !== 0;

  return (
    <div style={{
      background: '#fff', borderRadius: 16,
      border: isPending ? '2px solid var(--tv-warning)' : '1px solid var(--tv-border)',
      boxShadow: 'var(--tv-elev-1)',
      overflow: 'hidden',
    }}>
      {isPending && (
        <div style={{
          background: 'var(--tv-warning)', color: '#1A1614',
          padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          <MS name="payments" size={14} filled />
          <span style={{ flex: 1 }}>Cuenta el efectivo físicamente antes de confirmar</span>
          <span style={{ fontSize: 10 }}>24h máx</span>
        </div>
      )}
      {isDisputed && (
        <div style={{
          background: 'var(--tv-danger)', color: '#fff',
          padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          <MS name="gavel" size={14} filled />
          En disputa · esperando soporte
        </div>
      )}

      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'var(--tv-brand-soft)', color: 'var(--tv-brand-dark)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 14, flexShrink: 0,
          }}>
            {s.driver.split(' ').map(p => p[0]).join('')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{s.driver}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--tv-ink-muted)' }}>
              <span>{s.date}</span>
              <span>·</span>
              <span>{s.orders.length} pedidos</span>
            </div>
          </div>
          {isConfirmed && (
            <span className="tv-chip tv-chip-success" style={{ fontSize: 11 }}>
              <MS name="check_circle" size={13} filled /> Confirmado
            </span>
          )}
        </div>

        {/* Amount grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1,
          background: 'var(--tv-border)', borderRadius: 12, overflow: 'hidden',
          marginBottom: 12,
        }}>
          <div style={{ background: 'var(--tv-surface)', padding: '10px 12px' }}>
            <div className="tv-label" style={{ fontSize: 10, marginBottom: 4 }}>SISTEMA ESPERA</div>
            <div className="tv-mono" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{soles(s.expectedCash)}</div>
          </div>
          <div style={{ background: 'var(--tv-surface)', padding: '10px 12px' }}>
            <div className="tv-label" style={{ fontSize: 10, marginBottom: 4 }}>MOTO REPORTA</div>
            <div className="tv-mono" style={{
              fontSize: 20, fontWeight: 700, lineHeight: 1,
              color: hasDiff ? 'var(--tv-danger)' : 'var(--tv-ink)',
            }}>{soles(s.reportedCash)}</div>
          </div>
        </div>

        {hasDiff && isPending && (
          <div style={{
            background: 'var(--tv-warning-soft)', color: '#92400E',
            borderRadius: 10, padding: '8px 12px', marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600,
          }}>
            <MS name="info" size={14} filled />
            Diferencia de {soles(Math.abs(diff))} entre lo que el sistema espera y lo que reporta la moto.
          </div>
        )}

        {isDisputed && (
          <div style={{
            background: 'var(--tv-danger-soft)', color: '#7F1D1D',
            borderRadius: 10, padding: '8px 12px', marginBottom: 12,
            fontSize: 12,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Tú contaste: {soles(s.businessCount)}</div>
            <div>{s.note}</div>
          </div>
        )}

        {/* Orders breakdown */}
        <details style={{ marginBottom: 12 }} open={!mobile}>
          <summary style={{
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'var(--tv-ink-muted)', padding: '4px 0',
          }}>
            <MS name="receipt_long" size={14} />
            Ver {s.orders.length} pedidos del cierre
          </summary>
          <div style={{
            marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4,
            background: 'var(--tv-surface)', borderRadius: 10, padding: 8,
          }}>
            {s.orders.map(o => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span className="tv-mono" style={{ flex: 1, color: 'var(--tv-ink-muted)' }}>#{o.id}</span>
                <span className="tv-mono" style={{ fontWeight: 600 }}>{soles(o.total)}</span>
              </div>
            ))}
          </div>
        </details>

        {/* Actions */}
        {isPending && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button className="tv-btn tv-btn-ghost">
              <MS name="report_problem" size={18} /> Reportar diferencia
            </button>
            <button className="tv-btn tv-btn-brand">
              <MS name="check" size={18} /> Confirmo {soles(s.reportedCash)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EfectivoMobile() {
  const settlements = window.CASH_SETTLEMENTS;
  const pending = settlements.filter(s => s.state === 'pending_confirmation');
  const totalToday = settlements
    .filter(s => s.date.startsWith('Hoy'))
    .reduce((sum, s) => sum + s.reportedCash, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--tv-surface)' }}>
      <MobileTopBar title="Efectivo" subtitle={`Cierres de motorizados`} soundOn />

      {/* Summary */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          background: 'var(--tv-ink)', color: '#fff', borderRadius: 16, padding: '14px 16px',
        }}>
          <div className="tv-label" style={{ color: 'rgba(255,255,255,0.6)' }}>RECIBIDO HOY</div>
          <div className="tv-mono" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, marginTop: 4 }}>
            {soles(totalToday)}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            <div><strong style={{ color: '#fff' }}>{pending.length}</strong> por confirmar</div>
            <div><strong style={{ color: '#fff' }}>{settlements.length - pending.length}</strong> cerrados</div>
          </div>
        </div>
      </div>

      {pending.length > 0 && (
        <div style={{
          margin: '0 14px 12px',
          background: 'var(--tv-warning-soft)', color: '#92400E',
          borderRadius: 12, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <MS name="warning" size={18} filled />
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
            Tienes <strong>{pending.length}</strong> {pending.length === 1 ? 'cierre pendiente' : 'cierres pendientes'} de confirmar
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {settlements.map(s => <SettlementCard key={s.id} s={s} mobile />)}
      </div>

      <MobileBottomNav active="efectivo" />
    </div>
  );
}

function EfectivoDesktop() {
  const settlements = window.CASH_SETTLEMENTS;
  const pending = settlements.filter(s => s.state === 'pending_confirmation');
  const totalToday = settlements
    .filter(s => s.date.startsWith('Hoy'))
    .reduce((sum, s) => sum + s.reportedCash, 0);
  const totalWeek = 1240.50;

  const counts = {
    pedidos: window.ORDERS.filter(o => o.state === 'pending_acceptance' || o.state === 'validando').length,
    efectivo: pending.length,
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--tv-surface)' }}>
      <DesktopSidebar active="efectivo" counts={counts} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <DesktopTopBar
          title="Efectivo de motorizados"
          subtitle="Liquidación diaria · cuenta el dinero antes de confirmar"
          right={
            <button className="tv-btn tv-btn-ghost">
              <MS name="download" size={18} /> Exportar mes
            </button>
          }
        />

        <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
          {/* KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
            <KPI label="RECIBIDO HOY" value={soles(totalToday)} sub="3 cierres" tone="brand" />
            <KPI label="POR CONFIRMAR" value={pending.length.toString()} sub="cierres pendientes" tone={pending.length > 0 ? 'warning' : 'neutral'} icon="warning" />
            <KPI label="EN DISPUTA" value="1" sub="con soporte" tone="danger" icon="gavel" />
            <KPI label="ESTA SEMANA" value={soles(totalWeek)} sub="28 cierres" tone="neutral" />
          </div>

          {/* Pending block first */}
          {pending.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <MS name="warning" size={20} filled style={{ color: 'var(--tv-warning)' }} />
                <div style={{ fontSize: 16, fontWeight: 700 }}>Por confirmar ahora</div>
                <span className="tv-chip tv-chip-warning">{pending.length}</span>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>
                  Después de 24h se confirman automáticamente
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {pending.map(s => <SettlementCard key={s.id} s={s} />)}
              </div>
            </div>
          )}

          {/* History */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <MS name="history" size={20} style={{ color: 'var(--tv-ink-muted)' }} />
              <div style={{ fontSize: 16, fontWeight: 700 }}>Historial</div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                {['Esta semana', 'Mes', 'Personalizado'].map((f, i) => (
                  <button key={f} className={`tv-chip ${i === 0 ? 'tv-chip-ink' : ''}`} style={{ cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {settlements.filter(s => s.state !== 'pending_confirmation').map(s => <SettlementCard key={s.id} s={s} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, sub, tone = 'neutral', icon }) {
  const toneStyle = {
    brand:   { bg: 'var(--tv-brand-soft)', fg: 'var(--tv-brand-dark)' },
    warning: { bg: 'var(--tv-warning-soft)', fg: '#92400E' },
    danger:  { bg: 'var(--tv-danger-soft)', fg: '#991B1B' },
    success: { bg: 'var(--tv-success-soft)', fg: '#166534' },
    neutral: { bg: '#fff', fg: 'var(--tv-ink)' },
  }[tone];
  return (
    <div style={{
      background: toneStyle.bg, borderRadius: 14, padding: '12px 14px',
      border: '1px solid var(--tv-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div className="tv-label" style={{ fontSize: 10, flex: 1, color: toneStyle.fg, opacity: 0.7 }}>{label}</div>
        {icon && <MS name={icon} size={14} filled style={{ color: toneStyle.fg }} />}
      </div>
      <div className="tv-mono" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.05, marginTop: 4, color: toneStyle.fg }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

Object.assign(window, { EfectivoMobile, EfectivoDesktop, SettlementCard, KPI });
