import type { OrderVM } from '@/lib/orders/view-model'
import type { DetailItem } from './types'

export type ComandaMode = 'cocina' | 'motorizado'

function fmtMoney(amount: number): string {
  return `S/ ${amount.toFixed(2)}`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Genera el documento HTML completo optimizado para impresoras térmicas de tickets
 * (58mm o 80mm por cable USB / red / Bluetooth).
 *
 * Admite dos modos:
 * - 'cocina': enfocado 100% en la preparación (nombre del cliente grande, código, hora,
 *   tipo de pedido, cantidades y notas destacadas; sin precios ni datos de despacho).
 * - 'motorizado': comanda completa para reparto / caja (datos de entrega, dirección,
 *   referencia, motorizado, desglose de precios, totales y forma de pago clara).
 */
export function buildComandaHtml({
  order,
  items,
  bizName = 'Tindivo Negocio',
  mode = 'motorizado',
}: {
  order: OrderVM
  items: DetailItem[]
  bizName?: string
  mode?: ComandaMode
}): string {
  const isDelivery = order.method === 'delivery'
  const isPickup = order.method === 'pickup'
  const isPickupNow = isPickup && order.pickupTiming === 'now'
  const isCocina = mode === 'cocina'

  const now = new Date()
  const horaStr = new Intl.DateTimeFormat('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/Lima',
  }).format(now)

  const fechaCompletaStr = new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(now)

  // Tipo de servicio
  const tipoServicio = isDelivery ? 'DELIVERY' : isPickup ? 'RECOJO EN TIENDA' : 'PARA LLEVAR'

  // Desglose de pago según UiPayment del sistema (solo para motorizado / despacho)
  const effectivePayment = order.paymentReal ?? order.payment
  let paymentText = 'EFECTIVO'
  let paymentDetails = ''

  if (effectivePayment === 'prepaid') {
    paymentText = 'PREPAGO (ONLINE / YAPE)'
    if (order.yaCobrado) {
      paymentDetails =
        '<div class="bold text-center" style="margin-top: 3px; font-size: 13px;">*** [ ✓ YA PAGÓ - NO COBRAR ] ***</div>'
    } else {
      paymentDetails =
        '<div class="text-center" style="margin-top: 3px;">[ Por verificar comprobante ]</div>'
    }
  } else if (effectivePayment === 'pending_wallet') {
    paymentText = 'BILLETERA (YAPE / PLIN)'
    if (order.yaCobrado) {
      paymentDetails =
        '<div class="bold text-center" style="margin-top: 3px; font-size: 13px;">*** [ ✓ YA PAGÓ EN CAJA ] ***</div>'
    } else {
      paymentDetails = `<div class="bold text-center" style="margin-top: 3px; font-size: 14px;">*** COBRAR AL ENTREGAR: ${fmtMoney(order.total)} ***</div>`
    }
  } else if (effectivePayment === 'pending_mixed') {
    paymentText = 'PAGO MIXTO'
    const yapePart = order.walletPart ? `Billetera ${fmtMoney(order.walletPart)}` : ''
    const cashPart = order.cashPart ? `Efectivo ${fmtMoney(order.cashPart)}` : ''
    paymentDetails = `
      <div class="text-center">(${[yapePart, cashPart].filter(Boolean).join(' + ')})</div>
      <div class="bold text-center" style="margin-top: 3px; font-size: 14px;">*** COBRAR AL ENTREGAR: ${fmtMoney(order.total)} ***</div>
    `
  } else {
    paymentText = 'EFECTIVO'
    if (order.yaCobrado) {
      paymentDetails =
        '<div class="bold text-center" style="margin-top: 3px; font-size: 13px;">*** [ ✓ COBRADO EN CAJA ] ***</div>'
    } else if (order.paysWith && order.paysWith > 0) {
      const vuelto =
        order.cashChange ?? (order.paysWith > order.total ? order.paysWith - order.total : 0)
      paymentDetails = `
        <div class="row"><span>Paga con:</span> <span class="bold">${fmtMoney(order.paysWith)}</span></div>
        <div class="row"><span>Vuelto a dar:</span> <span class="bold">${fmtMoney(vuelto)}</span></div>
        <div class="bold text-center" style="margin-top: 3px; font-size: 14px;">*** COBRAR AL ENTREGAR: ${fmtMoney(order.total)} ***</div>
      `
    } else {
      paymentDetails = `<div class="bold text-center" style="margin-top: 3px; font-size: 14px;">*** COBRAR AL ENTREGAR: ${fmtMoney(order.total)} ***</div>`
    }
  }

  // Filas de productos para COCINA (sin precios, cantidad grande, notas bien visibles)
  const itemsCocinaHtml = items
    .map((it) => {
      const noteHtml = it.note
        ? `<div class="item-note">*** NOTA: ${escapeHtml(it.note.toUpperCase())} ***</div>`
        : ''
      const modsHtml = it.mods
        ? `<div class="item-mods">• ${escapeHtml(it.mods.toUpperCase())}</div>`
        : ''

      return `
        <div class="item-block-cocina">
          <div class="item-header-cocina">
            <span class="item-qty-cocina">[ ${it.qty}x ]</span>
            <span class="item-name-cocina">${escapeHtml(it.name.toUpperCase())}</span>
          </div>
          ${modsHtml}
          ${noteHtml}
        </div>
      `
    })
    .join('')

  // Filas de productos para MOTORIZADO (con precios y subtotales)
  const itemsMotorizadoHtml = items
    .map((it) => {
      const noteHtml = it.note
        ? `<div class="item-note">*** NOTA: ${escapeHtml(it.note)} ***</div>`
        : ''
      const modsHtml = it.mods ? `<div class="item-mods">• ${escapeHtml(it.mods)}</div>` : ''

      return `
        <div class="item-block">
          <div class="row item-header">
            <span class="item-title"><strong class="bold">[ ${it.qty}x ]</strong> ${escapeHtml(it.name)}</span>
            <span class="item-price bold">${fmtMoney(it.price * it.qty)}</span>
          </div>
          ${modsHtml}
          ${noteHtml}
        </div>
      `
    })
    .join('')

  // ==========================================
  // ESTILOS TÉRMICOS DE ALTO CONTRASTE (POS)
  // ==========================================
  const baseStyles = `
    @page {
      margin: 0;
      size: auto;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: Arial, "Helvetica Neue", Helvetica, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.25;
      color: #000000;
      background: #ffffff;
      width: 100%;
      max-width: 76mm;
      margin: 0 auto;
      padding: 6px 4px 18px 4px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      text-rendering: geometricPrecision;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: 800; }
    .bolder { font-weight: 900; }

    /* Líneas divisorias térmicas nítidas */
    .divider-solid {
      border-top: 2px solid #000000;
      margin: 6px 0;
    }
    .divider-double {
      border-top: 2px solid #000000;
      border-bottom: 1.5px solid #000000;
      height: 4px;
      margin: 6px 0;
    }
    .divider-dashed {
      border-top: 1.5px dashed #000000;
      margin: 6px 0;
    }

    /* Filas flexibles */
    .row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2px;
    }

    /* Encabezados y banners */
    .banner-type {
      border: 2px solid #000000;
      padding: 4px 2px;
      margin: 5px 0;
      text-align: center;
      font-weight: 900;
      font-size: 15px;
      letter-spacing: 0.5px;
    }

    /* Modificadores y notas */
    .item-mods {
      font-size: 12px;
      font-weight: 700;
      padding-left: 10px;
      margin-top: 1px;
      color: #000000;
    }
    .item-note {
      font-size: 12px;
      font-weight: 900;
      border: 1.5px solid #000000;
      padding: 2px 4px;
      margin-top: 3px;
      margin-left: 6px;
      color: #000000;
      background: transparent;
    }

    /* Pie de página */
    .footer {
      margin-top: 10px;
      font-size: 11px;
      text-align: center;
      line-height: 1.35;
    }
  `

  // ==========================================
  // PLANTILLA 1: COMANDA PARA COCINA
  // ==========================================
  if (isCocina) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Cocina #${escapeHtml(order.id)}</title>
  <style>
    ${baseStyles}
    .cocina-header-title {
      font-size: 15px;
      font-weight: 900;
      letter-spacing: 1px;
    }
    .cocina-order-id {
      font-size: 24px;
      font-weight: 900;
      letter-spacing: 1px;
      margin: 2px 0;
    }
    .cocina-time {
      font-size: 16px;
      font-weight: 800;
      margin-bottom: 4px;
    }
    .cocina-channel {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .cocina-client-box {
      border: 2px solid #000000;
      padding: 5px 2px;
      margin: 6px 0;
      text-align: center;
    }
    .cocina-client-label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .cocina-client-name {
      font-size: 20px;
      font-weight: 900;
      text-transform: uppercase;
      word-break: break-word;
      line-height: 1.15;
      margin-top: 1px;
    }
    .cocina-table-header {
      display: flex;
      justify-content: space-between;
      font-weight: 900;
      font-size: 13px;
      border-bottom: 2px solid #000000;
      padding-bottom: 3px;
      margin-top: 6px;
      margin-bottom: 6px;
    }
    .item-block-cocina {
      margin-bottom: 8px;
      page-break-inside: avoid;
    }
    .item-header-cocina {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      font-size: 15px;
      line-height: 1.2;
    }
    .item-qty-cocina {
      font-size: 17px;
      font-weight: 900;
      min-width: 38px;
      flex-shrink: 0;
    }
    .item-name-cocina {
      font-size: 15px;
      font-weight: 900;
      flex: 1;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <!-- Encabezado de Cocina -->
  <div class="text-center">
    <div class="cocina-header-title">*** COMANDA COCINA ***</div>
    <div class="cocina-order-id">#${escapeHtml(order.id)}</div>
    <div class="cocina-time">${escapeHtml(horaStr)}</div>
    <div class="cocina-channel">${escapeHtml(bizName.toUpperCase())}</div>
  </div>

  <div class="divider-solid"></div>

  <!-- Tipo de Pedido -->
  <div class="banner-type">
    ${escapeHtml(tipoServicio)}
    ${isPickupNow ? '<div style="font-size: 12px; font-weight: 800; margin-top: 2px;">(CLIENTE EN EL LOCAL)</div>' : ''}
  </div>

  <!-- Nombre del Cliente Muy Grande -->
  <div class="cocina-client-box">
    <div class="cocina-client-label">CLIENTE</div>
    <div class="cocina-client-name">${escapeHtml(order.customer || 'CLIENTE')}</div>
  </div>

  <div class="divider-double"></div>

  <!-- Cabecera de Productos -->
  <div class="cocina-table-header">
    <span>CANT.</span>
    <span>PRODUCTO / DETALLE</span>
  </div>

  <!-- Lista de Productos -->
  ${itemsCocinaHtml}

  <div class="divider-double"></div>

  <!-- Pie de Comanda -->
  <div class="footer">
    <div class="bold">${escapeHtml(fechaCompletaStr)}</div>
    <div class="bold" style="margin-top: 4px;">¡Buen provecho! · Tindivo Delivery</div>
    <div>tindivo.com · San Jacinto</div>
  </div>
</body>
</html>`
  }

  // ==========================================
  // PLANTILLA 2: COMANDA PARA MOTORIZADO / CAJA
  // ==========================================
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Comanda #${escapeHtml(order.id)}</title>
  <style>
    ${baseStyles}
    .header-logo {
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 0.5px;
    }
    .header-biz {
      font-size: 16px;
      font-weight: 900;
      margin-top: 2px;
      text-transform: uppercase;
    }
    .field-label {
      font-weight: 800;
      min-width: 90px;
      font-size: 13px;
    }
    .field-val {
      flex: 1;
      text-align: right;
      word-break: break-word;
      font-size: 13px;
    }
    .items-header {
      font-weight: 900;
      border-bottom: 2px solid #000000;
      padding-bottom: 3px;
      margin-top: 6px;
      margin-bottom: 6px;
      font-size: 13px;
    }
    .item-block {
      margin-bottom: 6px;
      page-break-inside: avoid;
    }
    .item-header {
      font-size: 13px;
    }
    .item-title {
      flex: 1;
      padding-right: 6px;
    }
    .item-title strong {
      font-size: 14px;
      font-weight: 900;
    }
    .item-price {
      font-size: 13px;
      white-space: nowrap;
    }
    .totals-area {
      margin-top: 4px;
    }
    .total-grand {
      font-size: 16px;
      font-weight: 900;
      border-top: 2px solid #000000;
      border-bottom: 2px solid #000000;
      padding: 4px 0;
      margin: 6px 0;
    }
    .payment-box {
      border: 1.5px solid #000000;
      padding: 5px;
      margin: 6px 0;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <!-- Encabezado de Plataforma y Restaurante -->
  <div class="text-center">
    <div class="header-logo">TINDIVO · SAN JACINTO</div>
    <div class="header-biz">${escapeHtml(bizName.toUpperCase())}</div>
  </div>

  <div class="divider-double"></div>

  <!-- Pedido y Hora -->
  <div class="row">
    <span class="bolder" style="font-size: 16px;">PEDIDO: #${escapeHtml(order.id)}</span>
    <span class="bold" style="font-size: 12px;">${escapeHtml(fechaCompletaStr)}</span>
  </div>

  <!-- Tipo de Pedido -->
  <div class="banner-type">
    &gt;&gt;&gt; ${escapeHtml(tipoServicio)} &lt;&lt;&lt;
    ${isPickupNow ? '<div style="font-size: 11px; font-weight: 800; margin-top: 2px;">(CLIENTE EN EL LOCAL)</div>' : ''}
  </div>

  <!-- Datos del Cliente y Envío -->
  <div class="row">
    <span class="field-label">CLIENTE:</span>
    <span class="field-val bolder">${escapeHtml(order.customer || 'Cliente')}</span>
  </div>
  <div class="row">
    <span class="field-label">TELÉFONO:</span>
    <span class="field-val bold">${escapeHtml(order.phone || 'No registrado')}</span>
  </div>

  ${
    isDelivery
      ? `
    <div class="row">
      <span class="field-label">DIRECCIÓN:</span>
      <span class="field-val bolder">${escapeHtml(order.address || order.addressRef || 'Sin dirección')}</span>
    </div>
    ${
      order.addressRef && order.address !== order.addressRef
        ? `
      <div class="row">
        <span class="field-label">REFERENCIA:</span>
        <span class="field-val bold">${escapeHtml(order.addressRef)}</span>
      </div>
    `
        : ''
    }
    <div class="row">
      <span class="field-label">MOTORIZADO:</span>
      <span class="field-val bold">${escapeHtml(order.driver?.name || 'Por asignar')}</span>
    </div>
  `
      : ''
  }

  <div class="divider-dashed"></div>

  <!-- Lista de Productos con Precios -->
  <div class="row items-header">
    <span>CANT. &amp; DESCRIPCIÓN</span>
    <span>IMPORTE</span>
  </div>

  ${itemsMotorizadoHtml}

  <div class="divider-dashed"></div>

  <!-- Totales y Finanzas -->
  <div class="totals-area">
    <div class="row">
      <span>Subtotal productos:</span>
      <span class="bold">${fmtMoney(order.subtotal ?? order.total - (order.deliveryFee ?? 0))}</span>
    </div>
    ${
      isDelivery
        ? `
      <div class="row">
        <span>Costo de envío:</span>
        <span class="bold">${fmtMoney(order.deliveryFee ?? 0)}</span>
      </div>
    `
        : ''
    }
    <div class="row total-grand">
      <span>TOTAL A COBRAR:</span>
      <span>${fmtMoney(order.total)}</span>
    </div>
  </div>

  <!-- Método de Pago -->
  <div class="payment-box">
    <div class="row">
      <span class="bold">FORMA DE PAGO:</span>
      <span class="bold">${escapeHtml(paymentText)}</span>
    </div>
    ${paymentDetails}
  </div>

  <div class="divider-double"></div>

  <!-- Pie de Comanda -->
  <div class="footer">
    <div class="bold">¡Buen provecho! · Tindivo Delivery</div>
    <div>tindivo.com · San Jacinto</div>
  </div>
</body>
</html>`
}

/**
 * Lanza la impresión de la comanda mediante un iframe temporal aislado.
 * Compatible con impresoras de cable USB, WiFi y Bluetooth en PC y tablets Android.
 */
export function printComanda({
  order,
  items,
  bizName,
  mode = 'motorizado',
}: {
  order: OrderVM
  items: DetailItem[]
  bizName?: string
  mode?: ComandaMode
}): void {
  if (typeof window === 'undefined') return

  const html = buildComandaHtml({ order, items, bizName, mode })

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.setAttribute('aria-hidden', 'true')
  iframe.id = 'comanda-print-iframe'

  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    document.body.removeChild(iframe)
    return
  }

  doc.open()
  doc.write(html)
  doc.close()

  // Dar tiempo al motor de renderizado para cargar layout
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch {
      // Fallback si el navegador bloquea print() en iframe
      window.print()
    } finally {
      // Limpiar iframe tras dar margen a la apertura del diálogo de impresión
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe)
        }
      }, 2000)
    }
  }, 250)
}
