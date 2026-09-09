import type { OrderVM } from '@/lib/orders/view-model'
import type { DetailItem } from './types'

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
 */
export function buildComandaHtml({
  order,
  items,
  bizName = 'Tindivo Negocio',
}: {
  order: OrderVM
  items: DetailItem[]
  bizName?: string
}): string {
  const isDelivery = order.method === 'delivery'
  const isPickup = order.method === 'pickup'
  const isPickupNow = isPickup && order.pickupTiming === 'now'

  const now = new Date()
  const fechaStr = new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(now)

  // Desglose de pago según UiPayment del sistema
  const effectivePayment = order.paymentReal ?? order.payment
  let paymentText = 'EFECTIVO'
  let paymentDetails = ''

  if (effectivePayment === 'prepaid') {
    paymentText = 'PREPAGO (ONLINE / YAPE)'
    if (order.yaCobrado) {
      paymentDetails =
        '<div class="bold" style="margin-top: 2px;">*** [ ✓ YA PAGÓ - NO COBRAR ] ***</div>'
    } else {
      paymentDetails = '<div style="margin-top: 2px;">[ Por verificar comprobante ]</div>'
    }
  } else if (effectivePayment === 'pending_wallet') {
    paymentText = 'BILLETERA (YAPE / PLIN)'
    if (order.yaCobrado) {
      paymentDetails =
        '<div class="bold" style="margin-top: 2px;">*** [ ✓ COBRADO EN CAJA ] ***</div>'
    } else {
      paymentDetails = `<div class="bold" style="margin-top: 2px;">*** COBRAR AL ENTREGAR: ${fmtMoney(order.total)} ***</div>`
    }
  } else if (effectivePayment === 'pending_mixed') {
    paymentText = 'PAGO MIXTO'
    const yapePart = order.walletPart ? `Billetera ${fmtMoney(order.walletPart)}` : ''
    const cashPart = order.cashPart ? `Efectivo ${fmtMoney(order.cashPart)}` : ''
    paymentDetails = `
      <div>(${[yapePart, cashPart].filter(Boolean).join(' + ')})</div>
      <div class="bold" style="margin-top: 2px;">*** COBRAR AL ENTREGAR: ${fmtMoney(order.total)} ***</div>
    `
  } else {
    paymentText = 'EFECTIVO'
    if (order.yaCobrado) {
      paymentDetails =
        '<div class="bold" style="margin-top: 2px;">*** [ ✓ COBRADO EN CAJA ] ***</div>'
    } else if (order.paysWith && order.paysWith > 0) {
      const vuelto =
        order.cashChange ?? (order.paysWith > order.total ? order.paysWith - order.total : 0)
      paymentDetails = `
        <div class="row"><span>Paga con:</span> <span>${fmtMoney(order.paysWith)}</span></div>
        <div class="row"><span>Vuelto a dar:</span> <span>${fmtMoney(vuelto)}</span></div>
        <div class="bold" style="margin-top: 2px;">*** COBRAR AL ENTREGAR: ${fmtMoney(order.total)} ***</div>
      `
    } else {
      paymentDetails = `<div class="bold" style="margin-top: 2px;">*** COBRAR AL ENTREGAR: ${fmtMoney(order.total)} ***</div>`
    }
  }

  const itemsRows = items
    .map((it) => {
      const noteHtml = it.note
        ? `<div class="item-note">*** NOTA: ${escapeHtml(it.note)} ***</div>`
        : ''
      const modsHtml = it.mods ? `<div class="item-mods">• ${escapeHtml(it.mods)}</div>` : ''

      return `
        <div class="item-block">
          <div class="row item-header">
            <span class="item-title"><strong>[ ${it.qty}x ]</strong> ${escapeHtml(it.name)}</span>
            <span class="item-price">${fmtMoney(it.price * it.qty)}</span>
          </div>
          ${modsHtml}
          ${noteHtml}
        </div>
      `
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Comanda #${escapeHtml(order.id)}</title>
  <style>
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
      font-family: 'JetBrains Mono', 'Courier New', Courier, monospace;
      font-size: 13px;
      line-height: 1.3;
      color: #000;
      background: #fff;
      width: 100%;
      max-width: 80mm;
      margin: 0 auto;
      padding: 8px 6px 20px 6px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .header-logo {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 1px;
    }
    .header-biz {
      font-size: 16px;
      font-weight: 900;
      margin-top: 2px;
      text-transform: uppercase;
    }
    .divider-double {
      border-top: 2px solid #000;
      border-bottom: 1px solid #000;
      height: 3px;
      margin: 6px 0;
    }
    .divider-dashed {
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .banner-type {
      border: 2px solid #000;
      padding: 4px 2px;
      margin: 6px 0;
      text-align: center;
      font-weight: 900;
      font-size: 15px;
      letter-spacing: 0.5px;
    }
    .banner-sub {
      font-size: 11px;
      font-weight: bold;
      margin-top: 2px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2px;
    }
    .field-label {
      font-weight: bold;
      min-width: 85px;
    }
    .field-val {
      flex: 1;
      text-align: right;
      word-break: break-word;
    }
    .items-header {
      font-weight: bold;
      border-bottom: 1px solid #000;
      padding-bottom: 3px;
      margin-top: 6px;
      margin-bottom: 6px;
    }
    .item-block {
      margin-bottom: 6px;
      page-break-inside: avoid;
    }
    .item-header {
      font-size: 13px;
    }
    .item-title strong {
      font-size: 14px;
    }
    .item-mods {
      font-size: 11px;
      padding-left: 14px;
      color: #111;
      margin-top: 1px;
    }
    .item-note {
      font-size: 12px;
      font-weight: 900;
      border: 1px solid #000;
      padding: 2px 4px;
      margin-top: 3px;
      margin-left: 10px;
      background: #f0f0f0 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .totals-area {
      margin-top: 4px;
    }
    .total-grand {
      font-size: 16px;
      font-weight: 900;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      padding: 4px 0;
      margin: 4px 0;
    }
    .payment-box {
      border: 1px solid #000;
      padding: 4px;
      margin: 6px 0;
      font-size: 12px;
    }
    .footer {
      margin-top: 10px;
      font-size: 11px;
      text-align: center;
      line-height: 1.4;
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
    <span class="bold" style="font-size: 15px;">PEDIDO: #${escapeHtml(order.id)}</span>
    <span class="bold">${escapeHtml(fechaStr)}</span>
  </div>

  <!-- Tipo de Pedido (Muy visible para cocina y despacho) -->
  ${
    isDelivery
      ? `
    <div class="banner-type">
      >>> DELIVERY <<<
    </div>
  `
      : `
    <div class="banner-type">
      >>> RECOJO EN TIENDA <<<
      ${isPickupNow ? '<div class="banner-sub">(CLIENTE EN EL LOCAL)</div>' : '<div class="banner-sub">(PARA LLEVAR)</div>'}
    </div>
  `
  }

  <!-- Datos del Cliente y Envío -->
  <div class="row">
    <span class="field-label">CLIENTE:</span>
    <span class="field-val bold">${escapeHtml(order.customer || 'Cliente')}</span>
  </div>
  <div class="row">
    <span class="field-label">TELÉFONO:</span>
    <span class="field-val">${escapeHtml(order.phone || 'No registrado')}</span>
  </div>

  ${
    isDelivery
      ? `
    <div class="row">
      <span class="field-label">DIRECCIÓN:</span>
      <span class="field-val bold">${escapeHtml(order.address || order.addressRef || 'Sin dirección')}</span>
    </div>
    ${
      order.addressRef && order.address !== order.addressRef
        ? `
      <div class="row">
        <span class="field-label">REFERENCIA:</span>
        <span class="field-val">${escapeHtml(order.addressRef)}</span>
      </div>
    `
        : ''
    }
    <div class="row">
      <span class="field-label">MOTORIZADO:</span>
      <span class="field-val">${escapeHtml(order.driver?.name || 'Por asignar')}</span>
    </div>
  `
      : ''
  }

  <div class="divider-dashed"></div>

  <!-- Lista de Productos para Cocina -->
  <div class="row items-header">
    <span>CANT &amp; PRODUCTO</span>
    <span>TOTAL</span>
  </div>

  ${itemsRows}

  <div class="divider-dashed"></div>

  <!-- Totales y Finanzas -->
  <div class="totals-area">
    <div class="row">
      <span>Subtotal productos:</span>
      <span>${fmtMoney(order.subtotal ?? order.total - (order.deliveryFee ?? 0))}</span>
    </div>
    ${
      isDelivery
        ? `
      <div class="row">
        <span>Costo de envío:</span>
        <span>${fmtMoney(order.deliveryFee ?? 0)}</span>
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
    <div>tindivo.com · San Jacinto, Áncash</div>
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
}: {
  order: OrderVM
  items: DetailItem[]
  bizName?: string
}): void {
  if (typeof window === 'undefined') return

  const html = buildComandaHtml({ order, items, bizName })

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

  // Dar tiempo al motor de renderizado para cargar fuentes y layout
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
