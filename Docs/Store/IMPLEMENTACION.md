# Tindivo Store — implementación (entrega)

Rama `feat/store` (sale de `perf/mapa-zoom-fluido`, **no de `main`**: `main` va 40 commits
por detrás y le faltan las migraciones 0232–0241, que ya están en producción).

Fuentes: `tindivo-store-prd-v2.md` (manda), `Tindivo_Store_Prompt_Maestro_Desarrollo_FullStack.md`
y el diseño «Tindivo Store v4» (comprador) / «v2» (funcionalidad del admin) de claude-design.

## 1. Qué hay

| Capa | Dónde | Qué |
| --- | --- | --- |
| Base | `supabase/migrations/0242`–`0245` | Tablas, RLS, triggers de invariantes, bucket, RPC de listado y métricas |
| Contratos | `packages/contracts/src/store.ts` | Reglas puras (descuento, insignia, qué falta para publicar, transiciones, mensajes de WhatsApp, texto para redes) y esquemas Zod |
| API pública | `apps/api/app/api/v1/public/store/**` | Listado, detalle por slug (+relacionados), eventos |
| API admin | `apps/api/app/api/v1/admin/store/**` | Lista+métricas, CRUD, estado (con anterior para Deshacer), fotos, duplicar, ajustes, categorías |
| Comprador | `apps/customer/app/store/**`, `features/store/**` | `/store`, `/store/[slug]`, visor, OG, JSON-LD, sitemap |
| Admin | `apps/admin/app/store/**`, `components/store/**` | `/store` (lista), `/store/nuevo`, `/store/[id]`, `/store/ajustes` |
| Imágenes | `packages/images` | Perfiles `store` (1080) y `store-thumb` (600) |

### Migraciones
- **0242** `store_categories`, `store_products`, `store_product_images`, `store_events`; RLS en las 4;
  triggers (borrador al nacer, ≤6 fotos, ≥1 foto para publicar, slug fijo al publicar, `sold_at`
  coherente, código inmutable); bucket `store-products`; `list_store_products`, `list_store_sold`;
  clave `store` en `app_settings`.
- **0243** `published_at`, `store_event_counts()`, `store_metrics()`.
- **0244** `reorder_store_images()` (reordenar en una sola transacción).
- **0245** `list_store_sold` con las mismas columnas que la grilla.

### Variables de entorno nuevas
- `NEXT_PUBLIC_CUSTOMER_URL` (apps/admin) — sitio donde viven los links que se copian.
  Por defecto `https://www.tindivo.com`. Local: `http://localhost:3000`.
- Ninguna otra. `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_APP_URL` ya existían.

## 2. Cómo ejecutar y probar

```bash
supabase migration up --local     # aplica 0242–0245 a la base LOCAL
pnpm dev                          # api :3001, customer :3000, admin :3003 …
```

- Comprador: `http://localhost:3000/store`
- Admin: `http://localhost:3003/store` (login `admin@e2e.local`, cuenta del seed e2e)

```bash
# contratos y reglas
cd packages/contracts && npx vitest run                       # 59 de Store
# API por la capa HTTP, contra la base local (40 casos)
cd apps/api && npx vitest run lib/__tests__/store.integration.test.ts
# navegador a 390 px (17 + 17 casos). Con el stack local arriba:
npx playwright test e2e/store.spec.ts e2e/store-admin.spec.ts --project=chromium --no-deps
```

> Los tests de navegador siembran sus propios artículos (`ZZ Test Store …`) y los borran.
> `--no-deps` se salta el precalentado: la primera ruta de cada app compila en frío (hasta ~15 s).

## 3. Decisiones técnicas
- **Nombres en inglés** en base y código (convención del repo); UI en español. La URL del comprador
  (`?categoria=ropa&condicion=segunda&orden=precio_asc`) va en español a propósito: se comparte.
- **Sin Server Actions**: REST en `apps/api`, como el resto. Las tablas **no tienen lectura anónima**;
  el público entra por la API (RPC solo `service_role`), igual que `search_catalog`.
