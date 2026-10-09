# 04 · Arquitectura objetivo: desacoplar para poder crecer

> Propuesta del 2026-10-08, **revisada tras la crítica de Codex** ([`revision-codex.md`](revision-codex.md)). Se apoya en
> [`01-codigo.md`](01-codigo.md), [`02-base-de-datos.md`](02-base-de-datos.md) y
> [`03-proveedores-y-vps.md`](03-proveedores-y-vps.md), y en el acuerdo sobre el contrato REST
> (`../customer_app_migration/debate-rest/conclusion.md`).

## 1. El principio: desacoplamiento

Jesús lo dijo así: **desacoplamiento es la prioridad para poder trabajar.** Es el criterio con el que se decide todo
lo demás. Hoy lo que cuesta trabajo son cuatro acoplamientos concretos:

| Acoplamiento | Dónde se ve (medido) | Qué pasa por culpa de él |
|---|---|---|
| **Clientes ↔ base** | 180 llamadas directas a Supabase desde los frontends (99 en Negocios) | Cada cambio de tabla puede romper una app; las apps nativas tendrían que repetirlo |
| **Rutas ↔ tablas y reglas** | 159 `.from()` y 57 `.rpc()` dentro de los *handlers* | La mezcla dificulta probar y reutilizar las reglas sin HTTP, y moverlas |
| **Código ↔ proveedor** | 300 llamadas a `supabase-js` en la API, repartidas | Cambiar de proveedor o de forma de acceso es tocar cientos de sitios |
| **Reglas ↔ interfaz** | El checkout calcula dinero en React; tres copias de la misma regla | Cada app nueva añade otra copia |

**Desacoplar no es montar infraestructura nueva.** Es poner **una frontera** (una interfaz, un contrato, un módulo)
entre dos cosas que hoy se tocan directamente, **en el momento en que se trabaja en ellas**.

## 2. ¿Microservicios?

**Hoy no.** Con una persona y unos 17 pedidos por noche, los microservicios multiplicarían lo que más cuesta:
despliegues, monitoreo, consistencia entre bases y fallos que cruzan la red. No hay un problema de escala que
resuelvan.

**La dirección sí es un monolito modular**: un solo despliegue y una sola base, divididos en módulos con fronteras.
Modularizar **reduce** el trabajo de una extracción futura, pero no lo elimina: separar un servicio cambia
transacciones, llamadas, fallos, autorización y despliegues, y requiere diseño y pruebas propios.

**Cuándo separar un módulo en un servicio** (criterios, no fechas):

1. necesita escalar distinto del resto;
2. lo mantiene otra persona o equipo con su propio ritmo de despliegue;
3. su caída no debe tumbar lo demás;
4. necesita otra tecnología.

Si no se cumple ninguno, se queda en el monolito.

## 3. Los módulos: un mapa, no una obligación de crear catorce carpetas

El mapa sirve para saber **a qué módulo pertenece** cada cosa cuando se toca. Los módulos se crean cuando hay trabajo
real en ellos, empezando por los que ya tienen límites claros.

