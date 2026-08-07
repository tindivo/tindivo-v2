# Evaluación: Impacto de agregar el estado 'awaiting_payment'

Este reporte evalúa de forma detallada y fundamentada en el código del repositorio el impacto y las dependencias que se verían afectadas si se decide añadir el nuevo estado `'awaiting_payment'` a la máquina de estados de Tindivo 2.0.

---

## 1. Enum de estados (Database & TypeScript)

* **¿Dónde está definido el enum `order_status`?**
  * Está declarado a nivel de base de datos en Postgres mediante la migración SQL [0001_extensions_and_enums.sql:L19-L31](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0001_extensions_and_enums.sql#L19-L31).
* **¿Se referencia este enum en algún type de TypeScript compartido?**
  * Sí, en dos ubicaciones del paquete `@tindivo/contracts`:
    1. [packages/contracts/src/enums.ts:L19-L32](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/packages/contracts/src/enums.ts#L19-L32): Define el array de strings `ORDER_STATUSES`, el validador Zod `OrderStatusSchema` y el tipo TypeScript `OrderStatus`.
    2. [packages/contracts/src/order-status.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/packages/contracts/src/order-status.ts):
       * `ORDER_TRANSITIONS` (L16-27): El mapa de transiciones válidas.
       * `TERMINAL_STATUSES` (L30): El array de estados que cierran el ciclo de vida del pedido.
       * `STATUS_TO_TRACKING` (L48-59): El diccionario de proyección para mapear el estado granular del backend al paso visible para el cliente (`TrackingStep`).
* **¿Hay arrays o mapas hardcodeados de estados en el frontend?**
  * **Customer App**:
    * [pedidos/page.tsx:L31 y L43](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/app/pedidos/page.tsx#L31): Define el filtro de estados activos y sus etiquetas descriptivas de estado en la bandeja del cliente.
    * [app/page.tsx:L32](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/app/page.tsx#L32): Lista de chequeo de pedidos en curso.
  * **Negocios App**:
    * [view-model.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/lib/orders/view-model.ts): Define la unión de tipos `OrderStatus` (L9), la lógica de tabulado en `getColumn()` (L144), el mapeo visual de estados en `getUiState()` (L160) y las alertas de tiempo en `countdownSec` (L193).
  * **Motorizados App**:
    * [types.ts:L5](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/lib/types.ts#L5): Unión de tipos de estado que maneja el motorizado.
  * **Admin App**:
    * [labels.ts:L4 y L102](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/admin/lib/labels.ts#L4): El mapa de etiquetas/tonos `ORDER_STATUS` y el set de control `ACTIVE_STATUSES` de la plataforma.

---

## 2. advance_order RPC (Base de Datos)

* **Firma completa de la función**:
  ```sql
  create or replace function public.advance_order(
    p_order_id uuid,
    p_actor_user_id uuid,
    p_actor_role public.user_role,
    p_action text,
    p_params jsonb default '{}'::jsonb
  ) returns jsonb
  ```
  *(Definida en la migración [0012_advance_order_rpc.sql:L9-L16](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0012_advance_order_rpc.sql#L9-L16))*
* **Lógica de transiciones (CASE/IF)**:
  La transición canónica se decide mediante el bloque `case p_action` ([0012_advance_order_rpc.sql:L43-L84](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0012_advance_order_rpc.sql#L43-L84)):
  * `accept`: Exige estado `'pending_acceptance'`. Transiciona a `'confirmed'`.
  * `preparing`: Exige estado `'confirmed'`. Transiciona a `'preparing'`.
  * `ready`: Exige estado `'preparing'`. Transiciona a `'waiting_driver'`.
  * `take`: Exige estado `'preparing'` o `'waiting_driver'`. Transiciona a `'heading_to_restaurant'`.
  * `arrived`: Exige estado `'heading_to_restaurant'`. Transiciona a `'waiting_at_restaurant'`.
  * `pickup`: Exige estado `'waiting_at_restaurant'`. Transiciona a `'picked_up'`.
  * `deliver`: Exige estado `'picked_up'`. Transiciona a `'delivered'`.
  * `cancel`: Exige que el estado actual no sea ni `'delivered'` ni `'cancelled'`. Transiciona a `'cancelled'`.
* **Número de transiciones actuales**:
  Maneja **16 transiciones** en total (8 flujos operativos progresivos directos, más 8 desde estados activos hacia el estado de cancelación `'cancelled'`).

---

## 3. validate_order RPC (Base de Datos)

* **¿Qué estados acepta como input?**
  Acepta única y exclusivamente pedidos en estado **`'validando'`** ([0034_validate_order_reason_code.sql:L28](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0034_validate_order_reason_code.sql#L28)). Si recibe cualquier otro estado, aborta y retorna un json indicando `{ ok: false, status: current_status }`.
* **¿A qué estado transiciona cuando `pass = true`?**
  Transiciona al estado **`'pending_acceptance'`** ([0034_validate_order_reason_code.sql:L40](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0034_validate_order_reason_code.sql#L40)).

---

## 4. Jobs de Inngest (Backend & Scheduling)

Los siguientes 6 jobs en [apps/api/lib/inngest/functions.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/api/lib/inngest/functions.ts) controlan los deadlines del ciclo de vida del pedido:

1. **`orderAcceptanceTimeout`** (L27-56):
   * *Disparador*: `EVENT_ORDER_CREATED`.
   * *Timeout*: `timers.acceptanceMinutes` (por defecto **5 minutos**).
   * *Acción*: Verifica si el pedido sigue en `'pending_acceptance'`. Si es así, lo cambia a `'cancelled'` (motivo `'pending_acceptance_timeout'`).
2. **`orderValidationTimeout`** (L100-126):
   * *Disparador*: `EVENT_ORDER_VALIDATION`.
   * *Timeout*: `timers.validationMinutes` (por defecto **5 minutos**).
   * *Acción*: Verifica si el pedido sigue en `'validando'`. Si es así, lo cambia a `'cancelled'` (motivo `'validation_timeout'`).
3. **`orderPrepayTimeout`** (L133-161):
   * *Disparador*: `EVENT_ORDER_PREPAY`.
   * *Timeout*: `timers.prepayVerificationMinutes` (por defecto **10 minutos**).
   * *Acción*: Verifica si el pedido sigue en `'validando'`. Si es así, lo cambia a `'cancelled'` (motivo `'prepay_timeout'`).
4. **`cashSettlementAutoConfirm`** (L64-93):
   * *Disparador*: `EVENT_CASH_DELIVERED`.
   * *Timeout*: `timers.cashAutoConfirmHours` (por defecto **24 horas**).
   * *Acción*: Verifica si la liquidación sigue en `'pending_confirmation'` y la auto-confirma.
5. **`transferRequestTimeout`** (L169-194):
   * *Disparador*: `EVENT_TRANSFER_REQUESTED`.
   * *Timeout*: `timers.transferTtlSeconds` (por defecto **30 segundos**).
   * *Acción*: Ejecuta `expire_order_transfers()` para dar de baja transferencias entre motorizados expiradas.
6. **`orderNotifyBusiness`** (L199-233):
   * *Disparador*: `EVENT_ORDER_NOTIFY_BUSINESS`.
   * *Timeout*: Inmediato.
   * *Acción*: Envía la Web Push de notificación del nuevo pedido al operador.

---

## 5. Frontend - Customer App

* **Página de tracking**: [pedido/[shortId]/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/app/pedido/%5BshortId%5D/page.tsx).
* **Mapeo a textos/iconos**:
  * Proyecta el estado interno granular a un subgrupo simple visible para el cliente (`received`, `preparing`, `ontheway`, `delivered`, `cancelled`) delegando en la función exportada `toTrackingStep()` ([order-status.ts:L61](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/packages/contracts/src/order-status.ts#L61)).
  * El nuevo estado `'awaiting_payment'` debería incluirse en el mapeo de `STATUS_TO_TRACKING` de `@tindivo/contracts` para asignarle un paso de tracking de cliente (probablemente `'received'`).
* **Componente de línea de progreso**:
  * Usa el array de constantes `STEPS` ([page.tsx:L14-19](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/app/pedido/%5BshortId%5D/page.tsx#L14-L19)).
  * Calcula la barra de progreso en base a la posición del estado proyectado en el array:
    `const progress = ((currentIdx + 1) / STEPS.length) * 100` ([page.tsx:L242](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/app/pedido/%5BshortId%5D/page.tsx#L242)).

---

## 6. Frontend - Negocios App

* **Renderizado por estado (Agrupación/Filtros)**:
  * Agrupa las filas de pedidos en 4 columnas principales usando `getColumn()` ([view-model.ts:L143-157](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/lib/orders/view-model.ts#L143-L157)):
    * `'nuevos'`: Incluye `'pending_acceptance'` y `'validando'`.
    * `'cocina'`: Incluye `'confirmed'`, `'preparing'`, `'waiting_driver'`, `'heading_to_restaurant'` y `'waiting_at_restaurant'`.
    * `'reparto'`: Incluye `'picked_up'`.
    * `'entregados'`: Cualquier otro estado terminal.
* **Ubicación de botones de acción**:
  * Las peticiones se orquestan en el controlador de la página principal [negocios/app/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/page.tsx#L136-L198) bajo funciones como `onAction()`.
  * La interfaz que renderiza físicamente los botones de validar, aceptar, preparar, marcar como listo o cancelar está ubicada en el panel lateral de detalles: [components/dashboard/pedido-detail.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L554).

---

## 7. Frontend - Motorizados App

* **Estados que referencia**:
  Referencia activamente los estados vinculados a la logística de reparto:
  * `'waiting_driver'`: Para enlistar pedidos disponibles a tomar.
  * `'heading_to_restaurant'`: Indica que el motorizado va a la tienda.
  * `'waiting_at_restaurant'`: El motorizado está en la tienda esperando el despacho.
  * `'picked_up'`: Indica que el repartidor ya tiene los productos y va a la casa del cliente.
  * `'delivered'` y `'cancelled'`: Estados finales para cerrar y auditar la liquidación de caja diaria.
  * *Ubicaciones principales*: [types.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/lib/types.ts#L8), [transitions.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/lib/transitions.ts), [use-driver-orders.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/hooks/use-driver-orders.ts), [pedido/[id]/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/motorizados/app/pedido/%5Bid%5D/page.tsx).

---

## 8. Frontend - Admin App

* **Estados que referencia**:
  En el panel de control del administrador, se mapean todos los estados en:
  * `ORDER_STATUS`: Diccionario en [admin/lib/labels.ts:L4-15](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/admin/lib/labels.ts#L4-L15) que les asigna etiquetas textuales y colores semánticos (`tone`).
  * `ACTIVE_STATUSES`: Set de control en [admin/lib/labels.ts:L102-111](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/admin/lib/labels.ts#L102-L111) para listar filtros activos.
