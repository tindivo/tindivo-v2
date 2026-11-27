# Ventana de producción: de la 0271 a la 0295, paso a paso

> Verificado: 2026-11-27 (corregido tras la Ronda 1 de Codex) · contra `develop` en `5c313d65`: las 21 migraciones,
> `supabase/functions/send-push` (y el de `origin/main`), `apps/api/lib/inngest/functions.ts`,
> `packages/backend/src/modules/retention/`, `supabase/config.toml` y `Docs/operacion/deploy.md` se leyeron; las rutas y
> los comandos existen. `origin/main..origin/develop` = **1041** commits (medido tras `git fetch`). **La ventana no se ha
> ejecutado nunca y ninguna consulta de esta guía se ha corrido contra `tindivo-prod` (sin verificar).** Los puntos marcados
> «sin verificar» se confirman con la salida que pegue Jesús durante la ventana o con el ensayo local de las precondiciones.

Esta guía lleva `tindivo-prod` (`zpnipajgwfthxhdtzhly`, **operación real**) de la migración **0271** a la **0295**. Es la
guía de la ventana; el detalle de cada paso de `send-push` y de Auth vive en `deploy.md` (§2.1, §2.2, §2.2.1) y aquí solo
se ordena. Si esta guía y `deploy.md` chocan, para y avisa: no elijas. **Excepción declarada:** en el corte del reintento
(paso 5) manda esta guía, y `deploy.md` queda pendiente de corregir (§4).

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
| 0279 | `0279_una_cuenta_nueva_solo_se_crea_con_google.sql` | Crea `auth_hooks.before_user_created`. **No activa el hook**: se activa a mano en el panel (§2, paso 6) | No | Sí |
| 0280 | `0280_las_resenas_se_piden_por_la_api.sql` | Funciones `*_for` de reseñas; `get_pending_review` y `create_order_review` delegan en ellas | No | Sí |
| 0281 | `0281_el_pedido_guarda_su_plataforma.sql` | `orders.client_platform` (CHECK y default); redefine `create_order_idempotently` | No | Sí |
| 0282 | `0282_the_proof_slot_is_asked_before_uploading.sql` | `prepay_proof_next_attempt` (solo lectura) | No | No |
| 0283 | `0283_un_recojo_siempre_va_prepagado.sql` | `create_customer_order`: recojo solo prepagado (`pickup_requires_prepaid`). **Dinero (invariante 9)** | No | No |
| 0284 | `0284_los_datos_tienen_plazo_de_conservacion.sql` | Plazos en `app_settings.data_retention`, lápidas de Storage, funciones de purga y triggers de guarda; redefine `delete_customer_account`. **Una sola vez vacía el comentario de las reseñas de cuentas ya borradas** | **Sí** (`order_reviews.comment`) | No |
| 0285 | `0285_la_caja_y_los_reclamos_tienen_plazo_de_conservacion.sql` | Retención de notas de caja y reclamos (5 años). **Dinero (invariante 9): `Docs/operacion/retencion-de-datos.md` la marca «pendiente de revisión de Jesús»** | No (la purga corre después, desde la API) | No |
| 0286 | `0286_el_antifraude_solo_cuenta_lo_de_los_ultimos_24_meses.sql` | Ventana de 24 meses para strikes, directorio y asignaciones; redefine `customer_requires_prepayment` y `customer_contraentrega_decision` | No (la purga corre después, desde la API) | No |
| 0287 | `0287_la_cancelacion_automatica_avisa_al_cliente.sql` | `cancel_expired_prepay_orders` escribe `OrderExpired` en el outbox (cuatro motivos: M0287:75, 95, 120, 142) | No | No |
| 0290 | `0290_el_restaurante_elige_sus_destacados.sql` | `menu_items.is_featured`, `businesses.featured_title` | No | Sí |
| 0291 | `0291_el_estado_de_entregas_dice_el_peso_maximo.sql` | `courier_service_status` añade `maxWeightKg` | No | No |
| 0292 | `0292_el_seguimiento_publico_no_da_el_telefono.sql` | `get_tracking` devuelve `driverPhone` siempre `null` | No | Sí |
| 0293 | `0293_el_tope_de_codigos_sms_y_el_traslado_del_celular_son_parametros.sql` | `phone_code_max_per_24h` = 3; **fuerza `phone_transfer_enabled` = `false`** (M0293:23); `reserve_phone_code` y `release_phone_code` | **Sí** (esa clave de `app_settings`) | No |
| 0295 | `0295_la_promo_de_lanzamiento_sin_ventana_completa_no_es_elegible.sql` | `current_customer_promo_free_delivery` no es elegible sin ventana completa | No | Sí |

Ninguna crea extensiones ni toca Vault ni Storage (buckets). Las extensiones que necesitan (`pg_cron`, `pg_net`,
`unaccent`) ya están en producción desde antes de la 0271 (sin verificar: se comprueba en la consulta C-07).

## 2. Pasos de la ventana

Cada paso termina en una **comprobación**; si no da lo esperado, **se para** (§3) y no se sigue con el siguiente. Jesús
pega la salida cruda de cada comprobación y se archiva fuera del repo (`tindivo-auditorias/`). Donde una comprobación
dice «booleano», cada columna debe dar `true`; un `false`, un `null` o cero filas es **para**, nunca «sigue».

### Precondiciones (todas, antes de empezar; sin una, no se arranca)

1. **Copia P0.5 hecha y verificada**, con el runbook `Docs/operacion/copia-de-produccion.md`, **el mismo día de la
   ventana** o la víspera como máximo (decisión a confirmar con Jesús). La copia sale PARCIAL por diseño (le falta la
   configuración externa); mientras eso siga abierto, antes de la ventana Jesús **captura a mano** (pantallazos del
   panel) la configuración de Auth (**si el proveedor Google ya estaba activo**, proveedores, URL, hooks), la lista de
   Edge Functions, los **nombres** de secretos (`supabase secrets list`, solo nombres) y el estado de la función
   `apply-data-retention-cron` en Inngest (hoy no debería existir en producción). Sin esa captura la reversión de Auth y
   de `send-push` es a ciegas.
2. **E2E en verde** sobre el commit de la ventana: la CI de `develop` con Playwright (`pnpm test:e2e`) en verde y, cuando
   entre el PR #209, la corrida de sus 13 escenarios por la API (`pnpm e2e:todo --reset`; **ese script aún no existe en
   `develop`**, vive en #209). Evidencia: la salida cruda, no «está verde».
3. **Esta guía firmada por Codex** sobre el commit que la contiene, sin condiciones abiertas (`codex-auditor.md` §7).
4. **Dinero revisado por Jesús**, por escrito: la **0275**, la **0283**, la **0285** y la **0295** (invariante 9), y el
   efecto de la **0286**, que actúa **en cuanto se aplica** (el directorio viejo deja de dar confianza y quien tuvo un
   strike hace más de 24 meses vuelve a poder pagar contra entrega: aceptado el 2026-11-12; se cuenta antes con C-03b).
   También, por escrito, que la **0293** pondrá `phone_transfer_enabled` en `false` aunque hoy esté encendido (se captura
   antes con C-03d) y los **conteos de purga** del paso 3-ter, categoría por categoría.
