# 02 · Auditoría de la base de datos

> Medido el 2026-10-08 en **`tindivo-prod`** (`zpnipajgwfthxhdtzhly`, Postgres 17, migración 0247) con consultas de
> **solo lectura** al catálogo (`pg_class`, `pg_proc`, `pg_policies`, `information_schema`) y los *advisors* de
> Supabase. Sin datos personales.

## Veredicto

**Los cimientos de la base son buenos; la organización no escala.** La higiene básica está por encima de la media
(RLS en todo, claves primarias, dinero exacto, fechas con zona, `search_path` fijado). Los problemas son de
**estructura**:

- todo vive en un solo esquema;
- `orders` es una tabla de 98 columnas que mezcla cinco temas;
- la lógica de negocio está en funciones gigantes;
- la base no protege su propia máquina de estados;
- hay cinco formas distintas de guardar «eventos».

## Lo que está bien (medido)

| Regla | Estado en prod |
|---|---|
| RLS activada en todas las tablas | **52 de 52** |
| Clave primaria en todas las tablas | **52 de 52** |
| Dinero en `numeric(10,2)` | **Todas** las columnas de importe |
| Fechas con zona horaria (`timestamptz`) | **0** columnas `timestamp` sin zona |
| `search_path` fijado en funciones | **127 de 127** (106 son `SECURITY DEFINER`) |
| Integridad referencial | 97 claves foráneas, 85 `CHECK`, 24 enums |
| Extensiones | Estándar de Postgres (`pg_cron`, `pg_trgm`, `pgcrypto`, `unaccent`, `uuid-ossp`) + `pg_net` y `supabase_vault` |

## Hallazgos

### B-01 · Un solo esquema para todo (`public`)

Las 52 tablas de negocio, de seis dominios distintos (pedidos de restaurante, Entregas, Store, cobros y
liquidaciones, antifraude, identidad), viven en `public`; las de Supabase van aparte (`auth`, `storage`, `realtime`,
`cron`). **No hay fronteras en la base**: cualquier función puede leer y escribir
cualquier tabla. Es el primer obstáculo para separar servicios algún día, y también para entender la base: un agente
o una persona no sabe qué tablas «son» de Entregas sin leer el código.

### B-02 · `orders`: 98 columnas, cinco preocupaciones

`orders` (98) junta en una fila el pedido, el pago y el comprobante, la validación antifraude, el reparto (motorizado,
banda de distancia, GPS) y la auditoría (`*_by`, `*_at`). Le siguen `courier_orders` (45) y `businesses` (38). Una
tabla ancha no es mala por sí sola, y partirla 1:1 puede añadir *joins* sin mejorar nada. Aquí sí hay dos costes
concretos:

- toda RPC que toca el pedido toca todo;
- **`orders` y `courier_orders` repiten conceptos** (contacto, coordenadas y referencia, estado, cancelación, motorizado,
  cobro) **con nombres y tipos distintos**.

El mototaxi sería una tercera copia si no se corrige el patrón.

### B-03 · La lógica de negocio está en funciones gigantes

127 funciones con 277 KB de código. **`advance_order` tiene 39 KB** (una sola función decide todas las transiciones de
todos los roles), `create_customer_order` 24 KB, y `validate_order` y `update_business_manual_order` pasan de 11 KB.
`create_customer_order` se ha redefinido 36 veces y `advance_order` 24. Estas funciones son lo más valioso del
sistema (dinero, antifraude) y a la vez lo más difícil de probar y de revisar: **no existe ningún test SQL** (ni
`supabase/tests` ni pgTAP).

### B-04 · La base no protege su máquina de estados

Ningún trigger valida transiciones de estado en `orders` (los 10 son de sellos de tiempo, outbox, saldo, reembolso,
promociones y bloqueo). La regla «`delivered` es terminal» (invariante 8 de `CLAUDE.md`) se cumple porque **cada
función que escribe `status` lo respeta**, no porque la base lo impida. El defecto del comprobante (H-1 del debate) es
exactamente esto. Una restricción de transiciones en la base (tabla de transiciones permitidas + trigger) cerraría la
clase entera de errores, no solo el caso concreto.

### B-05 · Cinco mecanismos de eventos y tres de temporizadores

| Tabla o mecanismo | Para qué |
|---|---|
| `domain_events` (7 746 filas) | Eventos de dominio que escriben 21 RPC; purga a 90 días |
| `outbox_events` | Otro outbox, que escribe un trigger (solo el rechazo final del comprobante) |
| `order_event_log` (7 329) | Bitácora de acciones del pedido |
| `order_status_history` (5 298) | Historial de estados |
| `courier_order_events` | Bitácora de Entregas |
| `push_delivery_log` (7 650) | Resultado de cada envío de push |
| **Temporizadores** | 12 jobs de `pg_cron` (5 cada minuto, 1 cada 15 minutos, 6 purgas diarias) + 8 funciones de Inngest + `dispatch_event` llamando por HTTP (`pg_net`) a la Edge Function |

