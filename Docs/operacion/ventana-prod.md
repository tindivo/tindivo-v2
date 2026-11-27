# Ventana de producción: de la 0271 a la 0295, paso a paso

> Verificado: 2026-11-27 · contra `develop` en `5c313d65`: las 21 migraciones, `supabase/functions/send-push`,
> `supabase/config.toml` y `Docs/operacion/deploy.md` se leyeron una a una; las rutas y los comandos existen. **La ventana
> no se ha ejecutado nunca y ninguna consulta de esta guía se ha corrido contra `tindivo-prod` (sin verificar).** Los
> puntos marcados «sin verificar» se confirman con la salida que pegue Jesús durante la ventana.

Esta guía lleva `tindivo-prod` (`zpnipajgwfthxhdtzhly`, **operación real**) de la migración **0271** a la **0295**. Es la
guía de la ventana; el detalle de cada paso de `send-push` y de Auth vive en `deploy.md` (§2.1, §2.2, §2.2.1) y aquí solo
se ordena. Si esta guía y `deploy.md` chocan, para y avisa: no elijas.

- **Fecha: pendiente de J3** (decisión de Jesús). Fable recomienda el **martes 1-dic por la mañana**, empezando antes de
  las 12:00 de Lima, y no tocar nada entre 18:00 y 23:00 (horario de pedidos).
- **Quién hace qué.** Jesús ejecuta **todo** lo que toca producción: `db push`, `supabase secrets`, `functions deploy`,
  el SQL de escritura, el panel de Supabase, Vercel e Inngest. **Ningún agente usa credenciales de producción** ni
  corre nada contra ella: los agentes preparan, leen lo que Jesús pega y dicen «sigue» o «para». Contra producción solo
  se corren consultas de **solo lectura**, y las corre Jesús.
- **Congelación.** `develop` no recibe merges desde 24 h antes. La guía vale para el commit firmado; si `develop` gana
  otra migración antes de la ventana (hoy hay una en camino: la **0296**, rama `feat/pago-unico-captura-v2`, PR #262,
  dinero), la guía se actualiza y **se vuelve a firmar** (ver §2, paso 0).

## 1. Las migraciones, en orden (21 archivos)

`supabase db push` las aplica en orden de número. Los huecos **0288, 0289 y 0294 no existen en `develop`** (no son
migraciones perdidas: números sin usar o de ramas sin integrar). El informe del 26-nov contaba 20; la cuenta medida es 21.

