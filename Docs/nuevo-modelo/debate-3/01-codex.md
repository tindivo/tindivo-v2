# Debate 3 · Turno 1 · Codex (verificación)

Verificado en `tindivo-courier`, sin modificar archivos ni ejecutar seeds. Evidencia de rama: `git status --short --branch` → `## tindivo-courier...origin/tindivo-courier`. Es revisión estática; no certifica funcionamiento en producción.

Para abreviar, **M** significa [`supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql`](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql).

## 1. Coordenadas y formulario de texto

**Hoy las coordenadas son obligatorias en tres capas:**

- Contrato: `coordinates: CoordinatesSchema` en ambos extremos. Los teléfonos, en cambio, son opcionales. (`packages/contracts/src/courier.ts:17`).
- RPC: recibe cuatro coordenadas, valida ambos puntos contra `point_in_coverage_polygon` y calcula distancia. (**M:463, 518, 535**).
- Tabla: cuatro columnas `NOT NULL`, más dos restricciones de caja geográfica. (**M:184, 191, 237**).

**Sí hace falta migración nueva:** permitir `NULL` en esas cuatro columnas; retirar la dependencia obligatoria del polígono y dejar `distance_m = NULL` cuando no hay coordenadas. Las restricciones geográficas pueden conservarse para valores existentes: no deben convertirse en una exigencia de ubicación. La pertenencia a San Jacinto quedaría como comprobación humana por texto/llamada. Base: **M:184, 207, 237, 518**.

También deben cambiar contrato, serialización y API: actualmente el navegador lanza «Faltan las coordenadas» y el endpoint accede directamente a `.coordinates.lat/lng`. (`apps/customer/features/courier/lib/api.ts:16`; `apps/api/app/api/v1/customer/courier-orders/route.ts:77`). `0233` solo restringe permisos; `0234` agrega coordenadas al seguimiento, sin flexibilizar creación. (`supabase/migrations/0233_the_courier_rpcs_stop_taking_anyones_word_for_it.sql:30`; `supabase/migrations/0234_el_seguimiento_de_entregas_ya_trae_las_coordenadas.sql:8`).

La **nota opcional no tiene campo persistido**; debe atravesar contrato, API y tabla. También falta exigir ambos celulares y fijar «listo ahora»: hoy `readyInMin` admite 0–180. (`packages/contracts/src/courier.ts:17,39`; **M:170–243**).

## 2. «Un activo por teléfono» y cuenta de Jesús

La RPC cuenta pedidos no terminales por **`requester_phone`**, no por `customer_user_id`, `origin_phone` ni `destination_phone`. El máximo sale de `courier.maxActivePerPhone`, inicialmente 1. (**M:525**).

El formulario obtiene ese teléfono del perfil de quien inició sesión. Por tanto, el segundo pedido de WhatsApp creado por Jesús será rechazado mientras el primero siga activo, aunque cambien ambos contactos. (`apps/customer/features/courier/hooks/use-courier-request.ts:25,131`).

El cambio mínimo absoluto es aumentar `maxActivePerPhone`, pero afecta a todos. Si se conserva el límite público, basta una excepción configurada para el UUID de Jesús dentro de la RPC, manteniendo su cuenta y el mismo formulario; no requiere modo operador. Base: **M:464,525**. La API ya fija el autor desde sesión. (`apps/api/app/api/v1/customer/courier-orders/route.ts:68`).

## 3. Disponibilidad y motorizado

«Disponible» significa únicamente que existe un conductor con `driver_availability.is_available = true` y `drivers.is_active = true`. **No cuenta comida pendiente, ocupación ni entregas activas.** Aceptar courier tampoco comprueba capacidad. (**M:425,600**).

No encontré integración courier en `apps/motorizados`; su tablero consulta `orders`. En API existen creación/cancelación del cliente y estado/seguimiento público, pero no rutas courier del conductor. (`apps/motorizados/hooks/use-driver-orders.ts:200`; `DECISIONS.md:1187,1198`; búsqueda `rg -n courier apps/motorizados apps/api/app`).

Los estados ya existen:

`requested → accepted → heading_to_pickup → at_pickup → picked_up → heading_to_dropoff → delivered`

También cancelación y liberación antes de recoger. (`packages/contracts/src/courier-status.ts:15`).

`advance_courier_order` implementa aceptar, soltar, salir, llegar, cobrar, recoger, salir al destino, entregar, cancelar y reportar problema; `expire_courier_orders` cancela solicitudes vencidas. (**M:584,733**). Falta exponerlos con autorización y lectura de disponibles: la RLS del conductor solo permite ver pedidos ya asignados. (**M:274**).

## 4. Directorio y autocompletado

`directory_businesses` contiene nombre, referencia, teléfonos, categoría y enlace opcional a `businesses`; este último aporta nombre, dirección, teléfono y WhatsApp de partners. No hay unión automática en el lector actual. (**M:109**; `packages/supabase/src/database.types.ts:359`; `apps/customer/features/courier/lib/directory.ts:42`).

