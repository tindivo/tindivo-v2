# Cola de lotes

> La sesión de trabajo toma de aquí **el primer lote A desbloqueado**, de arriba abajo. Al cerrar un lote se marca
> `[x]` con el commit o PR y se anota en la bitácora del día (`bitacora/AAAA-MM-DD.md`). Las reglas son las de
> [`plan-diario.md`](plan-diario.md) §2; el detalle de cada lote, en su §4.

Estados: `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[!]` bloqueado (con quién o qué lo desbloquea).

> **Prioridad desde el 2026-10-09 (Jesús):** customer móvil → Negocios Android → mudanza al VPS. Hay dos carriles:
> el **móvil** (contrato REST y rutas aditivas, que se despliegan en Vercel en cuanto cierre el paso 0) es el
> principal, y la **mudanza** (Fases 2 y 3 de `plan-diario.md`) espera detrás. Sustituye a `D-35` (Negocios
> primero) y a la regla de la Fase 4 que esperaba a la mudanza para desplegar.

## Fase 0 · Cimientos

- [x] **P0.1** · Commit de `Docs/arquitectura/`, `Docs/plan-migraciones/`, esta cola y la bitácora — aprobado por Jesús el 2026-10-09
- [x] **P0.2** · Inventario de rojos heredados: **ninguno**. `lint` 0 errores (37 avisos), `check:ds` verde, `type-check` 12/12 y 1 063 tests de 10 paquetes, todo con `Cached: 0` (bitácora del 2026-10-09). La suite de `@tindivo/api` se mide en P0.3
- [x] **P0.4** · Entorno autónomo: bloqueos de §2.2 en `.claude/settings.json`, candado de la base local (`pnpm db:cycle`, `pnpm db:lock status`) y `.env.local` revisados: solo claves locales — rama `chore/p0-entorno-autonomo`
- [x] **P0.3** · Job de integración en CI (`api-integration` en `.github/workflows/ci.yml`): Supabase CLI fijada, `supabase start` desde las migraciones, `db:seed:e2e` y la suite de la API con `--force`. Visto correr en el PR #9: 40 ficheros en verde (2026-10-10). Que sea obligatorio para mergear se marca en la protección de rama de GitHub (nivel C, **Jesús**)
- [x] **MV1** · *(carril móvil, adelantado)* Expediente de tiendas: [`07-publicacion-tiendas.md`](../customer_app_migration/07-publicacion-tiendas.md) — camino crítico, causas de rechazo, lo que le falta a la política (con borrador), inventario de datos medido en prod, diseño del borrado y de la cuenta de revisión, nota al revisor y ficha. Abre D-44…D-47 — rama `docs/mv1-expediente-tiendas`
- [!] **P0.5** · Copia de prod fuera del PC — **Jesús**: dónde se guarda, y presencia para sacarla (nivel B + C)
- [!] **P0.6** · Restauración aislada y conciliación — espera a P0.5
- [ ] **P0.7** · Recorrido e2e real del comprobante (sin `UPDATE` simulado)
- [ ] **CI-1** · *(lote menor)* Runner fijado a `ubuntu-24.04` antes de que `ubuntu-latest` pase a Ubuntu 26 (2026-10-19) y acciones sobre Node 24 (checkout, setup-node y upload-artifact v7, pnpm v6, setup-cli v3) — PR #14, CI verde y sin avisos. Se marca hecho al mergear

## Fase 1 · Paso 0

- [!] **C1** · Revocar `expire_courier_orders()` a clientes — escribir y probar en local es A; desplegar espera a P0.5 y a Jesús
- [ ] **C2** · Comprobante (a): `UPDATE` condicionado y 409
- [ ] **C3a-d** · Comprobante (b), transaccional
- [ ] **C4a-d** · Idempotencia (c)
- [ ] **C5** · Límites del bucket `payment-proofs`: JPEG, PNG, WebP y HEIC/HEIF, 15 MB (`D-40`, delegada por Jesús el 2026-10-09). Los 15 MB son el `MAX_INPUT_BYTES` que la app ya aplica, así que nadie que hoy pueda pagar deja de poder hacerlo; en prod, el comprobante más pesado de 56 mide 1,4 MB
- [!] **C6** · Despliegue de C2-C5 — nivel B
- [!] **C7** · Una semana de observación

## Carril móvil · customer

Orden de `../customer_app_migration/debate-rest/conclusion.md` §3. El primer build Android entra a la prueba cerrada
de Google Play en cuanto sea usable contra producción (solo lectura), para que los 14 días de los 12 testers corran
mientras se construye el resto.

- [x] **MV2a** · OpenAPI: registro de las 27 operaciones del cliente en `packages/contracts/src/openapi`, documento 3.0.3 generado desde Zod (`packages/contracts/openapi/v1.json`, servido en `GET /api/v1/openapi.json`), test de cobertura contra las rutas del disco y respuestas descritas de `health`, `schedule`, `search`, `courier/status` y `pilot-access` — rama `feat/mv2a-openapi`
- [x] **MV2b** · Las 21 respuestas descritas: ya no queda ninguna `x-tindivo-pending`. Cuerpos de petición en `@tindivo/contracts` y prueba de conformidad de las 27 operaciones en `api-integration` (41 ficheros y 440 tests en verde). En su primera corrida destapó dos errores del contrato: `Idempotency-Key` es un UUID obligatorio y `courier.hours.days` es opcional — PR #13, apilado sobre #12
- [ ] **MV2c** · Modelos generados desde el OpenAPI que compilan en Kotlin (runner Linux) y en Swift (runner macOS: cuesta 10 veces más minutos; decidir si en cada PR o a diario)
- [ ] **MV3** · Compatibilidad: cabeceras de plataforma y build, `GET /config`, versión mínima por app y plataforma (paso 2)
- [ ] **MV4** · Rutas del primer build: catálogo y horarios por REST, perfil, direcciones atómicas, `quote` (paso 3; necesita `D-39`)
- [ ] **MV5** · Lo que exige la revisión: borrado de cuenta (en la app y en una página web), Sign in with Apple en Auth, cuenta y negocio de demostración para el revisor
- [!] **MV6** · Staging en el proyecto de Supabase vacío de Jesús (H7) — crearlo y aplicarle migraciones es nivel B

## Lo que espera a Jesús

1. **P0.5** · Dónde guardar la copia de producción fuera del PC.
2. **Cuentas** · Apple Developer (US$ 99/año) y Google Play (US$ 25, un pago). La verificación de Google puede tardar días.
3. **Testers** · 15-16 personas con Gmail y Android que vayan a usar la app (el mínimo es 12 durante 14 días seguidos).
4. **Mac** · Confirmar macOS Sequoia 15.6+ o Tahoe 26.2+ (Xcode 26 es obligatorio desde el 2026-04-28).
5. **Contacto** · Correo de soporte y dónde vivirán la política de privacidad y los términos.
6. **MV6** · El ref del proyecto vacío, para montar staging contigo.
7. **D-39** · Dinero como cadena (`"12.50"`) en los campos nuevos.
8. **D-44…D-47** · Qué se conserva al borrar una cuenta, cómo accede el revisor, edad mínima y versiones mínimas de sistema (`07-publicacion-tiendas.md` §11).
9. **H8** · Presupuesto del VPS de ensayo — pospuesto: la mudanza va después del móvil.