5. **Decisión D-A: qué código corre durante y después de la ventana** (la guía no la toma: es de Jesús). Medido:
   `origin/main..origin/develop` = **1041** commits, y `main` tiene migraciones solo hasta la 0271. Hay **dos
   alternativas, con un orden fijo cada una**; nunca «la API antes que la base» (la API nueva lee columnas que solo
   existen tras el push, p. ej. `is_featured` y `featured_title` de la 0290, M0290:17).
   - **(a) Retirar la web del cliente de `main` antes del push.** Antes del paso 3: la web del cliente deja de servir
     (decisión D-27) y se comprueba que no atiende. Sigue **todo** lo demás en el orden de §2. Lo que queda de `main` y
     sigue vivo hasta el paso 8: la **API de `main`** (`apps/api/app/api/v1/customer/phone/verify/route.ts:91-92`, que
     sella `phone_verified_at` sin crear `phone_assignments` y, con la 0277, puede chocar con el índice único si el número
     ya está verificado en otra cuenta: sin verificar) y las apps de negocios, motorizados y admin de `main`. La web de
     `main` también se rompe sola con la 0276 y el hook: `components/auth-onboarding/persistence.ts:155` (INSERT en
     `customer_profiles`), `features/account/hooks/use-account-page.ts:300` (`upsert` en `customer_profiles`) y
     `supabase.auth.signUp` por correo.
   - **(b) Base primero y, en la misma ventana, API y web del cliente del commit firmado.** Orden: push (paso 3) →
     `send-push` (4) → reintento (5) → hook (6) → API **y** web del cliente del commit firmado (8). **Entre el push y el
     despliegue de la web, la web del cliente de `main` queda en mantenimiento** (mecanismo a definir por Jesús; sin
     verificar cuál) porque ya no puede escribir su perfil ni dar de alta cuentas.
   - Las dos exigen la **matriz de convivencia** de abajo, completa y aceptada por Jesús, **antes de fijar la fecha**. La
     **prueba de convivencia** de A3 (código de `main` contra las migraciones, en local) sigue **pendiente** y esta guía no
     la sustituye.

   **Matriz de convivencia** (consumidor de `main` · qué falla · en qué alternativa · cómo se evita). Cuatro archivos de
   aplicaciones de `main` se leyeron; el resto de rutas de `main` **no** se ha probado (sin verificar):

   | Consumidor de `main` | Qué falla (migración) | Cuándo | Cómo se evita |
   |---|---|---|---|
   | Web del cliente: perfil y términos (`persistence.ts:155`, `use-account-page.ts:300`) | Permiso denegado al escribir `customer_profiles` y `terms_acceptance` (0276); cuenta nueva sin perfil | (a) si no se retiró; (b) entre el push y el despliegue de la web | (a) retirarla antes del push; (b) mantenimiento push → deploy |
   | Web del cliente: alta por correo (`supabase.auth.signUp`) | 403 con el hook activo (0279) | Desde el paso 6 | Igual que la fila anterior; el hook no se activa con la web de `main` sirviendo |
   | API de `main`: `phone/verify/route.ts:91-92` | Sella el número sin `phone_assignments`; con la 0277, posible choque con el índice único (sin verificar) | Del push al despliegue de la API (paso 8), en ambas | Verificación de teléfono suspendida en ese intervalo (decisión de Jesús) o ensayo A3 que lo acote |
   | `send-push` de `main` (`origin/main:supabase/functions/send-push/index.ts:587`) | Trata **todo** `OrderExpired` como falta de pago («No llegó el pago a tiempo»); la 0287 emite `OrderExpired` también por no aceptar el negocio (`pending_acceptance_timeout`), por antifraude (`validation_timeout`) y por comprobante sin revisar: el cliente recibe un texto falso | Del push al paso 4 (minutos) y, de volver a `main`, mientras `main` siga viva | Desplegar `send-push` justo tras el push; aceptar el texto erróneo en ese intervalo o, si Jesús no lo acepta, esperar una hora sin cancelaciones (C-06 muestra los pedidos vivos) |
   | `send-push` de `main`: no llama a `complete_push_event` | Un evento reclamado queda sin `push_done_at` y, con el plazo por defecto (180 s), puede **volver a reclamarse** | Del push al paso 4 y de volver a `main` | Paso 3-bis (`leaseSeconds` = 900) |
   | Web de `main`: seguimiento (`tracking-driver.tsx:34`) | Sin WhatsApp del motorizado (0292) | Después del push | Aceptado; se corrige con la web del commit firmado |
   | Creadores de pedido (`create_customer_order`, `create_courier_order`) | Recojo solo prepagado (0283) y opciones obligatorias (0275): rechaza pedidos que antes pasaban | Después del push | Dinero: ya aceptado en la precondición 4 |
6. **Ensayo local del push de avisos** (gate, antes de la ventana; en la base local bajo candado, `pnpm db:cycle`). Con
   la función de `main` simulada (reclama y **no** llama a `complete_push_event`) y la de `develop`, evidencia cruda de
   ida, vuelta y nueva ida:
   - **Ida**: tras aplicar la 0272 con `leaseSeconds` = 900 y `ttlMinutes` = 15, un evento reclamado por la función vieja
     y sin `push_done_at` **no** se vuelve a reclamar: `claim_push_event` del mismo UUID devuelve 0 filas tras más de 180 s
     y tras más de 900 s (se simula retrasando `push_claimed_at`). Con `leaseSeconds` = 180 el mismo experimento **sí**
     devuelve la fila (prueba que el riesgo existe y que el 900 lo evita).
   - **Drenaje**: un evento procesado por la versión vieja durante el minuto de drenaje, con `since` puesto después, queda
     **fuera** del cron (`occurred_at < since`) y, con `leaseSeconds` = 900, no es reclamable. Al volver `leaseSeconds` a
     180 **antes** de que pase `ttlMinutes` desde su `occurred_at`, sí lo sería: por eso el paso 5-bis espera.
   - **Vuelta**: quitar `since`, `leaseSeconds` = 900, `main` viva: un evento nuevo reclamado por `main` no se re-reclama
     ni lo reintenta el cron.
   - **Nueva ida**: redesplegar la nueva, `since` posterior al drenaje, `leaseSeconds` de vuelta a 180 pasado el plazo;
     un evento normal posterior termina con `push_done_at` puesto.
7. **Versión exacta del CLI de Supabase y ensayo local del push** (gate). Jesús anota `supabase --version` de **su**
   máquina (en la máquina de la sesión que preparó la guía se midió `2.109.1`; es otra máquina) y se ensaya con esa misma
   versión, en una copia local aparte (no en el repo), contra la base local en 0271:
   - Si **cada archivo va en una transacción** o no: se provoca un fallo en el medio de un archivo (p. ej. una copia de
     la 0277 con un error después del `DO` de duplicados) y se mide qué queda (historial, objetos, perfiles
     desverificados). La 0272 dice de sí misma que el CLI no abre transacción (M0272:41-43); **sin verificar** hasta este
     ensayo.
   - Un **bloqueo provocado** (otra sesión con una transacción abierta sobre `customer_profiles` y sobre `orders`)
     contra la 0277 y la 0281: cuánto espera el CLI, qué muestra y si Ctrl+C lo corta limpio.
   - Si el CLI respeta un `lock_timeout` de arranque (p. ej. `PGOPTIONS="-c lock_timeout=10s"`): **sin verificar**; solo
     se usa si el ensayo lo mide.
   - Y la recuperación de §3.2-bis, reproducida con esa versión.
8. **Fuera de 18:00-23:00 de Lima** y con `develop` congelado. Jesús y un acompañante (Claude) en la sesión, con
   `Docs/operacion/deploy.md` abierto.

### Paso 0 · El commit y la lista (sin tocar producción)

