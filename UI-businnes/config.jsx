// Config (settings) — Mobile + Desktop

function ConfigField({ label, value, helper, mono = false }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label className="tv-label-input">{label}</label>
      <div className="tv-input" style={{ display: 'flex', alignItems: 'center' }}>
        <span className={mono ? 'tv-mono' : ''} style={{ flex: 1, fontSize: 15 }}>{value}</span>
        <MS name="edit" size={16} style={{ color: 'var(--tv-ink-subtle)' }} />
      </div>
      {helper && <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 4 }}>{helper}</div>}
    </div>
  );
}

function CapToggle({ icon, title, desc, on }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', background: '#fff',
      borderRadius: 12, border: '1px solid var(--tv-border)',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: on ? 'var(--tv-brand-soft)' : 'rgba(26,22,20,0.06)',
        color: on ? 'var(--tv-brand-dark)' : 'var(--tv-ink-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <MS name={icon} size={20} filled={on} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 2 }}>{desc}</div>
      </div>
      <button style={{
        width: 44, height: 26, borderRadius: 999,
        background: on ? 'var(--tv-brand)' : 'var(--tv-ink-subtle)',
        border: 'none', cursor: 'pointer', position: 'relative',
        flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 3, left: on ? 21 : 3,
          width: 20, height: 20, borderRadius: 999, background: '#fff',
          transition: 'left 140ms ease',
        }} />
      </button>
    </div>
  );
}

function ScheduleRow({ day, open, shift1, shift2, midnight }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', background: '#fff',
      borderRadius: 12, border: '1px solid var(--tv-border)',
    }}>
      <button style={{
        width: 22, height: 22, borderRadius: 6,
        background: open ? 'var(--tv-brand)' : 'transparent',
        border: open ? 'none' : '1.5px solid var(--tv-ink-subtle)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {open && <MS name="check" size={14} style={{ color: '#fff' }} />}
      </button>
      <div style={{ width: 76, fontSize: 14, fontWeight: 600 }}>{day}</div>
      {open ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="tv-chip tv-mono" style={{ fontSize: 12 }}>{shift1[0]}–{shift1[1]}</span>
          {midnight && <span className="tv-chip tv-chip-warning" style={{ fontSize: 10 }}>cruza 00:00</span>}
          {shift2 ? (
            <span className="tv-chip tv-mono" style={{ fontSize: 12 }}>{shift2[0]}–{shift2[1]}</span>
          ) : (
            <button className="tv-btn tv-btn-ghost tv-btn-sm" style={{ padding: '4px 8px', fontSize: 11 }}>
              <MS name="add" size={12} /> 2º turno
            </button>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, fontSize: 12, color: 'var(--tv-ink-subtle)' }}>Cerrado</div>
      )}
    </div>
  );
}

const SCHEDULE_DEMO = [
  { day: 'Lunes', open: true, shift1: ['11:00', '15:00'], shift2: ['18:00', '23:00'] },
  { day: 'Martes', open: true, shift1: ['11:00', '15:00'], shift2: ['18:00', '23:00'] },
  { day: 'Miércoles', open: false, shift1: ['', ''] },
  { day: 'Jueves', open: true, shift1: ['11:00', '15:00'], shift2: ['18:00', '23:00'] },
  { day: 'Viernes', open: true, shift1: ['11:00', '15:30'], shift2: ['18:00', '23:30'] },
  { day: 'Sábado', open: true, shift1: ['12:00', '01:00'], midnight: true },
  { day: 'Domingo', open: true, shift1: ['12:00', '22:00'] },
];

