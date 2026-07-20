# Auditoría del sistema de apelaciones y flujo prepaid — Inventario técnico

**Proyecto:** Tindivo v2  
**Fecha de generación:** 20 de julio de 2026  
**Propósito:** Documento de inventario técnico exhaustivo y lectura del estado actual del sistema de apelaciones, comprobantes de pago prepaid, reportes, anti-fraude y módulos de auditoría/contingencia.

---

## 1. ESTRUCTURA DEL MONOREPO

### Aplicaciones (`apps/`)
- **`apps/customer`**: Aplicación PWA B2C para clientes finales (`customer`).
  - Ruta base: `/apps/customer`
  - Stack: Next.js 16 (App Router), React 19, Tailwind CSS, Zustand v5.
  - Vistas clave: Catalogo `/`, Checkout `/checkout`, Tracking `/pedido/[shortId]`, Historial `/pedidos`, Cuenta `/cuenta`.
- **`apps/negocios`**: Dashboard Web para restaurantes y comercios aliados (`business`).
  - Ruta base: `/apps/negocios`
  - Stack: Next.js 16 (App Router), React 19, Tailwind CSS.
  - Vistas clave: Pedidos activos `/`, Historial `/historial`, Deuda y Liquidación `/deuda`, Configuración `/configuracion`, Menú `/menu`.
- **`apps/motorizados`**: PWA/Web App para repartidores/conductores (`driver`).
  - Ruta base: `/apps/motorizados`
  - Stack: Next.js 16 (App Router), React 19, Tailwind CSS.
  - Vistas clave: Tablero de asignación `/`, Disponibilidad `/`, Efectivo `/efectivo`.
- **`apps/admin`**: Panel de control del administrador del sistema (`admin`).
  - Ruta base: `/apps/admin`
  - Stack: Next.js 16 (App Router), React 19, Tailwind CSS.
  - Vistas clave: `/reportes`, `/incidentes`, `/claims`, `/contingencia`, `/strikes`, `/auditoria`, `/metricas`, `/negocios`, `/motorizados`, `/cobros`.
- **`apps/api`**: Servidor de backend REST unificado y endpoints Inngest.
  - Ruta base: `/apps/api`
  - Stack: Next.js API Routes (Route Handlers `/app/api/v1/...`), Supabase Service Role, Inngest client/functions.

### Carpetas Compartidas (`packages/`)
- **`packages/core`**: Dominio puro de la aplicación, constantes de negocio, helpers sin side-effects, y test de drift de enums (`src/enum-drift.ts`).
- **`packages/contracts`**: Fuente canónica de la verdad para schemas Zod, enums del dominio (`src/enums.ts`), y contratos de validación REST.
- **`packages/api-client`**: Cliente REST tipado consumidor de la API REST para las distintas apps.
- **`packages/supabase`**: Tipos TypeScript autogenerados de la base de datos Supabase (`database.types.ts`), cliente de servicio (`service-client.ts`), e instanciación de cliente navegador/servidor.
- **`packages/ui`**: Sistema de componentes UI compartidos (Botones, Inputs, Chips, Modales).
- **`packages/tsconfig`**: Configuraciones de TypeScript reutilizables (`base.json`, `nextjs.json`).

---

## 2. BASE DE DATOS — Tablas relevantes

### Table: `public.reports`
Sistema de reportes / reclamos / bandeja de atención del admin.

```sql
Table "public.reports"
 Column          | Type                    | Collation | Nullable | Default
-----------------+-------------------------+-----------+----------+--------------------
 id              | uuid                    |           | not null | gen_random_uuid()
 type            | public.report_type      |           | not null |
 status          | public.report_status    |           | not null | 'open'::report_status
 order_id        | uuid                    |           |          |
 business_id     | uuid                    |           |          |
 driver_id       | uuid                    |           |          |
 customer_user_id| uuid                    |           |          |
 customer_phone  | text                    |           |          |
 description     | text                    |           |          |
 evidence_url    | text                    |           |          |
 resolution_note | text                    |           |          |
 resolved_by     | uuid                    |           |          |
 resolved_at     | timestamp with time zone|           |          |
 created_by      | uuid                    |           |          |
 created_at      | timestamp with time zone|           | not null | now()
 updated_at      | timestamp with time zone|           | not null | now()
Indexes:
    "reports_pkey" PRIMARY KEY, btree (id)
    "reports_open_idx" btree (created_at DESC) WHERE status = 'open'::report_status
    "reports_type_idx" btree (type, status)
Foreign-key constraints:
    "reports_business_id_fkey" FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL
    "reports_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.users(id)
    "reports_customer_user_id_fkey" FOREIGN KEY (customer_user_id) REFERENCES public.users(id) ON DELETE SET NULL
    "reports_driver_id_fkey" FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL
    "reports_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL
    "reports_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES public.users(id)
```

### Table: `public.contingency_advances`
Adelantos del fondo de contingencia y registro contable de devoluciones inmediatas.