- Comprueba que el árbol de migraciones es el de esta guía. Desde el worktree limpio del commit firmado:

  ```bash
  git status --short                                                  # no debe imprimir nada
  git rev-parse --short HEAD                                          # = el commit que firmó Codex
  ls supabase/migrations | awk 'substr($0,1,4) >= "0272"' | wc -l    # debe dar 21
  ls supabase/migrations | awk 'substr($0,1,4) > "0295"'             # no debe imprimir nada
  ```

  Se compara solo el prefijo de 4 dígitos: el nombre completo `0295_la_promo_…sql` es mayor que `"0295"` y daría un falso
  positivo. Si imprime una 0296 o mayor: **para**. La guía no la cubre; se actualiza y se vuelve a firmar.
- `pnpm db:types` sobre la base local migrada hasta la 0295 no debe dejar cambios (la CI ya lo compara).

### Paso 1 · Consultas de solo lectura contra producción (Jesús)

Todas son `select`. Se corren en el editor SQL de `tindivo-prod` o con `psql` de solo lectura.

- **C-01** (la base está donde se cree): `select version from supabase_migrations.schema_migrations order by version desc limit 3;` → la primera fila es **`0271`**. Si es otra, **para**: la guía no aplica.
- **C-02** (0277 no abortará): `select count(*) from public.customer_profiles where phone_verified_at is not null and (phone is null or phone !~ '^[+]519[0-9]{8}$');` → **0**. Si no es 0, la 0277 falla a propósito; se corrige antes, con decisión de Jesús (es dato de clientes).
- **C-03** (cuántos números se desverifican): `select count(*) from public.customer_profiles where phone_verified_at is not null and phone in (select phone from public.customer_profiles where phone_verified_at is not null group by phone having count(*) > 1);` → cuenta **perfiles** (no números): son los que se desverifican. Jesús decide si es aceptable. Cada uno **tendrá que volver a verificar su celular** y esto **no se puede deshacer** sin la copia. Efecto en la contraentrega: §3.3.
- **C-03b** (0286 actúa al aplicarse; antes del push): cuántas filas quedan fuera de la ventana y dejan de contar. El corte es la **medianoche de Lima** del día (hoy en Lima − 24 meses), como `retention_cutoff` (M0284:289-320), escrito sin llamar a esa función (en la 0271 no existe). Si C-03c muestra otros meses para `strikesMonths` o `addressDirectoryMonths`, se cambia el `24` de la consulta:

  ```sql
  with c as (
    select (((now() at time zone 'America/Lima')::date - interval '24 months')::date)::timestamp
           at time zone 'America/Lima' as corte
  )
  select (select count(*) from public.customer_strikes s, c where s.created_at < c.corte) as strikes_fuera,
         (select count(*) from public.address_directory d, c
           where greatest(d.last_used_at, d.updated_at, d.created_at) < c.corte) as directorio_fuera;
  ```

  → con producción operando desde agosto de 2026 se espera **0** en ambas; si no, decide Jesús (cambia a quién se le exige pago adelantado, 0286:177-183).
- **C-03c** (los plazos que ya existen): `select value from public.app_settings where key = 'data_retention';` → se espera **sin fila** (la crea la 0284). Si existe, se anota **cada valor**: las migraciones 0284, 0285 y 0286 **no pisan** una clave presente (`on conflict do nothing` y `not (value ? '…')`), y la purga usará esos valores, no los de esta guía.
- **C-03d** (lo que la 0293 sobrescribe): `select value, updated_at from public.app_settings where key = 'phone_transfer_enabled';` → se anota el valor. Si es `true` (o la fila existe con otro valor), Jesús lo acepta **por escrito** antes del push: la 0293 lo fuerza a `false` (M0293:23) y reabrirlo es una decisión posterior y explícita.
- **C-04** (cuántas reseñas pierden el comentario, 0284): `select count(*) from public.order_reviews r join public.orders o on o.id = r.order_id join public.users u on u.id = o.customer_user_id where r.customer_user_id is null and r.comment is not null and u.deleted_at is not null;` → Jesús lo acepta (irreversible sin la copia).
- **C-05** (el corte del push sigue fijado y el despacho tiene la forma que exige la 0272): booleano.

  ```sql
  select (select jsonb_typeof(value) = 'string'
                 and (value #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ]'
                 and isfinite((value #>> '{}')::timestamptz)
            from public.app_settings where key = 'push_claim_since') as corte_valido,
         (select jsonb_typeof(value) = 'object'
                 and jsonb_typeof(value -> 'url') = 'string'
                 and (value ->> 'url') like 'https://zpnipajgwfthxhdtzhly.supabase.co/functions/v1/%send-push'
                 and jsonb_typeof(value -> 'anonKey') = 'string'
                 and length(value ->> 'anonKey') > 0
            from public.app_settings where key = 'push_dispatch') as despacho_valido;
  ```

  → `true`, `true`. Sin `url` en `push_dispatch`, `post_push_dispatch` devuelve `false` y no llama a nadie (M0272:113-118) y el cron retorna sin hacer nada (M0272:351-356). Con `corte_valido` en `false` o `null`, `send-push` ya falla cerrado y se resuelve antes (`deploy.md` §2.2). Una cadena que solo «existe» no es evidencia.
- **C-06** (informativa, no bloquea): `select status, count(*) from public.orders where status::text not in ('delivered','cancelled') group by 1;` → cuántos pedidos vivos hay; conviene empezar con pocos.
- **C-07** (extensiones): `select extname from pg_extension where extname in ('pg_cron','pg_net','unaccent') order by 1;` → las tres. Si falta `pg_cron`, la 0272 falla en `cron.schedule`.
- **C-08** (ACL de `auth` intacta, 0271): `select count(*) from information_schema.role_table_grants where grantee = 'supabase_auth_admin' and table_schema = 'public';` → **0** (la 0271 y su prueba lo exigen; `supabase/rollbacks/0271_*.acl-prod.txt` guarda el estado anterior). Comprueba permisos de tabla, no toda la ACL ni el trigger que también verifica la 0271.
- **C-09** (cuentas creadas por correo, sin la protección del hook; `auth.users` y `auth.identities` son del esquema de Supabase Auth, **sin verificar** las columnas en la versión de producción): `select count(*) as por_correo, count(*) filter (where not exists (select 1 from public.user_roles r where r.user_id = u.id and r.role in ('business','driver','admin'))) as por_correo_sin_rol_de_personal, count(*) filter (where exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google')) as ya_con_google from auth.users u where u.raw_app_meta_data ->> 'provider' = 'email';` → se anotan los tres números. Las cuentas «por correo sin rol de personal» son las que se crearon sin la protección de la 0279: el correo figura confirmado (autoconfirm) y quien las creó conoce la contraseña (M0279:5-12). **El hook no las corrige.** Jesús decide, por escrito, qué hacer con ellas antes del paso 6 (revisarlas, resetear su acceso o aceptar el riesgo).

### Paso 2 · Ensayo del push (sin aplicar nada)

`supabase db push --dry-run` (Jesús, enlazado a `tindivo-prod`; **no** a «Web v2» `psjigdoinfpgrnedxeyf`, abandonado).
Debe listar **exactamente las 21 migraciones**, de la 0272 a la 0295, sin ninguna otra. Si lista más, menos o pide
`--include-all` (historial fuera de orden), **para**. Antes, `supabase projects list` confirma que el enlace es `zpnipajgwfthxhdtzhly`.

### Paso 3 · `supabase db push`

