# 00 · Para retomar el trabajo en una sesión nueva

> **v1.0 · 2026-09-19.** Este archivo existe porque la sesión donde se diseñó el servicio se abrió desde **otro repo** (Mahes), y la memoria de Claude está ligada a la carpeta desde donde se abre. **Una sesión abierta en este repo no verá esa memoria.** Todo lo importante está aquí.
>
> **Actualización 2026-09-22 (de madrugada):** el backend completo y el lado
> cliente ya están CONSTRUIDOS. La fuente de verdad de lo que se hizo, con qué
> nombres y qué falta es `DECISIONS.md §31` — este archivo (y el resto de esta
> carpeta) queda como historia del diseño, no como estado actual. En resumen:
> ganaron los nombres del spec v1 (`courier_orders`/`directory_businesses`, NO
> `courier_requests`/`catalog_places` de `03-plan-tecnico.md`, ver abajo); se
> construyó migración+RPC+contracts+core con TDD, las rutas de cliente en
> `apps/api`, y el flujo completo en `apps/customer/features/courier/`
> (pedir, seguir, directorio en `/entregas` con lista Y mapa de pines
> tocables, badge de "Pedidos" y banner del home reflejando una entrega en
> curso). **No** se tocó `apps/motorizados`/`apps/admin` (fase siguiente).
> Probado con 22 tests de integración de RPC, unitarios de
> `packages/core`/`contracts`/`apps/customer`, y tres e2e de Playwright de
> punta a punta — todo verde. La migración `0232`/`0233` ya
> está en `tindivo-prod`.

## Estado en una frase

**Tindivo Entregas** (nombre técnico `courier`) tiene su **lado cliente construido y probado** (ver arriba); el lado motorizado/admin sigue sin construir. Esta sección y las que siguen describen el estado de diseño de la sesión del 19-sep — histórico, no vigente donde `DECISIONS.md §31` diga otra cosa.

## Qué es

Tindivo **recoge algo que ya está pedido, pagado y listo** en un punto A y **lo lleva** a un punto B dentro de San Jacinto, por **S/ 3**. Bajada: *«Recogemos lo que ya pagaste y lo llevamos.»* Sirve para llenar los días flojos y se apoya en un **directorio de negocios** cargado a mano. No compra nada, no es «recojo en tienda».

## Orden de lectura

1. `README.md` (resumen en diez líneas) → 2. **`04-decisiones-abiertas.md`** (lo decidido) → 3. `01` flujo · `02` dinero · `05` qué se lleva · `03` técnico · `08` UX · `06` backlog → 4. `../Home/README.md`.
`origen-jesus-v2/` son **los documentos de Jesús, versión vigente** (incluye el brief del afiche). `09` explica cómo se llegó aquí. `07`, `origen-jesus/` y `historico-pre-v2/` son **historia**.

## Lo decidido (resumen; el registro completo está en `04`)

- **Nombre:** «Tindivo Entregas» (con la bajada siempre visible). Nunca «recojo», «encargos» ni «mandado» hacia el usuario.
- **Precio:** S/ 3 fijo («desde S/ 3»); por distancia más adelante; se guarda `distance_m` desde el primer pedido.
- **Quién paga:** negocio → quien recibe; persona → el cliente elige. El artículo no cambia de manos hasta cobrar.
- **Dinero:** cobra **solo el transporte** el motorizado (efectivo exacto o su Yape personal) y queda **en deuda con Tindivo**; rinde **a diario**.
- **Sin recargos.** Espera 5 min y se cancela sin cobrar. **15 min** para aceptar (configurable). Soltar: el reloj no se reinicia. **1 pedido activo por teléfono.**
- **Horario** 6–11 pm todos los días; **solo San Jacinto**. **1 motorizado lun–vie, 2 sáb–dom.** Se pausa solo sin motorizado.
- **5 kg**, sin foto, frágil marcable. **Alcohol:** regla escrita, sin control. **Medicinas:** sí, sellada, sin controladas.
- **Panel único** del motorizado, con entregas en **azul**; restaurantes primero. Aliados **naranja**, otros negocios gris, moto azul.
- **El mapa es lo principal** de la pantalla de pedido. Pedir en **dos toques** desde cualquier sitio (`08`).
- **Directorio:** a mano, con logo, nota interna y pública; los negocios con perfil en Tindivo no se cargan dos veces.
- **Tabla propia** `courier_requests`, no `orders`.