```sql
Table "public.contingency_advances"
 Column          | Type                            | Collation | Nullable | Default
-----------------+---------------------------------+-----------+----------+--------------------
 id              | uuid                            |           | not null | gen_random_uuid()
 order_id        | uuid                            |           | not null |
 customer_user_id| uuid                            |           |          |
 customer_phone  | text                            |           |          |
 amount          | numeric(10,2)                   |           | not null |
 reason          | text                            |           | not null |
 proof_url       | text                            |           |          |
 actor_charged   | public.contingency_actor_charged|           | not null |
 status          | public.contingency_advance_status|          | not null | 'activo'::contingency_advance_status
 disputed_at     | timestamp with time zone        |           |          |
 dispute_note    | text                            |           |          |
 resolved_at     | timestamp with time zone        |           |          |
 resolved_by     | uuid                            |           |          |
 operator        | uuid                            |           |          |
 created_at      | timestamp with time zone        |           | not null | now()
 updated_at      | timestamp with time zone        |           | not null | now()
Indexes:
    "contingency_advances_pkey" PRIMARY KEY, btree (id)
    "ca_order_idx" btree (order_id)
    "ca_status_idx" btree (status)
Foreign-key constraints:
    "contingency_advances_customer_user_id_fkey" FOREIGN KEY (customer_user_id) REFERENCES public.users(id)
    "contingency_advances_operator_fkey" FOREIGN KEY (operator) REFERENCES public.users(id)
    "contingency_advances_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE
    "contingency_advances_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES public.users(id)
```

### Table: `public.customer_incidents`
Log de incidentes reportados (por motorizados, admin, etc.) sujetos a revisión por el admin.

```sql
Table "public.customer_incidents"
 Column            | Type                    | Collation | Nullable | Default
-------------------+-------------------------+-----------+----------+--------------------
 id                | uuid                    |           | not null | gen_random_uuid()
 order_id          | uuid                    |           |          |
 customer_user_id  | uuid                    |           |          |
 customer_phone    | text                    |           | not null |
 delivery_reference| text                    |           |          |
 incident_type     | public.incident_type    |           | not null |
 description       | text                    |           |          |
 reported_by       | uuid                    |           |          |
 reported_by_role  | text                    |           |          |
 is_strike         | boolean                 |           | not null | false
 reviewed_at       | timestamp with time zone|           |          |
 reviewed_by       | uuid                    |           |          |
 review_result     | text                    |           |          |
 created_at        | timestamp with time zone|           | not null | now()
 updated_at        | timestamp with time zone|           | not null | now()
Check constraints:
    "customer_incidents_reported_by_role_check" CHECK (reported_by_role = ANY (ARRAY['driver'::text, 'business'::text, 'admin'::text, 'system'::text, 'customer'::text]))
    "customer_incidents_review_result_check" CHECK (review_result = ANY (ARRAY['confirmed'::text, 'dismissed'::text]))
Indexes:
    "customer_incidents_pkey" PRIMARY KEY, btree (id)
    "idx_customer_incidents_pending" btree (reviewed_at) WHERE reviewed_at IS NULL
    "idx_customer_incidents_phone" btree (customer_phone)
Foreign-key constraints:
    "customer_incidents_customer_user_id_fkey" FOREIGN KEY (customer_user_id) REFERENCES public.users(id) ON DELETE SET NULL
    "customer_incidents_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL
    "customer_incidents_reported_by_fkey" FOREIGN KEY (reported_by) REFERENCES public.users(id) ON DELETE SET NULL
    "customer_incidents_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL
```

### Table: `payment_proofs`
**NO EXISTE como tabla independiente.**  
*Nota de arquitectura:* La información del comprobante de pago está desnormalizada directamente en columnas de la tabla `public.orders` (`comprobante_prepago_url`, `payment_proof_status`, `payment_verified_at`, `payment_verified_by`, `proof_attempt`, `validating_at`), y el archivo gráfico físico se almacena en el bucket privado de Supabase Storage `payment-proofs`.

### Table: `public.orders` (Columnas relevantes a cancel_reason, payment status y prepaid flow)

```sql
Table "public.orders" (Columnas seleccionadas de pagos, cancelación y prepago)
 Column                  | Type                    | Nullable | Default / Description
-------------------------+-------------------------+----------+--------------------------------------
 id                      | uuid                    | not null | gen_random_uuid()
 short_id                | text                    | not null |
 status                  | public.order_status     | not null | 'pending_acceptance'
 payment_intent          | public.payment_intent   | not null |
 cancel_reason           | public.cancel_reason    |          |
 cancelled_by            | uuid                    |          | FK -> public.users(id)
 cancelled_at            | timestamp with time zone|          |
 comprobante_prepago_url | text                    |          | Ruta en bucket payment-proofs (userId/...)
 payment_proof_status    | text                    |          | Check: 'pending', 'verified', 'rejected'
 proof_attempt           | integer                 | not null | 1 (max 2 intentos de resubida)
 payment_verified_at     | timestamp with time zone|          | Timestamp de confirmación por negocio
 payment_verified_by     | uuid                    |          | FK -> public.users(id) del negocio
 validating_at           | timestamp with time zone|          | Timestamp cuando pasa a 'validando'
 prepay_timer_expires_at | timestamp with time zone|          | Expiración del temporizador (10 min)
 prepay_timer_type       | text                    |          | Tipo de timer ('upload_proof', 'verify_proof')
 yape_confirmed          | boolean                 | not null | false
 client_pays_with        | numeric(10,2)           |          |
 change_to_give          | numeric(10,2)           |          |
```

### Table: `public.app_settings`
Configuración global editable por el administrador del sistema.