Jesús lo corre una vez, desde el worktree del commit firmado, con la versión del CLI de la precondición 7 y la salida en
un archivo. El CLI aplica los archivos en orden y, si uno falla, se detiene y los anteriores quedan aplicados. Si cada
archivo va en una transacción o no, **lo dijo el ensayo local** (precondición 7); sin ese ensayo no se arranca. La 0272
fija `lock_timeout` de 5 s sobre `domain_events` (el outbox en caliente): si no consigue el bloqueo, falla; se reintenta
el push, no se edita la migración. **Solo la 0272 pone `lock_timeout`** y lo restaura al final de su archivo: la **0281**
(CHECK en `orders`, M0281:28) y la **0277** (índice único y CHECK en `customer_profiles`, M0277:47 y M0277:65) toman
bloqueo exclusivo sobre tablas calientes **sin tope de espera**.

**Límite de espera concreto:** si el push lleva **más de 60 s sin avanzar** en la 0277 o la 0281, otra sesión de Jesús
corre (solo lectura):

```sql
select a.pid, a.state, a.wait_event_type, now() - a.query_start as lleva,
       pg_blocking_pids(a.pid) as bloqueado_por, left(a.query, 100) as consulta
  from pg_stat_activity a
 where a.datname = current_database() and a.pid <> pg_backend_pid()
   and (cardinality(pg_blocking_pids(a.pid)) > 0 or a.pid in (select unnest(pg_blocking_pids(b.pid)) from pg_stat_activity b))
 order by a.query_start;
```

Si el bloqueador es una transacción de la API o de las apps que sigue viva, se espera a que termine; **pasados 3
minutos** Jesús decide (acción suya, nunca de un agente): `select pg_cancel_backend(<pid del bloqueador>);` (cancela su
consulta, no la sesión) o, si el que espera es el push, **Ctrl+C** en el CLI. Lo que queda después depende de la
atomicidad medida en el ensayo: §3.2-bis. Después del push:

- **C-10** `select version from supabase_migrations.schema_migrations order by version desc limit 1;` → **0295**; y `select count(*) from supabase_migrations.schema_migrations where version >= '0272';` → **21**.
- **C-11** (una sola función por nombre, sin sobrecargas; `supabase/AGENTS.md`): `select p.proname, count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('create_customer_order','create_courier_order','create_order_idempotently','search_catalog','get_tracking','courier_service_status','cancel_expired_prepay_orders','delete_customer_account','customer_is_blocked','customer_requires_prepayment','customer_contraentrega_decision','push_event_types','claim_push_event','get_pending_review','create_order_review','current_customer_promo_free_delivery') group by 1 order by 1;` → **16 filas, todas con `count` = 1** (si falta un nombre o hay un 2, para; una consulta con `having` no vería las ausentes). Cuenta por nombre: no prueba argumentos ni que la llamada HTTP resuelva (eso lo hace el humo del paso 8).
- **C-12** (RLS en las tablas nuevas): `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('phone_assignments','phone_transfer_challenges','phone_restrictions','customer_security_notices','retention_storage_tombstones');` → 5 filas, todas `true`.
- **C-13** (0276: el navegador ya no escribe): `select has_table_privilege('authenticated','public.customer_profiles','INSERT,UPDATE'), has_table_privilege('authenticated','public.terms_acceptance','INSERT'), has_table_privilege('authenticated','public.reports','INSERT'), has_any_column_privilege('authenticated','public.customer_profiles','INSERT,UPDATE'), has_any_column_privilege('authenticated','public.terms_acceptance','INSERT,UPDATE'), has_any_column_privilege('authenticated','public.reports','INSERT,UPDATE');` → las seis `false` (la 0276 revoca también por columna).
- **C-14** (columnas nuevas): `select table_name, column_name from information_schema.columns where table_schema = 'public' and (table_name, column_name) in (('menu_items','thumbnail_url'),('menu_items','is_featured'),('businesses','featured_title'),('orders','client_platform'),('domain_events','push_attempts'),('domain_events','push_done_at'),('domain_events','push_dead_at'));` → 7 filas.
- **C-15** (cron de reintento creado y **apagado**): `select jobname, schedule, active from cron.job where jobname = 'retry-push-dispatch';` → una fila, `* * * * *`, activo; y `select value ? 'since' from public.app_settings where key = 'push_retry';` → **`false`** (sin `since` no hace nada).
- **C-16** (parámetros): `select key, value from public.app_settings where key in ('phone_code_max_per_24h','phone_transfer_enabled','data_retention') order by key;` → `phone_code_max_per_24h` = `3`, `phone_transfer_enabled` = `false`, y `data_retention` con los plazos **solo si la clave no existía** (C-03c; 24/13 meses, `cashRecordsYears` 5, `strikesMonths`, `addressDirectoryMonths`, `phoneAssignmentsMonths`). Si existía, deben salir **los valores anotados en C-03c** más las claves que faltaban.
- **C-17** (0277 cerró los duplicados): `select count(*) from (select phone from public.customer_profiles where phone_verified_at is not null group by phone having count(*) > 1) d;` → **0**.
- **C-18** (el hook existe y está cerrado, 0279): `select has_function_privilege('supabase_auth_admin','auth_hooks.before_user_created(jsonb)','EXECUTE'), has_function_privilege('anon','auth_hooks.before_user_created(jsonb)','EXECUTE');` → `true`, `false`. Comprueba permisos; **no** que el hook esté activado en el panel.
- **Advisors** del panel (seguridad y rendimiento): sin hallazgos nuevos de RLS ni de `search_path` sobre lo creado.

Si el push **no** terminó en la 0295, o cualquier comprobación falla: §3.

### Paso 3-bis · Alargar el plazo del reclamo (justo después del push, antes de todo lo demás)

Desde que existe la 0272, `claim_push_event` **vuelve a reclamar** un evento ya reclamado si pasó `leaseSeconds` (180 por
defecto) y tiene menos de `ttlMinutes` (15): M0272:279-281. La función de `main` reclama y **no** marca el final
(no llama a `complete_push_event`), así que, hasta desplegar la nueva (paso 4), todo aviso que envía queda «sin
terminar» y, pasados 180 s, quien conozca su UUID podría reclamarlo de nuevo y repetirlo. Con `leaseSeconds` = 900 y
`ttlMinutes` ≤ 15 **ningún evento puede re-reclamarse**: el reclamo es de `now()`, siempre posterior a `occurred_at`, y
un evento con más de 15 minutos ya no cumple `occurred_at > now() - ttl`. SQL de escritura, ejecutado por Jesús
**inmediatamente** tras el push:

```sql
update public.app_settings
   set value = jsonb_set(value, '{leaseSeconds}', '900'::jsonb), updated_at = now()
 where key = 'push_retry';
```

- **C-19** (booleano; `push_retry_settings` es de solo lectura y la corre el editor como `postgres`): `select lease = interval '900 seconds' as lease_900, ttl <= lease as ttl_dentro_del_lease from public.push_retry_settings(false);` y `select not (value ? 'since') as sin_since from public.app_settings where key = 'push_retry';` → `true` en las tres.
- **Residuo declarado:** los segundos entre el fin del push y este `update` (y los eventos reclamados por `main` justo antes del push, que siguen siendo re-reclamables hasta entonces). Solo los puede abrir quien conozca el UUID del evento; el cron sigue apagado. Se puede cerrar del todo **insertando antes del push** la fila `push_retry` con `leaseSeconds` = 900 (la 0272 la inserta con `on conflict do nothing`, M0272:66-71), pero esa variante **no está ensayada**: si Jesús la elige, entra en el ensayo local de la precondición 6.

