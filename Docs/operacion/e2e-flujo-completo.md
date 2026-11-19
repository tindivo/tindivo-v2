# Prueba de punta a punta de un pedido por la API REST

> Verificado: 2026-11-19 · contra `test/e2e-punta-a-punta` sobre `develop@25a6d537`, pila LOCAL (Supabase 127.0.0.1:54321, API en el puerto 3001), con `pnpm e2e:todo --reset` y otra vez sin `--reset`: 82/82 pasos, 13 escenarios

`scripts/e2e/flujo-completo.ts` lleva UN pedido de restaurante por todo su ciclo usando solo `/api/v1`, como las apps:
el cliente lo crea, la cajera lo valida y lo acepta, y el motorizado lo toma, lo recoge y lo entrega. Inicia sesión con
email y contraseña (Supabase Auth, clave anon) y manda el JWT como `Bearer`. Tras cada paso lee el pedido desde las tres
vistas y comprueba el estado esperado y que los tres actores ven el mismo `short_id`.

| Vista | De dónde sale |
|---|---|
| Cliente | `GET /customer/orders/{id}` |
| Motorizado | `GET /driver/orders/{id}` (404 mientras el pedido no está en su cola: se tolera) |
| Negocio | lectura de `orders` con el JWT de la cajera, bajo RLS: la API no tiene un GET por id para el negocio y así lo lee la app |

Escenarios: **contraentrega** (efectivo; si el cliente no tiene historial nace en `validando` y pasa por
`POST /business/orders/{id}/validate`) y **prepago** (`accept` → `upload-url` + PUT a Storage → `prepay-proof` →
`validate` → `ready` → entrega). El de contraentrega comprueba además el efectivo a rendir (`cash_owed_at_delivery`).

## Todos los escenarios

`pnpm e2e:todo` arranca la API si hace falta y corre los 13 escenarios bajo el candado (`--reset` hace antes `db reset` y el seed e2e; `--playwright` suma `pnpm test:e2e`). La lista de escenarios está en el script (`SCENARIO_NAMES`). Un escenario se corre solo con `--scenario <nombre>`.

Discusión: [matriz de escenarios](../trabajo/e2e/escenarios.md)

Quedan fuera de staging los que usan la service role (`no-show`, `prepago-vencido`, `celular-sms`, `entregas`, `borrar-cuenta`). `no-show` y los escenarios de cliente nuevo crean sus propios clientes (teléfono y referencia únicos por corrida), así que el strike no envenena a los clientes fijos ni la dirección «Portón azul…» que comparte Playwright. Sin `--reset` se acumulan clientes y pedidos entregados; si algo falla por «primer pedido con pago adelantado» o por un pedido activo, repite con `--reset`.

## Local

```bash
pnpm db:lock status                                   # la base es compartida: confirma que está libre
pnpm --filter @tindivo/api dev                        # API en :3001 (solo la API; no hacen falta las apps web)
pnpm db:lock run -- supabase db reset "&&" pnpm db:seed:e2e "&&" node scripts/e2e/flujo-completo.ts --check-events
```

Tras un `db reset` el cliente `cliente@e2e.local` no tiene historial: la contraentrega nace en `validando`
(ver [trampas](trampas.md#seed-e2e-clean-rompe-happy-path-order)). Si ya tiene una entrega, nace en `pending_acceptance`; el
script resuelve ambos caminos. Un cliente solo puede tener un pedido activo por negocio: si un pedido queda atascado, usa
`--customer-email cliente2@e2e.local` o repite el reset.

Opciones: `--scenario contraentrega|prepago|all`, `--api-url`, `--supabase-url`, `--anon-key` (o
`TINDIVO_E2E_ANON_KEY`; en local sale de `apps/api/.env.local`), `--credentials <cuentas.md>`, `--customer-email`,
`--prep-minutes`, `--check-events` (solo local: lee `domain_events` con la service role de `apps/api/.env.local`).
Termina con `PASS`/`FAIL` y código de salida 0/1 (2 si una guardia lo impide).

## Staging (`tindivo-dev`)

Solo con `--staging` y el `cuentas.md` más reciente que escribe `pnpm db:seed:staging`
([deploy.md §10](deploy.md#10-staging-tindivo-dev-tú)). El seed rota las contraseñas: usa la carpeta
`staging-credenciales-<fecha>` más reciente de `C:\Users\<usuario>\tindivo-secretos`.

```bash
node scripts/e2e/flujo-completo.ts --staging \
  --supabase-url https://jgziumvrtogguljhpdos.supabase.co \
  --api-url https://tindivo-api-staging.vercel.app/api/v1 \
  --anon-key "$TINDIVO_E2E_ANON_KEY" \
  --credentials "C:/Users/<usuario>/tindivo-secretos/staging-credenciales-<fecha>/cuentas.md"
```

Staging no tiene Inngest: los pedidos se crean y avanzan, pero las automatizaciones temporales (timeouts, avisos) no
corren. Cada corrida deja pedidos entregados en `tindivo-dev`; no hace falta limpiarlos.

## Guardias

- Se niega a correr si la URL de Supabase o de la API contiene `zpnipajgwfthxhdtzhly` (`tindivo-prod`).
- Una URL remota que no sea `jgziumvrtogguljhpdos.supabase.co` se rechaza; esa exige `--staging`.
- `--check-events` y la service role no se aceptan contra una base remota.
- No imprime contraseñas ni tokens (se enmascaran en cualquier mensaje de error).