```sql
Table "public.app_settings"
 Column     | Type                    | Collation | Nullable | Default
------------+-------------------------+-----------+----------+--------------------
 key        | text                    |           | not null |
 value      | jsonb                   |           | not null |
 updated_at | timestamp with time zone|           | not null | now()
 updated_by | uuid                    |           |          |
Indexes:
    "app_settings_pkey" PRIMARY KEY, btree (key)
Foreign-key constraints:
    "app_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.users(id)
```

Keys relevantes:
- `strikes`: `{"temporaryBlockThreshold": 3, "temporaryBlockDays": 30}`
- `validation`: `{"maxValidationRequestsPerDayPerBusiness": 3}`
- `prepay_threshold`: `{"amount": 30.00}` (monto a partir del cual el pedido requiere prepago obligatorio)
- `timers`: `{"acceptanceMinutes": 5, "validationMinutes": 5, "paymentMinutes": 10, "cashAutoConfirmHours": 24}`

### Table: `public.customer_profiles` (Columnas de strikes, bloqueo y verificación)

```sql
Table "public.customer_profiles"
 Column                | Type                    | Nullable | Default / Description
-----------------------+-------------------------+----------+-----------------------------------
 user_id               | uuid                    | not null | PK, FK -> public.users(id) CASCADE
 full_name             | text                    | not null |
 phone                 | text                    |          |
 phone_verified_at     | timestamp with time zone|          | Timestamp de verificación por OTP
 strikes               | integer                 | not null | 0 (contador denormalizado)
 contraentrega_blocked | boolean                 | not null | false (true cuando strikes >= 2)
 blocked_until         | timestamp with time zone|          | Bloqueo temporal total al alcanzar 3 strikes
 risk_level            | text                    |          | 'low', 'medium', 'high', 'critical'
 risk_reasons          | jsonb                   |          | Motivos detectados por reglas de riesgo
 risk_updated_at       | timestamp with time zone|          |
```

---

## 3. BASE DE DATOS — Triggers y funciones

### 1. `trg_orders_prepaid_refund` y `handle_prepaid_refund_on_cancel()`

```sql
CREATE OR REPLACE FUNCTION public.handle_prepaid_refund_on_cancel()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_amount numeric;
  v_reason text;
BEGIN
  IF new.payment_intent <> 'prepaid' THEN
    RETURN new;
  END IF;

  v_amount := coalesce(new.order_amount, 0) + coalesce(new.delivery_fee, 0);
  v_reason := coalesce(new.cancel_reason::text, '');

  -- El no-show es responsabilidad del cliente, no del restaurante
  IF v_reason = 'no_show' THEN
    RETURN new;
  END IF;

  IF new.payment_proof_status = 'verified'
     AND v_amount > 0
     AND v_reason IN ('business_cancelled', 'admin_cancelled', 'pending_acceptance_timeout') THEN
    -- Cliente pagó y el negocio lo confirmó: deuda automática al restaurante.
    BEGIN
      PERFORM public.create_contingency_advance(
        new.id,
        v_amount,
        'Prepago verificado cancelado por el restaurante — devolución al cliente',
        'restaurante',
        new.cancelled_by
      );
    EXCEPTION WHEN OTHERS THEN
      -- Si la deuda automática falla, crear reporte en la bandeja del admin.
      INSERT INTO public.reports (
        type, status, order_id, business_id, customer_user_id, customer_phone, description, created_by
      ) VALUES (
        'prepay_refund_review', 'open', new.id, new.business_id, new.customer_user_id,
        new.customer_phone,
        'Prepago verificado cancelado: la deuda automática falló (' || sqlerrm ||
          '). Registrar la devolución manualmente.',
        new.cancelled_by
      );
    END;

  ELSIF new.comprobante_prepago_url IS NOT NULL THEN
    -- Comprobante subido pero sin verificar: a la bandeja del admin para decidir.
    INSERT INTO public.reports (
      type, status, order_id, business_id, customer_user_id, customer_phone, description, created_by
    ) VALUES (
      'prepay_refund_review', 'open', new.id, new.business_id, new.customer_user_id,
      new.customer_phone,
      'Prepago cancelado (' || coalesce(nullif(v_reason, ''), 'sin motivo') ||
        ') con comprobante sin verificar. Revisar si corresponde devolución de S/ ' ||
        to_char(v_amount, 'FM999990.00') || '.',
      new.cancelled_by
    );
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_prepaid_refund ON public.orders;
CREATE TRIGGER trg_orders_prepaid_refund
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (old.status IS DISTINCT FROM 'cancelled' AND new.status = 'cancelled')
  EXECUTE FUNCTION public.handle_prepaid_refund_on_cancel();
```

### 2. `trg_incident_apply_strike` y `apply_incident_strike()`