### Paso 3-ter · Conteos de purga (lo que la API va a borrar), antes de desplegar la API

Con el push hecho las funciones existen (`retention_cutoff`, `retention_cash_cutoff`, `retention_report_due`,
`retention_fraud_claim_due`: todas `stable` y de solo lectura, M0284:292, M0285:31, M0284:785, M0285:107) y **nada
purga todavía**: el cron vive en la API. Cada consulta usa **el mismo predicado** que su función de purga. Jesús las corre
en el editor (rol `postgres`; los helpers solo dan permiso a `service_role`). Cada categoría: **0** es lo esperado
(producción opera desde agosto de 2026 y los plazos son de 13, 24 meses y 5 años; sin verificar). **Si no es 0: para y
decide Jesús, por categoría y por escrito**, qué se acepta que se borre o anonimice (irreversible sin la copia).

- **C-30** (los cortes son válidos; si alguno es `null`, esa categoría no se purga y el conteo de abajo da 0 sin significar nada): `select k, public.retention_cutoff(k) is not null as ok from unnest(array['customerIncidentsMonths','reportsMonths','phoneRestrictionsMonths','storeEventsMonths','pushDeliveryLogMonths','adminAlertsMonths','strikesMonths','addressDirectoryMonths','phoneAssignmentsMonths']) k;` y `select public.retention_cash_cutoff() is not null as caja_ok;` → todo `true`. Además `select k, public.retention_cutoff(k) from unnest(array[...los mismos...]) k;` para ver **la fecha** que se aplicará.
- **C-31** incidentes (`anonymize_old_customer_incidents`, M0284:742-770): `select count(*) from public.customer_incidents x where x.reviewed_at is not null and greatest(x.created_at, x.reviewed_at) < public.retention_cutoff('customerIncidentsMonths') and (x.customer_phone <> 'eliminado' or x.delivery_reference is not null or x.description is not null or x.customer_user_id is not null);` → 0. Incluye el caso del teléfono `eliminado` con otros campos aún presentes (M0284:764).
- **C-32** reportes (M0284:785-811): `select count(*) from public.reports r where public.retention_report_due(r, public.retention_cutoff('reportsMonths'));` → 0. Cada uno puede traer una imagen que se borra de Storage.
- **C-33** restricciones del número (M0284:709-730): `select count(*) from public.phone_restrictions x where (x.lifted_at is not null or (x."until" is not null and x."until" <= now())) and greatest(x.lifted_at, x."until") < public.retention_cutoff('phoneRestrictionsMonths');` → 0 (la tabla es nueva: debe estar vacía).
- **C-34** registros técnicos (M0284:616-700): `select (select count(*) from public.store_events where created_at < public.retention_cutoff('storeEventsMonths')) as store_events, (select count(*) from public.push_delivery_log where "at" < public.retention_cutoff('pushDeliveryLogMonths')) as push_delivery_log, (select count(*) from public.admin_alerts where resolved_at is not null and resolved_at < public.retention_cutoff('adminAlertsMonths')) as admin_alerts;` → `0, 0, 0`.
- **C-35** caja y reclamos (**dinero**, M0285:73-105 y 107-130): `select (select count(*) from public.cash_settlements x where x.created_at < public.retention_cash_cutoff() and x.status <> 'disputed' and (x.dispute_note is not null or x.resolution_note is not null)) as notas_de_caja, (select count(*) from public.fraud_coverage_claims c where public.retention_fraud_claim_due(c, public.retention_cash_cutoff())) as reclamos;` → `0, 0`. Con el plazo de 5 años y la operación desde agosto de 2026 no puede vencer nada; si da otra cosa, algo está mal con `cashRecordsYears` (C-03c).
- **C-36** antifraude (M0286:192-260): `select (select count(*) from public.customer_strikes x where x.created_at < public.retention_cutoff('strikesMonths') and (x.phone <> 'eliminado' or x.customer_user_id is not null or x.delivery_reference is not null or x.order_id is not null or x.delivery_coordinates_lat is not null or x.delivery_coordinates_lng is not null)) as strikes, (select count(*) from public.address_directory x where greatest(x.last_used_at, x.updated_at, x.created_at) < public.retention_cutoff('addressDirectoryMonths')) as directorio, (select count(*) from public.phone_assignments x where x.ended_at is not null and x.ended_at < public.retention_cutoff('phoneAssignmentsMonths')) as asignaciones, (select count(*) from public.phone_transfer_challenges c where c.assignment_id in (select id from public.phone_assignments x where x.ended_at is not null and x.ended_at < public.retention_cutoff('phoneAssignmentsMonths')) or c.result_assignment_id in (select id from public.phone_assignments x where x.ended_at is not null and x.ended_at < public.retention_cutoff('phoneAssignmentsMonths'))) as desafios;` → `0, 0, 0, 0`. Strikes y directorio ya se contaron antes del push con C-03b (cambian a quién se le exige pago); aquí se repite con el predicado exacto de la purga.
- **C-37** lápidas pendientes de Storage: `select count(*) from public.retention_storage_tombstones where deleted_at is null;` → **0** (la tabla nace con la 0284: no puede haber lápidas antes de la primera corrida).

**Barrera.** La API (que trae el cron `apply-data-retention-cron`, `apps/api/lib/inngest/functions.ts:350`, cron
`TZ=America/Lima 45 4 * * *`) **no se despliega** hasta que Jesús haya aceptado por escrito todos estos conteos. Tras
desplegar y **sincronizar Inngest** (paso 8), se comprueba en el panel que `apply-data-retention-cron` aparece; **si por
cualquier motivo los conteos no se aceptaron, se pausa allí antes de las 04:45 de Lima** (y se sigue el §3.2, fila de la
purga). Si la integración Vercel-Inngest sincroniza sola, la función ya estará viva al terminar el deploy (sin
verificar): por eso los conteos van antes.

### Paso 4 · Secretos y despliegue de `send-push`

`send-push` de `develop` cambió (7 archivos, 387 líneas añadidas frente a `main`): llama a `complete_push_event`, que
existe desde el paso 3. **Va después del push, nunca antes**, y **justo después** del paso 3-bis (el intervalo
push → deploy usa la función de `main`; ver la matriz de la precondición 5).

1. Secretos (Jesús; los valores nunca van al chat ni al repo): comprueba solo los **nombres** con
   `supabase secrets list --project-ref zpnipajgwfthxhdtzhly`. Deben estar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT`, `OPS_ALERT_SECRET` (el mismo valor que en Vercel `tindivo-api`). Para el aviso a la app Android hay
   que poner **`FCM_SERVICE_ACCOUNT_JSON`** (`deploy.md` §2, «Secretos del push nativo»); sin él **solo Android queda
   apagado** y el Web Push sigue. `APNS_*` no se necesitan hasta que exista la app iOS.
2. `supabase functions deploy send-push --project-ref zpnipajgwfthxhdtzhly`, desde el commit firmado. **Anota la hora UTC
   en que termina el comando** (la «hora del deploy»).
3. Comprobación sin enviar nada: `supabase functions list --project-ref zpnipajgwfthxhdtzhly` muestra `send-push` con
   la hora de este despliegue; en los logs de la función **no** debe aparecer `native_push_disabled` para Android.
4. Humo del reclamo (`deploy.md` §2.2, paso 8): un `POST` con solo la clave anónima y un `event_id` inventado → **409**;
   sin `event_id` → **400**. No se crean pedidos de prueba en producción. **Este humo prueba que el reclamo cierra, no
   que un aviso se entregue.**

### Paso 5 · Encender el reintento de avisos (`push_retry.since`)

Solo después de que `send-push` nuevo esté vivo (`deploy.md` §2.2.1). **Espera al menos 60 segundos desde la hora del
deploy** (que drenen las instancias viejas) y pon `since` en el **instante de ese momento**, no en la hora del deploy:
las instancias viejas siguen reclamando sin marcar el final durante ese minuto, y todo evento anterior a `since` queda
fuera del cron. **Esto se aparta de `deploy.md` §2.2.1 (paso 3: «hora del deploy»); en la ventana manda esta guía y
`deploy.md` queda pendiente de corregir (§4).** `leaseSeconds` **sigue en 900** (paso 5-bis). SQL de escritura,
ejecutado por Jesús:

```sql
update public.app_settings
   set value = jsonb_set(value, '{since}',
         to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))),
       updated_at = now()
 where key = 'push_retry';
