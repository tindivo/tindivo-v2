# supabase/ — reglas para migraciones y SQL

Se suman a las del `AGENTS.md` raíz. Aplican a todo lo que esté en `supabase/` y a cualquier consulta contra una base.

## Dos bases: declara siempre contra cuál

- **Local:** `127.0.0.1:54321` (Postgres en `54322`). Es donde apuntan los `.env.local` y donde corren las apps.
  Sus contenedores se llaman `supabase_db_zpnipajgwfthxhdtzhly`, con el ref del remoto: no te confundas.
- **Remota:** `zpnipajgwfthxhdtzhly`, nombre real **`tindivo-prod`**. Es **operación real**: solo cambios aditivos,
  `db push` antes de desplegar las apps y fuera del horario de pedidos.
- `psjigdoinfpgrnedxeyf` (el viejo «Web v2») está **abandonado**: nunca lo uses en un comando, script, env o config.
- El MCP de Supabase sirve para **leer** el remoto (consultas, advisors). Nunca para aplicar migraciones.

## Migraciones

- **Inmutables.** Nunca edites una migración ya aplicada. Todo cambio de esquema es una migración nueva, numerada
  `NNNN_`. Si crees que una aplicada está mal, para y repórtalo.
- **Antes de crear una:** `supabase migration list` para ver el primer número libre. Un plan escrito se desactualiza
  en cuanto se aplica algo, y dos sesiones pueden coger el mismo número.
- **Se aplican SOLO con el CLI**: `supabase migration up` o `db reset` en local, `supabase db push` en remoto.
  Cada una de las otras vías ya rompió algo distinto:

  | Vía | Qué rompió |
  |---|---|
  | MCP `apply_migration` | La registra con versión por **timestamp** en vez del número del repo; el CLI la ve fuera de orden y exige `--include-all` |
  | Editor SQL del panel | Aplica el código pero **no registra nada** en `schema_migrations`: el historial miente |
  | `docker cp` + `psql -f` | **Corrompe los acentos**: `dirección` acabó como `direcci??n` en 54 mensajes que ve el cliente |

- **Después de cada migración:** `pnpm db:types` (lee el remoto, así que **después** del push) y revisa los advisors.

## Redefinir una función: comprueba que reemplaza, no que duplica

Antes de aplicarla al remoto:

1. **Una sola fila:** `select oid, pg_get_function_arguments(oid) from pg_proc where proname = '<nombre>';`. Si hay
   más de una, creaste una sobrecarga: los parámetros no coinciden en orden, nombre o tipo con la firma viva.
2. **Al menos una llamada real por HTTP**, no por RPC directa: PostgREST resuelve sobrecargas por nombre de parámetro
   y falla con **PGRST203** donde la llamada directa funciona. Type-check y tests unitarios en verde no lo detectan.

Precedente: la `0114` duplicó `advance_order` en local y en producción, y PostgREST dejó de resolver toda
transición de pedido.

## Permisos de una función nueva o recreada

`REVOKE … FROM PUBLIC` no basta: los default privileges de Supabase dejan `EXECUTE` para `anon` y `authenticated`.
Revoca a cada rol que no deba llamarla y verifica `proacl` después.

## Fechas

`current_date` es **UTC**. De 19:00 a medianoche, hora de Lima, ya es el día siguiente: justo cuando opera Tindivo.
Usa `(now() at time zone 'America/Lima')::date`. Ya escondió un pedido entregado a las 20:00 de la liquidación de su día.

## Base local y tests

- La suite de `apps/api` es de **integración** contra la base local, y borra y siembra fixtures. Usa siempre el
  candado: `pnpm db:cycle` (reset → `db:seed:e2e` → tests) o `pnpm db:lock run -- "<comando>"`.
- **`supabase db reset` borra el mundo e2e y no lo repone** (no hay `seed.sql`): después, `pnpm db:seed:e2e`. Sin eso,
  los tests fallan en masa con errores que apuntan a otro sitio (`seed orders failed`, FK de `business_id`).
- Para comparar funciones entre dos bases, normaliza comentarios y espacios antes de hashear
  (`regexp_replace(prosrc, '--[^\n]*', '', 'g')` y `'\s+'` → `' '`): si no, un comentario da un falso positivo.

## `delivered` es terminal (detalle del invariante 8)

Verificado contra las 8 funciones que escriben `orders.status` (`advance_order`, `expire_order`,
`apply_order_transfer`, `cancel_customer_order`, `cancel_expired_prepay_orders`, `extend_order_prep`,
`validate_order`, `create_customer_order`) y el único `.update()` directo del API (`prepay-proof/route.ts`, que exige
`awaiting_payment`): **ninguna saca un pedido de `delivered`.** Por eso la rama de reversión de
`generate_delivery_charges` es código inalcanzable. Desde la `0124`, `balance_due` lo deriva
`trg_business_charges_recalc_balance`, así que el `DELETE` de cargos `pending` de esa rama ya no descuadra el saldo.
Si alguna vez se abre un camino para salir de `delivered`, esa rama pasa a ejecutarse: **repásala entera antes**,
empezando por los cargos que ya no están en `pending` y que el `DELETE` no toca.
