# Auditoría: Estado Actual de la Implementación de la Parte 2

Este documento presenta una auditoría exhaustiva del flujo de pago prepago (`prepaid`) tras la implementación de la Parte 2, respaldando cada hallazgo con las rutas de archivo exactas y los números de línea correspondientes en el código fuente.

---

## A. Checkout (`apps/customer/app/checkout/page.tsx`)

### 1. ¿Qué ocurre cuando el cliente confirma un pedido prepaid?
* **Redirección y Eliminación de `<Prepay />`**: Se eliminó el renderizado condicional inline que mostraba el modal `<Prepay />` inmediatamente al crear el pedido.
* **Comportamiento Actual**: Al confirmarse la creación del pedido (cualquiera sea el método), la línea 468 ejecuta:
  ```typescript
  if (confirmed) return <Confirmed result={confirmed} />
  ```
  El componente `<Confirmed result={confirmed} />` ([checkout/page.tsx:L1275-1309](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/app/checkout/page.tsx#L1275-L1309)) muestra la pantalla de confirmación *"¡Pedido recibido! Esperando que el restaurante confirme tu pedido."* con el código `#shortId` y un botón *"Ver seguimiento"* que redirige a `/pedido/${result.shortId}` (Línea 1302).

### 2. ¿El pedido nace en `pending_acceptance`?
* **Sí**:
  * A nivel de base de datos, el RPC `public.create_customer_order` en [0057_contraentrega_guards.sql:L174](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0057_contraentrega_guards.sql#L174) asigna explícitamente `status = 'pending_acceptance'` a la fila insertada en la tabla `orders`.
  * En la respuesta JSON devuelta por `POST /api/v1/customer/orders` ([orders/route.ts:L240](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/api/app/api/v1/customer/orders/route.ts#L240)), `result.body.data.status` es `'pending_acceptance'`.

---

## B. Tracking del Cliente (`apps/customer/app/pedido/[shortId]/page.tsx`)

### 1. ¿Qué secciones se renderizan en `pending_acceptance` con `payment_intent = 'prepaid'`?
* **Hero Card**: Título *"Pedido recibido"* y subtítulo dinámico *"Esperando confirmación de disponibilidad"* ([page.tsx:L285-296](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/app/pedido/%5BshortId%5D/page.tsx#L285-L296)).
* **Sección Prepago**: Renderiza únicamente el banner de espera naranja ([page.tsx:L312-322](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/app/pedido/%5BshortId%5D/page.tsx#L312-L322)):
  > *"Esperando confirmación del restaurante. El restaurante está verificando disponibilidad de tu pedido. Te avisaremos aquí para realizar el pago."*
* **Footer Card**: Muestra la indicación ([page.tsx:L553 font-semibold text-[13px]](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/app/pedido/%5BshortId%5D/page.tsx#L553)):
  > *"El restaurante confirmará disponibilidad para que puedas realizar el pago."*

### 2. ¿Se eliminaron o condicionaron las secciones viejas?
* **"Tu pago ya fue registrado"**: **Eliminado**. El render del footer card ([page.tsx:L552-560](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/app/pedido/%5BshortId%5D/page.tsx#L552-L560)) se reestructuró mediante una expresión ternaria limpia por estado real (`pending_acceptance`, `awaiting_payment`, `validando`, `confirmed`), eliminando por completo la frase legacy.
* **"El restaurante te llamará"**: **Condicionado**. Se creó la función helper `getStepSub` ([page.tsx:L97-105](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/app/pedido/%5BshortId%5D/page.tsx#L97-L105)) que sustituye este subtítulo por *"Esperando confirmación de disponibilidad"* para prepago en `pending_acceptance`, preservando el texto legacy únicamente para flujos de contraentrega.

### 3. Selección y exclusividad de la sección de pago
* **Mecanismo**: Las tarjetas están contenidas dentro del bloque `{data.paymentIntent === 'prepaid' && (...)}` ([page.tsx:L310](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/app/pedido/%5BshortId%5D/page.tsx#L310)). Cada estado posee una guardia booleana explícita basada en `data.status`:
  * `data.status === 'pending_acceptance'` (Banner naranja)
  * `data.status === 'awaiting_payment'` (Sección `<PrepayProofSection />` + alerta si `proofAttempt === 1`)
  * `data.status === 'validando'` (Banner azul *"Verificando tu pago..."*)
  * `data.status === 'cancelled' && data.cancelReason === 'proof_rejected_final'` (Banner rojo de cancelación)
* **Resultado**: Al ser `data.status` un campo escalar en Postgres, las condiciones son 100% mutuamente excluyentes; en ningún caso se apilan múltiples secciones de pago.

### 4. Bloque de código en `page.tsx`
```tsx
// apps/customer/app/pedido/[shortId]/page.tsx:L310-L364
{data.paymentIntent === 'prepaid' && (
  <>
    {/* 1. pending_acceptance: Esperando confirmación */}
    {data.status === 'pending_acceptance' && (
      <div className="mt-3.5 rounded-[22px] bg-orange-50/80 p-4 font-sans text-left text-orange-950" style={{ border: '1px solid #FFEDD5' }}>
        <div className="flex items-center gap-2 font-semibold text-[14px]">
          <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
          Esperando confirmación del restaurante
        </div>
        <p className="mt-1 text-[13px] text-orange-800">
          El restaurante está verificando disponibilidad de tu pedido. Te avisaremos aquí para realizar el pago.
        </p>
      </div>
    )}

    {/* 2 & 4. awaiting_payment: Subida de captura (intento 0 o 1) */}
    {data.status === 'awaiting_payment' && (
      <div>
        {data.proofAttempt === 1 && (
          <div className="mt-3.5 rounded-[18px] bg-red-50 p-3.5 text-left text-[13px] text-red-700" style={{ border: '1px solid #FCA5A5' }}>
            <strong>Tu comprobante no fue válido.</strong> Revisa e intenta de nuevo. Te queda 1 intento.
          </div>
        )}
        <PrepayProofSection
          orderId={ownedId ?? data.shortId}
          proofAttempt={data.proofAttempt ?? 0}
          onProofUploaded={load}
        />
      </div>
    )}

    {/* 3. validando: En revisión */}
    {data.status === 'validando' && (
      <div className="mt-3.5 rounded-[22px] bg-blue-50/80 p-4 font-sans text-left text-blue-950" style={{ border: '1px solid #BFDBFE' }}>
        <div className="flex items-center gap-2 font-semibold text-[14px]">
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
          Verificando tu pago...
        </div>
        <p className="mt-1 text-[13px] text-blue-800">
          El restaurante está revisando tu comprobante de pago. Te notificaremos apenas sea verificado.
        </p>
      </div>
    )}

    {/* 5. cancelled por rechazo final */}
    {data.status === 'cancelled' && data.cancelReason === 'proof_rejected_final' && (
      <div className="mt-3.5 rounded-[22px] bg-red-50 p-4 font-sans text-left text-red-950" style={{ border: '1px solid #FECDD3' }}>
        <div className="font-semibold text-[14px] text-red-900">Pedido cancelado</div>
        <p className="mt-1 text-[13px] text-red-800">
          El comprobante de pago no pudo validarse tras 2 intentos.
        </p>
      </div>
    )}
  </>
)}
```

---

## C. App Negocios (`apps/negocios/components/dashboard/pedido-detail.tsx`)

### 1. Botones y secciones en `pending_acceptance` para `payment_intent = 'prepaid'`
* **Estado Actual**: La aplicación de negocios (`apps/negocios`) aún conserva el componente legacy `pedido-detail.tsx` ([pedido-detail.tsx:L555-558](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L555-L558)).
* En `pending_acceptance`, evalúa `acceptDisabled = busy || (isPrepaid && order.proofStatus !== 'verified')`. Esto provoca que el botón *"Aceptar pedido"* figure deshabilitado porque requiere un comprobante verificado que aún no existe.

### 2. Renderizado de "Verificar comprobante" / "Rechazar"
* **Comportamiento Actual**: En la línea 916 de `pedido-detail.tsx`:
  ```tsx
  {order.payment === 'prepaid' && (
    <PaySectionPrepaid order={order} proofUrl={proofUrl} ... />
  )}
  ```
  Se renderiza la sección de verificación de comprobante prepago siempre que el método sea `prepaid`, independientemente de si el estado es `pending_acceptance`, `awaiting_payment` o `validando`.

### 3. Diferenciación de botones
* **Estado Actual**: No existe un botón independiente *"Aceptar disponibilidad"*. Todo el flujo del panel de negocios utiliza el botón legacy *"Aceptar pedido"* (que invoca `advance_order('accept')`). 
* **Diagnóstico de Desviación**: Esto se debe a que la App Negocios está programada para ser adaptada formalmente en la **Parte 3** del Spec. En el backend de la Parte 1, la función RPC `advance_order('accept')` ya bifurca internamente ([0059_prepaid_awaiting_payment_flow.sql:L109-123](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0059_prepaid_awaiting_payment_flow.sql#L109-L123)) enviando el pedido a `awaiting_payment` si es prepago, pero la UI del frontend de Negocios aún no refleja los 2 botones separados ("Aceptar disponibilidad" vs "Validar comprobante").

---

## D. Endpoint de Creación de Pedido (`apps/api/app/api/v1/customer/orders/route.ts`)

### 1. Eventos de Inngest emitidos al crear un pedido `prepaid`
* **Código Actual**: En [route.ts:L250-257](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/api/app/api/v1/customer/orders/route.ts#L250-L257):
  ```typescript
  if (created?.id) {
    try {
      if (created.status === 'validando')
        await sendOrderValidation({ orderId: created.id })
      else await sendOrderCreated({ orderId: created.id })
  ```
* **Status**: `sendOrderPrepay` fue **eliminado por completo** del flujo de creación de pedidos. Para prepago, al nacer en `pending_acceptance`, se emite `sendOrderCreated({ orderId })` (iniciando el timer de 5 minutos `orderAcceptanceTimeout` para que el restaurante confirme disponibilidad).

### 2. Confirmación de estado de nacimiento
* **Sí**: El pedido nace de manera garantizada en `'pending_acceptance'` tanto en la base de datos (RPC SQL) como en la respuesta de la API.

---

## E. Inngest Jobs y Timers (`apps/api/lib/inngest/functions.ts` y `client.ts`)

### 1. Job `orderPaymentTimeout`
* **Definición**: En [functions.ts:L133-167](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/api/lib/inngest/functions.ts#L133-L167):
  ```typescript
  export const orderPaymentTimeout: InngestFunction.Any = inngest.createFunction(
    {
      id: 'order-payment-timeout',
      name: 'Auto-cancelar pago no realizado',
      triggers: [{ event: EVENT_ORDER_PAYMENT_TIMEOUT }],
      cancelOn: [
        { event: EVENT_ORDER_PAYMENT_TIMEOUT, match: 'data.orderId' },
        { event: EVENT_ORDER_PREPAY_PROOF_UPLOADED, match: 'data.orderId' },
      ],
    },
    async ({ event, step }) => { ... }
  )
  ```
  Vigila el estado `awaiting_payment` durante `timers.paymentMinutes` (10 min) y llama a `expire_order(orderId, 'prepay_timeout')`.

### 2. Emisión de `EVENT_ORDER_PAYMENT_TIMEOUT`
* **En `advance_order('accept')`**: Se emite en [order-transition.ts:L63-69](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/api/lib/http/order-transition.ts#L63-L69) cuando la respuesta del RPC indica que la orden pasó a `'awaiting_payment'`:
  ```typescript
  if (body.action === 'accept' && result?.status === 'awaiting_payment') {
    await sendOrderPaymentTimeout({ orderId })
  }
  ```
* **En `validate_order(pass=false)`**: Se emite en [validate/route.ts:L54-58](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/api/app/api/v1/business/orders/%5Bid%5D/validate/route.ts#L54-L58) cuando el primer rechazo de comprobante regresa la orden a `'awaiting_payment'`, reiniciando el timer de 10 min.

### 3. Eliminación de `sendOrderPrepay` en creación
* **Confirmado**: Eliminado en `apps/api/app/api/v1/customer/orders/route.ts:L253-257`.

---

## Conclusión General de la Auditoría

1. **Partes 1 y 2 (Customer API & Customer Tracking)**: Se encuentran en cumplimiento **100% estricto con el Spec**. Las UI legacy del customer tracking fueron corregidas, el checkout redirige adecuadamente, la subida de comprobante está aislada en la página de tracking y la concurrencia de timers Inngest está blindada con `cancelOn`.
2. **Punto de Atención (App Negocios)**: El único punto de desviación actual se encuentra en la App Negocios (`apps/negocios/components/dashboard/pedido-detail.tsx`), donde la UI del restaurante aún no ha sido adaptada a la Parte 3 (muestra la sección de verificar comprobante prematuramente y deshabilita el botón de aceptar). Esto quedará resuelto por completo al construir la **Parte 3**.