```sql
CREATE OR REPLACE FUNCTION public.apply_incident_strike()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_threshold int;
  v_block_days int;
  v_count int;
BEGIN
  IF new.is_strike = true AND (tg_op = 'INSERT' OR coalesce(old.is_strike, false) = false) THEN
    -- 1) registrar el strike en customer_strikes
    INSERT INTO public.customer_strikes
      (customer_user_id, phone, delivery_reference, order_id, reason, reported_by)
    VALUES
      (new.customer_user_id, new.customer_phone, new.delivery_reference,
       new.order_id, new.incident_type::text, new.reviewed_by);

    -- 2) recomputar contador + aplicar bloqueo temporal si alcanza threshold (3)
    IF new.customer_user_id IS NOT NULL THEN
      SELECT coalesce((value->>'temporaryBlockThreshold')::int, 3),
             coalesce((value->>'temporaryBlockDays')::int, 30)
        INTO v_threshold, v_block_days
        FROM public.app_settings WHERE key = 'strikes';

      SELECT count(*) INTO v_count
        FROM public.customer_strikes WHERE customer_user_id = new.customer_user_id;

      UPDATE public.customer_profiles
        SET strikes = v_count,
            blocked_until = CASE WHEN v_count >= v_threshold
                                 THEN now() + (v_block_days || ' days')::interval
                                 ELSE blocked_until END,
            updated_at = now()
      WHERE user_id = new.customer_user_id;
    END IF;
  END IF;
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS trg_incident_apply_strike ON public.customer_incidents;
CREATE TRIGGER trg_incident_apply_strike
  AFTER INSERT OR UPDATE OF is_strike ON public.customer_incidents
  FOR EACH ROW EXECUTE FUNCTION public.apply_incident_strike();
```

### 3. `trg_strike_creates_report` y `create_report_for_strike()`

```sql
CREATE OR REPLACE FUNCTION public.create_report_for_strike()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.reports (
    type, status, order_id, customer_user_id, customer_phone, created_by, description
  ) VALUES (
    'no_show', 'open', new.order_id, new.customer_user_id, new.phone, new.reported_by,
    'No-show: strike anclado a ' || coalesce(new.delivery_reference, 'dirección sin referencia')
  );
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_strike_creates_report ON public.customer_strikes;
CREATE TRIGGER trg_strike_creates_report
  AFTER INSERT ON public.customer_strikes
  FOR EACH ROW EXECUTE FUNCTION public.create_report_for_strike();
```

### 4. RPC: `create_appeal_report` (Apelación de comprobante prepago rechazado)

```sql
CREATE OR REPLACE FUNCTION public.create_appeal_report(
  p_order_id uuid,
  p_customer_user_id uuid,
  p_description text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_existing_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002'; END IF;

  IF v_order.customer_user_id <> p_customer_user_id THEN
    RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001';
  END IF;

  IF v_order.status <> 'cancelled' OR v_order.cancel_reason <> 'proof_rejected_final' THEN
    RAISE EXCEPTION 'Solo se puede apelar pedidos cancelados por rechazo final de comprobante' USING errcode = 'P0001';
  END IF;

  -- Prevención de apelación duplicada
  SELECT id INTO v_existing_id
  FROM public.reports
  WHERE order_id = p_order_id
    AND type = 'rejected_proof_disputed'
    AND status = 'open';

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'alreadyExisted', true, 'reportId', v_existing_id);
  END IF;

  -- Crear reporte de apelación
  INSERT INTO public.reports (
    type, status, order_id, business_id, customer_user_id,
    customer_phone, description, evidence_url, created_by
  ) VALUES (
    'rejected_proof_disputed', 'open', p_order_id, v_order.business_id,
    p_customer_user_id, v_order.customer_phone,
    coalesce(nullif(trim(p_description), ''), 'Cliente apela rechazo final de comprobante de pago'),
    v_order.comprobante_prepago_url,
    p_customer_user_id
  )
  RETURNING id INTO v_existing_id;

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.appeal_created', 'customer', p_customer_user_id, jsonb_build_object('reportId', v_existing_id));

  RETURN jsonb_build_object('ok', true, 'alreadyExisted', false, 'reportId', v_existing_id);
END;
$$;
```

---

## 4. BASE DE DATOS — RLS Policies

### Policies para `public.reports`
```sql
-- Admin: acceso total
CREATE POLICY rep_admin_all ON public.reports FOR ALL TO authenticated
  USING ((SELECT public.current_user_has_role('admin'))) 
  WITH CHECK ((SELECT public.current_user_has_role('admin')));

-- Autenticados: pueden insertar si son el creador o participante
CREATE POLICY rep_insert_auth ON public.reports FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (customer_user_id IS NULL OR customer_user_id = (SELECT auth.uid()))
    AND (business_id IS NULL OR business_id = (SELECT public.current_business_id()))
    AND (driver_id IS NULL OR driver_id = (SELECT public.current_driver_id()))
  );

-- Participantes: leen únicamente los reportes propios o donde están involucrados
CREATE POLICY rep_participant_read ON public.reports FOR SELECT TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR customer_user_id = (SELECT auth.uid())
    OR business_id = (SELECT public.current_business_id())
    OR driver_id = (SELECT public.current_driver_id())
  );
```

### Policies para `public.contingency_advances`
```sql
-- Admin: acceso total
CREATE POLICY ca_admin_all ON public.contingency_advances FOR ALL TO authenticated
  USING ((SELECT public.current_user_has_role('admin'))) 
  WITH CHECK ((SELECT public.current_user_has_role('admin')));

-- Negocios: leen únicamente adelantos de sus propios pedidos
CREATE POLICY ca_business_read ON public.contingency_advances FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.orders WHERE business_id = (SELECT public.current_business_id())));
```

### Policies para `public.customer_incidents`
```sql
-- Acceso directo cerrado a anon/authenticated por defecto. Leen admins:
CREATE POLICY incidents_admin_read ON public.customer_incidents FOR SELECT TO authenticated
  USING ((SELECT public.current_user_has_role('admin')));
```