Era `ARQ-06` en el análisis anterior y sigue igual. **Matiz:** la bitácora, el historial de estados y el registro de
envíos push son **auditoría**, no colas, y está bien que existan aparte. Lo que sobra es tener **dos outbox**
(`domain_events` y `outbox_events`) y tres caminos de entrega. Para promociones, mototaxi y push nativo conviene
**una entrega durable común** con consumidores idempotentes.

### B-06 · Dos estilos de autorización en SQL

- **13 funciones** autorizan mirando la sesión (`auth.uid()`), y las llaman los usuarios por PostgREST.
- **18 funciones** reciben el usuario por parámetro (`p_actor_user_id`, `p_customer_user_id`…) y solo las puede
  llamar la API (`service_role`). **Comprobado: ninguna de estas 18 la puede ejecutar un usuario.**
- 3 usan las dos cosas.

Es seguro, pero son dos modelos. Hay 103 políticas en `public`; 99 políticas de `public` y `storage` dependen de
`auth.uid()` o de sus ayudantes (`current_user_has_role`, `current_business_id`, `current_driver_id`).

### B-07 · Funciones expuestas sin necesidad

- **13 funciones `SECURITY DEFINER` las puede ejecutar `anon`**, es decir, cualquiera con la clave pública.
- La mayoría son lecturas públicas legítimas (`get_tracking`, `courier_service_status`…).
- Una no lo es: **`expire_courier_orders`**, la función del cron que vence entregas. Su impacto es bajo, porque solo
  vence lo que ya debía vencer, pero rompe el principio: un proceso interno no debe estar en la API pública.
- 28 funciones `SECURITY DEFINER` las pueden ejecutar los usuarios con sesión. Revisé las de apelaciones y reembolsos:
  validan dentro que quien llama sea administrador.

### B-08 · Índices y políticas

- **36 claves foráneas sin índice.** Casi todas son columnas de auditoría (`resolved_by`, `updated_by`), así que
  tienen poco impacto, pero `customer_order_items.menu_item_id` y `promo_redemptions.customer_user_id` sí se consultan.
- **20 índices que nunca se usan** (por ejemplo `orders_customer_gps_distance_idx`, `orders_pickup_timing_idx`).
- **66 casos de varias políticas permisivas** para la misma tabla y acción (patrón `*_admin_all` + `*_owner_all`).
  Postgres evalúa todas; se pueden fundir en una por acción.

### B-09 · Configuración que hace de modelo de datos

`app_settings` (18 claves JSON) guarda parámetros operativos, que es correcto, pero también **entidades de negocio**.
La única promoción del sistema es la clave `promo_free_delivery` (un JSON con fechas, código y tope). Así no caben
dos campañas a la vez, no hay historial y no se puede validar con restricciones. Ver
[`04-arquitectura-objetivo.md`](04-arquitectura-objetivo.md) §4.

### B-10 · Nombres mezclados

- Casi todo está en inglés y `snake_case`, que es lo correcto.
- Hay excepciones que ya son contrato: `orders.comprobante_prepago_url`, el estado `validando` dentro de un enum en
  inglés, `map_landmark_category` entera en español y `vehicle_type` con `bici`/`pie`.
- **Sin `created_at`: 16 tablas; sin `updated_at`: 28.** Algunas no lo necesitan (bitácoras inmutables), pero no hay
  una regla que diga cuáles.

### B-11 · Tres tablas sin políticas a propósito

`customer_otp_attempts`, `idempotency_keys` y `outbox_events` tienen RLS sin políticas, así que nadie salvo
`service_role` las ve. Es correcto, pero conviene **declararlo** (un comentario `COMMENT ON TABLE` o una política
explícita de denegación) para que el *advisor* y un agente no lo confundan con un olvido.

### B-12 · El historial es la única fuente de verdad del esquema

Para saber cómo es hoy una función hay que encontrar su última versión entre 246 migraciones; ya se acordó resolverlo
con una foto legible y una CI que reconstruya la base (`../movil/debate-rest/conclusion.md` §4).

## Resumen por prioridad

| Prioridad | Hallazgos |
|---|---|
| **Corregir ya** (riesgo) | B-04 (guardia de transiciones), B-07 (`expire_courier_orders` y revisión de las 13) |
| **Antes de crecer** (promociones, mototaxi, apps) | B-01, B-02, B-05, B-09 |
| **Higiene continua** | B-03 (tests de SQL y dividir funciones al tocarlas), B-06, B-08, B-10, B-11, B-12 |