| N.º | Archivo | Qué hace | Toca datos existentes | `rollbacks/` |
|---|---|---|---|---|
| 0272 | `0272_un_aviso_que_no_salio_se_reintenta.sql` | Columnas `push_*` en `domain_events`, `claim_push_event` con plazo, `complete_push_event`, cron `retry-push-dispatch` (cada minuto), `app_settings.push_retry`. Nace **apagado** | No | Sí |
| 0273 | `0273_el_plato_guarda_su_miniatura.sql` | `menu_items.thumbnail_url` (opcional) | No | No |
| 0274 | `0274_la_busqueda_trae_la_miniatura_del_plato.sql` | `search_catalog` devuelve la miniatura | No | No |
| 0275 | `0275_las_opciones_del_plato_se_validan_al_pedir.sql` | `create_customer_order` exige las selecciones obligatorias | No | No |
| 0276 | `0276_el_perfil_los_terminos_y_las_apelaciones_los_escribe_el_servidor.sql` | **Quita escritura directa** de `anon`/`authenticated` en `customer_profiles`, `terms_acceptance` y `reports`; redefine `create_customer_order` y `create_courier_order` | No (cambia permisos) | No |
| 0277 | `0277_un_numero_verificado_una_sola_cuenta.sql` | Tablas `phone_assignments`, `phone_transfer_challenges`, `phone_restrictions`, `customer_security_notices`; índice único y CHECK sobre teléfonos verificados; `claim_customer_phone`; redefine el antifraude y los dos creadores de pedido. **Falla si hay teléfonos verificados mal formados y desverifica los números duplicados** | **Sí** (`customer_profiles.phone_verified_at`) | No |
| 0278 | `0278_al_borrar_la_cuenta_el_numero_conserva_su_riesgo.sql` | Redefine `delete_customer_account`; `lift_phone_restriction` | No | No |
| 0279 | `0279_una_cuenta_nueva_solo_se_crea_con_google.sql` | Crea `auth_hooks.before_user_created`. **No activa el hook**: se activa a mano en el panel (§2, paso 7) | No | Sí |
| 0280 | `0280_las_resenas_se_piden_por_la_api.sql` | Funciones `*_for` de reseñas; `get_pending_review` y `create_order_review` delegan en ellas | No | Sí |
| 0281 | `0281_el_pedido_guarda_su_plataforma.sql` | `orders.client_platform` (CHECK y default); redefine `create_order_idempotently` | No | Sí |
| 0282 | `0282_the_proof_slot_is_asked_before_uploading.sql` | `prepay_proof_next_attempt` (solo lectura) | No | No |
| 0283 | `0283_un_recojo_siempre_va_prepagado.sql` | `create_customer_order`: recojo solo prepagado (`pickup_requires_prepaid`). **Dinero (invariante 9)** | No | No |
| 0284 | `0284_los_datos_tienen_plazo_de_conservacion.sql` | Plazos en `app_settings.data_retention`, lápidas de Storage, funciones de purga y triggers de guarda; redefine `delete_customer_account`. **Una sola vez vacía el comentario de las reseñas de cuentas ya borradas** | **Sí** (`order_reviews.comment`) | No |
| 0285 | `0285_la_caja_y_los_reclamos_tienen_plazo_de_conservacion.sql` | Retención de notas de caja y reclamos (5 años). **Dinero (invariante 9): `Docs/operacion/retencion-de-datos.md` la marca «pendiente de revisión de Jesús»** | No (la purga corre después, desde la API) | No |
| 0286 | `0286_el_antifraude_solo_cuenta_lo_de_los_ultimos_24_meses.sql` | Ventana de 24 meses para strikes, directorio y asignaciones; redefine `customer_requires_prepayment` y `customer_contraentrega_decision` | No (la purga corre después, desde la API) | No |
| 0287 | `0287_la_cancelacion_automatica_avisa_al_cliente.sql` | `cancel_expired_prepay_orders` escribe `OrderExpired` en el outbox | No | No |
| 0290 | `0290_el_restaurante_elige_sus_destacados.sql` | `menu_items.is_featured`, `businesses.featured_title` | No | Sí |
| 0291 | `0291_el_estado_de_entregas_dice_el_peso_maximo.sql` | `courier_service_status` añade `maxWeightKg` | No | No |
| 0292 | `0292_el_seguimiento_publico_no_da_el_telefono.sql` | `get_tracking` devuelve `driverPhone` siempre `null` | No | Sí |
| 0293 | `0293_el_tope_de_codigos_sms_y_el_traslado_del_celular_son_parametros.sql` | `phone_code_max_per_24h` = 3; **fuerza `phone_transfer_enabled` = `false`**; `reserve_phone_code` y `release_phone_code` | **Sí** (esa clave de `app_settings`) | No |
| 0295 | `0295_la_promo_de_lanzamiento_sin_ventana_completa_no_es_elegible.sql` | `current_customer_promo_free_delivery` no es elegible sin ventana completa | No | Sí |

Ninguna crea extensiones ni toca Vault ni Storage (buckets). Las extensiones que necesitan (`pg_cron`, `pg_net`,
`unaccent`) ya están en producción desde antes de la 0271 (sin verificar: se comprueba en la consulta C-07).

## 2. Pasos de la ventana

Cada paso termina en una **comprobación**; si no da lo esperado, **se para** (§3) y no se sigue con el siguiente. Jesús
pega la salida cruda de cada comprobación y se archiva fuera del repo (`tindivo-auditorias/`).

### Precondiciones (todas, antes de empezar; sin una, no se arranca)

1. **Copia P0.5 hecha y verificada**, con el runbook `Docs/operacion/copia-de-produccion.md`, **el mismo día de la
   ventana** o la víspera como máximo (decisión a confirmar con Jesús). La copia sale PARCIAL por diseño (le falta la
   configuración externa); mientras eso siga abierto, antes de la ventana Jesús **captura a mano** (pantallazos del
   panel) la configuración de Auth (proveedores, URL, hooks), la lista de Edge Functions y los **nombres** de secretos
   (`supabase secrets list`, solo nombres). Sin esa captura la reversión de Auth y de `send-push` es a ciegas.