| Módulo | Qué es dueño | Hoy en la base | Cuándo nace |
|---|---|---|---|
| **ordering** (restaurantes) | Pedido de comida, ítems, estados, validación, comprobante | `orders`, `customer_order_items*`, `order_status_history`, `order_event_log` | **Primero**, junto al paso 0 o justo después (los parches mínimos no esperan a la extracción) |
| **courier** (Entregas) | Recoger y llevar | `courier_orders`, `courier_order_events` | Al tocar Entregas |
| **store** | Tindivo Store | `store_*` | Ya está casi aislado (`apps/api/lib/store/`) |
| **promotions** | Campañas, canjes | `promo_redemptions` + `app_settings.promo_free_delivery` + promos por plato y de lanzamiento | Con la primera campaña nueva (§4) |
| **notifications** | Dispositivos, preferencias, envío | `push_subscriptions`, `push_delivery_log` | Con el push nativo (paso 5) |
| **catalog** | Negocios, horarios, apertura del día, menú, QR de pago | `businesses`, `business_schedule`, `business_service_days`, `menu_*`, `business_payment_qrs` | Con la superficie móvil de Negocios |
| **identity** | Usuarios, roles, perfiles, teléfono, términos, borrado de cuenta | `users`, `user_roles`, `customer_profiles`, `terms_acceptance`, `customer_otp_attempts` | Con las rutas `/me` y el borrado de cuenta |
| **geo**, **fleet**, **trust**, **billing**, **reviews** | Zonas, lugares y direcciones · motorizados y asignación · antifraude · cobros, liquidaciones y reembolsos · reseñas | `delivery_zones`, `map_landmarks`, `address_directory`, `directory_businesses`, `customer_addresses` · `drivers*`, `order_transfer_requests`, `order_assignment_rejections` · `customer_strikes`, `customer_incidents`, `fraud_coverage_claims` · `business_charges`, `cash_settlements`, `restaurant_payments`, `reports` · `order_reviews*` | **Antes de convertirlos en módulos compartidos hay que aclarar quién es dueño de qué**; mientras tanto, se tratan sus tablas como de otro |
| **platform** (transversal) | Outbox, idempotencia, configuración, auditoría | `domain_events`, `outbox_events`, `idempotency_keys`, `app_settings` | Se usa desde todos |

## 4. Cómo es un módulo por dentro (lo mínimo)

```
<módulo>/
  domain/        reglas puras; puede importar contracts y utilidades puras, nunca I/O
  application/   casos de uso (createOrder, registerPrepayProof…)
  infra/         acceso a datos y a proveedores (hoy supabase-js y las RPC existentes)
  http/          rutas finas: validan, llaman a un caso de uso, responden
  index.ts       lo único que otros módulos pueden importar
```

**Las reglas de dependencia** (verificables en la CI, ver `05-estandares.md`):

- un módulo solo importa el `index.ts` de otro;
- el SDK de un proveedor solo se importa en `infra/`;
- la ruta no consulta tablas.

**El SQL existente se queda.** Las RPC actuales (`advance_order`, `create_customer_order`…) pasan a ser la
implementación que llama `infra/`. Nadie las reescribe por estética. Cuando una se toca por otro motivo, se le añaden
tests y, si es grande, se parte.

**Dónde vive una regla:** las decisiones autoritativas de elegibilidad (dinero, estado, cupos, quién puede qué)
**se validan dentro de la operación** cuando dependen de datos cambiantes. Cuando la interfaz necesita anticiparlas
(mostrar si aplica una promoción, si se permite contraentrega), **consulta esa misma autoridad** (el `quote`, el
`config`); no introduce una segunda implementación. Nunca dos copias.

## 5. Promociones

**Lo que hay hoy (corregido):**

- una campaña global configurable, el JSON `app_settings.promo_free_delivery` con fechas, código y tope;
- `promo_redemptions` y un trigger que la liquida al entregar;
- además, **promociones por plato** (`cart_item_free_delivery`) y de **lanzamiento**, que el checkout combina
  (`use-checkout-state.ts:318-343, 420-422`).

O sea, varias modalidades, cada una cableada a su manera.

**Cómo empezar (sin construir un motor por adelantado):**

1. **Partir de las campañas concretas que Jesús quiere lanzar** (las dos o tres próximas) y modelar solo lo que piden.
2. Mover las campañas de `app_settings` a una tabla `campaigns` cuando lo pidan el historial, el ciclo de vida
   (borrador, activa, cerrada) o la financiación, o cuando hagan falta dos campañas a la vez.
3. **Antes de escribir código, inventariar y especificar** las reglas de las próximas campañas. Ya hay combinación
   de promociones en el checkout, pero estas reglas no están escritas en ningún sitio:
   - acumulación o exclusión entre promociones;
   - prioridad;
   - redondeo;
   - quién financia (Tindivo o el negocio, `D-34`);
   - reserva concurrente del presupuesto, y su liberación al cancelar;
   - vencimiento;
   - devolución;
   - **foto de las condiciones** con la que se aplicó cada canje.