### Policies para Storage Bucket `payment-proofs` (`storage.objects`)
```sql
-- Subida (INSERT): el cliente sube SOLO en su propia carpeta (foldername[1] = auth.uid())
CREATE POLICY "storage proofs insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('payment-proofs', 'receipts')
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- Lectura propia (SELECT): el cliente lee SOLO sus archivos subidos
CREATE POLICY "storage proofs read own" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id IN ('payment-proofs', 'receipts')
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- Actualización (UPDATE): el cliente puede sobreescribir/reintentar su archivo
CREATE POLICY "storage proofs update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('payment-proofs', 'receipts')
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id IN ('payment-proofs', 'receipts')
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- Admin (ALL): acceso completo a todo el bucket storage
CREATE POLICY "storage admin all" ON storage.objects FOR ALL TO authenticated
  USING ((SELECT public.current_user_has_role('admin')))
  WITH CHECK ((SELECT public.current_user_has_role('admin')));
```

---

## 5. BASE DE DATOS — Migraciones recientes (0050 a 0066)

- **`0050_catalog_only_mode.sql`**: Habilita el flag/modo "solo catálogo" desactivando checkout en comercios configurados así.
- **`0051_fix_business_schedule_comment.sql`**: Corrige comentario de sintaxis SQL en la tabla `business_schedule`.
- **`0052_catalog_search.sql`**: Introduce RPC de búsqueda de productos de menú para el marketplace.
- **`0053_accent_color_not_unique.sql`**: Elimina constraint de unicidad en `businesses.accent_color`.
- **`0054_realtime_fix.sql`**: Ajusta publicaciones de Realtime en Supabase.
- **`0055_customer_otp_attempts.sql`**: Crea tabla `customer_otp_attempts` para rate-limiting de SMS OTP.
- **`0056_require_verified_phone.sql`**: Fuerza la presencia de `phone_verified_at` antes de permitir la creación de pedidos.
- **`0057_contraentrega_guards.sql`**: Añade RPC con guardas para bloquear contraentrega según strikes y perfil de riesgo.
- **`0058_awaiting_payment_state.sql`**: Añade el estado `awaiting_payment` al enum Postgres `order_status`.
- **`0059_prepaid_awaiting_payment_flow.sql`**: Implementa máquina de estados y RPCs de flujo prepago (`awaiting_payment`, subida y validación).
- **`0060_storage_proofs_update_policy.sql`**: Agrega política RLS de UPDATE en `payment-proofs` para reintentos de comprobante.
- **`0061_prepaid_timers_and_expire.sql`**: Agrega temporizadores prepago (`prepay_timer_expires_at`) y la RPC `expire_order_prepay`.
- **`0062_fix_create_customer_order_prepaid_status.sql`**: Corrige creación de pedidos asignando `awaiting_payment` para pedidos prepago.
- **`0063_fix_create_customer_order_exact_0057.sql`**: Alinea la RPC de creación de pedido conservando todas las guardas anti-fraude.
- **`0064_create_point_in_coverage_polygon.sql`**: RPC espacial para validar si coordenadas caen dentro del polígono de entrega.
- **`0065_prepaid_timers_cron_alignment.sql`**: Sincroniza la ejecución de cronjobs con la expiración de temporizadores prepago de 10 minutos.
- **`0066_appeal_system.sql`**: Implementa `create_appeal_report` para apelaciones de comprobantes rechazados y actualiza `get_tracking` con `hasAppeal`.

---

## 6. API / ENDPOINTS

### Endpoints de Clientes (`/api/v1/customer/...`)
- **`POST /api/v1/customer/orders/[id]/prepay-proof`**
  - *Qué hace:* Registra la ruta del comprobante subido a Storage por el cliente. Pasa el pedido de `awaiting_payment` a `validando`.
  - *Validaciones:* Rol `customer`, pedido pertenezca al usuario, estado sea `awaiting_payment`, `proof_attempt < 2`, ruta comience con `userId/`.
  - *Tablas:* `orders`, `order_event_log`. Dispara eventos Inngest.
- **`GET /api/v1/customer/orders/[id]/prepay-info`**
  - *Qué hace:* Retorna los datos bancarios / QR Yape/Plin del restaurante para realizar el pago.
  - *Validaciones:* Rol `customer`, usuario sea dueño del pedido.
  - *Tablas:* `orders`, `businesses`.
- **`POST /api/v1/customer/orders/[id]/cancel`**
  - *Qué hace:* Cancela un pedido por el cliente.
  - *Validaciones:* Rol `customer`, cancelable únicamente en estado `pending_acceptance` o `awaiting_payment` (o dentro de 2 min).
  - *Tablas:* `orders`, `order_event_log`.
- **`POST /api/v1/customer/orders/[id]/appeal`**
  - *Qué hace:* Permite al cliente apelar el rechazo definitivo de su comprobante (`proof_rejected_final`). Invoca RPC `create_appeal_report`.
  - *Validaciones:* Rol `customer`, pedido cancelado con `cancel_reason = proof_rejected_final`.
  - *Tablas:* `orders`, `reports`, `order_event_log`.