2. **E2E en verde** sobre el commit de la ventana: la CI de `develop` con Playwright (`pnpm test:e2e`) en verde y, cuando
   entre el PR #209, la corrida de sus 13 escenarios por la API (`pnpm e2e:todo --reset`; **ese script aún no existe en
   `develop`**, vive en #209). Evidencia: la salida cruda, no «está verde».
3. **Esta guía firmada por Codex** sobre el commit que la contiene, sin condiciones abiertas (`codex-auditor.md` §7).
4. **Dinero revisado por Jesús**, por escrito: la **0275**, la **0283**, la **0285** y la **0295** (invariante 9), y el
   efecto de la **0286**, que actúa **en cuanto se aplica** (el directorio viejo deja de dar confianza y quien tuvo un
   strike hace más de 24 meses vuelve a poder pagar contra entrega: aceptado el 2026-11-12; se cuenta antes con C-03b).
5. **Decisión D-A: qué código corre durante y después de la ventana** (la guía no la toma: es de Jesús). Medido: `main`
   está **1041 commits** detrás de `develop`, y `main` tiene migraciones solo hasta la 0271. Leyendo `origin/main`, la
   **web del cliente** (`apps/customer`) escribe con el JWT del navegador en `terms_acceptance` y `customer_profiles`
   (`components/auth-onboarding/persistence.ts`, `features/account/hooks/use-account-page.ts:300`) y da de alta con
   `supabase.auth.signUp` por correo. Con la **0276** esas escrituras dejan de existir (permiso denegado) y con el hook
   de la **0279** activado el alta por correo responde 403. Es decir: **mientras la web del cliente de `main` siga
   viva, la ventana «solo servidor» la rompe** para cuentas nuevas y para editar el perfil. Opciones: (a) la web del
   cliente ya no recibe pedidos (congelada, D-27) y Jesús lo acepta; (b) se despliega antes la API y la web del commit
   firmado (no «solo servidor»). La **prueba de convivencia** de A3 (código de `main` contra las migraciones, en local)
   es lo que confirma el alcance exacto: **está pendiente y esta guía no la sustituye**. Las apps de negocios, motorizados
   y admin de `main` solo **leen** `reports` y no escriben `customer_profiles` (leído en `origin/main`).
6. **Fuera de 18:00-23:00 de Lima** y con `develop` congelado. Jesús y un acompañante (Claude) en la sesión, con
   `Docs/operacion/deploy.md` abierto.

### Paso 0 · El commit y la lista (sin tocar producción)

- Comprueba que el árbol de migraciones es el de esta guía. Desde el worktree limpio del commit firmado:

  ```bash
  git status --short                      # no debe imprimir nada
  git rev-parse --short HEAD              # = el commit que firmó Codex
  ls supabase/migrations | awk '$0 >= "0272"' | wc -l      # debe dar 21
  ls supabase/migrations | awk '$0 > "0295"'               # no debe imprimir nada
  ```

  Si imprime una 0296 o mayor: **para**. La guía no la cubre; se actualiza y se vuelve a firmar.
- `pnpm db:types` sobre la base local migrada hasta la 0295 no debe dejar cambios (la CI ya lo compara).

### Paso 1 · Consultas de solo lectura contra producción (Jesús)

Todas son `select`. Se corren en el editor SQL de `tindivo-prod` o con `psql` de solo lectura.

