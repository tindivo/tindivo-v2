# 00 · Para retomar el trabajo en una sesión nueva

> 2026-09-19. Este archivo existe porque la sesión donde se diseñó Encargos se abrió desde **otro repo** (Mahes), y la memoria de Claude está ligada a la carpeta desde donde se abre. **Una sesión abierta en este repo no verá esa memoria.** Todo lo importante está aquí y en los documentos vecinos.

## ⚠️⚠️ Lo MÁS reciente: segunda versión de los documentos de Jesús

Jesús pasó una **versión 2** (`origen-jesus-v2/`, con un nuevo **brief de publicidad**) y pidió **primero un análisis**, antes de actualizar nada. Está en **`09-analisis-documentos-v2.md`**: **léelo primero.** Lo esencial: casi todo son mejoras (sin recargos, sin foto, 5 min de espera, quién paga, horario 6–11 pm, peso 5 kg, nombre **«Tindivo Recoge y Lleva»**); hay **contradicciones** con lo que Jesús dijo en el chat (10 vs 15 min, 2 vs 1 pedidos activos, rojo vs naranja, alcohol, y él propone ahora **«Tindivo Courier»**); y `01`–`08` **aún no se han actualizado** a v2. **Hasta que Jesús decida las 9 preguntas de `09` §8, no diseñar ni programar.**

## ⚠️ Antes: documentos de «Recojo» de Jesús (versión 1)

Jesús aportó seis documentos (`origen-jesus/`) con un **objetivo de negocio** (llenar lunes–jueves, punto de equilibrio ~10 viajes/noche), un **catálogo de negocios** como canal de adquisición, hora de listo, espera y cancelación. **Léelos junto con `07-integracion-recojo.md`**, que los compara con todo lo demás y propone qué hacer con cada discrepancia. **Donde discrepen, manda `07`**, y varias decisiones de abajo están **en revisión** (nombre «Encargos» vs «Recojo» —choca con «Recojo en tienda», que ya existe—, precio, alcohol, cuándo se paga).

## Estado en una frase

Encargos está **diseñado y sin construir**: no hay código, ni migraciones, ni cambios en `DECISIONS.md`. Solo existen los documentos de `docs/Encargos/` y `docs/Home/`.

## Orden de lectura

1. `README.md` — qué es y resumen en diez líneas.
2. `04-decisiones-abiertas.md` — **qué está cerrado y qué se asume por defecto**.
3. `01` (flujo) · `02` (dinero) · `05` (qué se puede llevar) · `03` (plan técnico) · `06` (backlog).
4. `../Home/README.md` — el home nuevo tipo Rappi.

## Lo cerrado por Jesús

- **Recojo y entrega, sin compras.** Vende Tindivo; no hay restaurante ni cajera.
- **S/ 3 fijo al lanzar; por distancia más adelante.** Se guarda `distance_m` (Haversine, en el servidor) desde el primer encargo. El corte en km se decidirá con datos: Jesús calcula que grifo → centro son 5–10 km y **lo va a medir**; el polígono sembrado del repo **no sirve** para calibrarlo (`07` §2).
- A y B **dentro del polígono de cobertura**; no hay caseríos.
- El motorizado ve **toda la información al aceptar**, en una tarjeta de resumen; puede **soltar** un encargo aceptado (se acuerda hablando entre el equipo). Los encargos se distinguen con **un azul vibrante propio** (restaurantes = naranja).
- **Calificaciones en los dos sentidos** y **foto del motorizado al entregar**: **backlog** (`06` B-12, B-13), **sin descartarlas**.
- Un cliente puede tener **a la vez un encargo y un pedido a un restaurante**; «Pedidos» los lista juntos.
- **El cliente elige cuándo paga**: al recoger o al entregar (por defecto, al entregar). **El artículo no cambia de manos hasta cobrar.**
- **Todo el dinero pasa por el motorizado** (efectivo exacto o **su Yape personal**). Él debe a Tindivo el precio de cada encargo entregado y **rinde a diario** al admin. **Jesús precarga el QR/Yape de cada motorizado.**
- El cliente **escribe A y B**, con selector **«que me traigan / que lleven algo»**, y **el mapa es la parte principal** de la pantalla (con «usar mi ubicación actual» y una línea recta punteada A–B; Leaflet no traza rutas y no hace falta).
- **Categorías permitidas** (sin «Otro»); mochila **45×45×45 cm**; **5 kg**; valor hasta **S/ 200**; sin efectivo; joyas no se mencionan.
- **Medicinas sí** (compartimento aislado; sin controladas; sin refrigeración especial). **Una sola categoría «Bebidas»**: el alcohol no se anuncia aparte ni lleva casilla de mayor de edad; nada de cajas (5 kg y mochila).
- **Línea recta punteada** entre A y B en el mapa para empezar (no es una ruta real).
- Un motorizado **puede tener varios encargos activos** (solo aviso). **Sin avisos al admin** por ahora: el panel del admin se trabaja después.
- **Solicitud caduca a los 15 min.**
- **Un solo panel** en la app del motorizado: encargos y pedidos juntos, **etiquetados** («ENCARGO», color propio, sin franja de papelito).
- **Solo de noche** en la prueba. **Máx. 2 motorizados: sábado y domingo 2, lunes a viernes 1.**
- Diseño del home en **Claude Design**.
- Subir la oferta de 0.50 en 0.50: **backlog**. Tabla propia `errands`, no `orders`.