El seed define **ocho fixtures**, enlaza La Florencia al negocio e2e y borra/reinserta únicamente su rango de IDs. Está restringido a base local. **Ocho fixtures no demuestran ocho filas reales.** (`apps/api/scripts/seed-courier-directory.ts:59,208`; `apps/api/lib/__tests__/helpers/local-db.ts:19`).

La exposición de `phone/whatsapp` es efectiva: se descargan al navegador, y la policy permite leer filas visibles incluso sin sesión. Ocultar botones no la corrige. (`apps/customer/features/courier/lib/directory.ts:45`; **M:162**).

**Estimación: 2–3 horas** para adaptar «buscar → elegir → rellenar» con datos curados: ya existen filtro por nombre y copia de referencia/teléfono. No incluye poblar producción ni rediseñar permisos. (`apps/customer/features/courier/components/route-sheet.tsx:29,78`; `apps/customer/features/courier/lib/store.ts:97`).

## 5. Cobro y cierre

`driver_payment_qrs` y `courier_remittances` siguen pendientes, sin implementación encontrada en migraciones/tipos. (`DECISIONS.md:1199`; **M:43**).

Sí existen `fee_amount`, `payer`, `payment_method` (`cash|yape`), `transport_collected_at`, `driver_id` y fechas: permiten agrupar cobros por conductor y turno, pero no registran la conciliación contra su pago. (**M:201–227**).

La RPC guarda método y momento del cobro; impide recoger sin cobrar cuando paga origen y entregar sin cobrar cuando paga destino. **Todavía acepta método nulo.** (**M:589,640,659,683**).

## 6. Medición

Hay timestamps de creación, aceptación, salida, llegada, recogida, salida al destino, entrega y cancelación, además de eventos con actor y fecha. (**M:215,286,713**).

Se puede inferir WhatsApp por `customer_user_id = UUID_de_Jesús` **si todos los pedidos de esa cuenta pertenecen a ese canal**; un pedido personal suyo resultaría indistinguible. `utm_source` existe, pero llega desde el cliente. (**M:175,224**; `apps/api/app/api/v1/customer/courier-orders/route.ts:91`).

«No se pudo» tiene motivos: `no_driver`, `driver_rejected`, `not_ready`, `transport_unpaid`, `customer_cancelled`, `unreachable`, `other`. No hay explicación libre en `report_problem`. (**M:74,702–719**).

## 7. Horario

La configuración inicial incluye apagado, S/3, 18:00–23:00, mensaje de pausa, peso, máximo activo y tiempo de traslado. La función evalúa **solo hora de Lima**, incluyendo cruce de medianoche; **no evalúa días de semana**. Son valores de migración, no valores remotos verificados. (**M:322,401**).

## 8. Datos de tindivo-prod

**No tengo MCP Supabase conectado.** La búsqueda de herramientas no lo encontró; el descubrimiento del plugin devolvió `installed:false`. No ejecuté consultas SQL remotas.

Por tanto, quedan **sin verificar** los conteos de `courier_orders`, `directory_businesses` y partners; entregados por hora durante ocho semanas; y simultaneidad por conductor entre 19–22 h. No atribuyo números locales ni documentales a producción.

## Lo que hace falta tocar para el MVP

Estimaciones de trabajo, no mediciones:

- **SQL, contratos y API: 5–7 h.** Coordenadas nullable, nota, contactos obligatorios, listo ahora, excepción de Jesús y método obligatorio. Base: **M:170,463,640**; `packages/contracts/src/courier.ts:39`.
- **Formulario y seguimiento: 5–7 h.** Texto, «Soy yo», casilla acordada y eliminación del recorrido de mapas. Base: `apps/customer/features/courier/lib/store.ts:85`; `types.ts:19`.
- **Motorizado/API: 8–12 h.** Cola, prioridad comida, llamada antes de salir, acciones y actualización de estados. Base: `apps/motorizados/hooks/use-driver-orders.ts:200`; **M:274,584**.
- **QR y cierre: 4–6 h.** Mostrar QR propio y registrar/verificar conciliación del turno. Base: `DECISIONS.md:1199`; **M:201**.
- **Autocompletado: 2–3 h**, según §4.
- **Verificación integral: 4–6 h**, incluidos dos pagadores, varios pedidos de Jesús y regresión de comida. Base existente: `apps/api/lib/__tests__/courier-orders.integration.test.ts`.

## Imposibles o riesgos técnicos

Ninguna decisión cerrada aparece técnicamente imposible. El riesgo de calendario es **28–41 horas estimadas**, frente a dos días de construcción.

Hay un riesgo concreto de cuadre: cobrar en origen y después **soltar** conserva el cobro, pero borra `driver_id`; otro conductor podría quedar asociado al dinero. Debe impedirse esa liberación o conservar quién cobró. (**M:612,640**).