- **C-01** (la base está donde se cree): `select version from supabase_migrations.schema_migrations order by version desc limit 3;` → la primera fila es **`0271`**. Si es otra, **para**: la guía no aplica.
- **C-02** (0277 no abortará): `select count(*) from public.customer_profiles where phone_verified_at is not null and (phone is null or phone !~ '^[+]519[0-9]{8}$');` → **0**. Si no es 0, la 0277 falla a propósito; se corrige antes, con decisión de Jesús (es dato de clientes).
- **C-03** (cuántos números se desverifican): `select count(*) from public.customer_profiles where phone_verified_at is not null and phone in (select phone from public.customer_profiles where phone_verified_at is not null group by phone having count(*) > 1);` → cuenta **perfiles** (no números): son los que se desverifican. Jesús decide si es aceptable. Cada uno **tendrá que volver a verificar su celular**, perderá la contraentrega 24 meses (§3.3) y esto **no se puede deshacer** sin la copia.
- **C-03b** (0286 actúa al aplicarse; antes del push): cuántas filas quedan fuera de los 24 meses y dejan de contar: `select count(*) from public.customer_strikes where created_at < now() - interval '24 months';` y `select count(*) from public.address_directory where greatest(coalesce(last_used_at, created_at), coalesce(updated_at, created_at), created_at) < now() - interval '24 months';` → con producción operando desde agosto de 2026 se espera **0** en ambas; si no, decide Jesús (cambia a quién se le exige pago adelantado, 0286:177-183).
- **C-04** (cuántas reseñas pierden el comentario, 0284): `select count(*) from public.order_reviews r join public.orders o on o.id = r.order_id join public.users u on u.id = o.customer_user_id where r.customer_user_id is null and r.comment is not null and u.deleted_at is not null;` → Jesús lo acepta (irreversible sin la copia).
- **C-05** (el corte del push sigue fijado): `select key, value, updated_at from public.app_settings where key in ('push_claim_since', 'push_dispatch');` → las dos filas existen y `push_claim_since` tiene fecha ISO válida. Sin ellas, `send-push` ya está fallando cerrado y hay que resolverlo antes (`deploy.md` §2.2).
- **C-06** (informativa, no bloquea): `select status, count(*) from public.orders where status::text not in ('delivered','cancelled') group by 1;` → cuántos pedidos vivos hay; conviene empezar con pocos.
- **C-07** (extensiones): `select extname from pg_extension where extname in ('pg_cron','pg_net','unaccent') order by 1;` → las tres. Si falta `pg_cron`, la 0272 falla en `cron.schedule`.
- **C-08** (ACL de `auth` intacta, 0271): `select count(*) from information_schema.role_table_grants where grantee = 'supabase_auth_admin' and table_schema = 'public';` → **0** (la 0271 y su prueba lo exigen; `supabase/rollbacks/0271_*.acl-prod.txt` guarda el estado anterior).

### Paso 2 · Ensayo del push (sin aplicar nada)

`supabase db push --dry-run` (Jesús, enlazado a `tindivo-prod`; **no** a «Web v2» `psjigdoinfpgrnedxeyf`, abandonado).
Debe listar **exactamente las 21 migraciones**, de la 0272 a la 0295, sin ninguna otra. Si lista más, menos o pide
`--include-all` (historial fuera de orden), **para**. Antes, `supabase projects list` confirma que el enlace es `zpnipajgwfthxhdtzhly`.

### Paso 3 · `supabase db push`

Jesús lo corre una vez, desde el worktree del commit firmado, con la salida en un archivo. El CLI aplica los archivos
en orden y, si uno falla, se detiene y los anteriores quedan aplicados (comportamiento del CLI; si cada archivo va en su
propia transacción o no, se confirma en la salida del push: **sin verificar**; la 0272 dice de sí misma que el CLI no abre
transacción). La 0272 fija `lock_timeout` de 5 s sobre `domain_events` (el outbox en caliente): si no consigue el bloqueo,
falla. Es otra razón para empezar con pocos pedidos vivos (C-06); se reintenta el push, no se edita la migración.
**Solo la 0272 pone `lock_timeout`**: la **0281** (CHECK en `orders`) y la **0277** (índice único y CHECK en
`customer_profiles`) toman bloqueo exclusivo sobre tablas calientes sin tope de espera. Hay que ensayarlo sobre una copia
restaurada (P0.6, aún abierto) y verificar allí si cada archivo va en su propia transacción. Después:

- **C-10** `select version from supabase_migrations.schema_migrations order by version desc limit 1;` → **0295**; y `select count(*) from supabase_migrations.schema_migrations where version >= '0272';` → **21**.
- **C-11** (una sola función por nombre, sin sobrecargas; `supabase/AGENTS.md`): `select p.proname, count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('create_customer_order','create_courier_order','create_order_idempotently','search_catalog','get_tracking','courier_service_status','cancel_expired_prepay_orders','delete_customer_account','customer_is_blocked','customer_requires_prepayment','customer_contraentrega_decision','push_event_types','claim_push_event','get_pending_review','create_order_review','current_customer_promo_free_delivery') group by 1 order by 1;` → **16 filas, todas con `count` = 1** (si falta un nombre o hay un 2, para; una consulta con `having` no vería las ausentes).
- **C-12** (RLS en las tablas nuevas): `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('phone_assignments','phone_transfer_challenges','phone_restrictions','customer_security_notices','retention_storage_tombstones');` → 5 filas, todas `true`.
- **C-13** (0276: el navegador ya no escribe): `select has_table_privilege('authenticated','public.customer_profiles','INSERT,UPDATE'), has_table_privilege('authenticated','public.terms_acceptance','INSERT'), has_table_privilege('authenticated','public.reports','INSERT'), has_any_column_privilege('authenticated','public.customer_profiles','INSERT,UPDATE'), has_any_column_privilege('authenticated','public.terms_acceptance','INSERT,UPDATE'), has_any_column_privilege('authenticated','public.reports','INSERT,UPDATE');` → las seis `false` (la 0276 revoca también por columna).
- **C-14** (columnas nuevas): `select table_name, column_name from information_schema.columns where table_schema = 'public' and (table_name, column_name) in (('menu_items','thumbnail_url'),('menu_items','is_featured'),('businesses','featured_title'),('orders','client_platform'),('domain_events','push_attempts'),('domain_events','push_done_at'),('domain_events','push_dead_at'));` → 7 filas.
- **C-15** (cron de reintento creado y **apagado**): `select jobname, schedule, active from cron.job where jobname = 'retry-push-dispatch';` → una fila, `* * * * *`, activo; y `select value ? 'since' from public.app_settings where key = 'push_retry';` → **`false`** (sin `since` no hace nada).
- **C-16** (parámetros): `select key, value from public.app_settings where key in ('phone_code_max_per_24h','phone_transfer_enabled','data_retention') order by key;` → `3`, `false` y los plazos de retención (24/13 meses y `cashRecordsYears` 5, `strikesMonths`, `addressDirectoryMonths`, `phoneAssignmentsMonths`).
- **C-17** (0277 cerró los duplicados): `select count(*) from (select phone from public.customer_profiles where phone_verified_at is not null group by phone having count(*) > 1) d;` → **0**.
- **C-18** (el hook existe y está cerrado, 0279): `select has_function_privilege('supabase_auth_admin','auth_hooks.before_user_created(jsonb)','EXECUTE'), has_function_privilege('anon','auth_hooks.before_user_created(jsonb)','EXECUTE');` → `true`, `false`.
- **Advisors** del panel (seguridad y rendimiento): sin hallazgos nuevos de RLS ni de `search_path` sobre lo creado.

Si el push **no** terminó en la 0295, o cualquier comprobación falla: §3.

### Paso 4 · Secretos y despliegue de `send-push`

`send-push` de `develop` cambió (7 archivos, 387 líneas añadidas frente a `main`): llama a `complete_push_event`, que
existe desde el paso 3. **Va después del push, nunca antes.**

1. Secretos (Jesús; los valores nunca van al chat ni al repo): comprueba solo los **nombres** con
   `supabase secrets list --project-ref zpnipajgwfthxhdtzhly`. Deben estar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT`, `OPS_ALERT_SECRET` (el mismo valor que en Vercel `tindivo-api`). Para el aviso a la app Android hay
   que poner **`FCM_SERVICE_ACCOUNT_JSON`** (`deploy.md` §2, «Secretos del push nativo»); sin él **solo Android queda
   apagado** y el Web Push sigue. `APNS_*` no se necesitan hasta que exista la app iOS.
2. `supabase functions deploy send-push --project-ref zpnipajgwfthxhdtzhly`, desde el commit firmado. Anota la hora UTC.
3. Comprobación sin enviar nada: `supabase functions list --project-ref zpnipajgwfthxhdtzhly` muestra `send-push` con
   la hora de este despliegue; en los logs de la función **no** debe aparecer `native_push_disabled` para Android.
4. Humo del reclamo (`deploy.md` §2.2, paso 8): un `POST` con solo la clave anónima y un `event_id` inventado → **409**;
   sin `event_id` → **400**. No se crean pedidos de prueba en producción.

### Paso 5 · Encender el reintento de avisos (`push_retry.since`)

Solo después de que `send-push` nuevo esté vivo (`deploy.md` §2.2.1). **Espera al menos 1 minuto** tras el despliegue (que
drenen las instancias viejas) y pon `since` = `now()` en ese momento (`deploy.md` §2.2, paso 4); si no, el cron repite
avisos ya entregados (0272:392-413). SQL de escritura, ejecutado por Jesús:

```sql
update public.app_settings
   set value = jsonb_set(value, '{since}', to_jsonb('<hora UTC ISO del deploy del paso 4>'::text)), updated_at = now()
 where key = 'push_retry';