## Se asume por defecto (Jesús no lo ha rebatido)

| ID | Qué |
|---|---|
| D-24 | Alcohol **sin pantalla extra**: los términos lo cubren y el motorizado puede negarse a entregar a un menor evidente |
| D-27 | Horario = horario de la plataforma (≈ 18:00–23:00) |
| D-28 | Visible solo para una **lista de prueba**; interruptor `errands.enabled` apagado por defecto |
| D-16b | Rendición en efectivo o Yape a una cuenta **de negocio** de Tindivo; recibe el admin |
| P-9 | Al soltar un encargo, el reloj de 15 min **se reinicia** |
| P-4 | Hay dos notas: **indicaciones del cliente** (las ve el motorizado) y **notas del motorizado** (internas) |
| P-11 | **Un solo encargo activo por cliente** |
| P-5, P-12, P-13 | Ver `04` |
| D-10, D-11, D-13, D-21, D-09 | Ver `04` |

## Lo que **no** se pudo comprobar

- **Términos completos de inDrive.Entregas:** no cargaron. Solo se leyó su página de Perú (alcohol, tabaco, medicinas, joyas y armas no permitidos; máx. 10 kg en moto; US$ 100).
- **Normativa peruana de medicinas y mensajería** (DIGEMID): se halló la de farmacias y operadores logísticos, **no** una para un mensajero que lleva algo ya dispensado. Recomendada revisión legal.
- **Condiciones de Yape** para una cuenta personal que recibe muchos cobros: no verificado.
- **El gate del piloto del API** (`apps/api/lib/pilot/gate.ts`): no se abrió.

## Pendientes de Jesús fuera del software

Proteger las botellas (acolchado) · cargar el QR/Yape de cada motorizado · revisión legal del texto · comprobar Yape · artes de la tarjeta de Encargos y del banner · **la imagen de referencia del home de Rappi**.

## Lo que se leyó del repo (para no releerlo)

- `orders.business_id` es `NOT NULL` y **ocho** funciones escriben `orders.status`: por eso, tabla propia.
- El motorizado **no tiene método de cobro propio** (`drivers` sin columnas de Yape; `yape-qr.tsx` muestra el QR del restaurante). Hay que construirlo (`driver_payment_qrs`, patrón `0184`).
- `cash_settlements` asume un negocio como contraparte: **no se reutiliza**.
- **Haversine** ya existe dos veces (`apps/customer/lib/coverage.ts`, `apps/motorizados/lib/geo.ts`); Leaflet 1.9.4 trae `distanceTo`; **no** calcula rutas.
- **App del motorizado:** el home tiene pestañas `available-tab` / `mine-tab` / `team-tab`, con `order-card` y `hooks/use-driver-orders.ts`. Hay que añadir el tipo unión `kind: 'order' | 'errand'` y una `errand-card`.
- **App del cliente:** el home (`HomeShell`) solo conoce restaurantes. `lib/active-orders.ts` cuenta solo `orders` y alimenta `BottomNav`, el banner del home, la ficha del negocio y `/cuenta`: **hay que sumarle los encargos** sin romper el bloqueo «un pedido activo por restaurante». Reutilizar `map-picker.tsx`, `location-sheet.tsx` y `lib/geolocation.ts`.
- El `customer` carga Material Symbols completo; `motorizados` y `negocios` tienen subset cerrado (`icons.txt`), y allí **no existe `package_2`**.
- Los plazos salen de `app_settings.timers` (`DECISIONS §10`); la aceptación del negocio es de 8 min (`0186`). La siguiente migración libre era la **`0229`** (comprobar con `supabase migration list`).

## Siguiente paso

1. Los documentos de Jesús ya están integrados (`07`). Falta cerrar el **nombre para el cliente** (`08` §11.1: favorito «Te lo llevamos», Jesús busca algo más fácil) y las **notas del directorio** (`04` P-14). Lo demás está decidido.
2. **El UX manda** (`08`): Jesús insistió en que pedir tiene que ser facilísimo **desde todos lados**. **El directorio todavía no existe**: hay que **cargarlo negocio por negocio**, con logo, notas y toda la información (`origen-jesus/02`, `08` §12). El diseño es **preventivo**, no una corrección de algo que ya se use mal. *(Un malentendido mío lo había tomado por un directorio existente con miles de visitas.)*
3. **Aliados en naranja** en el mapa (no rojo); moto en azul; demás negocios en gris.
2. **Diseño del home y de la pantalla de Encargos en Claude Design**, con la imagen de Rappi (`../Home/README.md`). *Sugerencia: `Artifact` con `action: "quickstart"`, `intent: "design"`.*
3. Se añade **`DECISIONS.md §29 · Encargos`** con lo cerrado (y notas en §4 y §7 sobre «Tindivo no retiene fondos»).
4. **Fase 1** (`03` §8): migración, contratos Zod, RPC y tests, con aprobación de Jesús en cada hito.

## Reglas del repo que no se olvidan

Leer `DECISIONS.md` antes de tocar nada · commits **en español con tilde**, escritos desde fichero UTF-8 (`git commit -F`) · migraciones **solo por CLI de Supabase** · RLS en todas las tablas · el plazo sale de `app_settings` · `pnpm graphify:update` tras cambiar código.