### Endpoints de Negocios (`/api/v1/business/...`)
- **`GET /api/v1/business/orders/[id]/prepay-proof`**
  - *Qué hace:* Obtiene la URL firmada (signed URL) del comprobante de prepago cargado por el cliente.
  - *Validaciones:* Rol `business`, el pedido pertenezca a la empresa del usuario.
  - *Tablas:* `orders`, Storage bucket `payment-proofs`.
- **`POST /api/v1/business/orders/[id]/validate`**
  - *Qué hace:* Valida el comprobante prepago (`action: 'confirm'` o `'reject'`). En confirmación aprueba pago; en rechazo, si `proof_attempt = 1` solicita nuevo comprobante; si `proof_attempt >= 2`, cancela con `proof_rejected_final`.
  - *Validaciones:* Rol `business`, pedido en estado `validando` o `pending_acceptance`.
  - *Tablas:* `orders`, `order_event_log`.
- **`POST /api/v1/business/contingency/[id]/dispute`**
  - *Qué hace:* El restaurante disputa un adelanto de contingencia cargado a su deuda dentro de la ventana de 48 horas.
  - *Validaciones:* Rol `business`, adelanto en estado `activo`, actor cargado `restaurante`.
  - *Tablas:* `contingency_advances`, `reports`.
- **`POST /api/v1/business/fraud-claims`**
  - *Qué hace:* Solicita la cobertura del fondo de fraude para un pedido no pagado/fraudulento.
  - *Validaciones:* Rol `business`, pedido perteneciente al restaurante.
  - *Tablas:* `fraud_coverage_claims`.

### Endpoints de Admin (`/api/v1/admin/...`)
- **`GET /api/v1/admin/reports` / `POST /api/v1/admin/reports/[id]/resolve`**
  - *Qué hace:* Lista reportes abiertos y los resuelve (`status: 'resolved' | 'dismissed'`, opcional `refund_customer`).
  - *Validaciones:* Rol `admin`.
  - *Tablas:* `reports`, `contingency_advances`, `orders`.
- **`GET /api/v1/admin/contingency` / `POST /api/v1/admin/contingency/[id]/resolve`**
  - *Qué hace:* Gestiona el fondo de contingencia y resuelve disputas planteadas por restaurantes.
  - *Validaciones:* Rol `admin`.
  - *Tablas:* `contingency_advances`, `businesses`.
- **`GET /api/v1/admin/incidents` / `POST /api/v1/admin/incidents/[id]/review`**
  - *Qué hace:* Revisa incidentes de motorizados y los confirma como strike (`confirmed`) o desestima (`dismissed`).
  - *Validaciones:* Rol `admin`.
  - *Tablas:* `customer_incidents`, `customer_strikes`, `customer_profiles`.
- **`GET /api/v1/admin/claims` / `PUT /api/v1/admin/fraud-claims/[id]/resolve`**
  - *Qué hace:* Aprueba o rechaza reclamos de cobertura de fraude de comercios.
  - *Validaciones:* Rol `admin`.
  - *Tablas:* `fraud_coverage_claims`.
- **`GET /api/v1/admin/strikes`**
  - *Qué hace:* Muestra la lista de clientes con strikes y estado de bloqueo.
  - *Validaciones:* Rol `admin`.
  - *Tablas:* `customer_profiles`, `customer_strikes`.

---

## 7. HOOKS Y STATE MANAGEMENT

### 1. Hook Gate de Checkout: `useOrderReadiness`
*Ubicación:* `apps/customer/hooks/use-order-readiness.ts`

```typescript
'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { pointInPolygon } from '@/lib/coverage'

type GateType = 'phone' | 'address'

type OrderReadiness = {
  ready: boolean
  currentGate: GateType | null
  missingSteps: GateType[]
  loading: boolean
  refetch: () => Promise<void>
}

export function useOrderReadiness(): OrderReadiness {
  const [profile, setProfile] = useState<{
    phone: string | null
    phone_verified_at: string | null
  } | null>(null)
  const [hasValidAddress, setHasValidAddress] = useState(false)
  const [loading, setLoading] = useState(true)

  const supabase = getSupabaseBrowser()

  async function fetchReadiness() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) {
        setProfile(null)
        setHasValidAddress(false)
        return
      }

      // 1. Verificar teléfono
      const { data: prof } = await supabase
        .from('customer_profiles')
        .select('phone, phone_verified_at')
        .eq('user_id', user.id)
        .maybeSingle()

      setProfile(prof)

      // 2. Verificar dirección en zona
      const { data: addresses } = await supabase
        .from('customer_addresses')
        .select('coordinates_lat, coordinates_lng')
        .eq('user_id', user.id)

      if (addresses && addresses.length > 0) {
        const { getCoveragePolygon } = await import('@/lib/coverage')
        const polygon = await getCoveragePolygon()

        if (polygon) {
          const anyInZone = addresses.some(
            (addr) =>
              addr.coordinates_lat != null &&
              addr.coordinates_lng != null &&
              pointInPolygon(
                {
                  lat: Number(addr.coordinates_lat),
                  lng: Number(addr.coordinates_lng),
                },
                polygon.polygon,
              ),
          )
          setHasValidAddress(anyInZone)
        } else {
          setHasValidAddress(true)
        }
      } else {
        setHasValidAddress(false)
      }
    } catch (err) {
      console.error('[useOrderReadiness] Error fetching readiness:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReadiness()
  }, [])

  const missingSteps: GateType[] = []

  if (!profile?.phone_verified_at) {
    missingSteps.push('phone')
  }

  if (!hasValidAddress) {
    missingSteps.push('address')
  }

  return {
    ready: !loading && missingSteps.length === 0,
    currentGate: missingSteps[0] ?? null,
    missingSteps,
    loading,
    refetch: fetchReadiness,
  }
}
```