```

- **C-20** `select value -> 'since' from public.app_settings where key = 'push_retry';` → la hora puesta.
- Pasados 3 minutos, **C-21**: `select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'retry-push-dispatch') order by start_time desc limit 5;` → corridas `succeeded`. **No** se ejecuta `retry_push_dispatch()` a mano (escribe).
- Apagarlo es una línea (`deploy.md` §2.2.1, «Cómo apagarlo»).

### Paso 6 · Auth: proveedor Google de producción

Panel de `tindivo-prod` (`deploy.md` §2.1): **Authentication > Sign In / Providers > Google: ON** con el ID de cliente
web **de producción** (distinto del de staging: cada cliente web de Google lleva solo el callback de su entorno,
`Docs/operacion/publicar-apps-nativas.md`) y su callback `https://zpnipajgwfthxhdtzhly.supabase.co/auth/v1/callback`; «Confirm email» apagado. Se
captura la pantalla antes y después. **Comprobación:** entrar con Google desde la app de prueba cerrada o una cuenta
propia de Jesús; no se crean cuentas de prueba masivas en producción.

### Paso 7 · Auth: activar el hook `before_user_created`

**Solo si la decisión D-A (precondición 5) lo permite.** La función ya existe por el push (C-18). En el panel:
**Authentication > Hooks > Before User Created > Postgres > esquema `auth_hooks`, función `before_user_created` > activar.**
Al revés (hook antes del push), GoTrue no encuentra la función y falla **toda** alta, también la de Google.

- Comprobación (`deploy.md` §2.1, paso 3): un `signUp` por correo con la clave anónima responde **403** «Las cuentas nuevas de Tindivo se crean con Google.»; entrar con Google sigue funcionando; crear un negocio o un motorizado desde Admin sigue funcionando (`auth.admin.createUser` no pasa por el hook).
- `supabase/config.toml` lo activa solo en local; el panel de producción **no lo lee**.

### Paso 8 · Desplegar la API (y lo demás del commit)

Después de los pasos 3 a 5 (`deploy.md` §0.1: la base **antes** que las apps). Qué commit se despliega lo decide D-A.

1. **Variables** (Vercel `tindivo-api`, Production; **[tú]**): las de `deploy.md` §1 más, si se mandan SMS reales,
   `OTP_PHONE_HMAC_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (la puerta del build falla sin ellas) y
   `OPS_ALERT_SECRET`. El **Build Command** debe estar sin sobrescribir. La key del log de la API sigue pendiente (M11 del informe).
2. `pnpm check:deploy` con el remoto enlazado: tiene que salir en **verde** antes de desplegar. Si no puede consultar, falla (a propósito).
3. Despliegue de la API. Humo: `GET https://apiv2.tindivo.com/api/v1/health` → 200; `GET .../api/v1/config` → 200; **una llamada real
   por HTTP** a cada ruta cuya función se redefinió (una sola por RPC no basta: PGRST203, `supabase/AGENTS.md`): cotización,
   `GET /public/orders/{shortId}` de un pedido ya entregado (`driverPhone` = `null`) y `GET /public/courier/status` (`maxWeightKg`).
4. **Inngest** (`deploy.md` §5): se vuelve a sincronizar `https://apiv2.tindivo.com/api/inngest` y debe aparecer
   `apply-data-retention-cron` (04:45 de Lima, `retencion-de-datos.md`). **Esta es la parte que borra y anonimiza datos
   viejos**: antes de dejarla viva, corre las consultas del §«Cómo se comprueba que la purga corre», punto 4, de
   `retencion-de-datos.md` **tal cual** y anota cuántas filas vencidas hay. Con producción operando desde agosto de 2026
   se espera **0** (los plazos son de 13 y 24 meses; sin verificar). Si no es 0, **se para y decide Jesús** antes de la 04:45.
