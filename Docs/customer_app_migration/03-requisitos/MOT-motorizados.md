# MOT · App de motorizados (`apps/motorizados`)

> **Nivel de detalle: capacidad.** Formato y leyendas: [`00-formato-y-convenciones.md`](00-formato-y-convenciones.md).
> Es la app **más pulida** del sistema (referencia de diseño según `DECISIONS.md §16`; ≈ 13,5 k
> líneas, 6 páginas) y la que **más se beneficia de lo nativo**: GPS en segundo plano, mapas y
> navegación, push fiable con sonido y cola sin red. Hoy 3 motorizados tienen push registrado
> (5 suscripciones, 4 de ellas en iPhone: instalaron la PWA).
>
> **Disposición por defecto:** `DIFERIR · M3`. Cuando se decida llevarla a nativo, casi todo es
> `ADAPTAR`.

## Páginas actuales

`/` (bandeja: **En espera · Míos · Equipo**) · `/pedido/[id]` (ficha) · `/efectivo` · `/historial` ·
`/perfil` · `/restaurantes`.

## MOT-BAN · Bandeja y ciclo del viaje

| ID | Capacidad | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| MOT-BAN-001 ★ | Bandeja con tres pestañas: **En espera** (sin dueño), **Míos** y **Equipo**. | `ord_driver_read` deja ver solo los pedidos sin dueño de los restaurantes con los que trabaja; **recojo nunca entra** (RLS + `take` + `appears_in_queue_at` NULL). Orden por `estimated_ready_at` ascendente (no se reordena sola). | `app/(driver)`; `lib/orders/sort`; `DECISIONS.md §26, §29` | ✅ | DIFERIR · M3 |
| MOT-BAN-002 | Tarjeta de cuatro filas: cejilla (local · código + **insignia de estado**), identidad (nombre + **reloj**), referencia, cobro. | Cada canal dice **una** cosa (franja = local, insignia = estado, reloj = tiempo, borde = emergencia). Colores de estado categóricos, sin ámbar ni rojo. | `lib/orders/card-view-model.ts` (56 tests); `DECISIONS.md §26` | ✅ | DIFERIR · M3 |
| MOT-BAN-003 ★ | Reloj que **no se apaga** y cambia de sentido: cocina (lo que falta) → pasada la ETA (lo que se pasó) → reparto (lo que lleva rodando desde `picked_up_at`). | Rojo al pasar de cero; borde rojo a `queueLeadMinutes`; reparto rojo a ⚙ `deliveryLateMinutes` (20). Siempre `mm:ss`. | `DECISIONS.md §26` | ✅ | DIFERIR · M3 |
| MOT-BAN-004 ★ | Avanzar el pedido **arrastrando** la tarjeta: derecha avanza («Tomar» → «Llegué al local» → «Ya recogí» → «Llegué a la puerta» → «Cobrar»), izquierda **suelta** (solo antes de recoger). | Lo irreversible (cobrar, soltar) abre su hoja y no cierra solo. **Optimista** para `arrived`, `pickup`, `arrived_customer`; **`take` compite y confirma primero**; `deliver` es dinero y tampoco es optimista. No arranca en el borde izquierdo (24 px, «atrás» de iOS). | `DECISIONS.md §29`; `components/home/order-card.tsx` | ✅ | DIFERIR · M3 |
| MOT-BAN-005 | La cola se entera **al instante** de que otro se llevó el pedido. | *Broadcast* privado `drivers:board` (0231, `realtime.send`), solo rol `driver`; la tarjeta desaparece en **0,24 s** frente a 17,7 s; el poll de 15 s queda de respaldo. | `0231`; `hooks/use-driver-orders.ts` | ✅ | DIFERIR · M3 |
| MOT-BAN-006 | **Cola sin red** con reintento. | Se encolan `arrived`, `pickup`, `deliver`, `no_show` con su `Idempotency-Key` y UI optimista; **`take` nunca** se encola. FIFO; un 4xx/5xx descarta el item. | `lib/transitions.ts`; `lib/offline-queue.ts` | ✅ | ADAPTAR · M3 |

## MOT-VIA · Acciones del viaje