### 2. Stores de Zustand
- **`apps/customer/lib/cart.ts`**: Store de bolsa/carrito de compras (ítems, cantidades, negocio seleccionado).
- **`apps/customer/lib/onboarding-store.ts`**: Store de onboarding y flujo de autenticación del cliente.

---

## 8. COMPONENTES DE UI — App Customer (B2C)

### 1. Pantalla de Subida de Comprobante: `PrepayProofSection`
*Ubicación:* `apps/customer/components/prepay-proof-section.tsx`

```tsx
'use client'

import { Button } from '@tindivo/ui'
import { useState } from 'react'
import { api, errMsg } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface PrepayProofSectionProps {
  orderId: string
  proofAttempt: number
  hasProof: boolean
  onSuccess: () => void
}

export function PrepayProofSection({
  orderId,
  proofAttempt,
  hasProof,
  onSuccess,
}: PrepayProofSectionProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const supabase = getSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Sesión no encontrada')

      const ext = file.name.split('.').pop() || 'jpg'
      const filePath = `${session.user.id}/${orderId}_proof_${proofAttempt}.${ext}`

      const { error: storageErr } = await supabase.storage
        .from('payment-proofs')
        .upload(filePath, file, { upsert: true })

      if (storageErr) throw new Error(`Error en storage: ${storageErr.message}`)

      await api.post(`/customer/orders/${orderId}/prepay-proof`, { path: filePath })
      onSuccess()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-[22px] border border-amber-500/20 bg-amber-500/5 p-4">
      <h3 className="font-bold text-[16px] text-amber-900">
        {hasProof ? 'Reintentar comprobante' : 'Sube tu captura de pago'}
      </h3>
      <p className="mt-1 text-[13px] text-amber-800">
        Intentos realizados: {proofAttempt} de 2. Asegúrate de que el número de operación sea visible.
      </p>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="mt-3 block w-full text-[13px]"
      />

      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}

      <Button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="mt-3 w-full"
      >
        {uploading ? 'Subiendo…' : 'Enviar comprobante'}
      </Button>
    </div>
  )
}
```

### 2. Modales de Error/Bloqueo (Gates)
*Ubicaciones:* `apps/customer/components/gates/phone-gate-modal.tsx` y `address-gate-modal.tsx`

---

## 9. COMPONENTES DE UI — App Admin

### 1. Bandeja de Reportes: `ReportesPage`
*Ubicación:* `apps/admin/app/reportes/page.tsx`

```tsx
'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Ico, SectionHeader, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { REPORT_TYPE_LABEL } from '@/lib/labels'

interface ReportRow {
  id: string
  type: string
  status: string
  customer_phone: string | null
  description: string | null
  evidence_url: string | null
  created_at: string
  orders: { short_id: string } | null
}

export default function ReportesPage() {
  const [reports, setReports] = useState<ReportRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<ReportRow[]>>('/admin/reports?status=open')
      .then((r) => setReports(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function resolve(id: string, status: 'resolved' | 'dismissed', action?: 'refund_customer' | 'none') {
    setBusyId(id)
    try {
      await api.post(`/admin/reports/${id}/resolve`, { status, resolutionAction: action })
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        eyebrow="Antifraude"
        title="Reportes"
        description={reports ? `${reports.length} reportes abiertos` : 'Bandeja de incidentes abiertos.'}
        right={<Button size="sm" variant="outline" onClick={load}>Refrescar</Button>}
      />
      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}
      {!reports ? (
        <div className="h-40 animate-pulse rounded-[22px] bg-ink/[0.05]" />
      ) : reports.length === 0 ? (
        <div className="t-card">
          <EmptyState icon={<Ico.shield className="h-5 w-5" />} title="Bandeja limpia" hint="Nada pendiente. 🎉" />
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="t-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={REPORT_TYPE_LABEL[r.type] ?? r.type} tone="danger" />
                    {r.orders?.short_id && <span className="font-mono text-[13px] text-ink-muted">#{r.orders.short_id}</span>}
                  </div>
                  <p className="mt-1.5 text-[14px] text-ink">{r.description}</p>
                  {r.customer_phone && <p className="mt-0.5 text-[13px] text-ink-subtle">📞 {r.customer_phone}</p>}
                  {r.evidence_url && (
                    <a href={r.evidence_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold text-[13px] text-brand underline">
                      <Ico.eye className="h-3.5 w-3.5" /> Ver comprobante adjunto
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {r.type === 'rejected_proof_disputed' ? (
                    <>
                      <Button size="sm" disabled={busyId === r.id} onClick={() => resolve(r.id, 'resolved', 'refund_customer')}>
                        Reembolsar cliente
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => resolve(r.id, 'dismissed')}>
                        Descartar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" disabled={busyId === r.id} onClick={() => resolve(r.id, 'resolved')}>
                        Resolver
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => resolve(r.id, 'dismissed')}>
                        Descartar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

---

## 10. COMPONENTES DE UI — App Negocios (restaurante)

### 1. Validación de Comprobantes de Pago: `PedidoDetail`
*Ubicación:* `apps/negocios/components/dashboard/pedido-detail.tsx`  
*Acciones:* En estado `validando`, muestra la vista previa del comprobante cargado y los botones de acción: **"Confirmar pago"** (invoca `/api/v1/business/orders/[id]/validate` con `action: 'confirm'`) e **"Inválido"** (invoca `/api/v1/business/orders/[id]/validate` con `action: 'reject'`).

---

## 11. INNGEST JOBS

Ubicación del registro principal: `apps/api/lib/inngest/functions.ts`

- **`orderAcceptanceTimeout` (`order-acceptance-timeout`)**: Cancela pedidos no aceptados en 5 min.
- **`cashSettlementAutoConfirm` (`cash-settlement-auto-confirm`)**: Confirma automáticamente entregas de efectivo no liquidadas tras 24 horas.
- **`orderValidationTimeout` (`order-validation-timeout`)**: Cancela pedidos en `validando` si la cajera no procesa la validación en 5 min.
- **`orderPaymentTimeout` (`order-payment-timeout`)**: Cancela pedidos prepago en `awaiting_payment` si el cliente no sube comprobante en 10 min.
- **`orderPrepayTimeout` (`order-prepay-timeout`)**: Job legacy de seguridad para verificación de prepago (10 min).
- **`transferRequestTimeout` (`transfer-request-timeout`)**: Acepta automáticamente solicitudes de transferencia entre repartidores al expirar 30 segundos.
- **`orderNotifyBusiness` (`order-notify-business`)**: Envía notificación push web al operador del restaurante al registrarse un nuevo pedido.

---

## 12. TIPOS DE TYPESCRIPT

*Ubicación canónica:* `packages/contracts/src/enums.ts`

```typescript
export const REPORT_TYPES = [
  'no_show',
  'rejected_proof_disputed',
  'cash_difference',
  'restaurant_fake',
  'strike_reactivation',
  'advance_dispute',
  'prepay_refund_review',
] as const