5. Secretos de apps: `NEXT_PUBLIC_SUPPORT_WHATSAPP` y `app_settings.support_whatsapp` con el número real (M7 del informe):
   `select value from public.app_settings where key = 'support_whatsapp';`.

### Paso 9 · Humo de operación y vigilancia

- Un pedido real del flujo normal (con Jesús), de cliente a entregado, con push en cada paso; **no** se inventan pedidos en producción.
- Esa misma noche (18:00-23:00): Jesús y un acompañante miran los avisos y el panel de la cajera; después, el cron
  `retry-push-dispatch` (C-21), `PushDeliveryFailed` en los admins (no debe llegar), y **a las 04:45 del día siguiente**
  la corrida de `apply-data-retention-cron` en `Completed` con `failed = 0`.
- **Dos días de vigilancia**: pedidos nuevos por `client_platform` (`select client_platform, count(*) from public.orders where created_at >= now() - interval '1 day' group by 1;`), errores 4xx/5xx de la API y avisos que no llegan.

## 3. Cuándo abortar y cómo se revierte

**La verdad sobre la reversión.** Un rollback de **esquema** no recupera **datos**. Lo único que devuelve un dato
borrado o cambiado es la **copia P0.5**, y esa copia **no se restaura sobre `tindivo-prod` desde su runbook** (otra
operación, con su plan firmado; la restauración está descrita, no ensayada: P0.6). Por eso la copia va antes, y por eso
lo irreversible va en §3.3.

### 3.1 Cuándo se aborta (se para y no se sigue)

- C-01 no da `0271`, o el `--dry-run` lista algo distinto de las 21.
- C-02 no da 0, o Jesús no acepta el número de C-03 o de C-04.
- El push termina en error: la migración que falló queda sin registrar y las anteriores quedan aplicadas.
- Cualquier comprobación de §2 no da lo esperado.
- La API de producción responde 5xx por una RPC con PGRST203/404 tras desplegar, o un pedido real no se puede crear.
- Aparecen pedidos o avisos perdidos en la noche de operación.
- Pasan las 18:00 de Lima con algo a medias: se deja en el último estado **estable** (ver tabla) y se sigue al día siguiente.

### 3.2 Qué se hace en cada punto

| Estado | Qué hay | Cómo se sigue o se vuelve |
|---|---|---|
| El push falló en la migración N | 0272..N-1 aplicadas, N sin registrar | **No** se reintenta a ciegas: se lee el error, se corrige con una **migración nueva** (nunca se edita una aplicada) y se vuelve a firmar. Las funciones redefinidas ya aplicadas son compatibles con el código viejo (ver §3.4) |
| El push terminó, algo falla después | 0295 aplicada | Casi todo es **aditivo**: se deja la base como está, se apaga lo nuevo (hook, `since`) y se arregla hacia adelante. Volver atrás es la excepción, y se hace con el rollback de la fila (abajo) |
| `send-push` nuevo falla | Función nueva viva | **No se borra `push_claim_since`**: la función de `main` ya llama a `claim_push_event` (`origin/main:supabase/functions/send-push/index.ts:1390`) y, sin corte, la 0272 (líneas 256-261) responde 409 a todo: se cortarían **todos** los avisos. Se hace: (1) quitar `since` (`update public.app_settings set value = value - 'since', updated_at = now() where key = 'push_retry';`), (2) redesplegar la función de `main`, (3) **conservar el corte**. El rollback de `deploy.md` §2.2 (borrar el corte) sirve solo para volver a antes de la 0264 |
| El reintento duplica avisos | `push_retry.since` puesto | `update public.app_settings set value = value - 'since', updated_at = now() where key = 'push_retry';` (apaga el cron sin tocar nada más) |
| El alta de cuentas falla o un cliente legítimo no entra | Hook activo | **Apagar el hook en el panel** (Authentication > Hooks). La función puede quedarse. **Antes** de ejecutar `rollbacks/0279_*` hay que apagar el hook: si no, GoTrue falla TODA alta |
| La web del cliente de `main` falla por la 0276 | Permisos revocados | **No hay un rollback de la 0276 en el repo.** La salida es hacia adelante: desplegar la web/API del commit firmado (opción b de D-A), o decidir (Jesús) una migración nueva que devuelva los permisos, con revisión de seguridad. Por eso D-A se decide **antes** |
| La purga de retención borra algo que no debía | Corrida de las 04:45 | Se apaga la función en Inngest **de inmediato** y se pone `data_retention` inválido para que falle cerrado (la guía de `retencion-de-datos.md` dice que clave inválida = no toca nada). Lo ya borrado solo vuelve de la copia |