```

- **C-20** (booleano; `<hora del deploy>` es la anotada en el paso 4, en UTC ISO): `select (value ->> 'since') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' as forma_iso, isfinite((value ->> 'since')::timestamptz) as finito, (value ->> 'since')::timestamptz > '<hora del deploy>'::timestamptz + interval '60 seconds' as posterior_al_drenaje, (value ->> 'leaseSeconds')::int = 900 as lease_900 from public.app_settings where key = 'push_retry';` y `select ok from public.push_retry_settings(true);` → todo `true`. Un `false` o `null`: **para** y se apaga (`value - 'since'`).
- Pasados 3 minutos, **C-21** (tres lecturas; no se ejecuta `retry_push_dispatch()` a mano: escribe):
  1. El cron corre: `select status, return_message, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'retry-push-dispatch') order by start_time desc limit 5;` → corridas `succeeded`. **`succeeded` no prueba que se despache nada**: la función retorna 0 sin error si algo falta.
  2. El outbox después del corte (la de `deploy.md` §2.2.1, acotada): `select count(*) filter (where e.push_done_at is not null) as con_final, count(*) filter (where e.push_done_at is null and e.push_dead_at is null) as sin_final, count(*) filter (where e.push_dead_at is not null) as perdidos from public.domain_events e where e.occurred_at >= (select (value ->> 'since')::timestamptz from public.app_settings where key = 'push_retry') and e.event_type = any (public.push_event_types());`
  3. Lectura: `con_final` ≥ 1, `perdidos` = 0 y `sin_final` solo con eventos de menos de 3 minutos. **Si no hay ningún evento después del corte, no hay evidencia: no se lee como éxito**; se espera a un pedido real (con Jesús) y se repite.
- Apagarlo es una línea (`deploy.md` §2.2.1, «Cómo apagarlo»).

### Paso 5-bis · Devolver el plazo del reclamo a 180 s (≥ 16 minutos después de `since`)

Los eventos procesados por las instancias viejas durante el minuto de drenaje no tienen `push_done_at` y son anteriores
a `since`: el cron los ignora, pero con `leaseSeconds` en 180 serían re-reclamables por UUID mientras tengan menos de 15
minutos. Por eso el plazo vuelve a 180 **solo cuando todos tengan más de 15 minutos** (las dos condiciones). Con 900,
un `send-push` que cae después de reclamar no se reintenta en ese lapso (el cron lo dará por perdido y avisará a los
admins al pasar el plazo): aceptado. Primero `select now() > (value ->> 'since')::timestamptz + interval '16 minutes' as ya_se_puede from public.app_settings where key = 'push_retry';` → `true`; luego, SQL de escritura:

```sql
update public.app_settings
   set value = jsonb_set(value, '{leaseSeconds}', '180'::jsonb), updated_at = now()
 where key = 'push_retry';
```

Comprobación: `select lease = interval '180 seconds' as lease_180 from public.push_retry_settings(true);` → `true`.

### Paso 6 · Auth: activar el hook `before_user_created` (primero)

**Solo si la decisión D-A (precondición 5) lo permite** (la web del cliente de `main` ya no sirve: retirada o en mantenimiento)
**y** después de decidir sobre las cuentas de C-09. La función ya existe por el push (C-18). En el panel:
**Authentication > Hooks > Before User Created > Postgres > esquema `auth_hooks`, función `before_user_created` > activar.**
Al revés (hook antes del push), GoTrue no encuentra la función y falla **toda** alta, también la de Google. El hook va
**antes** de abrir Google: mientras el proveedor Google no estaba habilitado o la confirmación de correo sigue apagada,
el alta pública por correo es el vector de preapropiación que motivó la 0279; abrir Google primero lo deja abierto
durante todo el intervalo.

- Comprobación (`deploy.md` §2.1, paso 3): un `signUp` por correo con la clave anónima responde **403** «Las cuentas nuevas de Tindivo se crean con Google.»; crear un negocio o un motorizado desde Admin sigue funcionando (`auth.admin.createUser` no pasa por el hook). **Si el `signUp` por correo no responde 403, no se sigue** al paso 7.
- **Si Google ya estaba activo en producción** (lo capturó la precondición 1), entre el push y este paso el alta por correo estuvo abierta: se vuelve a correr C-09 y se compara con la de antes para ver si nacieron cuentas en el intervalo.
- `supabase/config.toml` lo activa solo en local; el panel de producción **no lo lee**.
- **Riesgo de apagar el hook** (§3.2): vuelve a abrir el alta por correo con confirmación automática. El hook solo evalúa el evento que recibe (M0279:60): **no corrige ni desvincula** identidades creadas antes ni mientras estuvo apagado. Cada hora con el hook apagado es una ventana de preapropiación; apagarlo es decisión de Jesús, con C-09 antes y después.

### Paso 7 · Auth: proveedor Google de producción

Panel de `tindivo-prod` (`deploy.md` §2.1): **Authentication > Sign In / Providers > Google: ON** con el ID de cliente
web **de producción** (distinto del de staging: cada cliente web de Google lleva solo el callback de su entorno,
`Docs/operacion/publicar-apps-nativas.md`) y su callback `https://zpnipajgwfthxhdtzhly.supabase.co/auth/v1/callback`; «Confirm email» apagado. Se
captura la pantalla antes y después. **Comprobación:** entrar con Google desde la app de prueba cerrada o una cuenta
propia de Jesús; no se crean cuentas de prueba masivas en producción. Después, C-09 de nuevo: el número «por correo» no debe haber crecido.

### Paso 8 · Desplegar la API (y lo demás del commit)

Después de los pasos 3 a 5-bis (`deploy.md` §0.1: la base **antes** que las apps) y **solo con los conteos del paso 3-ter
aceptados**. Qué commit se despliega y qué se hace con la web lo decide D-A (alternativa a: solo API y demás; alternativa
b: API **y** web del cliente del commit firmado, la web sale del mantenimiento al terminar).

1. **Variables** (Vercel `tindivo-api`, Production; **[tú]**): las de `deploy.md` §1 más, si se mandan SMS reales,
   `OTP_PHONE_HMAC_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (la puerta del build falla sin ellas) y
   `OPS_ALERT_SECRET`. El **Build Command** debe estar sin sobrescribir. La key del log de la API sigue pendiente (M11 del informe).
2. `pnpm check:deploy` con el remoto enlazado: tiene que salir en **verde** antes de desplegar. Si no puede consultar, falla (a propósito).
3. Despliegue de la API. Humo: `GET https://apiv2.tindivo.com/api/v1/health` → 200; `GET .../api/v1/config` → 200; **una llamada real
   por HTTP** a cada ruta cuya función se redefinió (una sola por RPC no basta: PGRST203, `supabase/AGENTS.md`): cotización,
   `GET /public/orders/{shortId}` de un pedido ya entregado (`driverPhone` = `null`) y `GET /public/courier/status` (`maxWeightKg`).