export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const

export const ORDER_STATUSES = [
  'validando',
  'pending_acceptance',
  'awaiting_payment',
  'confirmed',
  'preparing',
  'waiting_driver',
  'heading_to_restaurant',
  'waiting_at_restaurant',
  'picked_up',
  'delivered',
  'cancelled',
] as const

export const CANCEL_REASONS = [
  'pending_acceptance_timeout',
  'validation_timeout',
  'prepay_timeout',
  'business_cancelled',
  'admin_cancelled',
  'customer_cancelled',
  'no_show',
  'proof_rejected_final',
] as const

export const CONTINGENCY_ADVANCE_STATUSES = ['activo', 'disputado', 'cancelado'] as const
export const CONTINGENCY_ACTORS_CHARGED = ['restaurante', 'tindivo'] as const
```

---

## 13. EVALUACIÓN Y RECOMENDACIÓN TÉCNICA: SECCIONES DE AUDITORÍA EN ADMIN

### Estado actual de las páginas de auditoría / anti-fraude en `/admin`:
Actualmente el panel de administración presenta **6 páginas separadas** bajo el sidebar:
1. `/admin/reportes`: Reclamaciones de clientes por apelación de comprobante (`rejected_proof_disputed`), revisiones de devolución prepago (`prepay_refund_review`), no-shows y disputas.
2. `/admin/incidentes`: Reportes cargados por motorizados (dirección falsa, cliente no responde) por revisar/confirmar strike.
3. `/admin/claims`: Reclamos de negocios solicitando reembolso del fondo de cobertura anti-fraude.
4. `/admin/contingencia`: Gestión financiera del fondo de contingencia, registro manual de adelantos y disputas de restaurantes.
5. `/admin/strikes`: Lista informativa de clientes penalizados y bloqueados.
6. `/admin/auditoria`: Visor técnico del log cronológico de eventos de pedidos (`order_event_log`).

### Diagnóstico técnico:
- **Redundancia operativa:** `/admin/reportes`, `/admin/incidentes` y `/admin/claims` son 3 vistas distintas que resuelven una misma acción operativa: **un ítem requiere revisión humana y decisión del admin (aprobar/desestimar)**.
- **Dispersión de contexto:** Si un pedido tuvo un incidente reportado por el motorizado, generó un reporte para el cliente y un reclamo de cobertura del comercio, el administrador debe saltar entre 3 pantallas distintas para comprender el caso completo.

### Recomendación y Propuesta de Unificación:
Se recomienda **reestructurar y consolidar las 6 pantallas en 2 únicos módulos conceptuales**:

1. **`Bandeja de Casos Operativos` (Consolidación de `/reportes`, `/incidentes`, `/claims` y `/contingencia`)**:
   - Una sola vista con pestañas o filtros por tipo de caso (Apelaciones de comprobante, Incidentes de motorizado, Reclamos de cobertura de comercios, Disputas de contingencia).
   - Permite al operador ver toda la historia y resolver los eventos sin cambiar de módulo.
2. **`Auditoría y Reputación` (Consolidación de `/auditoria` y `/strikes`)**:
   - Un módulo de consulta histórica y trazabilidad donde se pueden buscar logs de eventos (`order_event_log`), consultar usuarios bloqueados/con strikes y ajustar parámetros globales de riesgo (`app_settings`).