### 3.3 Qué NO tiene vuelta (se dice antes, se acepta antes)

- **0277**: los perfiles con el mismo teléfono verificado quedan desverificados (C-03). Las asignaciones quedan en
  `phone_assignments` (`duplicate_cleared`), pero el campo `phone_verified_at` solo vuelve de la copia. Además, quien
  vuelva a verificar su número **pierde la contraentrega durante 24 meses**: `duplicate_cleared` lo deja en `no_history`
  (0277, `customer_contraentrega_decision`; 0286).
- **0284**: los comentarios de reseñas de cuentas ya borradas se vacían (C-04).
- **0293**: `phone_transfer_enabled` pasa a `false` aunque estuviera encendido.
- **La purga y la anonimización de la API** (0284, 0285, 0286): una vez desplegada la API con `apply-data-retention-cron`,
  lo vencido se anonimiza o se borra por lotes cada día, incluida la lista de Storage por lápida. Sin copia, no vuelve.
- **Un cliente que se registró con el hook apagado** o que se desverificó no se repara solo.

### 3.4 Rollbacks que existen en el repo (`supabase/rollbacks/`)

`0272`, `0279`, `0280`, `0281`, `0290`, `0292`, `0295`. **No hay** de `0273`, `0274`, `0275`, `0276`, `0277`, `0278`,
`0282`, `0283`, `0284`, `0285`, `0286`, `0287`, `0291` ni `0293`: esas se corrigen con una migración nueva. Ningún
rollback se ejecuta sin que Jesús lo mande y sin la comprobación de solo lectura que cada uno trae. Las funciones
redefinidas son copias literales de la versión anterior más un cambio puntual (lo dice cada migración), así que el
código de la API de `main` las sigue llamando con la misma firma: lo que **sí** cambia el comportamiento visible para
el código viejo son la 0276 (permisos), la 0279 (hook), la 0283 (recojo solo prepagado) y la 0293 (traslado apagado).

Lo que el código de `main` **nota** con la base en la 0295 (leído en `origin/main`, sin probar):

- **0292**: el WhatsApp del motorizado desaparece del seguimiento (`tracking-driver.tsx:34`).
- **0275**: se rechazan pedidos con opciones obligatorias faltantes o repetidas.
- **0287**: aparece un `OrderExpired` nuevo en el outbox al cancelar por vencimiento.
- **0277**: nace `phone_restrictions`; `phone/verify/route.ts:91` de `main` sella el número **sin crear `phone_assignments`**.
- **Cuenta nueva desde la web de `main`**: el insert de `persistence.ts:155` queda revocado por la 0276, no se crea el perfil, `verify` actualiza 0 filas y responde `verified:true`, y ese cliente **no puede pedir**.

**Conclusión: la base NO puede pasar sola.** Tiene que ir junto con el despliegue de las apps desde `develop`, o la web de
`main` se rompe para los clientes nuevos. Es decisión de Jesús y Fable (J3), antes de fijar la fecha.

## 4. Lo que esta guía no resuelve (a la vista de todos)

- **La prueba de convivencia de A3** (el código de `main` contra las 21 migraciones, en local con `pnpm db:cycle` o su equivalente) **no está hecha**. §2, precondición 5, dice dónde se ve el choque con la web del cliente; el resto de rutas de `main` no se ha probado.
- La **fecha** (J3) y **D-A** son de Jesús.
- La **0296** (pago único, #262) y cualquier migración posterior **no** están en esta guía.
- Ni la ventana ni la restauración se han ensayado contra una copia de producción (P0.6 está abierto).
- Las consultas C-xx son de lectura y están leídas contra las migraciones, no corridas contra un prod real.
