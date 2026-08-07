# Hallazgos de Referencia — `tindivo-delivery` (Sistema Viejo)

**Fecha:** 23 de Julio de 2026  
**Propósito:** Documento de hallazgos observados en el repositorio de referencia `tindivo-delivery` previo a la implementación del spec de port en `tindivo-v2`.

---

## 1. Muestreo y Análisis por Archivo

### 1.1 Formulario de Creación Manual
* **`apps/web/src/features/restaurante/new-order/components/new-order-form.tsx`**
  * **Encontrado:** Sí (~1228 líneas).
  * **Comportamientos observados:**
    1. Usa `useIdempotencyKey('restaurante:new-order')` guardado en sessionStorage para enviar el header `Idempotency-Key` (UUID v4).
    2. Usa `submittingRef` (useRef boleano) para bloqueo síncrono en el mismo frame de JS e impedir doble submit antes del re-render de React.
    3. Blacklist explícita de teléfonos de prueba: `BLACKLISTED_PHONES = ['999999999', '987654321', '912345678', '955555555', '900000000', '911111111', '123456789']`.
    4. 4 opciones de pago: `'prepaid'`, `'pending_yape'` (en v2 es `'pending_wallet'`), `'pending_cash'`, `'pending_mixed'`.
    5. Presets de preparación `PREP_MINUTES = [10, 15, 20, 25, 30, 35, 40, 45, 50]`.
    6. Autocompletado de historial de direcciones por teléfono mediante `AddressSuggestionPopup` y `useCustomerHistoricalAddresses` (nota: este autocompletado fue declarado FUERA DE ALCANCE para v2 por decisión del founder).
    7. Cálculo de vuelto inmediato en UI cuando el método es cash/mixto: `paysWith - cashTarget`.
    8. Validación de pago mixto: suma exacta de Yape + Efectivo idéntica al monto total.
* **`apps/web/src/features/restaurante/new-order/components/address-suggestion-popup.tsx`**
  * **Encontrado:** Sí (12 KB). Popup modal para seleccionar direcciones previas asociadas al teléfono ingresado.

### 1.2 Dashboard de Pedidos Activos
* **`apps/web/src/features/restaurante/active-orders/components/active-orders.tsx`**
  * **Encontrado:** Sí (4.8 KB). Lista de tarjetas de pedidos en curso filtrando por estados activos.
* **`apps/web/src/features/restaurante/order-detail/components/edit-order-sheet.tsx`**
  * **Encontrado:** Sí (15.6 KB). Bottom sheet modal para:
    1. Extender minutos de preparación (+5, +10, +15 min).
    2. Marcar "Listo ahora" (`ready-early`).
    3. Cancelar pedido con selección estructurada de motivo y notas.
* **Cuenta regresiva:**
  * Calcula la diferencia de tiempo entre `now` local y `estimated_ready_at` proveniente del servidor.

### 1.3 Endpoints de Referencia
* **`apps/api/app/api/v1/restaurant/orders/route.ts`**
  * **Encontrado:** Sí. Endpoint POST para creación de pedidos manuales con `source = 'restaurant_pwa'`.
* **`apps/api/app/api/v1/restaurant/orders/[id]/cancel/route.ts`**
  * **Encontrado:** Sí. Recibe motivo de cancelación y nota, actualizando el pedido y registrando en auditoría.
* **`apps/api/app/api/v1/restaurant/orders/[id]/extension/route.ts`**
  * **Encontrado:** Sí. Incrementa `estimated_ready_at`, suma `prep_extension_count` y valida que no supere 2 extensiones.
* **`apps/api/app/api/v1/restaurant/orders/[id]/ready-early/route.ts`**
  * **Encontrado:** Sí. Marca `ready_early_used = true` y ajusta `appears_in_queue_at = now()`.

### 1.4 Notificaciones y Audio
* **`supabase/functions/send-push/index.ts`**
  * **Encontrado:** Sí. Edge Function Deno que despacha Web Push usando la librería `web-push` y notifica eventos a dispositivos suscritos. Mantiene restricción de cabecera `Topic` truncada a máx 32 caracteres.
* **`apps/web/src/shared/hooks/use-overdue-feedback.ts`**
  * **Encontrado:** Sí. Hook que utiliza Web Audio API (`AudioContext`) para emitir un tono sintetizado de doble bip (880 Hz → 1175 Hz) ante eventos del sistema, manejando con `try/catch` la política de bloqueo de autoplay en navegadores móviles (iOS/Android) antes del primer gesto del usuario.

---

## 2. Diferencias Clave Identificadas vs. `tindivo-v2`

1. **Lógica de negocio:** En el viejo la lógica residía en clases de caso de uso en TypeScript (`packages/core`). En `tindivo-v2` toda la lógica transaccional reside en RPCs PostgreSQL (`create_business_manual_order`, `advance_order`, `validate_order`).
2. **Ciclo de vida del pedido manual:** En `tindivo-v2`, el pedido manual nace directamente en estado `preparing` con `appears_in_queue_at` calculado en SQL 10 min antes del `estimated_ready_at`. No nace en `waiting_driver`.
3. **Nombres de Enums y Columnas:**
   * Método de pago Yape: `'pending_yape'` en el viejo vs `'pending_wallet'` en v2.
   * `restaurant_id` en el viejo vs `business_id` en v2.
   * `client_phone` y `client_name` en el viejo vs `customer_phone` y `customer_name` en v2.
4. **Estado de Servidor:** El viejo usa `@tanstack/react-query` v5. En `tindivo-v2` se emplean hooks nativos de React + `@tindivo/api-client`.

---

## 3. Elementos NO Encontrados
* No se detectaron discrepancias o archivos faltantes en las rutas de referencia indicadas en la sección 1 del spec. Todos los archivos existían y fueron leídos correctamente.