## Lo que sigue pendiente

- **Confirmar con Jesús:** que el nombre técnico sea `courier` (asumido); quién recibe las rendiciones y si la cuenta de Tindivo es de negocio.
- **Fuera del software (de Jesús):** comprobar las condiciones de **Yape** para una cuenta personal con muchos cobros; **proteger las botellas**; **cargar el QR/Yape de cada motorizado**; revisión legal del texto y de medicinas; preguntar en la **Municipalidad** por el alcohol; **medir** grifo → centro (5–10 km); número de **WhatsApp de consultas**; **prueba de 5 segundos** del nombre **antes de imprimir el afiche**; artes.
- **No comprobado por mí:** los términos completos de inDrive.Entregas; la normativa peruana de medicinas para un mensajero; las condiciones de Yape; `apps/api/lib/pilot/gate.ts`.

## Lo que se leyó del repo (para no releerlo)

- `orders.business_id` es `NOT NULL` y **ocho** funciones escriben `orders.status`: por eso, tabla propia.
- **«Recojo»** aparece **126 veces en 26 archivos** de `apps/customer` para el *recojo en tienda*: por eso ese nombre no sirve, ni público ni técnico.
- El motorizado **no tiene método de cobro propio** (`drivers` sin columnas de Yape; `yape-qr.tsx` muestra el QR del restaurante): hay que construir `driver_payment_qrs` (patrón `0184`).
- `cash_settlements` asume un negocio como contraparte: **no se reutiliza**.
- **Haversine** ya existe dos veces (`apps/customer/lib/coverage.ts`, `apps/motorizados/lib/geo.ts`); Leaflet 1.9.4 trae `distanceTo`; **no** traza rutas.
- **Polígono de cobertura sembrado (`0045`) no es fiable:** centrado ~25 km al oeste del San Jacinto real (`apps/admin/.../mapa-referencias` usa -9.1465, -78.2779).
- **`map_landmarks`** (`0208`/`0214`) es el patrón del directorio; los negocios `catalog_only` ya existen y aparecen en el home.
- **App del motorizado:** pestañas `available-tab` / `mine-tab` / `team-tab`, `order-card`, `hooks/use-driver-orders.ts`; `release-sheet` para soltar. **App del cliente:** `HomeShell` solo conoce restaurantes; `lib/active-orders.ts` cuenta solo `orders` (alimenta `BottomNav`, banner, ficha del negocio y `/cuenta`); reutilizar `map-picker.tsx`, `location-sheet.tsx`, `lib/geolocation.ts`.
- El `customer` carga Material Symbols completo; `motorizados` y `negocios` tienen **subset cerrado** (`icons.txt`), sin `package_2`.
- Plazos desde `app_settings.timers` (`DECISIONS §10`); aceptación del negocio 8 min (`0186`). Siguiente migración libre: **`0229`** (comprobar).

## Siguiente paso

1. **Diseño en Claude Design** de la hoja de pedido (mapa principal), el directorio (lista y mapa) y el home tipo Rappi, con los tokens de `packages/ui/src/theme.css` (`DECISIONS §16`). Jesús traerá la **imagen de referencia del home de Rappi**. *(Sugerencia: `Artifact` con `action: "quickstart"`, `intent: "design"`.)* **Aprobación del diseño antes de programar.**
2. **`DECISIONS.md §29`** con lo decidido y notas en §4 y §7 (`«Tindivo no retiene fondos»`).
3. **Fase 1** (`03` §8): migración, contratos Zod, RPC y tests, con aprobación en cada hito.

## Reglas del repo que no se olvidan

Leer `DECISIONS.md` antes de tocar nada · commits **en español con tilde**, desde fichero UTF-8 (`git commit -F`) · migraciones **solo por CLI de Supabase** · RLS en todas las tablas · el plazo sale de `app_settings` · `pnpm graphify:update` tras cambiar código · **código y base de datos en inglés**.