4. **Atomicidad:** el canje se reserva **en la misma transacción** que crea el pedido. Una interfaz entre módulos no
   da esa garantía por sí sola, así que la reserva vive en la base (§4) y el módulo la envuelve.
5. El `quote` del checkout (paso 3 del plan acordado) pregunta a `promotions` qué aplica, para que **las apps no
   calculen descuentos**.

## 6. Mototaxi

**Hipótesis de trabajo: un módulo propio (`rides`)**, separado de pedidos y de Entregas, porque tiene su propia
máquina de estados y sus reglas de seguridad de pasajeros. Lo que **queda por decidir** cuando se defina la operación:

- si comparte motorizados o necesita **conductores habilitados** aparte (licencia, vehículo, seguro);
- disponibilidad exclusiva;
- si va en la misma app del cliente o no;
- cómo se cobra.

**No se generaliza nada antes de conocer la operación.** Repetir coordenadas o contacto como una foto dentro de cada
viaje no es necesariamente deuda; lo es copiar **reglas**.

Es, eso sí, el mejor candidato futuro a servicio aparte si llega a tener seguimiento GPS en vivo a escala (criterio 1
del §2).

## 7. Decisiones técnicas: qué es dirección y qué es ensayo

| # | Tema | Estado | Criterio para adoptarlo |
|---|---|---|---|
| A-01 | Monolito modular | **Dirección** | — |
| A-02 | Esquema de Postgres por módulo | **Ensayo** | Solo si ayuda a propiedad y permisos de verdad (un esquema no impide accesos si el mismo rol lo escribe todo). Antes de mover nada: inventario de dependencias, grants, PostgREST, tipos, Realtime y funciones. Los límites **en el código** empiezan ya, sin mover tablas |
| A-03 | Framework HTTP | **Ensayo** | Primero reducir la duplicación con lo que hay. Luego un `defineRoute` pequeño en dos rutas, **solo para lo HTTP** (errores, request-id, versión de cliente): la autorización del recurso y la idempotencia transaccional no se esconden en un *middleware* genérico. Hono, si se quiere, en un ensayo aparte que verifique la convivencia de rutas, Zod 4, OpenAPI y errores |
| A-04 | Acceso a datos | **Ensayo** | Primero, funciones de acceso del módulo con `supabase-js` dentro. Un driver de Postgres solo donde resuelva una transacción o una latencia **medida**, comparando *pooling*, errores, permisos y tipos, y sin ampliar privilegios. Kysely o similar exige cambiar explícitamente la regla de `CLAUDE.md` |
| A-05 | Entrega de eventos | **Dirección**: entrega durable común y consumidores idempotentes | La auditoría (bitácora, historial, registro de push) no es una cola y se queda. Los mecanismos actuales (Inngest, cron, Edge Function) **se mantienen hasta demostrar** el reemplazo: reclamación concurrente, reintentos, eventos venenosos, orden cuando importe, protección contra doble envío y observabilidad |
| A-06 | Guardia de transiciones en la base | **Dirección**, empezando por `orders` | Tabla de transiciones permitidas + trigger, con tests. Por máquina de estados, no como trigger universal |
| A-07 | ADR | **Dirección** | `DECISIONS.md` sigue siendo la autoridad y el índice; las decisiones nuevas van en `Docs/adr/`. Los comentarios que protegen invariantes **se quedan**; lo que sale del código es la crónica |
| A-08 | Contenedores | **Ensayo** | Cuando se pruebe el VPS (doc 03) |

## 8. Cómo se llega sin una gran refactorización

1. **Lo nuevo nace desacoplado.** Promociones, las rutas `/me`, el `quote` y los arreglos del paso 0 se escriben ya
   dentro de su módulo.
2. **Lo que se toca, se deja mejor.** Al modificar una ruta, su lógica pasa a un caso de uso. Al modificar una RPC,
   se le añaden tests.
3. **Lo que no se toca, no se toca.**

**El paso 0 no espera a nada.** Las reglas mínimas (`05-estandares.md`) se aplican en paralelo, empezando por el código
nuevo y con una lista de excepciones para lo existente.