function ConfigMobile() {
  const r = window.RESTAURANT;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--tv-surface)' }}>
      <MobileTopBar title="Configuración" subtitle="Perfil del restaurante" soundOn />

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 24px' }}>
        {/* Hero */}
        <div style={{
          background: '#fff', borderRadius: 16, padding: 14,
          border: '1px solid var(--tv-border)', marginBottom: 14,
          display: 'flex', gap: 12, alignItems: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: r.accent, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Bricolage Grotesque', fontWeight: 700, fontSize: 22,
          }}>T</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{r.name}</div>
            <div className="tv-label" style={{ marginTop: 4, fontSize: 10 }}>PAPELITO {r.papelito.toUpperCase()}</div>
          </div>
          <button className="tv-btn tv-btn-ghost tv-btn-sm">
            <MS name="edit" size={14} />
          </button>
        </div>

        <SectionTitle>DATOS DEL NEGOCIO</SectionTitle>
        <ConfigField label="NOMBRE" value={r.name} />
        <ConfigField label="ESLOGAN" value={r.tagline} />
        <ConfigField label="TELÉFONO" value={r.phone} mono />

        <SectionTitle>PAGO YAPE</SectionTitle>
        <ConfigField label="NÚMERO DE YAPE" value={r.yapeNumber} mono />
        <div style={{
          background: '#fff', borderRadius: 12, padding: 12, border: '1px solid var(--tv-border)',
          marginBottom: 12,
        }}>
          <div className="tv-label-input">QR DE YAPE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="tv-ph" style={{ width: 64, height: 64, borderRadius: 10 }}>
              <span>QR YAPE</span>
            </div>
            <div style={{ flex: 1, fontSize: 12, color: 'var(--tv-ink-muted)' }}>
              Sube tu QR para que el cliente pueda escanearlo al hacer un pedido prepago.
            </div>
            <button className="tv-btn tv-btn-ghost tv-btn-sm">
              <MS name="upload" size={14} /> Subir
            </button>
          </div>
        </div>

        <SectionTitle>TIEMPOS Y PRECIO</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <ConfigField label="ETA MÍN" value={`${r.etaMin} min`} mono />
          <ConfigField label="ETA MÁX" value={`${r.etaMax} min`} mono />
        </div>
        <ConfigField label="DELIVERY" value={`S/${r.deliveryFee.toFixed(2)}`} mono helper="Lo que cobras al cliente por envío. El motorizado recibe S/2.50." />

        <SectionTitle>CAPACIDADES</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CapToggle icon="storefront" title="Publicar catálogo" desc="Aparecer en el marketplace de Tindivo" on={r.publishesCatalog} />
          <CapToggle icon="shopping_bag" title="Recojo en local" desc="El cliente puede hacer pedidos para recoger" on={r.acceptsWebPickup} />
          <CapToggle icon="delivery_dining" title="Delivery web" desc="Aceptar pedidos con envío a domicilio" on={r.acceptsWebDelivery} />
          <CapToggle icon="two_wheeler" title="Motorizados Tindivo" desc="Usar la flota de motos de Tindivo" on={r.usesTindivoDrivers} />
        </div>

        <SectionTitle action={
          <button className="tv-btn tv-btn-ghost tv-btn-sm">
            <MS name="content_copy" size={14} /> Copiar
          </button>
        }>HORARIO SEMANAL</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {SCHEDULE_DEMO.map(d => <ScheduleRow key={d.day} {...d} />)}
        </div>

        <div style={{ height: 16 }} />

        <SectionTitle>SESIÓN</SectionTitle>
        <div style={{
          background: '#fff', borderRadius: 12, padding: 12, border: '1px solid var(--tv-border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 999, background: 'var(--tv-brand-soft)',
            color: 'var(--tv-brand-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 13,
          }}>JE</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>jesus@eltumi.pe</div>
            <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)' }}>Cajero · sesión iniciada</div>
          </div>
          <button className="tv-btn tv-btn-ghost tv-btn-sm" style={{ color: 'var(--tv-danger)' }}>
            <MS name="logout" size={16} /> Salir
          </button>
        </div>
      </div>

      <div style={{
        padding: '12px 14px 14px', background: '#fff', borderTop: '1px solid var(--tv-border)',
      }}>
        <button className="tv-btn tv-btn-brand tv-btn-block tv-btn-lg">
          <MS name="save" size={20} filled /> Guardar cambios
        </button>
      </div>
    </div>
  );
}

