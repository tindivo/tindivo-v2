# Evaluación: ¿Dónde encaja la apelación de pago prepaid?

Este informe evalúa y detalla la estructura y comportamiento de las entidades de disputa y reporte en Tindivo 2.0, con el fin de determinar dónde encaja mejor la funcionalidad de apelación de un pago prepago (`prepaid`) rechazado o expirado.

---

## 1. Tabla `public.fraud_coverage_claims`

* **Propósito**: Almacena reclamos de cobertura del fondo por pedidos fraudulentos o con incidencias graves.
* **Definición de Schema**: [0036_antifraude_incidents_claims.sql:L42-L56](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0036_antifraude_incidents_claims.sql#L42-L56)
  * `id uuid primary key`
  * `order_id uuid references public.orders(id)` (FK)
  * `business_id uuid references public.businesses(id)` (FK)
  * `amount numeric(10,2)` (Monto reclamado)
  * `reason text`
  * `evidence_url text` (Link a captura/evidencia)
  * `status public.fraud_claim_status` (Enum: `'pending'`, `'approved'`, `'rejected'`)
  * `resolved_at timestamptz`
  * `resolved_by uuid references public.users(id)`
  * `resolution_note text`
  * `created_by uuid references public.users(id)`
  * `created_at timestamptz`
  * `updated_at timestamptz`
* **RPCs de creación y resolución**:
  * **Creación**: `create_fraud_coverage_claim` RPC [[0038_antifraude_rpc_optional_params.sql:L38-L58](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0038_antifraude_rpc_optional_params.sql#L38-L58)].
  * **Resolución**: `resolve_fraud_claim` RPC [[0039_fix_resolve_fraud_claim_enum_cast.sql:L6-L29](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0039_fix_resolve_fraud_claim_enum_cast.sql#L6-L29)]. Si se aprueba, genera automáticamente un adelanto de contingencia activo cargado a Tindivo (`actor_charged = 'tindivo'`), descontando el dinero del fondo pero sin imputar deuda al restaurante.

---

## 2. Tabla `public.reports`

* **Propósito**: Bandeja de incidencias y reportes generales para revisión y resolución manual de la administración.
* **Definición de Schema**: [0002_tables.sql:L544-L561](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0002_tables.sql#L544-L561)
  * `id uuid primary key`
  * `type public.report_type` (Enum de tipos de reporte)
  * `status public.report_status` (Enum: `'open'`, `'resolved'`, `'dismissed'`)
  * `order_id uuid references public.orders(id)` (FK)
  * `business_id uuid references public.businesses(id)` (FK)
  * `driver_id uuid references public.drivers(id)` (FK)
  * `customer_user_id uuid references public.users(id)` (FK)
  * `customer_phone text`
  * `description text`
  * `evidence_url text`
  * `resolution_note text`
  * `resolved_by uuid references public.users(id)`
  * `resolved_at timestamptz`
  * `created_by uuid references public.users(id)`
  * `created_at timestamptz`
  * `updated_at timestamptz`
* **Tipos de reporte actuales (`report_type`)**:
  * `'no_show'`: Cliente no se presentó a recoger.
  * `'rejected_proof_disputed'`: El negocio rechazó el comprobante prepago del cliente, y el cliente disputa ese rechazo.
  * `'cash_difference'`: Disputas de arqueo de caja de motorizados.
  * `'restaurant_fake'`: Pedidos fantasma.
  * `'strike_reactivation'`: Solicitudes de desbloqueo de strikes.
  * `'advance_dispute'`: Disputas de deudas/adelantos presentadas por restaurantes.
  * `'prepay_refund_review'`: *Añadido en migración 0048* — Revisión de devolución de prepagos.
* **Resolución**:
  Son resueltos caso a caso por abonos/DML del administrador, o integrados directamente en flujos RPC (por ejemplo, el RPC `resolve_contingency_advance` actualiza automáticamente a `'resolved'` los reportes relacionados de tipo `'advance_dispute'`).

---

## 3. Vinculación y visibilidad de flujos por rol

* **¿Existe alguna tabla compartida visible simultáneamente para cliente, negocio y admin?**
  Sí, la tabla **`public.reports`** es la única entidad diseñada estructuralmente para soportar visibilidad multitenant de tres roles mediante RLS.
  * El **Administrador** puede ver todos los registros de reportes.
  * El **Restaurante**, el **Motorizado** y el **Cliente** pueden leer los reportes en los que participan o que ellos mismos crearon, gracias a la política de seguridad RLS unificada.

---

## 4. Análisis de Políticas RLS y Exposición de Tablas

* **Políticas RLS actuales en `public.reports`**:
  * La política `rep_participant_read` [[0004_rls.sql:L324-L330](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0004_rls.sql#L324-L330)] expone los registros de forma segura:
    ```sql
    using (
      created_by = (select auth.uid())
      or customer_user_id = (select auth.uid())
      or business_id = (select public.current_business_id())
      or driver_id = (select public.current_driver_id())
    );
    ```
    *Esto permite que tanto el cliente como el negocio vean el mismo reporte asociado a un pedido sin necesidad de duplicar datos ni crear tablas intermedias.*
* **Políticas RLS actuales en `public.fraud_coverage_claims`**:
  * Solo posee políticas para el admin (`claims_admin_read`) y para el negocio (`claims_business_read`) [[0037_antifraude_rpcs_and_rls.sql:L19-L26](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0037_antifraude_rpcs_and_rls.sql#L19-L26)]. **El cliente no tiene acceso RLS para consultar esta tabla**, por lo que no es apta para flujos visibles por el usuario final.

---

## 5. Campo `proof_url` en `contingency_advances`

* **¿Se usa hoy?**
  Sí. Se captura en el formulario de la app Admin en [contingencia/page.tsx:L204](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/admin/app/contingencia/page.tsx#L204) bajo el campo *"Captura del Yape/Plin (URL)"* y se envía al registrar pérdidas con el RPC `create_contingency_advance`.
* **¿De dónde sale esa imagen?**
  Es el comprobante de la transacción de reembolso (Yape/Plin) efectuada al cliente. El admin efectúa el abono manual, sube el comprobante al storage y pega la URL en la interfaz como justificación del egreso del fondo.

---

## 6. Flujo ante cancelación/timeout con comprobante subido

El comportamiento del sistema cuando un pedido prepago (`prepaid`) es rechazado o cancelado por inactividad (timeout), habiendo el usuario subido su captura, está completamente automatizado a través del trigger `trg_orders_prepaid_refund` en [[0048_prepaid_refund_on_cancel.sql](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0048_prepaid_refund_on_cancel.sql)]:

1. **Si el pago ya estaba verificado (`payment_proof_status = 'verified'`)**:
   El sistema asume que el dinero ingresó a las cuentas del negocio. Al cancelarse por el negocio/admin o timeout, ejecuta `create_contingency_advance` asignando la deuda al **restaurante** (`actor_charged = 'restaurante'`). Esto descuenta el dinero del fondo para devolverlo de inmediato al cliente, y le suma esa deuda al saldo consolidado del restaurante en su `balance_due`.
2. **Si el comprobante fue subido pero NO verificado**:
   Dado que el comprobante no tiene confirmación de validez, el sistema **no asume deuda automática** (para evitar cargar pérdidas injustificadas al restaurante en caso de capturas falsas).
   En su lugar, inserta un reporte de tipo **`'prepay_refund_review'`** en estado **`'open'`** en la bandeja del admin (`public.reports`) [[0048_prepaid_refund_on_cancel.sql:L68-L78](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/supabase/migrations/0048_prepaid_refund_on_cancel.sql#L68-L78)]. El administrador audita el caso manualmente: si la captura es real, aprueba la devolución; de lo contrario, la desestima.
