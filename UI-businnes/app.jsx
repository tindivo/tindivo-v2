// Main canvas — Tindivo Dashboard Restaurante

const FRAME = {
  mobileW: 390,
  mobileH: 844,
  desktopW: 1280,
  desktopH: 820,
};

// Mobile phone artboard wrapper — plain function (not a component) so the
// returned element's React `type` is DCArtboard, which DCSection filters on.
const phoneArtboard = ({ id, label, children }) => (
  <DCArtboard id={id} label={label} key={id} width={FRAME.mobileW + 40} height={FRAME.mobileH + 40}>
    <div style={{
      width: FRAME.mobileW + 40, height: FRAME.mobileH + 40,
      background: 'linear-gradient(180deg, #F0EBE3 0%, #E8E2D8 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: FRAME.mobileW, height: FRAME.mobileH,
        background: '#000', borderRadius: 44,
        padding: 8, boxShadow: '0 20px 50px -20px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,0,0,0.1)',
      }}>
        <div style={{
          position: 'relative',
          width: '100%', height: '100%',
          background: 'var(--tv-surface)', borderRadius: 36, overflow: 'hidden',
        }}>
          {/* Status bar */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 44,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 28px 0', fontSize: 13, fontWeight: 600, zIndex: 100,
            pointerEvents: 'none',
          }}>
            <span>20:34</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <MS name="signal_cellular_alt" size={14} />
              <MS name="wifi" size={14} />
              <span style={{
                width: 22, height: 11, border: '1.2px solid #1A1614', borderRadius: 3,
                position: 'relative', display: 'inline-block',
              }}>
                <span style={{ position: 'absolute', inset: 1, background: '#1A1614', borderRadius: 1, width: '80%' }} />
              </span>
            </span>
          </div>
          {/* Notch */}
          <div style={{
            position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
            width: 110, height: 28, background: '#000', borderRadius: 999, zIndex: 60,
          }} />
          {/* Content */}
          <div style={{ paddingTop: 44, height: '100%', display: 'flex', flexDirection: 'column' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  </DCArtboard>
);

// Desktop browser artboard — same factory pattern.
const desktopArtboard = ({ id, label, children, height = FRAME.desktopH }) => (
  <DCArtboard id={id} label={label} key={id} width={FRAME.desktopW + 40} height={height + 60}>
    <div style={{
      width: FRAME.desktopW + 40, height: height + 60,
      background: 'linear-gradient(180deg, #F0EBE3 0%, #E8E2D8 100%)',
      padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="tv-browser" style={{ width: FRAME.desktopW, height }}>
        <div className="tv-browser-chrome">
          <span className="tv-browser-dot" style={{ background: '#FF5F57' }} />
          <span className="tv-browser-dot" style={{ background: '#FEBC2E' }} />
          <span className="tv-browser-dot" style={{ background: '#28C840' }} />
          <div className="tv-browser-url">
            <MS name="lock" size={11} style={{ marginRight: 6, color: 'var(--tv-success)' }} />
            negocios.tindivo.com
          </div>
          <div style={{ flex: 1 }} />
          <MS name="more_horiz" size={16} style={{ color: 'var(--tv-ink-muted)' }} />
        </div>
        <div style={{ height: 'calc(100% - 38px)', overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  </DCArtboard>
);

function App() {
  return (
    <DesignCanvas storageKey="tindivo-business-dashboard-v3">

      <DCSection
        id="intro"
        title="Tindivo · Dashboard del Restaurante (v3)"
        subtitle="Priamo · San Jacinto, Áncash. Pedidos v2: 4 columnas, buffer gradual, busy mode, WEB/MANUAL.">
        <DCPostIt>
          Hover en cada artboard para reorganizar. Click en expandir para verlo a tamaño completo.
        </DCPostIt>
      </DCSection>

      <DCSection
        id="pedidos-v3"
        title="1 · Pedidos (v3 — refinamiento final)"
        subtitle="3 columnas · cards limpias · countdown inline · detalle por tap · secciones de pago · modal rechazo/cancelación">

        {/* Mobile tabs */}
        {phoneArtboard({ id: 'p3-mob-new',     label: 'Mobile · Nuevos (3 pedidos)',   children: <PedidosMobileV3 activeTab="new" /> })}
        {phoneArtboard({ id: 'p3-mob-cooking', label: 'Mobile · En cocina (8 estados)', children: <PedidosMobileV3 activeTab="cooking" /> })}
        {phoneArtboard({ id: 'p3-mob-route',   label: 'Mobile · Reparto + timer',      children: <PedidosMobileV3 activeTab="route" /> })}
        {phoneArtboard({ id: 'p3-mob-paused',  label: 'Mobile · Pausado',              children: <PedidosMobileV3 activeTab="new" isPaused={true} /> })}
        {phoneArtboard({ id: 'p3-mob-pause-modal', label: 'Mobile · Modal pausar',     children: <PedidosMobileV3 activeTab="new" showPauseModal={true} /> })}
        {phoneArtboard({ id: 'p3-mob-empty',   label: 'Mobile · Sin pedidos',          children: <PedidosEmptyMobileV3 /> })}

        {/* Mobile detail screens */}
        {phoneArtboard({ id: 'p3-mob-det-cash',    label: 'Detalle · Efectivo + vuelto',
          children: <PedidosMobileV3 activeTab="new" showDetail={window.ORDERS_NEW[0]} /> })}
        {phoneArtboard({ id: 'p3-mob-det-wallet',  label: 'Detalle · Billetera + QR',
          children: <PedidosMobileV3 activeTab="new" showDetail={window.ORDERS_NEW[1]} /> })}
        {phoneArtboard({ id: 'p3-mob-det-prepaid', label: 'Detalle · Prepago · verificar comprobante',
          children: <PedidosMobileV3 activeTab="new" showDetail={window.ORDERS_NEW[2]} /> })}
        {phoneArtboard({ id: 'p3-mob-det-prepaid-ok', label: 'Detalle · Prepago verificado · aceptar habilitado',
          children: <PedidosMobileV3 activeTab="new" showDetail={window.ORDERS_NEW[2]} proofVerified={true} /> })}
        {phoneArtboard({ id: 'p3-mob-det-reject',  label: 'Detalle · Modal rechazo',
          children: <PedidosMobileV3 activeTab="new" showDetail={window.ORDERS_NEW[0]} showRejectModal={true} /> })}
        {phoneArtboard({ id: 'p3-mob-det-waiting', label: 'Detalle · Motorizado llegó (cocina)',
          children: <PedidosMobileV3 activeTab="cooking" showDetail={window.ORDERS_COOKING.find(o => o.state === 'waiting')} /> })}

        {/* Cards comparison */}
        {phoneArtboard({ id: 'p3-states-compare', label: 'Comparativa · 6 sub-estados cocina',
          children: (
            <div style={{ height: '100%', overflowY: 'auto', background: 'var(--tv-surface)' }}>
              <CocinaStatesComparison />
            </div>
          ) })}

        {/* Desktop */}
        {desktopArtboard({ id: 'p3-desk-main',    label: 'Desktop · 3 columnas',            height: 860, children: <PedidosDesktopV3 /> })}
        {desktopArtboard({ id: 'p3-desk-paused',  label: 'Desktop · Modo pausado',          height: 860, children: <PedidosDesktopV3 isPaused={true} /> })}
        {desktopArtboard({ id: 'p3-desk-modal',   label: 'Desktop · Modal pausar',          height: 860, children: <PedidosDesktopV3 showPauseModal={true} /> })}
        {desktopArtboard({ id: 'p3-desk-det-cash',label: 'Desktop · Detalle efectivo + vuelto', height: 880, children: <PedidosDesktopV3 showDetailId="A8K23F" /> })}
        {desktopArtboard({ id: 'p3-desk-det-pre', label: 'Desktop · Detalle prepago (comprobante)', height: 900, children: <PedidosDesktopV3 showDetailId="C9P22D" /> })}
        {desktopArtboard({ id: 'p3-desk-empty',   label: 'Desktop · Sin pedidos',           height: 860, children: <PedidosEmptyDesktopV3 /> })}
      </DCSection>

      <DCSection
        id="nuevo"
        title="2 · Solicitar motorizado"
        subtitle="Pedido por teléfono · sin selección de platos · un campo dirección/referencia · pagos genéricos · vuelto automático.">
        {phoneArtboard({ id: 'nuevo-mobile', label: 'Mobile', children: <NewOrderMobile /> })}
        {desktopArtboard({ id: 'nuevo-desktop', label: 'Desktop', height: 960, children: <NewOrderDesktop /> })}
      </DCSection>

      <DCSection
        id="menu"
        title="3 · Menú"
        subtitle="Lista refactorizada — badge 'Con opciones' vs 'Directo al carrito', editar prominente, estado vacío.">
        {phoneArtboard({ id: 'menu-mobile-list', label: 'Mobile · Lista', children: <MenuMobile /> })}
        {phoneArtboard({ id: 'menu-mobile-empty', label: 'Mobile · Estado vacío', children: <MenuMobile showEmpty /> })}
        {desktopArtboard({ id: 'menu-desktop-list', label: 'Desktop · Lista', children: <MenuDesktop /> })}
      </DCSection>

      <DCSection
        id="menu-editor"
        title="3b · Editor de item"
        subtitle="Pizza Hawaiana (3 grupos) · Pizza Fullmeat (2 grupos) · Alitas BBQ (1 grupo) · Chicha morada (sin grupos)">
        {phoneArtboard({ id: 'editor-mobile-hawaiana', label: 'Mobile · Pizza Hawaiana', children: <ItemEditorMobile item={PRIAMO_ITEMS[0]} /> })}
        {phoneArtboard({ id: 'editor-mobile-chicha',   label: 'Mobile · Chicha (sin grupos)', children: <ItemEditorMobile item={PRIAMO_ITEMS[3]} /> })}
        {phoneArtboard({ id: 'editor-mobile-delete-modal',  label: 'Mobile · Modal eliminar',         children: <ItemEditorMobile item={PRIAMO_ITEMS[0]} showDeleteModal={true} /> })}
        {phoneArtboard({ id: 'editor-mobile-unsaved-modal', label: 'Mobile · Modal cambios sin guardar', children: <ItemEditorMobile item={PRIAMO_ITEMS[0]} showUnsavedModal={true} /> })}
        {desktopArtboard({ id: 'editor-desktop-hawaiana', label: 'Desktop · Pizza Hawaiana', height: 1060, children: <ItemEditorDesktop item={PRIAMO_ITEMS[0]} /> })}
        {desktopArtboard({ id: 'editor-desktop-fullmeat', label: 'Desktop · Pizza Fullmeat', height: 960, children: <ItemEditorDesktop item={PRIAMO_ITEMS[1]} /> })}
        {desktopArtboard({ id: 'editor-desktop-alitas',   label: 'Desktop · Alitas BBQ',     height: 880, children: <ItemEditorDesktop item={PRIAMO_ITEMS[2]} /> })}
        {desktopArtboard({ id: 'editor-desktop-chicha',   label: 'Desktop · Chicha (simple)', height: 820, children: <ItemEditorDesktop item={PRIAMO_ITEMS[3]} /> })}
      </DCSection>

      <DCSection
        id="menu-preview"
        title="3c · Vista previa del cliente"
        subtitle="Cómo ve el cliente el item — modal mobile (bottom sheet) y panel lateral desktop.">
        {phoneArtboard({ id: 'preview-mobile-hawaiana', label: 'Mobile · Pizza Hawaiana (bottom sheet)', children: (
          <div style={{ position: 'relative', height: '100%', background: '#FAF6F1' }}>
            <div style={{ padding: '14px', height: '100%', overflowY: 'auto' }}>
              <div className="tv-display" style={{ fontSize: 18, marginBottom: 8 }}>Menú · Pizzas</div>
              <div style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid var(--tv-border)', marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Pizza Hawaiana</div>
                <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>Desde S/15</div>
              </div>
            </div>
            <CustomerPreviewMobile item={PRIAMO_ITEMS[0]} />
          </div>
        )})}
        {phoneArtboard({ id: 'preview-mobile-chicha', label: 'Mobile · Chicha (sin opciones)', children: (
          <div style={{ position: 'relative', height: '100%', background: '#FAF6F1' }}>
            <div style={{ padding: '14px', height: '100%', overflowY: 'auto' }}>
              <div className="tv-display" style={{ fontSize: 18, marginBottom: 8 }}>Menú · Bebidas</div>
              <div style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid var(--tv-border)', marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Chicha morada</div>
                <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>S/2.50</div>
              </div>
            </div>
            <CustomerPreviewMobile item={PRIAMO_ITEMS[3]} />
          </div>
        )})}
        {desktopArtboard({ id: 'preview-desktop-hawaiana', label: 'Desktop · Pizza Hawaiana + preview panel', height: 900, children: <ItemEditorWithPreviewDesktop item={PRIAMO_ITEMS[0]} /> })}
        {desktopArtboard({ id: 'preview-desktop-alitas', label: 'Desktop · Alitas BBQ + preview panel', height: 860, children: <ItemEditorWithPreviewDesktop item={PRIAMO_ITEMS[2]} /> })}
      </DCSection>

      <DCSection
        id="efectivo"
        title="4 · Efectivo"
        subtitle="Liquidación diaria del efectivo entregado por motorizados.">
        {phoneArtboard({ id: 'cash-mobile', label: 'Mobile', children: <EfectivoMobile /> })}
        {desktopArtboard({ id: 'cash-desktop', label: 'Desktop', children: <EfectivoDesktop /> })}
      </DCSection>

      <DCSection
        id="historial"
        title="5 · Historial"
        subtitle="Pedidos completados y cancelados del día — filtros estado + origen. Solo lectura.">
        {phoneArtboard({ id: 'hist-mobile', label: 'Mobile', children: <HistorialMobile /> })}
        {desktopArtboard({ id: 'hist-desktop', label: 'Desktop', children: <HistorialDesktop /> })}
      </DCSection>

      <DCSection
        id="deuda"
        title="6 · Deuda"
        subtitle="Balance con Tindivo · adelantos del fondo · historial de liquidaciones.">
        {phoneArtboard({ id: 'deuda-mobile', label: 'Mobile', children: <DeudaMobile /> })}
        {desktopArtboard({ id: 'deuda-desktop', label: 'Desktop', children: <DeudaDesktop /> })}
      </DCSection>

      <DCSection
        id="config"
        title="7 · Config"
        subtitle="Perfil, billeteras digitales, horarios, capacidades del negocio.">
        {phoneArtboard({ id: 'config-mobile', label: 'Mobile', children: <ConfigMobile /> })}
        {desktopArtboard({ id: 'config-desktop', label: 'Desktop', height: 1100, children: <ConfigDesktop /> })}
      </DCSection>

      <DCSection
        id="notas"
        title="Cambios v2"
        subtitle="Correcciones aplicadas tras revisión del brief completo (FUNCIONALIDADES_TINDIVO_DELIVERY.md).">
        <DCPostIt color="brand">
          <strong>Pedido manual:</strong> sin selección de platos. Solo monto total + un textarea "Dirección o referencia" (máx 500 chars).
        </DCPostIt>
        <DCPostIt>
          <strong>Pagos genéricos:</strong> "Ya pagó" · "Cobrar con billetera digital" · "Cobrar en efectivo" (default) · "Billetera + Efectivo".
        </DCPostIt>
        <DCPostIt>
          <strong>Vuelto:</strong> banner verde muy visible — "Prepáralo en efectivo y mételo en la bolsa antes de que llegue el motorizado".
        </DCPostIt>
        <DCPostIt>
          <strong>Extensión:</strong> solo 1 vez por pedido (+5 o +10 min). Disponible en <code>waiting_driver</code> y <code>heading_to_restaurant</code>. Bloqueado desde que el moto llega al local.
        </DCPostIt>
        <DCPostIt>
          <strong>Prep presets:</strong> 10 · 15 · 20 · 25 · 30 · 35 · 40 · 45 · 50 min. Default: 20 min.
        </DCPostIt>
        <DCPostIt>
          <strong>Badges WEB / MANUAL:</strong> en cada card de pedido y en el historial para distinguir el origen.
        </DCPostIt>
        <DCPostIt>
          <strong>Nueva vista Historial:</strong> filtros estado + origen, tabla en desktop, lista en mobile. Métricas del día arriba (ventas, web/manual, cancelados).
        </DCPostIt>
      </DCSection>

    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
