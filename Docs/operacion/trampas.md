# Trampas conocidas

> Verificado: según la fecha de cada trampa · fuente: notas de sesiones de Claude (ago–oct 2026), consolidadas el 2026-10-10. Lo que no se ha vuelto a medir desde entonces lleva su fecha original.

## Índice por síntoma

| Síntoma que ves | Trampa |
|---|---|
| `curl 127.0.0.1:54321` da 000 con los contenedores `Up (healthy)`; `supabase start` falla con `bind: An attempt was made to access a socket in a way forbidden by its access permissions` | [Windows reserva los puertos de Supabase](#windows-reserva-los-puertos-de-supabase) |
| `docker` falla con `npipe:////./pipe/dockerDesktopLinuxEngine … cannot find the file specified` | [Docker Desktop no está en Program Files](#docker-desktop-no-está-en-program-files) |
| «Mi arreglo no hace efecto» y `curl` responde 200; el servidor nuevo murió con `EADDRINUSE` | [pkill no mata Next en Windows](#pkill-no-mata-next-en-windows) |
| Un test busca `ah√≠` en vez de `ahí` | [Un heredoc de Bash corrompe los acentos](#un-heredoc-de-bash-corrompe-los-acentos) |
| Negocios, usuarios o ciclos de caja sobrantes en la base local tras correr suites | [Las suites de integración dejan basura en la base local](#las-suites-de-integración-dejan-basura-en-la-base-local) |
| `cash-summary-scope.integration.test.ts` falla con `expected 204 to be 104` | [Los seeders de demo envenenan los tests de caja](#los-seeders-de-demo-envenenan-los-tests-de-caja) |
| Un pedido creado a mano en la base local desaparece a mitad de sesión | [Los pedidos demo desaparecen solos](#los-pedidos-demo-desaparecen-solos) |
| Dos tarjetas que deberían ir a distinto ritmo enseñan el mismo `mm:ss` | [Los relojes de orders no se siembran en el INSERT](#los-relojes-de-orders-no-se-siembran-en-el-insert) |
| Un test que asume «cliente sin historial» pasa por el motivo equivocado; el viaje falla con `→ estado: preparing` donde esperaba `awaiting_payment` | [Los fixtures e2e acumulan historial permanente](#los-fixtures-e2e-acumulan-historial-permanente) |
| `403 forbidden · "El restaurante está pausado temporalmente"` en `happy-path-order`, `vecino-conocido-contraentrega` y `viaje-pedido-online` | [accepting_orders_until es pausado hasta](#accepting_orders_until-es-pausado-hasta) |
| `element is not enabled` sobre el nombre de un plato; banner «Todavía no ha confirmado que atiende hoy» | [La jornada del mundo e2e caduca a las 5](#la-jornada-del-mundo-e2e-caduca-a-las-5) |
| 404 en todas las rutas con `next dev` «Ready»; `type-check` rojo en `.next/dev/types/routes.d.ts`; overlay con `Next.js 16.2.6 (stale)`; una regla nueva de `globals.css` no aplica | [Next da 404 en todas las rutas](#next-da-404-en-todas-las-rutas) |
| Una app devuelve 404 minutos después de un `pnpm build` con `pnpm dev` levantado | [pnpm build envenena el dev server vivo](#pnpm-build-envenena-el-dev-server-vivo) |
| Todos los e2e de un spec caen a la vez: `element is not stable`, «Negocio no encontrado o no disponible», HTML de error 500 en la API | [Un dev server viejo finge bugs de código](#un-dev-server-viejo-finge-bugs-de-código) |
| En local la tarjeta del motorizado cambia al soltar el gesto pero `orders.status` no | [Los gestos del motorizado sin la API caen a la cola offline](#los-gestos-del-motorizado-sin-la-api-caen-a-la-cola-offline) |
| Un e2e falla y al repetirlo pasa; «No se pudo cargar» en la ficha del negocio; `element was detached from the DOM, retrying` | [Los rojos intermitentes de e2e son Next compilando](#los-rojos-intermitentes-de-e2e-son-next-compilando) |
| `happy-path-order` rojo con `Expected: "pending_acceptance" / Received: "validando"` | [seed-e2e-clean rompe happy-path-order](#seed-e2e-clean-rompe-happy-path-order) |
| `tablero`, `deuda` e `historial` en rojo en la suite visual completa | [La suite visual depende de la DB](#la-suite-visual-depende-de-la-db) |
| La UI de permisos de push no aparece en Playwright; «pestaña en segundo plano» imposible de provocar | [Chromium headless miente sobre visibilidad y permisos](#chromium-headless-miente-sobre-visibilidad-y-permisos) |
| En Chrome de automatización el DOM se queda en el esqueleto de `loading.tsx` y `Page.captureScreenshot` expira | [La pestaña oculta de Chrome no hidrata](#la-pestaña-oculta-de-chrome-no-hidrata) |
| `isVisible()` devuelve `false` sobre algo de la bolsa que se ve en pantalla | [La bolsa se renderiza dos veces](#la-bolsa-se-renderiza-dos-veces) |
| `pnpm test` verde en ~200 ms con `Cached: 9 cached, 9 total` y `>>> FULL TURBO` | [Turbo cachea los tests de integración](#turbo-cachea-los-tests-de-integración) |
| El job `db-types-drift` rojo, o `database.types.ts` con +4/−28 líneas sin cambio de esquema | [db-types-drift es de versión del CLI](#db-types-drift-es-de-versión-del-cli) |
| Rutas del v2 dan 404 en `api.tindivo.com` | [El dominio real de la API v2](#el-dominio-real-de-la-api-v2) |
| El PDF de producción pierde la tipografía y los emoji salen como cuadrados | [El Chromium serverless solo trae Open Sans](#el-chromium-serverless-solo-trae-open-sans) |
| En Windows `spawn ... ENOENT` al renderizar el PDF; el dev server del 3001 no responde tras tocar `next.config.ts` | [La rama de producción del PDF no se puede probar en Windows](#la-rama-de-producción-del-pdf-no-se-puede-probar-en-windows) |
| Una pantalla tarda ~500 ms más de lo esperado por llamar a la API | [El salto a la API cuesta medio segundo](#el-salto-a-la-api-cuesta-medio-segundo) |
| `LegacyMigrationApplyError ... INSERT INTO supabase_migrations.schema_migrations(version, name, statements)` | [Colisión de número de migración](#colisión-de-número-de-migración) |
| Un DELETE por PostgREST responde 204 y la fila sigue ahí | [Un DELETE sin policy devuelve 204](#un-delete-sin-policy-devuelve-204) |
| Una lectura del Supabase legacy trae exactamente 1000 filas | [Leer el Supabase legacy](#leer-el-supabase-legacy) |
| Un negocio dice «sonó y no me apareció» | [Diagnosticar pedidos perdidos](#diagnosticar-pedidos-perdidos) |
| `push_delivery_log` dice `ok` y aun así el pedido no sonó | [El push se entregó y aun así no sonó](#el-push-se-entregó-y-aun-así-no-sonó) |
| Textos que sobresalen de botones o tarjetas en un diseño `.dc.html` | [Medir desbordes con Playwright antes de publicar](#medir-desbordes-con-playwright-antes-de-publicar) |
| Un rótulo del mapa se pisa con la chapa de otro punto en producción | [Los rótulos del mapa se pisan con la densidad real](#los-rótulos-del-mapa-se-pisan-con-la-densidad-real) |

## Entorno Windows

### Windows reserva los puertos de Supabase
**Síntoma:** Docker arranca, los contenedores `supabase_*` salen `Up (healthy)`, pero `curl 127.0.0.1:54321` da 000 y `docker port supabase_kong_...` no imprime nada. `supabase start` falla con `bind: An attempt was made to access a socket in a way forbidden by its access permissions` sobre 54322.
**Causa:** (verificada 2026-09-24) tras un reinicio, Windows (Hyper-V/winnat) reserva un rango de puertos: `netsh int ipv4 show excludedportrange protocol=tcp` lista 54215-54414, que cubre 54321-54324.
**Qué hacer:** en una terminal de ADMINISTRADOR, `net stop winnat` y `net start winnat`, luego `supabase start`. No se puede desde una sesión sin elevar, así que hay que pedírselo al usuario. Otra salida es mover los puertos en `supabase/config.toml` y en los `.env.local`, mucho más invasiva. Si además `docker` no resuelve, ver [Docker Desktop no está en Program Files](#docker-desktop-no-está-en-program-files).

### Docker Desktop no está en Program Files
**Síntoma:** con el demonio parado (típicamente tras un apagón o un reinicio), `docker` falla con `npipe:////./pipe/dockerDesktopLinuxEngine … cannot find the file specified`, que parece un problema de instalación. La primera señal suele ser una tanda de errores de `docker` o de tests de integración que apuntan a la base, no a Docker.
**Causa:** Docker Desktop está instalado en `C:\Users\Jesus\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe` (`%LOCALAPPDATA%\Programs\DockerDesktop`), **no** en `C:\Program Files\Docker`, y no está arrancado.
**Qué hacer:** antes de culpar a la base local o a un test, comprueba el demonio. Si está caído, lánzalo con `Start-Process` desde esa ruta: los contenedores de Supabase (`supabase_db_zpnipajgwfthxhdtzhly`) vuelven solos y `supabase status` responde sin hacer `supabase start`; tarda menos de un minuto. NO hace falta `supabase db reset`, con lo que se evita [el veneno de los seeders de demo](#los-seeders-de-demo-envenenan-los-tests-de-caja) y el reseed e2e. El otro falso culpable de la misma familia es [Los rojos intermitentes de e2e son Next compilando](#los-rojos-intermitentes-de-e2e-son-next-compilando).

### pkill no mata Next en Windows
**Síntoma:** "mi arreglo no hace efecto". `curl` responde 200, la app carga, todo parece bien, pero se está midiendo **el build anterior al cambio**. En el log del servidor nuevo (lanzado en segundo plano con `nohup ... &`) aparece `EADDRINUSE`.
**Causa:** reiniciar un servidor de Next con `pkill -f "next start"` desde el Bash de Windows **no mata nada**. El proceso viejo sigue escuchando, el nuevo choca con `EADDRINUSE` y muere en silencio (su error se queda en el log). Medido el 2026-08-31: se persiguió service worker, cachés del navegador, duplicación de chunks y un `console.warn` que no aparecía antes de mirar el log y encontrar `EADDRINUSE` en dos reinicios seguidos; el código estaba bien. Dos hallazgos más:
- El `webServer` de Playwright (`playwright.config.ts` levanta las cuatro apps 3000, 3001, 3002, 3004 con `reuseExistingServer: true`) no siempre cierra las que arrancó. El 2026-09-05 quedó un Next de `negocios` escuchando en 3002 tras un `playwright test` que solo necesitaba la sesión de negocios; ese huérfano produce el `EADDRINUSE` silencioso.
- `dev` y `start` se comportan distinto al perder al supervisor. El 2026-09-09 (11,3 GB de RAM, 6 % libre, cinco Next + WSL + IDE) el harness mató la tarea de fondo, murió el proceso `turbo`/`pnpm` y los 14 hijos siguieron vivos y escuchando: los cinco puertos respondían 200 y la app servía el código actual. En `dev` el proceso superviviente recompila al vuelo; el peligro de "mides el build anterior" es de `next start`, que sirve un build congelado. Lo que se pierde es el padre: ya no hay un `taskkill /T` único que los tumbe, hay que ir por puerto. El 2026-09-06 pasó lo mismo con un `pnpm dev` matado por falta de memoria: los dos `dev` nuevos murieron con `EADDRINUSE` en su log y durante media hora se midió un build sin los cambios.
**Qué hacer:** matar por puerto con PowerShell, no por nombre de proceso:
```powershell
Get-NetTCPConnection -LocalPort 3004 -State Listen |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```
y comprobar que el puerto quedó libre antes de relanzar. Alternativa: `netstat -ano | grep -E ":3000|:3001" | grep LISTEN` da el PID real, y `taskkill //F //PID <pid> //T` (dobles barras desde Git Bash) lo termina (comprobado el 2026-09-06).
- Después de cada arranque en segundo plano, `grep -i eaddrinuse` sobre su log **antes** de medir nada (o `grep -c EADDRINUSE`). Si un cambio "no hace efecto" en una app servida, ese grep va primero, por delante de cualquier teoría sobre cachés.
- Para confirmar que corre lo tuyo, mete un `console.warn` con un string literal distintivo (sobrevive a la minificación, que sí mangla los nombres de funciones locales) y compruébalo con `grep -rl` sobre `.next/static/chunks/`.
- Tras cualquier corrida de Playwright, comprobar los cinco puertos antes de dar el árbol por limpio.
- Antes de matar y relanzar por un aviso de tarea muerta, `curl` a los puertos: si responden, el trabajo ya está hecho; relanzar a ciegas rompe (los huérfanos aún tienen el puerto).
Es el mismo cuadro de "el problema está en el servidor, no en tu código" que [Next da 404 en todas las rutas](#next-da-404-en-todas-las-rutas).

### Un heredoc de Bash corrompe los acentos
**Síntoma:** un e2e busca `/Pagas en la caja y preparan tu pedido ah√≠ mismo/` y no encuentra nada; el texto corrupto (`ahí` sale como `ah√≠`) acaba dentro del código o del test, y el fallo se disfraza de aserción rota.
**Causa:** pasar un script de Python por un heredoc de Bash (`cat > x.py <<'PY'`) en esta máquina corrompe los caracteres no ASCII. El script se ejecuta sin error. Como el repo es íntegramente en español (copy, comentarios, mensajes de test), casi cualquier reemplazo de texto lleva acentos.
**Qué hacer:** para scripts de parcheo con texto en español, escribe el `.py` con la herramienta Write (al scratchpad) y ejecútalo con `python ruta.py`; no lo pases por heredoc. Si ya ocurrió, corrige el string con Edit, no con otro heredoc. Cuidado con `/tmp`: Git Bash y el Python de Windows **no** resuelven la misma ruta; usa el scratchpad absoluto para los ficheros que compartan. La misma regla vale para los mensajes de commit: escríbelos a un fichero UTF-8 y usa `git commit -F`.

## Base local y tests de integración

### Las suites de integración dejan basura en la base local
**Síntoma:** la DB local acumula negocios, usuarios, pedidos, eventos y ciclos de caja de fixtures. Medido el 2026-08-11: 71 negocios, 110 usuarios, 159 pedidos, 11 ciclos vacíos. Medido el 2026-08-19: 27 pedidos manuales, 116 usuarios muertos, 1 evento. Un ciclo vacío la pantalla lo pinta como «Por confirmar ahora».
**Causa:** las suites de integración de `apps/api` ensucian la DB por **seis** vías, cada una por un hueco distinto del modelo:
1. `afterAll` no corre si matas el proceso (Ctrl-C, crash, watch cerrado).
2. `seed-e2e-clean` filtraba solo por `orders.customer_user_id`, y los pedidos MANUALES lo tienen NULL por definición (los teclea la cajera, no hay cuenta).
3. `public.users` **no tiene FK a `auth.users`**: borrar el de auth deja el espejo vivo, y con él su `user_roles`.
4. `domain_events` apunta al agregado por `aggregate_id` **sin FK**: cualquier borrado que no lo contemple lo deja vivo, y nace con `published_at NULL`, o sea que el outbox lo sigue viendo pendiente.
5. Los ciclos de caja quedan vacíos al llevarse sus pedidos.
6. `delivered` es terminal y nadie lo limpia; ver [Los fixtures e2e acumulan historial permanente](#los-fixtures-e2e-acumulan-historial-permanente), la vía más traicionera porque hace pasar tests por el motivo equivocado.
**Qué hacer:** el barrido vive en `apps/api/vitest.global-setup.ts` y corre al arrancar Y al terminar (el setup es el que importa: el teardown tampoco corre si matan el proceso). **Si añades un fixture nuevo, da de alta su marcador ahí**; es el paso que se olvida siempre:
- negocios por nombre exacto (`NEGOCIOS_FIXTURE`)
- usuarios por `full_name` (`USUARIOS_FIXTURE`)
- pedidos y ciclos de los negocios COMPARTIDOS, por `TELEFONOS_FIXTURE`
- `seed-e2e-clean` va por DOS marcadores: `customer_user_id` **y** `business_id`

Orden de borrado: `restaurant_payments` / `business_charges` / `cash_settlements` / `orders` **antes** que `businesses` (FK NO ACTION); `domain_events` a mano; y los usuarios en `public.users` **y** `auth.users`. Para diagnosticar: `db.from(...).select()` con una columna que no existe **falla en silencio** si no miras `error` (devuelve `undefined` y parece que no hay filas); comprueba siempre `error` antes de concluir que algo está limpio.

### Los seeders de demo envenenan los tests de caja
**Síntoma:** tras correr un seeder de demo y luego `pnpm test`, `cash-summary-scope.integration.test.ts` falla con aserciones de importe (medido el 2026-08-12: `expected 204 to be 104`). Aislado, el fichero pasa en verde; el error habla de la caja, no del seeder.
**Causa:** los seeders de demo (`seed-cashier-board.ts`, `seed-demo-board.ts`, `seed-two-orders.ts`) siembran en el MISMO `E2E.BUSINESS_ID` contra el que corren los tests de integración de `apps/api`. La limpieza de ese test (`parkPending()`) está acotada a `.in('customer_phone', TELEFONOS_FIXTURE)` a propósito, porque sin el filtro sacaba pedidos de `delivered` y rompía el invariante 8 de `CLAUDE.md` (la firma de ese defecto es `cancel_reason` vacío). Todo lo sembrado por un script de demo cae fuera del filtro, se suma al efectivo sin rendir del par motorizado-negocio y descuadra el total.
**Qué hacer:** antes de dar por buena una falla de caja, comprueba si hay pedidos de demo vivos en el negocio e2e; si los hay, `pnpm db:seed:e2e` y relanza. No es lo mismo que [las suites que dejan basura](#las-suites-de-integración-dejan-basura-en-la-base-local): allí la dejan los tests, aquí la deja quien siembra para mirar la UI.

### Los pedidos demo desaparecen solos
**Síntoma:** un pedido clonado en la base local para ver una pantalla (por ejemplo uno en `awaiting_payment`) desaparece entre un comando y el siguiente, sin rastro en `cancelled_at` ni `cancel_reason`, y el mundo e2e sigue entero.
**Causa:** (medido 2026-08-27) no es un cron ni un `db reset`: es `apps/api/scripts/seed-e2e-clean.ts`, que borra los transaccionales **por el marcador del cliente de prueba**. Cualquier clon de un pedido del cliente e2e cae con él, y basta con que otra sesión (otro agente en el mismo árbol) corra el e2e.
**Qué hacer:** crea el pedido demo, míralo y **bórralo tú** al terminar. Dejarlo vivo rompe otras suites: un cliente con pedido activo choca con el guard de la 0105 y otros tests no pueden volver a pedir a ese negocio. Si desaparece a media sesión, recréalo y sigue; no investigues la base. Relacionado: [fixtures e2e](#los-fixtures-e2e-acumulan-historial-permanente), [seeders de demo](#los-seeders-de-demo-envenenan-los-tests-de-caja).

### Los relojes de orders no se siembran en el INSERT
**Síntoma:** al sembrar pedidos de prueba con `pending_acceptance_at` en el pasado, el valor se pierde y todos los pedidos del mismo lote salen con el mismo reloj a cero, sea cual sea el `ago(n)`. Dos tarjetas que deberían ir a distinto ritmo enseñan el MISMO `mm:ss`, y parece un fallo del contador de la UI.
**Causa:** (medido 2026-08-22) el trigger de sellos de estado de `orders` asigna `new.pending_acceptance_at := now()` **sin `COALESCE`** (era con COALESCE hasta la 0103, que lo quitó a propósito para que el contador se reiniciara al reencolar; la 0158 lo mantiene). Lo mismo vale para `awaiting_payment_at` y `validating_at`.
**Qué hacer:** INSERT primero y `UPDATE orders SET pending_acceptance_at = <pasado> WHERE short_id = ...` después; el UPDATE sí se conserva mientras el status no cambie. Deja margen: el cron cancela a los `acceptanceMinutes` de `app_settings.timers`, la única fuente de los plazos desde la 0174. **Léelo de la base que uses antes de calcular** (en `tindivo-prod` vale 8 al 2026-10-10; la nota original decía 5): con el pedido colocado unos 40 segundos antes del plazo tienes tiempo de mirarlo. Esto es necesario para montar los estados de la cajera que dependen del tiempo (el último minuto antes de que el cron cancele, el paso de ámbar a rojo).

### Los fixtures e2e acumulan historial permanente
**Síntoma:** un test que asume «este cliente no tiene historial» pasa por el motivo equivocado (falso verde), y el fallo aparece en la segunda corrida o en la de otra persona. En el viaje (`viaje-pedido-online.spec.ts`): la parada 3 falla con `→ estado: preparing` donde esperaba `awaiting_payment`.
**Causa:** `delivered` es terminal (invariante 8), así que ninguna suite borra los pedidos que llevó hasta la entrega: los helpers de limpieza filtran con `.not('status','in','("delivered","cancelled")')` justo para no tocarlos. Medido el 2026-08-18: `e2e00000-…-000000000003` tenía en la base local un pedido `delivered` dejado por otra suite. `pnpm db:seed:e2e` hace upsert de los fixtures pero no borra pedidos, y `supabase db reset` limpia todo pero pide re-sembrar.
Caso más caro (medido el 2026-09-02): `viaje-pedido-online.spec.ts` se envenena a sí mismo. El viaje camina hasta `delivered`, y UNA sola entrega basta para que `current_customer_trusted_for_contraentrega()` pase a `true` para `cliente@e2e.local`. A partir de ahí el checkout ya no ofrece prepago por defecto y el pedido nace como contraentrega. El test borra su propio pedido al final, pero si una corrida falla a mitad, la entrega se queda. Esto **miente en un bisect**: correr con el cambio (falla), sin él (pasa) y con él otra vez (falla) parece una acusación limpia contra el código, y lo que cambió entre medias fue el historial del cliente.
**Qué hacer:**
- Si un test necesita un cliente en estado LIMPIO (sin entregas, sin strikes, sin perfil tocado), **créalo en el propio test** con `db.auth.admin.createUser` + `customer_profiles`, con teléfono único (`9` + 8 dígitos aleatorios), y bórralo en `afterAll`. No reutilices `E2E.CUSTOMERS`. Patrón ya escrito en `apps/api/lib/__tests__/contraentrega-delivery-history.integration.test.ts`. Reutilizar los fixtures compartidos sigue estando bien para tests que necesitan un cliente CON historial.
- Antes de cada corrida del viaje: `pnpm db:seed:e2e:clean` (purga los transaccionales del cliente de prueba sin tocar el mundo). Ojo con su efecto lateral: ver [seed-e2e-clean rompe happy-path-order](#seed-e2e-clean-rompe-happy-path-order). Si lo corres, corre después la suite completa dos veces antes de leer el resultado: la primera deja a `happy-path-order` en rojo por falta de historial.
- Comprueba el estado real con `select public.current_customer_trusted_for_contraentrega();`, previo `set_config('request.jwt.claims', ...)` con el `sub` del cliente e2e.

### accepting_orders_until es pausado hasta
**Síntoma:** en local aparecen de golpe tres rojos, `happy-path-order`, `vecino-conocido-contraentrega` y `viaje-pedido-online`, con `403 forbidden · "El restaurante está pausado temporalmente"`, con un mensaje que apunta a la API.
**Causa:** (nota del 2026-09-04) `businesses.accepting_orders_until` NO es «acepta pedidos hasta»: es **pausado hasta**. Un valor en el futuro (o `'infinity'`) significa modo ocupado y la API rechaza la creación de pedidos. El estado normal, abierto, es **NULL**, y así lo deja `seed-e2e.ts`, que ni siquiera escribe la columna. Poner `now() + interval '6 hours'` para «abrir» el negocio lo pausa seis horas.
**Qué hacer:** no busques en la API ni en tu cambio de UI. Ejecuta `select accepting_orders_until from businesses` y ponla a NULL. El guard vive en `isBusinessPaused()`, dentro de `apps/api/app/api/v1/customer/orders/route.ts` (función local, no está en `packages/`). Para cerrar de verdad un negocio en local, lo que manda es `business_schedule`; ver [La jornada del mundo e2e caduca a las 5](#la-jornada-del-mundo-e2e-caduca-a-las-5).

### La jornada del mundo e2e caduca a las 5
**Síntoma:** un spec que compra por la UI real del cliente pasa de noche y amanece rojo. Playwright dice `element is not enabled` sobre el nombre del plato y apunta al catálogo; el banner `not_confirmed` («Todavía no ha confirmado que atiende hoy») deshabilita todas las tarjetas. No se parece a una precondición ausente.
**Causa:** (verificada 2026-09-03) `current_service_date()` = `(Lima now − 5 h)::date`, así que la jornada rueda a las **05:00 de Lima**. `pnpm db:seed:e2e` inserta `business_service_days` solo para la fecha de servicio del momento en que corre y nadie repone la fila. La última fila abierta era del `2026-09-02`, `viaje-pedido-online.spec.ts` reventó, y con solo `pnpm db:seed:e2e` volvió a verde.
**Qué hacer:** antes de correr e2e que compren por la UI, `pnpm db:seed:e2e`, no solo tras un `db reset` sino también si el último seed es de ayer. Para confirmar el diagnóstico: `select public.current_service_date();` contra `select * from public.business_service_days order by service_date desc limit 3;` (local: `docker exec supabase_db_zpnipajgwfthxhdtzhly psql -U postgres -d postgres`). Emparenta con [La suite visual depende de la DB](#la-suite-visual-depende-de-la-db) y los [seeders de demo](#los-seeders-de-demo-envenenan-los-tests-de-caja).

## Next y dev servers

### Next da 404 en todas las rutas
**Síntoma:** cuatro variantes de la misma causa:
1. **404 universal.** `next dev` arranca limpio («Ready in 5s»), sirve el layout, y **todas** las rutas devuelven 404, incluida `/` con `app/page.tsx` en su sitio. En el log solo aparece `Compiling /_not-found/page`. No hay middleware ni `basePath`.
2. **`pnpm type-check` rojo en un archivo generado.** Docenas de errores de SINTAXIS (`TS1109: Expression expected`, `TS1160: Unterminated template literal`) en `.next/dev/types/routes.d.ts`. El `exclude: [".next"]` del tsconfig NO lo salva: `next-env.d.ts` hace `import "./.next/dev/types/routes.d.ts"`, y un import se salta el exclude.
3. **Overlay de error a pantalla completa con avisos que no se reproducen.** El 2026-09-01 el overlay de dev tapó la app con «Encountered a script tag while rendering React component» apuntando a `app/layout.tsx`, y se cayeron dos corridas de e2e. La marca que lo delata está en la esquina del overlay: **`Next.js 16.2.6 (stale)`**. En una corrida limpia (48 mensajes de consola, cargas duras, navegaciones blandas, back/forward, con y sin el bypass del piloto) salieron cero.
4. **Una regla nueva de `globals.css` no llega al navegador.** El 2026-09-03, dos reglas añadidas a `apps/customer/app/globals.css` no aplicaban: la clase SÍ estaba en el elemento (comprobado con `getComputedStyle`), el archivo SÍ tenía la regla en disco y otras reglas del mismo archivo (`scrollbar-hide`, `pilot-bypass`) sí estaban en el bundle servido. El CSS compilado era viejo, no equivocado. `ctrl+shift+r` no basta. Una variante (2026-09-06): el spec `mapa-reparto-de-rotulos` llevaba tres viewports en rojo y parecía un fallo del repartidor de etiquetas, pero la regla `.t-lm-badge` (`position:absolute` + `translate(-50%,-50%)`) no estaba en el CSS servido, así que cada disco se pintaba 11 px abajo-derecha de su coordenada. `getComputedStyle` devolvía `position: static; display: inline` cuando la hoja dice `absolute`/`block`; las reglas MÁS RECIENTES del fichero (`.t-lm-badge`, `.overflow-clip-safe`) faltaban mientras las viejas (`.t-lm-dot`, `.pb-safe`) estaban. Con `.next` borrado, 17/17 en verde.
**Causa:** el caché de Turbopack en `apps/<app>/.next` se corrompe cuando dos procesos escriben en el mismo árbol (por ejemplo otro agente en el mismo working tree; ver también [pnpm build envenena el dev server vivo](#pnpm-build-envenena-el-dev-server-vivo)). Los síntomas mandan a buscar donde no está: el 404 parece enrutado o configuración (`next.config.ts`, `middleware.ts`, estructura de `app/`), el rojo de tipos entierra errores reales bajo ruido de un `.d.ts` ajeno, y en el del CSS se duda de la especificidad del selector cuando la regla ni siquiera está servida.
**Qué hacer:**
- Antes de depurar una ruta que «no existe», comprueba si `/` también da 404.
- Ante un overlay, lee primero si dice `(stale)` y si el servidor sigue vivo (`curl` a la ruta). Si el aviso no se reproduce con `.next` recién borrado, es el caché; no cambies el patrón que señala.
- Si `type-check` solo se queja de `.next/`, `rm -rf apps/<app>/.next/dev/types` (o borra `.next`) y vuelve a correr; Next lo regenera. Ojo con hacerlo si otra sesión puede estar a mitad de un `next build` en el mismo repo.
- Para el CSS rancio, detección en un minuto:
```bash
U=$(curl -s http://localhost:3000/cuenta | grep -o '/_next/static/[^"]*\.css' | head -1)
curl -s "http://localhost:3000$U" | grep -c "t-lm-badge"   # 0 = CSS rancio
```
  (o `curl -s http://localhost:3000/<ruta> | grep -o '/_next/static/[^"]*\.css'` y un `grep` de tu regla en ese archivo). Una regla que existe en el fichero y no computa NO es un fallo de especificidad: es que no llegó. Se destraba tocando el CSS con un cambio de CONTENIDO real (un salto de línea suelto a veces no invalida el hash) o borrando `.next`.

### pnpm build envenena el dev server vivo
**Síntoma:** una app sirve 404 en todas sus rutas (incluida `/`) con el proceso vivo y escuchando, minutos después de un `pnpm build`. Visto el 2026-09-08: `pnpm dev` arrancado a las 18:28, `pnpm build` a las 18:38-18:40, y a las 18:50 `motorizados` (3004) devolvía 404 en `/`, `/login`, `/pedidos` y `/hoy` teniendo `app/(driver)/page.tsx`. Las otras cuatro apps seguían respondiendo 200: no cae siempre ni en todas. Segundo golpe: Playwright sondea la URL de cada `webServer`, un 404 le dice «no está levantado», intenta arrancar el suyo y muere con `EADDRINUSE`, con un error de puertos que no tiene nada que ver con los puertos ni con el test.
**Causa:** `next build` y `next dev` escriben en el **mismo `apps/<app>/.next`**. Correr `pnpm build` desde la raíz con un `pnpm dev` levantado sobrescribe los manifiestos de producción encima de los que el dev server tiene abiertos (mismo cuadro que [Next da 404 en todas las rutas](#next-da-404-en-todas-las-rutas)). El daño llega tarde, así que el 404 se atribuye al último commit. Confirmado el mismo día: borrar `apps/motorizados/.next` y volver a levantar devolvió el 200 en `/`.
**Qué hacer:**
- Antes de `pnpm build`, mira si hay dev servers vivos: `netstat -ano | grep -E ":(300[0-4])\s" | grep LISTENING`. Si los hay y no son tuyos, **pregunta antes** (puede haber alguien con el navegador abierto).
- No se puede reparar una sola app: al matar la tarea de motorizados, turbo tumbó las otras cuatro (`turbo run dev` cae entero cuando una tarea muere). La reparación es siempre de las cinco. Receta que funcionó, en orden: parar el dev → `pnpm build` si lo necesitas → borrar los cinco `.next` → `pnpm dev` de nuevo. Para esperar sin `sleep`, `curl --retry 90 --retry-delay 4 --retry-connrefused` por puerto bloquea hasta que responden.
- Al diagnosticar un 404 raro, compara `LastWriteTime` de `.next/build` (lo pone el build) con el de `.next/dev` (lo pone el dev): si el de `build` es posterior al arranque del dev server, es esto.
- Matar procesos por puerto, no por nombre: ver [pkill no mata Next en Windows](#pkill-no-mata-next-en-windows) y [Un dev server viejo finge bugs de código](#un-dev-server-viejo-finge-bugs-de-código).

### Un dev server viejo finge bugs de código
**Síntoma:** todos los e2e de un spec caen a la vez, incluidos los que pasaban hace diez minutos. Dos variantes, ninguna delata la causa:
1. `element is not stable` / `element was detached from the DOM` al pulsar botones normales del catálogo (**customer**, :3000).
2. «Negocio no encontrado o no disponible» en pantalla, con `/api/v1/health` respondiendo **200 en JSON** pero `/api/v1/public/businesses/:id` devolviendo **HTML de error 500** (**api**, :3001).
**Causa:** ocurre cuando el árbol se mueve debajo de un server que sigue vivo: otro agente cambió de rama o hizo `git stash`, o se tocó `apps/api/next.config.ts`. El `webServer` de Playwright tiene `reuseExistingServer: true`, así que reutiliza el proceso corrupto una y otra vez y el rojo es determinista (parece un bug de verdad, no un flake). Borrar `.next` sin matar el proceso no basta.
**Qué hacer:** matar por puerto y borrar la caché de ESA app; el siguiente `playwright test` la vuelve a levantar sola. `pkill` no sirve (ver [pkill no mata Next en Windows](#pkill-no-mata-next-en-windows)):
```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { taskkill /PID $_ /T /F }
```
luego `rm -rf apps/customer/.next` (o `apps/api/.next`). Distinto de [Los rojos intermitentes de e2e son Next compilando](#los-rojos-intermitentes-de-e2e-son-next-compilando), que es lento pero pasa solo.

### Los gestos del motorizado sin la API caen a la cola offline
**Síntoma:** probando la app del motorizado en local, la UI cambia al soltar el gesto (la tarjeta cambia, un test dice «pasó») pero `orders.status` en la base no. Se ve como un fallo del gesto.
**Causa:** (nota del 2026-09-19) el board lee de Supabase directo, pero cada transición (`postTransition`) va a `NEXT_PUBLIC_API_URL=localhost:3001`. Sin la API, el POST falla por red, `postTransition` lo encola en `offline-queue` y pinta el estado optimista.
**Qué hacer:** levanta TAMBIÉN `apps/api` (`pnpm dev`, puerto 3001), no solo `apps/motorizados` (3004). Ante «la UI cambió pero `orders.status` no», mira primero `netstat` de :3001. La PRIMERA petición a cada ruta de la API compila en frío (2-3 s): mide latencias del gesto a partir de la segunda. Relacionado: [Los rojos intermitentes de e2e son Next compilando](#los-rojos-intermitentes-de-e2e-son-next-compilando).

## e2e con Playwright

### Los rojos intermitentes de e2e son Next compilando
**Síntoma:** un e2e que falla y al repetirlo pasa. Dos variantes que no se parecen a la causa:
- «No se pudo cargar» en la ficha del negocio: el catálogo tardó más de lo que aguanta el hook y la pantalla cayó a su estado de error.
- `element was detached from the DOM, retrying` al hacer clic en un plato: la respuesta lenta llegó DURANTE el clic, React re-renderizó y el nodo que Playwright tenía agarrado desapareció.
**Causa:** Next en desarrollo compila cada ruta la primera vez que se pide, y el `webServer` de Playwright solo espera a UNA por app (`/api/v1/health` y la portada). Medido en frío el 2026-08-29:
```
GET /api/v1/public/schedule        5,14 s  →  0,08 s la segunda
GET /negocio/:id (página)          4,10 s  →  0,49 s
GET /api/v1/public/businesses/:id  1,87 s  →  0,12 s
```
El primer test que abre una ficha de negocio pagaba las tres: ~11 s contra un `actionTimeout` de 15 s, justo en el filo, o sea intermitente.
**Qué hacer:** lo cubre el proyecto `precalentar` de `playwright.config.ts` (`e2e/precalentar.setup.ts`), que pide las rutas calientes antes de todo y comprueba que el mundo e2e esté sembrado. **`--no-deps` se lo salta**: con el stack frío, no lo uses. Si vuelve un rojo raro, mira primero si la ruta implicada es nueva y no está en la lista de `RUTAS`. Ver también [La suite visual depende de la DB](#la-suite-visual-depende-de-la-db) y los [seeders de demo](#los-seeders-de-demo-envenenan-los-tests-de-caja).

### seed-e2e-clean rompe happy-path-order
**Síntoma:** `pnpm test:e2e` completo deja `happy-path-order` en rojo con `Expected: "pending_acceptance" / Received: "validando"`; el mismo test pasa si corres solo `--project=chromium`. Verificado el 2026-09-07 contra `develop` limpio (37 passed / 1 failed, el mismo).
**Causa:** `vecino-conocido-contraentrega.spec.ts` llama `pnpm db:seed:e2e:clean` en su `afterAll`, y ese script borra TODOS los pedidos de TODOS los clientes e2e (`E2E_CUSTOMER_USER_IDS`) y de los negocios e2e. Corre al final, así que el cliente `...0003` se queda sin ningún pedido no cancelado y en la corrida SIGUIENTE su pedido cae en `standard_validation_rule` («primer pedido de este teléfono») y nace en `validando`: el daño de una corrida se cobra en la siguiente, lo que lo hace parecer aleatorio. Un `supabase db reset` lo dispara igual (medido el 2026-09-10): tras el reset, la primera corrida completa deja `happy-path-order` en rojo con ese mensaje y la SEGUNDA sale verde sin tocar nada, porque `viaje-pedido-online` corre después y deja al cliente `...0003` el `delivered` que faltaba. Antes del reset no se notaba porque el historial acumulado tapaba el agujero.
**Qué hacer:** antes de culpar a tu rama, corre `--project=chromium` solo. Después de un `db reset`, corre la suite dos veces antes de leer el resultado. En un spec nuevo NO uses `db:seed:e2e:clean` para limpiar lo tuyo: borra por id lo que creaste (ver el `borrarPedidosDe` de `e2e/recojo-en-el-local.spec.ts`). Relacionado: [Los fixtures e2e acumulan historial permanente](#los-fixtures-e2e-acumulan-historial-permanente) y [La suite visual depende de la DB](#la-suite-visual-depende-de-la-db).

### La suite visual depende de la DB
**Síntoma:** (al 2026-09-04, medido) `npx playwright test --project=visual` sale 13/13 verde, pero `npx playwright test` (suite completa) deja **3 rojos siempre**: `tablero`, `deuda` e `historial` de `e2e/visual/negocios.spec.ts`.
**Causa:** los snapshots comparan la pantalla entera píxel a píxel y las baselines llevan dentro el contenido de la base, no solo el diseño. `e2e/visual/mundo-determinista.setup.ts` (proyecto `mundo-visual`, del que `visual` depende) fija el mundo al principio de la corrida, pero después el proyecto `chromium` corre `viaje-pedido-online.spec.ts`, que lleva un pedido hasta `delivered`. Ese pedido cambia justo esas tres pantallas (el tablero por el número de tarjetas, la deuda por el cargo de reparto, el historial por la fila nueva), y como `delivered` es terminal y nadie lo limpia, se acumula. No es flakiness ni diseño.
**Qué hacer:** si ves esos tres, y solo esos tres, en rojo tras una corrida completa, no es tu cambio. Confírmalo corriendo `--project=visual` a solas: si sale 13/13, el culpable es el orden de la suite. NO regrabes con `--update-snapshots` desde una corrida completa, porque fijarías el mundo contaminado como base. El arreglo de fondo (pendiente) es que `visual` no comparta base con los proyectos que crean pedidos, o que `mundo-visual` vuelva a correr justo antes de capturar.

### Chromium headless miente sobre visibilidad y permisos
**Síntoma:** en Playwright, una UI que solo aparece con el permiso de notificaciones sin contestar (la hoja de `PushPermissionSheet`, la fila «Solo te avisamos con esta pantalla abierta») no sale nunca; y no hay forma de provocar el caso «pestaña en segundo plano».
**Causa:** (medido) en Chromium headless: (1) `Notification.permission` es `'denied'` de fábrica, no `'default'`; (2) `otraPagina.bringToFront()` NO oculta la primera: `document.visibilityState` se queda en `'visible'` en todas las páginas. Falla el andamio, no el código.
**Qué hacer:** para el permiso, `ctx.addInitScript` con `Object.defineProperty(Notification, 'permission', { get: () => 'default' })` (o `'granted'`/`'denied'` para retratar cada estado). Para la visibilidad, redefinir `document.visibilityState` y despachar `new Event('visibilitychange')` a mano; es exactamente la API de la que depende el código, así que la prueba sigue siendo honesta. En los specs de verdad el permiso se concede en el `use` del config, que **no llega** a los contextos hechos con `browser.newContext()`.

### La pestaña oculta de Chrome no hidrata
**Síntoma:** con el Chrome de automatización (extensión) en segundo plano, Next nunca hace el swap del Suspense (`$RC`), el DOM se queda con el esqueleto de `loading.tsx` más el contenido oculto, `__reactProps` no aparece y `Page.captureScreenshot` expira. Parece un bug de hidratación (se perdió ~1 h el 2026-10-02) y no lo es.
**Causa:** si `document.visibilityState === 'hidden'` (ventana minimizada o usuario ausente), `requestAnimationFrame` no corre. Las pruebas por la extensión de Chrome dependen de que la ventana esté visible.
**Qué hacer:** comprueba primero `document.visibilityState`. Para verificar UI sin la persona delante, escribe/ejecuta Playwright (`npx playwright test e2e/x.spec.ts --project=chromium --no-deps`), que corre en su propio navegador visible. Otros dos cuidados que salieron: un `login()` que espera un texto presente también en la pantalla de login (p. ej. «Sala de control») deja que el siguiente `goto` corte el inicio de sesión; y `Icon` de `@tindivo/ui` mete el nombre del glifo en el nombre accesible («paid Vendido») salvo que se envuelva en `aria-hidden`.

### La bolsa se renderiza dos veces
**Síntoma:** en Playwright, `getByText(/…/).first()` a 360 px coge la copia del sidebar, que está oculta, e `isVisible()` devuelve `false` sobre un elemento que sí se ve en pantalla. El test dice que el componente no se pinta cuando se pinta perfectamente (una captura enseñaba el aviso pintado mientras el aserto decía que no existía).
**Causa:** en `apps/customer` la bolsa se monta **dos veces a la vez**: `cart-sidebar.tsx` (escritorio) y `cart-sheet-content.tsx` (hoja móvil). Las dos están siempre en el DOM; cuál se ve lo decide el CSS por ancho de viewport. Lo mismo aplica a cualquier componente que se monte en las dos vistas; `CartCtas` y `CartPickupNotice` ya están en ese caso.
**Qué hacer:** recoger todas las coincidencias con `.all()` y filtrar por `isVisible()`, o anclar el localizador dentro de la hoja concreta. Nunca `.first()` a secas para nada de la bolsa. Verifica con una captura antes de creerte un `false`. Relacionado: [Los rojos intermitentes de e2e son Next compilando](#los-rojos-intermitentes-de-e2e-son-next-compilando), [Un dev server viejo finge bugs de código](#un-dev-server-viejo-finge-bugs-de-código).

## Turbo y CI

### Turbo cachea los tests de integración
**Síntoma:** `pnpm test` sale verde entero sin ejecutar un solo test. La salida es idéntica a una corrida real (los 251 tests de `apps/api` con sus tiempos, el `🧹 [después] restos de test borrados` del teardown incluido). Lo único que la delata son las dos últimas líneas: `Cached: 9 cached, 9 total` y `>>> FULL TURBO`, con un tiempo total de ~200 ms.
**Causa:** `pnpm test` es `turbo run test`, y Turbo reproduce el log cacheado cuando los archivos no cambiaron. Los tests de `apps/api` son de integración contra la Supabase local y el estado de esa base **no entra en el hash**: un cache hit verde no dice nada sobre si hoy pasan (la base pudo resetearse, quedarse sin el mundo e2e o llenarse de basura de otra suite).
**Qué hacer:** forzar la ejecución y comprobar que el contador de caché sea cero:
```bash
pnpm db:seed:e2e                                    # el mundo e2e, primero
npx turbo run test --force --output-logs=new-only   # sin caché
```
Leer siempre el pie: solo vale si dice `Cached: 0 cached`. Para sacar los resúmenes de los demás paquetes sin volver a pagar la corrida, un `npx turbo run test --filter='!@tindivo/api'` normal ya los sirve de caché. Relacionado: [La suite visual depende de la DB](#la-suite-visual-depende-de-la-db) y los [seeders de demo](#los-seeders-de-demo-envenenan-los-tests-de-caja) son las dos formas de que la base mueva el resultado; esta es la de que el resultado ni se calcule.

### db-types-drift es de versión del CLI
**Síntoma:** tras un `db push`, regenerar `database.types.ts` da un diff enorme que parece que la migración tumbó algo; o el job `db-types-drift` del CI sigue rojo después de commitear la regeneración. Medido el 2026-08-27 (CLI local 2.109.1, tras aplicar 0190–0194 en prod): **+4 / −28 líneas** sin que el esquema `public` cambiara. Todo el diff era de formato: sale el bloque `graphql_public` entero (schema, `Functions.graphql`, y su entrada en `Constants`), entra `__InternalSupabase: { PostgrestVersion: "14.17" }`, y desaparece el salto de línea final.
**Causa:** `pnpm db:types` genera contra el **remoto** (`zpnipajgwfthxhdtzhly`), y el job `db-types-drift` del CI hace lo mismo con `supabase/setup-cli@v1 version: latest` y exige `diff -q` idéntico. El fichero commiteado depende de la versión del CLI que lo generó, no solo del esquema.
**Qué hacer:** mira el diff, no el `--stat`. Si no toca `public.Tables` / `Functions` / `Enums`, es la versión del CLI. Si el CI sigue rojo, la causa probable es que CI corre `latest` (2.116+) y se generó con uno más viejo: actualiza el CLI y regenera, no edites el fichero a mano. Relacionado: [Colisión de número de migración](#colisión-de-número-de-migración).

## Producción

### El dominio real de la API v2
**Síntoma:** sondear rutas del v2 contra `api.tindivo.com` da 404 en todo y parece «producción va con un deploy viejo» o «esa ruta no se desplegó».
**Causa:** la API de producción de **v2 vive en `https://apiv2.tindivo.com`**. `api.tindivo.com` es la del **v1 legacy**, sigue en pie, contesta y sirve un 404 de Next con aspecto normal. Los docs se corrigieron el 2026-09-08 (commit `239f764`): los siete que decían `api.tindivo.com` ahora dicen `apiv2`, y `Docs/13 §2` y `Docs/05 §1` llevan un aviso. El handoff `2026-08-11-los-momentos-sin-aviso.md` ya había documentado la trampa y aun así los docs de referencia siguieron mintiendo.
**Qué hacer:** verifica sin fiarte de ningún doc; el frontend lleva la URL dentro de sus chunks:
```bash
curl -s https://negocios.tindivo.com/ -o /tmp/n.html
for c in $(grep -oE '/_next/static/chunks/[a-zA-Z0-9_.-]+\.js' /tmp/n.html | sort -u); do
  curl -s "https://negocios.tindivo.com$c" | grep -oE 'https?://[a-zA-Z0-9.:-]+/api/v1'
done | sort -u
```
Calibra antes de concluir: `/api/v1/health` da 200 sin auth y `/api/v1/business/profile` da 401. Si una ruta que existe te da 404, no es que falte: estás llamando al host equivocado.

### El Chromium serverless solo trae Open Sans
**Síntoma:** cualquier PDF renderizado en producción pierde su tipografía, las columnas de dinero pierden la alineación tabular, y los emoji y glifos de símbolos (`▲` U+25B2, `→` U+2192) salen como cuadrados. En local no se ve.
**Causa:** (nota del 2026-09-08) el `@sparticuz/chromium` con el que producción genera PDFs trae tres fuentes y ni una más, dentro de `bin/fonts.tar.br`: `fonts/Open_Sans/OpenSans-Bold.ttf`, `OpenSans-Italic.ttf` y `OpenSans-Regular.ttf`. En local el PDF lo dibuja el Chrome de la máquina, que tiene de todo (incluida una fuente de emoji y una monoespaciada). Ninguna pila tipográfica (`-apple-system`, `Segoe UI`, `Roboto`, `monospace`) resuelve a nada en el contenedor: cae toda a Open Sans.
**Qué hacer:** en `apps/api/lib/pdf/` la solución ya está montada: Geist y JetBrains Mono embebidas en base64 vía `pnpm pdf:assets`, y flechas y caritas dibujadas en SVG. Si tocas ese PDF o creas otro renderizado en servidor:
- Embebe la fuente. No la declares por nombre y no la traigas por URL.
- Cualquier glifo fuera del subset latin va **dibujado**, no escrito. El copy de `packages/core` se escribe pensando en el navegador y ya coló un `→`; por eso `esc()` avisa por log cuando encuentra uno.
- Ojo con `document.fonts.ready`: las `@font-face` con `data:` no bloquean el evento `load`, así que hay que esperarlas antes de `page.pdf()`.
Relacionado: [La rama de producción del PDF no se puede probar en Windows](#la-rama-de-producción-del-pdf-no-se-puede-probar-en-windows).

### La rama de producción del PDF no se puede probar en Windows
**Síntoma:** en Windows, la rama de producción de `launchBrowser` infla el `.br` a `%TEMP%\chromium` y muere con `spawn ... ENOENT`; el PDF se despliega sin haber probado el camino real. Además, cambiar `next.config.ts` deja el dev server del 3001 colgado: se reinicia solo, el PID cambia, el puerto sigue en LISTENING y no responde ni `/api/v1/health`.
**Causa:** `apps/api/lib/pdf/browser.ts` bifurca por `NODE_ENV === 'production'`: **dev** usa el Chrome/Edge instalado en la máquina (Chrome COMPLETO); **producción** usa `@sparticuz/chromium`, que es `chrome-headless-shell` para Linux. Son dos programas distintos con capacidades distintas, y todo lo que se prueba aquí pasa por la rama que producción nunca ejecuta. Eso ya dejó desplegar el PDF con dos fallos que solo existían al otro lado: el `bin/` que no viajaba en la traza y `headless: true` sobre un binario que solo entiende `'shell'`.
**Qué hacer:**
- Para **ver el documento**, usa la rama de dev con una config de vitest desechable (sin `globalSetup`, así no toca la DB), un `PerformancePayload` sintético y `renderRendimientoPdf` directamente. Node suelto no vale: no resuelve los imports sin extensión de `@tindivo/core`.
- Para **rasterizar y mirarlo**, pdf.js inyectado en un Chrome de puppeteer y captura de cada canvas. `pdftoppm` no está.
- `next start` fuerza `NODE_ENV=production` y por tanto toma la rama serverless: sirve para comprobar que el ERROR se reporta bien, no para ver el PDF.
- Lo que sí se verifica en frío: que los `.br` entren en el bundle, mirando `.next/server/app/.../pdf/route.js.nft.json` tras un `next build`. Hazlo con `distDir` aparte para no pisar el `.next` del dev server.
- Tras cambiar `next.config.ts`, reinicia a mano el dev server del 3001; ver [Next da 404 en todas las rutas](#next-da-404-en-todas-las-rutas) y [pkill no mata Next en Windows](#pkill-no-mata-next-en-windows).
Relacionado: [El Chromium serverless solo trae Open Sans](#el-chromium-serverless-solo-trae-open-sans).

### El salto a la API cuesta medio segundo
**Síntoma:** una pantalla que lee por la API (`apiv2.tindivo.com`) arranca debiendo 470-750 ms aunque la ruta no toque la base; en `/cuenta` se pagaba para acabar pintando «Sin reclamos».
**Causa:** (medido en prod el 2026-08-28) `GET https://apiv2.tindivo.com/api/v1/customer/appeals` sin token responde en **470-750 ms** (3 veces, warm); es la ruta 401, que corta antes de consultar nada, así que ese medio segundo es el piso del salto. `https://zpnipajgwfthxhdtzhly.supabase.co/rest/v1/` responde en 275-315 ms desde la misma máquina: la API cuesta ~2x lo que PostgREST antes de hacer nada. El preflight OPTIONS son otros ~318 ms (con `access-control-max-age` 86400, pero Chrome lo capa a 2 h y Safari a ~10 min). Una ruta de la API suele encadenar hops en serie desde el serverless: `requireRole` es `auth.getUser(token)` (red a Supabase Auth) + un select a `user_roles`, antes de la consulta que de verdad se quería. La base no era el problema: los planes van por índice en ~1 ms.
**Qué hacer:** si el dato se puede leer con una policy de RLS que ya existe, léelo directo por PostgREST y deja la API para lo que necesita `service_role` (URLs firmadas de Storage, escrituras con máquina de estados, cosas con `user_roles`). Antes de meter un `api.get()` dentro del `Promise.all` que destapa una pantalla, pregúntate si puede salir de ahí.

## Supabase y PostgREST

### Colisión de número de migración
**Síntoma:** `supabase migration up --local` ejecuta el DDL sin quejarse y revienta DESPUÉS, al anotar la migración:
```
LegacyMigrationApplyError ... At statement: 2
INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
```
El error apunta a la tabla de bookkeeping, no al SQL (que está bien), y la transacción entera se deshace, así que la función queda SIN reemplazar. Es fácil leerlo como "la base miente sobre su estado".
**Causa:** (2026-08-20) con otro agente en el mismo árbol, el número de migración libre puede dejar de serlo entre que se elige y se aplica: acabaron dos ficheros `0182_*` a la vez. `version` es la PK de `supabase_migrations.schema_migrations`. Verificar el número libre contra `origin/main` no basta porque los ficheros del otro agente están SIN TRACKEAR, invisibles para git: la fuente de verdad del espacio de números es el disco y la base, nunca el historial.
**Qué hacer:**
- Antes de nombrar una migración: `ls supabase/migrations | tail -1` y `supabase migration list`. Y otra vez justo antes de aplicar, no solo al empezar.
- Guardia de una línea: `ls supabase/migrations | cut -d_ -f1 | uniq -d` (vacío = sin colisiones).
- **Nunca borres una fila de `schema_migrations` sin leer su columna `name`.** Se miró solo `version`, se dio por basura propia una fila que era del otro agente y se borró; se curó porque su migración era `CREATE OR REPLACE` (invariante 6), o sea por suerte del invariante: `supabase migration up` la reaplicó igual y reanotó la fila.
- Si el choque ya ocurrió: renumera lo tuyo al siguiente libre y corre `migration up`, que aplica las dos y deja el registro coherente.

### Un DELETE sin policy devuelve 204
**Síntoma:** un DELETE por PostgREST responde **HTTP 204** y la fila sigue ahí. Una segunda variante: con `service_role` y policy de sobra, `.delete().like('id', 'tmp%')` sobre `menu_items` devolvió 204 y no borró nada; el síntoma aparece en el INSERT siguiente, que choca con la clave primaria y hace pensar que el script de seed está roto.
**Causa:** (1) (nota del 2026-08-28) con el JWT del cliente sobre `reports`: con `rep_participant_read` el cliente VE la fila pero no hay ninguna policy de DELETE para su rol, así que el DELETE afecta 0 filas, y 0 filas borradas es un 204 perfectamente válido; hizo falta el `service_role`. Aplica a casi toda la app: el esquema da a `customer` lecturas y algún insert, y las escrituras de verdad van por la API; muy pocas tablas tienen DELETE para un rol que no sea admin. (2) (medido el 2026-09-01) `id` es `uuid` y PostgREST no aplica `like` sobre uuid: la petición sale bien y casa con cero filas.
**Qué hacer:** tras un DELETE por PostgREST, **verifica con un SELECT**, no con el código de estado. Para limpiar datos de prueba en local, usa desde el principio la `SUPABASE_SERVICE_ROLE_KEY` de `apps/api/.env.local`. Para borrar por patrón sobre uuid, arma la lista de ids en el script y usa `.in('id', ids)`. Si algún día se pone un botón de "eliminar" en el cliente, comprueba que existe la policy: sin ella la UI dirá que funcionó y no habrá pasado nada. Misma familia que [Los fixtures e2e acumulan historial permanente](#los-fixtures-e2e-acumulan-historial-permanente) (un éxito aparente que no limpió nada).

### Leer el Supabase legacy
**Síntoma:** una lectura del legacy (`nwcdxmebsozswnjlblip`, tindivo-delivery) devuelve exactamente 1000 filas sin error aunque se pidió más (`limit=5000`), y los agregados calculados encima parecen válidos y no lo son (ya produjo un `_stg_first_order` incorrecto en la primera pasada del ETL de direcciones; `orders` tiene 1606 filas con `client_phone`, no 1000).
**Causa:** (nota del 2026-08-04) el PostgREST del legacy tiene `db-max-rows = 1000`; el truncamiento es silencioso. Además, el MCP `supabase-legacy` existe en `.mcp.json` pero exige OAuth, y el link de autorización falló el 2026-08-04. Vía alternativa para leerlo desde v2 (`zpnipajgwfthxhdtzhly`) sin archivos intermedios: `CREATE EXTENSION http WITH SCHEMA extensions` en v2, llamar al PostgREST del legacy con la secret key (`sb_secret_...`, headers `apikey` + `Authorization: Bearer`) y parsear con `json_to_recordset`. La extensión se desinstaló al cerrar el ETL del directorio.
**Qué hacer:** antes de cargar cualquier tabla del legacy, pedir el conteo con `Prefer: count=exact` leyendo `Content-Range`; si supera 1000, paginar con `&order=id&limit=1000&offset=N` y verificar que `filas_leídas = total` antes de agregar nada. Si se necesita otra lectura, hay que volver a instalar la extensión `http`, y la secret key del legacy se rota tras cada uso porque queda en los logs de consultas de v2.

## Diagnóstico de incidentes

### Diagnosticar pedidos perdidos
**Síntoma:** un negocio reporta que perdió un pedido («sonó y no me apareció», «no me llegó»).
**Causa:** la evidencia está en `orders` del remoto `tindivo-prod`, y llegar a ella cuesta dos consultas. Leer código primero lleva a hipótesis plausibles y equivocadas: en el caso de `JMAXL98Z` (21-ago-2026) las tres primeras deducidas leyendo eran de móvil, y el incidente fue en desktop.
**Qué hacer:**
- **La huella:** `status = 'cancelled' AND cancel_reason = 'pending_acceptance_timeout'` con `cancelled_at - pending_acceptance_at ≈ 300s` es exactamente «sonó los cinco minutos y nadie lo tocó». Es raro (uno en 30 días). Los `prepay_timeout` son otra cosa (el cliente no pagó) y `business_cancelled` también (alguien decidió).
- **Lo que lo desambigua:** mirar los pedidos del MISMO negocio en la ventana de ±30 min. Si la cajera creó un `business_manual` justo antes o después, no estaba ausente: estaba ocupada dentro de la app, lo que descarta las hipótesis de «no estaba mirando». En `JMAXL98Z` había un manual 18 segundos después de la expiración.
- **Antes de teorizar, dos preguntas al negocio** que separan las dos fuentes de sonido: ¿la app estaba abierta en pantalla o el celular bloqueado? ¿el sonido se repetía o sonó una vez? La voz in-app machaca cada 3s/15s; el push de `send-push` suena una vez.
- Si el envío salió bien, ver [El push se entregó y aun así no sonó](#el-push-se-entregó-y-aun-así-no-sonó).

### El push se entregó y aun así no sonó
**Síntoma:** ante un pedido perdido, `push_delivery_log` dice `status = 'ok'`, entregado a los pocos segundos, y el negocio dice que no sonó. Caso: los tres pedidos que Pizza Priamo perdió el 8-sep-2026 (`DTH7CQFV` 20:17, `VHRTX2ML` 20:45, `X9MV4TED` 20:54, S/99) tienen sus tres push en `ok`. El aviso salió; no se sabe si sonó.
**Causa:** el fallo está en el aparato, no en el envío. Entre «el parlante está prendido» (lo que contesta el negocio, de buena fe) y «este aparato reproduce sonido ahora mismo» caben el volumen del sistema, el modo silencio, y sobre todo un `AudioContext` en `suspended`, que no falla, no avisa y no suena. Ninguna de las tres se puede consultar desde el código.
**Qué hacer:** mira primero `push_delivery_log` para descartar el envío; si sale `ok`, el problema es del aparato y la única prueba que existe es hacer ruido y preguntarle a la persona. La huella del pedido en sí está en `orders` con `pending_acceptance_timeout` (ver [Diagnosticar pedidos perdidos](#diagnosticar-pedidos-perdidos)). El panel ya vigila el `AudioContext` mientras hay algo esperando, y la prueba de sonido vive en `apps/negocios/components/sound-check.tsx`.

## Diseño

### Medir desbordes con Playwright antes de publicar
**Síntoma:** en los diseños de Claude Design (`.dc.html`) publicados sin renderizar, textos que sobresalen de botones y layouts: `flex:1 1 0` partiendo etiquetas largas, «Restaurantes» a 26 px en una tarjeta de 137 px, una barra 3 px más ancha que la pantalla y el pie tapando contenido (diseño de Entregas, nota del 2026-09-20).
**Causa:** calcular alturas a mano falla. La instrucción del tipo Design dice «no verifiques salvo que te lo pidan»; en este caso sí se pidió.
**Qué hacer:** los `.dc.html` se abren tal cual con `file://` (el `<x-dc>` sin runtime renderiza como HTML normal). Usa `playwright-core` del repo (`node_modules/.pnpm/playwright-core@1.62.0/...`, Chromium ya instalado; Geist y Material Symbols cargan de Google Fonts). Intercepta `**/_blob/**` para servir los logos/iconos locales y `**/support.js` vacío. Mide: `scrollWidth > clientWidth`, hijos que salen de su botón, `Range.getClientRects()` con varias líneas en botones, y fotografía cada tablero. Ignora lo que vive dentro de elementos con `transform` (pines girados) y los adornos recortados a propósito. Antes de publicar el índice, lee la URL del lienzo sin `path`: si el editor guardó en medio, el publish se rechaza. Bash puede fallar por timeout del clasificador; PowerShell + `node archivo.js` funciona.

### Los rótulos del mapa se pisan con la densidad real
**Síntoma:** en producción, un rótulo (p. ej. «I.E. Inicial Piloto San Jacinto») escribe su nombre encima de la chapa de otro punto. El spec `e2e/mapa-reparto-de-rotulos.spec.ts` no lo ve.
**Causa:** (medido el 2026-09-08) el spec siembra **12** referencias apretadas alrededor del centro y las borra al terminar; `map_landmarks` en local está **vacía**. En `tindivo-prod` hay **60 referencias activas**, repartidas por el pueblo, no en racimo. Sembrando esas 60 en local y corriendo el mismo spec con el código de `main` sin tocar: 72 chapas, 44 nombres, **1 solape**, en TODOS los frames, en los tres anchos; el nombre que sobra sale de las dispersas. `repartirRotulos` (`map-picker-inner.tsx`) solo mete en la pelea a los puntos dentro de `MARGEN = 100` px del lienzo; a los de fuera les deja `conNombre: true` sin comprobar choques y sin reservar su chapa. Con 12 en racimo nadie cae fuera de ese margen; con 60 dispersas, sí. Es un defecto VIVO en producción, no una regresión.
**Qué hacer:** si tocas el reparto, siembra primero las 60 de prod en local o no estarás midiendo lo que ve el cliente. El arreglo natural es que el margen del reparto y el del recorte de viewport sean el mismo número, en vez de 100 contra `margenCulling()`.

<!-- fuentes: windows-reserva-los-puertos-de-supabase.md, docker-no-esta-en-program-files.md, pkill-no-mata-next-en-windows.md, heredoc-bash-corrompe-acentos.md, next-404-en-todas-las-rutas.md, build-envenena-el-dev-server-vivo.md, dev-servers-viejos-fingen-bugs-de-codigo.md, rojos-intermitentes-e2e-son-next-compilando.md, seed-e2e-clean-rompe-el-happy-path.md, la-jornada-del-mundo-e2e-caduca-a-las-5.md, fixtures-e2e-acumulan-historial-permanente.md, suites-integracion-dejan-negocios-huerfanos.md, seeders-demo-envenenan-tests-de-caja.md, pedidos-demo-desaparecen-solos.md, relojes-de-orders-no-se-siembran-en-el-insert.md, turbo-cachea-los-tests-de-integracion.md, suite-visual-depende-de-la-db.md, chromium-headless-miente-sobre-visibilidad-y-permisos.md, la-pestana-oculta-de-chrome-no-hidrata.md, bolsa-se-renderiza-dos-veces.md, gestos-del-motorizado-sin-api-caen-a-la-cola-offline.md, db-types-drift-es-de-version-del-cli.md, colision-de-numero-de-migracion.md, delete-sin-policy-devuelve-204.md, salto-a-la-api-cuesta-medio-segundo.md, dominio-real-de-la-api-v2.md, el-chromium-serverless-solo-trae-open-sans.md, la-rama-de-produccion-del-pdf-no-se-puede-probar-en-windows.md, legacy-read-path.md, rotulos-del-mapa-se-pisan-con-la-densidad-real.md, diagnosticar-pedidos-perdidos.md, el-push-se-entrego-y-aun-asi-no-sono.md, medir-desbordes-con-playwright-antes-de-publicar.md, accepting-orders-until-es-pausado-hasta.md -->