4. **Inngest** (`deploy.md` §5): se vuelve a sincronizar `https://apiv2.tindivo.com/api/inngest` y debe aparecer
   `apply-data-retention-cron` (04:45 de Lima, `retencion-de-datos.md`; `apps/api/lib/inngest/functions.ts:350`). **Esta
   es la parte que borra y anonimiza datos viejos.** Se comprueba en el **panel** que aparece. Con los conteos del paso
   3-ter aceptados, se deja viva; si no, **se pausa ahí antes de las 04:45** y no se reanuda hasta aceptarlos.
5. Secretos de apps: `NEXT_PUBLIC_SUPPORT_WHATSAPP` y `app_settings.support_whatsapp` con el número real (M7 del informe):
   `select value from public.app_settings where key = 'support_whatsapp';` (comprueba que existe y qué número hay; no que sea el correcto: eso lo confirma Jesús mirando el número).

### Paso 9 · Humo de operación y vigilancia

- Un pedido real del flujo normal (con Jesús), de cliente a entregado, con push en cada paso; **no** se inventan pedidos en producción.
- Esa misma noche (18:00-23:00): Jesús y un acompañante miran los avisos y el panel de la cajera; después, el cron
  `retry-push-dispatch` (C-21), `PushDeliveryFailed` en los admins (no debe llegar), y **a las 04:45 del día siguiente**
  la corrida de `apply-data-retention-cron` en `Completed` con `failed = 0`.
- **Dos días de vigilancia**: pedidos nuevos por `client_platform` (`select client_platform, count(*) from public.orders where created_at >= now() - interval '1 day' group by 1;`; `client_platform` admite `NULL`: no clasifica todas las plataformas), errores 4xx/5xx de la API y avisos que no llegan.

## 3. Cuándo abortar y cómo se revierte

**La verdad sobre la reversión.** Un rollback de **esquema** no recupera **datos**. Lo único que devuelve un dato
borrado o cambiado es la **copia P0.5**, y esa copia **no se restaura sobre `tindivo-prod` desde su runbook** (otra
operación, con su plan firmado; la restauración está descrita, no ensayada: P0.6). Por eso la copia va antes, y por eso
lo irreversible va en §3.3.

### 3.1 Cuándo se aborta (se para y no se sigue)

- C-01 no da `0271`, o el `--dry-run` lista algo distinto de las 21.
- C-02 no da 0, o Jesús no acepta el número de C-03 o de C-04, o algún conteo de C-31 a C-37 no es 0 y Jesús no lo acepta por escrito.
- El push termina en error o se corta: §3.2-bis (la migración que falló puede haber dejado efectos).
- Cualquier comprobación de §2 no da lo esperado (booleano en `false`, `null` o cero filas).
- La API de producción responde 5xx por una RPC con PGRST203/404 tras desplegar, o un pedido real no se puede crear.
- Aparecen pedidos o avisos perdidos en la noche de operación.
- Pasan las 18:00 de Lima con algo a medias: se deja en el último estado **estable** (ver tabla) y se sigue al día siguiente.

### 3.2 Qué se hace en cada punto

| Estado | Qué hay | Cómo se sigue o se vuelve |
|---|---|---|
| El push falló o se cortó en la migración N | 0272..N-1 aplicadas; N **sin registrar** pero con efectos posibles (según la atomicidad medida en el ensayo) | **No** se reintenta a ciegas ni se «arregla» con una migración nueva: ver §3.2-bis |
| El push terminó, algo falla después | 0295 aplicada | Casi todo es **aditivo**: se deja la base como está, se apaga lo nuevo (hook, `since`) y se arregla hacia adelante. Volver atrás es la excepción, y se hace con el rollback de la fila (abajo) |
| `send-push` nuevo falla | Función nueva viva | **No se borra `push_claim_since`**: la función de `main` ya llama a `claim_push_event` (`origin/main:supabase/functions/send-push/index.ts:1390`) y, sin corte, la 0272 (líneas 256-261) responde 409 a todo: se cortarían **todos** los avisos. Se hace, en este orden: (1) **en un solo `update`**, quitar `since` **y** fijar `leaseSeconds` = 900: `update public.app_settings set value = jsonb_set(value - 'since', '{leaseSeconds}', '900'::jsonb), updated_at = now() where key = 'push_retry';` (la función de `main` no marca el final: con 180 s los avisos que envíe se re-reclamarían), (2) redesplegar la función de `main` (desde un worktree de `origin/main`), (3) **conservar el corte**. **Mientras `main` siga viva no se quita `leaseSeconds`.** Para volver a la nueva: paso 4 → paso 5 → paso 5-bis. Los eventos que ya terminó la nueva tienen `push_done_at` y no se reabren; **residuo**: los segundos entre el fallo y el `update`. Además, `main` trata todo `OrderExpired` como falta de pago (matriz de la precondición 5). El rollback de `deploy.md` §2.2 (borrar el corte) sirve solo para volver a antes de la 0264 |
| El reintento duplica avisos | `push_retry.since` puesto | `update public.app_settings set value = value - 'since', updated_at = now() where key = 'push_retry';` (apaga el cron sin tocar nada más). **No** devuelve `leaseSeconds` a 180 mientras haya eventos de menos de 15 minutos sin `push_done_at` |
| El alta de cuentas falla o un cliente legítimo no entra | Hook activo | **Apagar el hook en el panel** (Authentication > Hooks), con el riesgo del paso 6 (vuelve el alta por correo). La función puede quedarse. **Antes** de ejecutar `rollbacks/0279_*` hay que apagar el hook: si no, GoTrue falla TODA alta |
| La web del cliente de `main` falla por la 0276 | Permisos revocados | **No hay un rollback de la 0276 en el repo.** La salida es hacia adelante: desplegar la web/API del commit firmado (alternativa b de D-A), o decidir (Jesús) una migración nueva que devuelva los permisos, con revisión de seguridad. Por eso D-A se decide **antes** |
| La purga de retención borra algo que no debía | Corrida de las 04:45 | **Pausar** `apply-data-retention-cron` en el panel de Inngest **de inmediato**, **cancelar** sus corridas en curso y sus reintentos pendientes (los nombres exactos de los controles del panel: sin verificar) y **comprobar en el panel que no queda ninguna corrida activa ni en cola**. Lo que una transacción ya cerró no se deshace, y una fila en vuelo termina. **Lápidas pendientes:** quedan con `deleted_at is null` y su borrado de Storage se retoma al reanudar (`drainTombstones` en `apply-retention-policy.ts` las reintenta y no mira `data_retention`; `retention_pending_tombstones`, M0284:501-520). **No** se pone `data_retention` inválido: no detiene el borrado desde lápidas, y una ventana antifraude inválida hace que `retention_window_start` devuelva `-infinity` y vuelvan a contarse antecedentes sin límite (M0286:36-44). Cualquier cambio de plazos es decisión de Jesús, con su efecto antifraude por escrito. Lo ya borrado solo vuelve de la copia |

### 3.2-bis Un push a medias: cómo se inspecciona y cómo se sale