| ID | Capacidad | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| MOT-VIA-001 ★ | **Tomar** un pedido (`take`). | Compite; sin red no se toma. Respeta capacidad (⚙ máx. 3 pedidos, 2 restaurantes, 3 huecos de mochila). | `advance_order('take')`; `assignment_rules` | ✅ | DIFERIR · M3 |
| MOT-VIA-002 | «Llegué al local» (`arrived`) y «Ya recogí» (`pickup`). | **La banda no la declara el motorizado** (la elige la cajera, 0126); `pickup` pide `slots` (1-3) y es donde se **devengan los cargos**; recogida **prematura** (ETA no llegó **y** cocina no marcó lista) abre hoja de confirmación. | `advance_order`; `DECISIONS.md §29` | ✅ | DIFERIR · M3 |
| MOT-VIA-003 ★ | «Llegué a la puerta» (`arrived_customer`) con **GPS**. | Acepta un fix de hasta **30 s** y se rinde a los **2 s**; sin fix, la llegada se registra igual con coordenadas nulas. Arranca el reloj `noShowWaitMinutes` (⚙ 5) y el **push al cliente**. | `.../transition` (`lat,lng,accuracy_m` nullable) | ✅ | ADAPTAR · M3 |
| MOT-VIA-004 ★ | **Cobrar** y entregar (`deliver`). | Registra lo realmente pagado: `paymentReal`, `cashAmount`, `yapeAmount`, `clientPaysWith`; la **RPC valida** que sumen el pedido y que el billete cubra el efectivo; el prepago muestra una **palabra** («Prepagado»), nunca una cifra; en mixto la cifra grande es el efectivo. | `advance_order('deliver')`; `deliver_order_cash` | ✅ | DIFERIR · M3 |
| MOT-VIA-005 | **Soltar** el pedido (`release`) con motivo. | Solo antes de recoger; avisa a todo el equipo; vuelve a `preparing` o `waiting_driver`. | `advance_order('release')`; 0121 | ✅ | DIFERIR · M3 |
| MOT-VIA-006 ★ | Declarar **no-show** tras esperar. | Suelo ⚙ 5 min; cancela y deja **strike** (teléfono + dirección); reporte al admin; aviso inmediato al cliente. | `advance_order('no_show')`; `DECISIONS.md §8` | ✅ | DIFERIR · M3 |
| MOT-VIA-007 | **Traspaso** entre motorizados. | `POST /driver/orders/:id/transfer-request` (idempotente); TTL ⚙ 30 s, **callarse cede el pedido**; solo si hay capacidad; el dueño responde `POST /driver/transfers/:id/respond`. | `request_order_transfer`, `respond_order_transfer` | ✅ | DIFERIR · M3 |
| MOT-VIA-008 | **Capturar la dirección real** de la puerta. | `POST /driver/orders/:id/address` (`capture_delivery_address`): lat/lng/precisión/referencia; alimenta el directorio (`driver_verified`). | 0147 | ✅ | ADAPTAR · M3 |
| MOT-VIA-009 | Enlaces a mapas/navegación y plantillas de WhatsApp al cliente. | Chip «Avisar: voy en camino / ya llegué», sin ventana emergente y solo con teléfono válido. | `lib/deeplinks.ts`; `lib/whatsapp-templates.ts` | ✅ | ADAPTAR · M3 |

## MOT-EFE · Efectivo, disponibilidad y otros

| ID | Capacidad | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| MOT-EFE-001 ★ | **Declarar** el efectivo entregado al negocio y ver lo abierto por confirmar. | `deliver_order_cash`; el negocio confirma/discrepa; avisos colapsados por (motorizado, negocio). | `/driver/cash-settlements`; `app/(driver)/efectivo` | ✅ | DIFERIR · M3 |
| MOT-DIS-001 | **Disponibilidad**: conectarse/desconectarse. | `POST /driver/availability` (`set_driver_availability`); cron `close-driver-shifts` la apaga fuera de horario (gracia ⚙ 10 min). **Notificar no es asignar**: no se filtra el aviso por disponibilidad. | `hooks/use-availability.ts`; cron | ✅ | DIFERIR · M3 |
| MOT-RST-001 | Ver los **restaurantes** con los que trabaja. | `driver_businesses()`; los asigna el admin. | `app/(driver)/restaurantes` | ✅ | DIFERIR · M3 |
| MOT-INC-001 | Reportar un **incidente** del cliente (dirección falsa, no-show…). | `POST /driver/incidents` (idempotente); el admin lo revisa. | `create_customer_incident` | ✅ | DIFERIR · M3 |
| MOT-HIS-001 | Historial y perfil. | La nota del motorizado **nunca se publica**. | `app/(driver)/historial`, `perfil` | ✅ | DIFERIR · M3 |
| MOT-PSH-001 | **Avisos push** al motorizado (≈ 25 momentos portados del v1). | Ver la lista blanca en `SYS-transversal.md`; `requireInteraction` + vibración para lo accionable; **tags distintos** en el doble aviso de traspaso. Es la única app que llama a `pushManager.subscribe` de forma sistemática. | `send-push/index.ts`; `DECISIONS.md §25` | ✅ | ADAPTAR · M3 |

---

## Lo que el Customer consume de esta app

| Acción del motorizado | Efecto en el Customer |
|---|---|
| `take` | El pedido pasa a «Preparando» con un motorizado asignado (nombre visible) |
| `pickup` | «En camino»; push «Tu pedido salió» con el nombre de pila |
| `arrived_customer` | «¡El motorizado llegó!»; el teléfono del motorizado pasa a ser visible; **reloj de espera**; push con `requireInteraction` |
| `no_show` | Cancelación con copy «No pudimos entregarte el pedido»; **strike** que endurece futuros pedidos |
| `deliver` | «Entregado»; abre la ventana de reseña (⚙ 21 días) |