- **Los invariantes viven en la base**, no solo en la API: el admin escribe desde un celular con red mala.
- **Portada = la foto de menor posición.** Sin `is_cover` ni «solo una portada».
- **Slug al publicar**, nunca al crear el borrador (no hay título aún) y no cambia después.
- **Parámetros** (WhatsApp, delivery) en `app_settings.store`, no en tabla nueva.
- **Estilo v4 acotado a `/store`** (`.st-root`, prefijo `st-`). El resto del customer no se toca.
  El admin usa `as-*` por lo mismo, y evita los botones con `bg-*` que vigila `check:ds`.
- **Fotos**: se comprimen en el celular (detalle ~1080 px y miniatura 600 px) y se suben con la
  sesión del admin. La miniatura no se recorta: la grilla la pinta 1:1 con `object-position` según
  el punto central que elige Jesús.
- **Open Graph como PNG**: las fotos son WebP y WhatsApp/Satori no las renderizan bien; se
  transcodifican por el optimizador de Next (mismo patrón que la tarjeta de restaurantes).
- **404 reales**: `loading.tsx` solo cubre el listado (grupo `(list)`); si cubriera el detalle, el
  streaming enviaría 200 antes de que `notFound()` pudiera fijar el 404.
- **Caché**: el listado y el detalle del servidor se cachean 15 s (stale-while-revalidate).

## 4. Desviaciones del prompt / del PRD (a propósito)
- Rutas del admin: `/store`, `/store/nuevo`, `/store/[id]`, `/store/ajustes` (no `/admin/store`):
  el admin ya es su propia app/subdominio.
- Texto para redes: «Entrega en San Jacinto, pagas al recibir» en vez de «Te la llevo…»: no hay
  forma fiable de acertar el género del artículo.
- Eventos del PRD v2 (`filter_apply`, `click_notify`), no los del prompt maestro (v1).
- Sin `destacado` (el PRD v2 lo elimina).
- El paso 7 del flujo de venta (registrar la entrega en el sistema de pedidos) queda manual, como en el PRD.
- Hero con tres círculos de iconos en lugar de recortes de producto: las fotos del diseño son de
  Wikimedia con licencias que obligan a atribución. Cuando haya fotos propias recortadas se cambia
  `StoreHero` (`features/store/components/store-chrome.tsx`).

## 5. Limitaciones conocidas
- Falta **un enlace a `/store` desde el home** de tindivo.com (no se tocó: el home está bloqueado
  a la espera de otro rediseño). El tráfico entra por los links de Facebook/WhatsApp.
- Los tipos de las tablas de Store aún no están en `database.types.ts` (se regeneran contra el
  remoto tras el push); `apps/api/lib/store/store.ts` usa un cliente sin tipos. Tras `pnpm db:types`
  se puede apretar esa capa.
- Reordenar fotos: flechas (táctil) y arrastrar (escritorio). No hay arrastre táctil.
- Zoom del visor: doble toque y pellizco del navegador; sin paneo con inercia.
- Volver conserva filtros por la URL; la posición exacta del scroll queda a cargo del navegador.
- Reserva de 24 h manual (no hay cron), como pide el PRD.
- Los borradores abandonados no se limpian solos (PRD §3: «después del lanzamiento»).

## 6. Pasos manuales de despliegue (en este orden)
1. **Mergear `perf/mapa-zoom-fluido` antes que `feat/store`** (o rebasar sobre `develop`).
2. `supabase migration list` y comprobar que 0242–0245 están libres en remoto.
3. `supabase db push` — **fuera del horario de pedidos**: `tindivo-prod` es operación real. Todo es aditivo.
4. `pnpm db:types` y revisar `get_advisors` (RLS de las 4 tablas nuevas).
5. `pnpm check:deploy` en verde.
6. Desplegar `apps/api`, luego `customer` y `admin`.
7. En el admin: añadir `NEXT_PUBLIC_CUSTOMER_URL=https://www.tindivo.com`.
8. Probar en prod con un artículo real: publicar → ver `/store/<slug>` → pegar el link en WhatsApp
   (comprobar la vista previa) → tocar el botón → comprobar el evento en el resumen.
9. Revisar el WhatsApp y el delivery en **Tienda → ajustes** (por defecto 51906550166 y S/2.00–2.50).

## 7. Checklist de aceptación (PRD §12 y prompt §46)
Ver el estado actual en `Docs/Store/ACEPTACION.md`.