El CLI aplica en orden y se detiene en el primer error. Lo que queda de la migración N que falló depende de si el CLI la
ejecutó en una transacción: **lo dijo el ensayo local** de la precondición 7 (no se asume). Con consultas de **solo
lectura**, Jesús ve el estado de N:

- Registrada o no: `select version from supabase_migrations.schema_migrations order by version desc limit 3;`.
- Objetos que N crea: por cada tabla, `select to_regclass('public.<tabla>');`; por cada función, `select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = '<nombre>';`; por columna, `information_schema.columns`; por índice y restricción, `pg_indexes` y `pg_constraint`. La lista sale de leer el archivo N.
- Filas tocadas por N: **0277** deja desverificados a los duplicados **antes** de crear el índice único y el CHECK. Si N = 0277: `select count(*) from public.phone_assignments where end_reason = 'duplicate_cleared';` (cuántos perfiles se desverificaron), `select exists (select 1 from pg_indexes where indexname = 'customer_profiles_verified_phone_unique') as indice, exists (select 1 from pg_constraint where conname = 'customer_profiles_phone_e164') as check_e164;` (si hay desverificados y falta alguno de los dos, quedó a medias). **0284**: C-04 debe dar 0 si ya vació los comentarios. **0293**: `phone_transfer_enabled` en `false` (C-16).
- **Una migración nueva no arregla N**: el siguiente `db push` vuelve a empezar por N. La salida es **corregir la causa** (el dato, el bloqueo o el permiso que la hizo fallar) y **reintentar N**: las migraciones son idempotentes (invariante 6; la 0277 usa `on conflict do nothing` e `if not exists`, así que repetirla tras haber desverificado a los duplicados no los desverifica de nuevo). Si N **debe cambiar**, es decisión de Jesús y la guía y la migración se vuelven a firmar; nadie edita a escondidas una migración aplicada en parte.

### 3.3 Qué NO tiene vuelta (se dice antes, se acepta antes)

- **0277**: los perfiles con el mismo teléfono verificado quedan desverificados (C-03). Las asignaciones quedan en
  `phone_assignments` (`duplicate_cleared`), pero el campo `phone_verified_at` solo vuelve de la copia. **Efecto en la
  contraentrega** (`customer_contraentrega_decision`, M0286:109-150): un perfil desverificado no tiene teléfono
  verificado, así que mientras tenga un pedido entregado en **su** cuenta sigue en `trusted` (regla 1); si no lo tiene,
  queda en `no_history`. Al **volver a verificar**, el número tiene asignaciones ajenas cerradas dentro de la ventana de
  24 meses: entonces solo es `trusted` si ya hay una entrega de su propio perfil con ese teléfono **posterior al inicio de
  su asignación actual**; si no, `no_history` (pago adelantado o validación por GPS). No es «24 meses fijos para todos»:
  depende de cada perfil.
- **0284**: los comentarios de reseñas de cuentas ya borradas se vacían (C-04).
- **0293**: `phone_transfer_enabled` pasa a `false` aunque estuviera encendido (C-03d).
- **La purga y la anonimización de la API** (0284, 0285, 0286): una vez desplegada la API con `apply-data-retention-cron`,
  lo vencido se anonimiza o se borra por lotes cada día, incluida la lista de Storage por lápida. Sin copia, no vuelve. Por
  eso los conteos del paso 3-ter son una puerta.
- **Un cliente que se registró con el hook apagado** o que se desverificó no se repara solo (C-09).

### 3.4 Rollbacks que existen en el repo (`supabase/rollbacks/`)

`0272`, `0279`, `0280`, `0281`, `0290`, `0292`, `0295`. **No hay** de `0273`, `0274`, `0275`, `0276`, `0277`, `0278`,
`0282`, `0283`, `0284`, `0285`, `0286`, `0287`, `0291` ni `0293`: esas se corrigen con una migración nueva. Ningún
rollback se ejecuta sin que Jesús lo mande y sin la comprobación de solo lectura que cada uno trae. Las funciones
redefinidas son copias literales de la versión anterior más un cambio puntual (lo dice cada migración), así que el
código de la API de `main` las sigue llamando con la misma firma: lo que **sí** cambia el comportamiento visible para
el código viejo son la 0276 (permisos), la 0279 (hook), la 0283 (recojo solo prepagado) y la 0293 (traslado apagado).

**El rollback completo de la 0272 no se recomienda** con la base ya en la 0277: restaura `dispatch_event` de la 0264 con la lista de tipos escrita a mano
(`supabase/rollbacks/0272_*.rollback.sql:71-87`), que **no** incluye `CustomerPhoneMoved` (lo añade `push_event_types` en
M0277, ~línea 520) ni `PushDeliveryFailed`: esos eventos dejarían de viajar. Para volver al reclamo definitivo hay que
decidirlo con Jesús y, si procede, una migración nueva que lo haga sin perder esos tipos. La reversión del push es la del
§3.2 (quitar `since`, `leaseSeconds` = 900, función de `main`, conservar el corte).

Lo que el código de `main` **nota** con la base en la 0295 (leído en `origin/main`, sin probar):

- **0292**: el WhatsApp del motorizado desaparece del seguimiento (`tracking-driver.tsx:34`).
- **0275**: se rechazan pedidos con opciones obligatorias faltantes o repetidas.
- **0287**: aparece un `OrderExpired` nuevo en el outbox al cancelar por vencimiento, y `send-push` de `main` lo anuncia siempre como falta de pago (matriz de la precondición 5).
- **0277**: nace `phone_restrictions`; `phone/verify/route.ts:91` de `main` sella el número **sin crear `phone_assignments`**.
- **Cuenta nueva desde la web de `main`**: el insert de `persistence.ts:155` queda revocado por la 0276, no se crea el perfil, `verify` actualiza 0 filas y responde `verified:true`, y ese cliente **no puede pedir**.

**Conclusión (la misma que la precondición 5):** la base NO puede pasar con la web del cliente de `main` sirviendo.
Cualquiera de las dos alternativas lo evita: **(a)** retirar esa web antes del push (y vivir con la API de `main` hasta
el paso 8), o **(b)** base primero y, en la misma ventana, API **y** web del commit firmado, con la web en mantenimiento
entre el push y su despliegue. **Nunca la API antes que la base.** La decisión es de Jesús y Fable (J3), antes de fijar la fecha.

## 4. Lo que esta guía no resuelve (a la vista de todos)

- **La prueba de convivencia de A3** (el código de `main` contra las 21 migraciones, en local con `pnpm db:cycle` o su equivalente) **no está hecha**. La matriz de la precondición 5 dice dónde se ve el choque; el resto de rutas de `main` no se ha probado.
- Los **ensayos locales** de las precondiciones 6 y 7 (reclamo del push; atomicidad del CLI, bloqueos y recuperación) **no están hechos**.
- La **fecha** (J3) y **D-A** son de Jesús.
- **`deploy.md` §2.2.1** (paso 3) sigue diciendo «hora del deploy» para `since`; esta guía manda en la ventana y `deploy.md` está **pendiente de corregir**.
- La **0296** (pago único, #262) y cualquier migración posterior **no** están en esta guía.
- Ni la ventana ni la restauración se han ensayado contra una copia de producción (P0.6 está abierto).
- Las consultas C-xx son de lectura y están leídas contra las migraciones, no corridas contra un prod real. Las de `auth.*` (C-09) y los controles del panel de Inngest, Vercel y Supabase están **sin verificar**.
- El diseño de push es «al menos una vez»: corregir esta ventana no lo convierte en «exactamente una vez».