function ConfigDesktop() {
  const r = window.RESTAURANT;
  const counts = {
    pedidos: window.ORDERS.filter(o => o.state === 'pending_acceptance' || o.state === 'validando').length,
    efectivo: window.CASH_SETTLEMENTS.filter(s => s.state === 'pending_confirmation').length,
  };
  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--tv-surface)' }}>
      <DesktopSidebar active="config" counts={counts} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <DesktopTopBar
          title="Configuración"
          subtitle="Perfil del restaurante, horarios y capacidades"
          right={
            <button className="tv-btn tv-btn-brand">
              <MS name="save" size={18} filled /> Guardar cambios
            </button>
          }
        />

        <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20 }}>
            {/* Section nav */}
            <aside style={{ position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
              {[
                { id: 'datos', icon: 'storefront', label: 'Datos', active: true },
                { id: 'yape', icon: 'qr_code_2', label: 'Pago Yape' },
                { id: 'tiempos', icon: 'schedule', label: 'Tiempos y precio' },
                { id: 'capacidades', icon: 'tune', label: 'Capacidades' },
                { id: 'horario', icon: 'calendar_month', label: 'Horario' },
                { id: 'cuenta', icon: 'account_circle', label: 'Cuenta' },
              ].map(it => (
                <button key={it.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10, width: '100%',
                  background: it.active ? '#fff' : 'transparent',
                  border: it.active ? '1px solid var(--tv-border)' : 'none',
                  color: 'var(--tv-ink)', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 14, fontWeight: 500, textAlign: 'left',
                  boxShadow: it.active ? 'var(--tv-elev-1)' : 'none',
                }}>
                  <MS name={it.icon} size={18} filled={it.active} style={{ color: it.active ? 'var(--tv-brand)' : 'var(--tv-ink-muted)' }} />
                  {it.label}
                </button>
              ))}
            </aside>

            {/* Main */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Datos */}
              <ConfigSectionDesktop title="Datos del negocio" icon="storefront">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label className="tv-label-input">NOMBRE</label>
                    <div className="tv-input">{r.name}</div>
                  </div>
                  <div>
                    <label className="tv-label-input">TELÉFONO</label>
                    <div className="tv-input tv-mono">{r.phone}</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="tv-label-input">ESLOGAN / LEMA</label>
                    <div className="tv-input">{r.tagline}</div>
                  </div>
                  <div>
                    <label className="tv-label-input">COLOR DE ACENTO (PAPELITO)</label>
                    <div className="tv-input" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 24, height: 24, borderRadius: 6, background: r.accent }} />
                      <span style={{ flex: 1 }}>{r.papelito}</span>
                      <span className="tv-mono" style={{ color: 'var(--tv-ink-muted)', fontSize: 13 }}>{r.accent}</span>
                    </div>
                  </div>
                  <div>
                    <label className="tv-label-input">UBICACIÓN</label>
                    <div className="tv-input">{r.district}</div>
                  </div>
                </div>
              </ConfigSectionDesktop>

              <ConfigSectionDesktop title="Pago por Yape" icon="qr_code_2">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 14, alignItems: 'flex-start' }}>
                  <div>
                    <label className="tv-label-input">NÚMERO DE YAPE</label>
                    <div className="tv-input tv-mono">{r.yapeNumber}</div>
                    <div style={{ marginTop: 12, padding: 12, background: 'var(--tv-info-soft)', borderRadius: 10, fontSize: 12, color: '#0369A1', display: 'flex', gap: 8 }}>
                      <MS name="info" size={14} filled />
                      <span>Los clientes verán este número y tu QR cuando paguen por Yape antes del pedido.</span>
                    </div>
                  </div>
                  <div>
                    <label className="tv-label-input">QR DE YAPE</label>
                    <div className="tv-ph" style={{ width: 160, height: 160, borderRadius: 12 }}>
                      <span>QR YAPE<br/>160×160</span>
                    </div>
                    <button className="tv-btn tv-btn-ghost tv-btn-sm tv-btn-block" style={{ marginTop: 8 }}>
                      <MS name="upload" size={14} /> Reemplazar
                    </button>
                  </div>
                </div>
              </ConfigSectionDesktop>

              <ConfigSectionDesktop title="Tiempos y precio" icon="schedule">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                  <div>
                    <label className="tv-label-input">ETA MÍNIMO</label>
                    <div className="tv-input tv-mono">{r.etaMin} min</div>
                  </div>
                  <div>
                    <label className="tv-label-input">ETA MÁXIMO</label>
                    <div className="tv-input tv-mono">{r.etaMax} min</div>
                  </div>
                  <div>
                    <label className="tv-label-input">DELIVERY</label>
                    <div className="tv-input tv-mono">S/ {r.deliveryFee.toFixed(2)}</div>
                  </div>
                </div>
              </ConfigSectionDesktop>

              <ConfigSectionDesktop title="Capacidades del negocio" icon="tune"
                subtitle={`Modo actual: Delivery web + recojo`}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <CapToggle icon="storefront" title="Publicar catálogo" desc="Aparecer en el marketplace" on={r.publishesCatalog} />
                  <CapToggle icon="shopping_bag" title="Recojo en local" desc="Pedidos para recoger" on={r.acceptsWebPickup} />
                  <CapToggle icon="delivery_dining" title="Delivery web" desc="Aceptar pedidos a domicilio" on={r.acceptsWebDelivery} />
                  <CapToggle icon="two_wheeler" title="Motorizados Tindivo" desc="Usar nuestra flota" on={r.usesTindivoDrivers} />
                </div>
              </ConfigSectionDesktop>

              <ConfigSectionDesktop title="Horario semanal" icon="calendar_month"
                right={
                  <button className="tv-btn tv-btn-ghost tv-btn-sm">
                    <MS name="content_copy" size={14} /> Copiar lunes a todos
                  </button>
                }>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {SCHEDULE_DEMO.map(d => <ScheduleRow key={d.day} {...d} />)}
                </div>
              </ConfigSectionDesktop>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigSectionDesktop({ title, icon, subtitle, right, children }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: 18,
      border: '1px solid var(--tv-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'var(--tv-brand-soft)', color: 'var(--tv-brand-dark)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MS name={icon} size={18} filled />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

Object.assign(window, { ConfigMobile, ConfigDesktop, ConfigField, CapToggle, ScheduleRow });
