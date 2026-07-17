# Auditoría UX: Estados y tiempos del flujo de pago prepaid

Este documento detalla el estado actual del flujo de pago prepago (`prepaid`) en Tindivo 2.0. Mapea los campos de base de datos, el flujo de subida de capturas, la validación del restaurante, el diseño de las vistas de los tres roles, los reportes de disputas y los tiempos límite (timers).

---

## 1. Campos de pago en la tabla `orders`

* **Campos actuales relacionados con pago y comprobantes**:
  * `payment_intent` (public.payment_intent, [0002_tables.sql:L235](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L235)): Tipo de pago solicitado (`'pending_cash'`, `'pending_yape'`, `'prepaid'`, `'pending_mixed'`).
  * `payment_real` (public.payment_real, [0002_tables.sql:L236](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L236)): Método de pago finalmente efectuado al entregar (`'paid_cash'`, `'paid_wallet'`).
  * `comprobante_prepago_url` (text, [0002_tables.sql:L244](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L244)): Ruta del archivo de captura en el bucket Supabase Storage (`payment-proofs`).
  * `payment_proof_status` (text, [0031_business_dashboard_fields.sql:L22](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0031_business_dashboard_fields.sql#L22)): Estado de la verificación del comprobante.
    * *Valores del enum completo (Restricción CHECK)*: `is null`, `'pending'`, `'verified'`, `'rejected'` [[0031_business_dashboard_fields.sql:L28-L29](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0031_business_dashboard_fields.sql#L28-L29)].
  * `payment_verified_at` (timestamptz) y `payment_verified_by` (uuid) [[0031_business_dashboard_fields.sql:L20-L21](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0031_business_dashboard_fields.sql#L20-L21)].
* **Contador de reintentos**:
  * **No existe** ningún campo en la base de datos que cuente reintentos de captura de prepago en el esquema actual.

---

## 2. Subida de captura actual

* **Mecanismo de subida**:
  * El cliente carga el archivo físico al bucket `payment-proofs` de Supabase Storage mediante el SDK cliente en la ruta `${userId}/${orderId}`.
  * Luego, notifica la ruta del comprobante haciendo un `POST` al endpoint:
    `POST /api/v1/customer/orders/[id]/prepay-proof` [[prepay-proof/route.ts:L18](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/api/app/api/v1/customer/orders/%5Bid%5D/prepay-proof/route.ts#L18)].
* **Múltiples subidas y sobreescritura**:
  * Sí se puede invocar más de una vez mientras el estado del pedido continúe en `'validando'` y el tipo de pago sea `'prepaid'`.
  * La base de datos actualiza el campo `comprobante_prepago_url` con la nueva ruta sin arrojar error.
  * En Supabase Storage, dado que se utiliza la opción `{ upsert: true }` [[checkout/page.tsx:L1120](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/app/checkout/page.tsx#L1120)], **se sobreescribe el archivo físico**, por lo que la imagen anterior se reemplaza y no queda duplicada en disco.

---

## 3. Validación del restaurante

* **Proceso de validación**:
  * El operador del restaurante valida la orden enviando un `POST` a:
    `POST /api/v1/business/orders/[id]/validate` [[validate/route.ts:L25](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/api/app/api/v1/business/orders/%5Bid%5D/validate/route.ts#L25)], que a su vez llama al RPC de Postgres `validate_order`.
* **Opciones y motivos**:
  * Captura el boolean `pass` (aprobado/rechazado).
  * Admite opcionalmente un campo de texto descriptivo `reason` y un código estructurado `reasonCode` (`'invalid_proof'`, `'out_of_stock'`, `'closed'`, etc.).
* **Comportamiento ante rechazo**:
  * Cuando se rechaza (`pass = false`), **el pedido se cancela directamente** (`status = 'cancelled'`) y se registra `payment_proof_status = 'rejected'` [[0034_validate_order_reason_code.sql:L51-L56](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0034_validate_order_reason_code.sql#L51-L56)]. **No vuelve** a ningún estado intermedio para permitir que el cliente intente resubir el comprobante.

---

## 4. Vista del restaurante (Negocios App)

* **Detalle del pedido (`pedido-detail.tsx`)**:
  * Si el comprobante ya se subió (`proofUrl` no nulo), renderiza una etiqueta `"Verificar comprobante de pago"` y muestra la imagen del comprobante utilizando una etiqueta `<img />` con la URL firmada de la captura [[pedido-detail.tsx:L215-L228](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/dashboard/pedido-detail.tsx#L215-L228)].
  * Si el cliente aún no ha subido el comprobante, renderiza una caja gris con el texto: *"El cliente aún no ha subido el comprobante"* (L247).
  * **Detalle crítico**: El panel renderiza de igual forma los botones de acción `"Confirmar"` e `"Inválido"` incluso si no se ha subido ningún comprobante (L251-260).

---

## 5. Vista del cliente (Customer App)

* **En la página de tracking (`pedido/[shortId]/page.tsx`)**:
  * El cliente **no tiene un botón para subir comprobantes en la pantalla de tracking**. El proceso de carga ocurre exclusivamente en la pantalla posterior a la compra (`checkout/page.tsx` componente `Prepay`).
  * Si el cliente sale del checkout y abre el tracking mientras el restaurante verifica su captura, solo visualiza un banner que indica: *"Tu pago ya fue registrado. Si necesitas cambiar algo, escríbenos por soporte."* [[page.tsx:L481-L483](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/customer/app/pedido/%5BshortId%5D/page.tsx#L481-L483)].
  * Si la captura fue rechazada, ve la vista de pedido cancelado con el texto explicativo correspondiente a la cancelación del pedido.

---

## 6. Reportes de disputa existentes

* **Tipo `'rejected_proof_disputed'`**:
  * **No existe ningún flujo que lo inserte**. Está declarado en el enum `report_type` y en el mapeo de labels de la app Admin, pero no es llamado ni referenciado por ninguna lógica o trigger del sistema.
* **Tipo `'prepay_refund_review'`**:
  * Es disparado por el trigger `trg_orders_prepaid_refund` [[0048_prepaid_refund_on_cancel.sql:L85](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0048_prepaid_refund_on_cancel.sql#L85)] cuando una orden prepaga se cancela y contiene un comprobante subido que aún no ha sido verificado.
  * El admin ve una incidencia abierta en su bandeja con el detalle: *"Prepago cancelado (motivo) con comprobante sin verificar. Revisar si corresponde devolución de S/[monto]"*.
* **UI en Customer App**:
  * **No existe**. La app Customer no cuenta con ningún formulario para reportar o abrir disputas. El único recurso disponible es el enlace a soporte por WhatsApp.

---

## 7. Vista de reportes en cada app

* **Admin**:
  * Administra los reportes en la sección de **Reportes** en `/reportes` [[reportes/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/admin/app/reportes/page.tsx)].
  * Acciones: Botón `"Resolver"` (llama a `POST /admin/reports/${id}/resolve` con status `'resolved'`) y botón `"Descartar"` (con status `'dismissed'`).
* **Negocios y Customer**:
  * **No tienen visualización**. Ninguna de estas dos aplicaciones cuenta con secciones o componentes que listen o muestren los reportes financieros o de disputas creados.

---

## 8. Timers relacionados (en `app_settings.timers`)

* **Timers configurados en el sistema**:
  * **Aceptación de disponibilidad**: `timers.acceptanceMinutes` (por defecto **5 minutos**). Determina el tiempo máximo del negocio para aceptar el pedido antes de auto-cancelarlo.
  * **Límite para subir comprobante**: Actualmente, el pedido entra a `'validando'` y el cron `orderPrepayTimeout` espera `timers.prepayVerificationMinutes` (por defecto **10 minutos**) para que el cliente suba la captura y el negocio la apruebe.
  * **Validación de captura**: Compartido bajo el mismo temporizador de validación humana general `timers.validationMinutes` (por defecto **5 minutos**).
* **Configuración**:
  * Todos los valores anteriores son completamente configurables sin deploy al estar almacenados en la tabla de configuración dinámica `app_settings` bajo la clave `'timers'`.
