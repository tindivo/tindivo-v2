# Tindivo Entregas · MVP v1

> **2026-09-30 · Claude + Codex** (debate 3, `Docs/nuevo-modelo/debate-3/01`
> a `04`). Se construye el **jueves 1 y el viernes 2 de octubre**, se ensaya el
> **domingo 4** y se lanza el **lunes 5**. Todo lo que no está aquí va a
> [`backlog-entregas.md`](./backlog-entregas.md).
>
> **Sobre los datos:** en esta ronda ni Claude ni Codex tuvieron acceso a
> `tindivo-prod` (el MCP respondió `Unauthorized` y no conectó). Las cifras de
> producción vienen del debate 1 (`plan-final.md` §2). Lo que falta medir está
> en el §9.

> **Actualización 2026-09-30 (tarde) — manda sobre lo de abajo.** Jesús decidió
> **reutilizar el flujo del mapa que ya existe** (A en el mapa → B en el mapa →
> contactos → ¿quién paga? → ¿qué llevamos?) en vez del formulario de solo
> texto. Eso elimina las tareas de coordenadas nulas, el formulario nuevo y el
> seguimiento sin mapa. Lo construido está en la `0235`
> (`driver_courier_step`, tope por motorizado, cobro obligatorio, cuenta de
> WhatsApp sin límite, «listo ahora»), la API `/driver/courier-orders`, la
> sección «Entregas» de `apps/motorizados`, y «¿Qué llevamos?» sin «Comida» ni
> «¿Cuándo estará listo?». «Pedido a nombre de…» sale del nombre de quien pide:
> no hay campo nuevo. Datos de `tindivo-prod` (consultados ese día): 0 entregas,
> 0 negocios en el directorio, `0234` sin aplicar, y en el pico L–V (8 pm) el
> motorizado está sin comida el 49 % del tiempo y con 2 o más el 20 %.

## 1. Qué entra en el MVP

| Feature | Riesgo que previene |
|---|---|
| Formulario de **una pantalla, solo texto**, con 7 campos | Que la gente no complete el pedido |
| **«Soy yo»** junto a cada celular | Escribir dos veces los datos propios |
| Pedido **sin coordenadas** (migración `0235`) | La decisión «sin mapa» choca hoy con tres capas que las exigen |
| **Jesús crea pedidos de WhatsApp con su cuenta**, sin límite por teléfono (exención para el rol `admin`) | Solo podría atender un cliente de WhatsApp a la vez |
| **Seguimiento en texto** para el cliente, sin mapa | Hoy el mapa del seguimiento falla con coordenadas nulas |
| **Sección «Entregas» en la app del motorizado**: aceptar, llamar, recogido, entregado, no se pudo, soltar | Hoy nadie puede atender una entrega |
| **Pasos compuestos atómicos** en la RPC (recogido y entregado) | Pedidos a medio avanzar si se corta la conexión |
| **Método de cobro obligatorio** y prohibido **soltar tras cobrar** | Dinero sin registrar o sin motorizado responsable |
| **Tope de 2 entregas activas por motorizado** (ver desacuerdo 1) | Un motorizado acepta de más y los clientes esperan sin saberlo |
| **Revocar la lectura pública de `directory_businesses`** | Hoy cualquiera, sin sesión, lee el teléfono y el WhatsApp de los negocios |
| **«Listo ahora» forzado en el servidor** | Pedidos para «dentro de 2 horas» que bloquean al motorizado |
| **Dos consultas SQL guardadas**: cuadre y medición | Noches sin cuadrar y un piloto sin datos para decidir |

## 2. El formulario

Una sola pantalla. **Todo es obligatorio.**

| # | Campo | Regla | Cómo se llena |
|---|---|---|---|
| 1 | **Recoger en** | Texto, ≥ 5 caracteres | «Botica Santa Rosa, frente a la plaza» |
| 2 | **Celular de quien entrega** | 9 dígitos | **«Soy yo»** pone el del perfil |
| 3 | **Llevar a** | Texto, ≥ 5 caracteres | |
| 4 | **Celular de quien recibe** | 9 dígitos | **«Soy yo»** |
| 5 | **¿Qué es?** | Texto, ≤ 120 caracteres | «Bolsa con útiles» |
| 6 | **¿Quién paga los S/ 3?** | Dos botones: *Quien entrega (al recoger)* / *Quien recibe (al entregar)* | Sin valor por defecto |
| 7 | Casilla: **«Ya está listo y pagado. Tindivo no compra ni adelanta dinero. Pesa menos de 5 kg.»** | Obligatoria | |

**Qué no se pide:**

- **Nombres de los contactos:** el servidor guarda «Quien entrega» o «Quien
  recibe», o el nombre del perfil si se tocó «Soy yo». El motorizado confirma
  por la llamada.
- **Nota:** la referencia ya dice cómo llegar.
- **Tiempo de preparación, peso y frágil:** se envían fijos (`readyInMin = 0`,
  `isFragile = false`), y el peso va en el texto de la casilla.

**Quien pide** (nombre y celular) sale del perfil de la sesión, como hoy.
**El login no cambia.**

**Si el origen es un negocio:** en el MVP se escribe igual que cualquier
punto. El celular es obligatorio, y lo ve **solo el motorizado**. El
autocompletado desde la base va al backlog: hoy no hay negocios verificados en
producción, y activarlo exige primero arreglar su privacidad.

**Por WhatsApp:** Jesús abre el mismo formulario con su cuenta, con **«Soy
yo» apagado**, y copia los datos del cliente.

## 3. Capacidad

- **Software:** como máximo **2 entregas activas por motorizado**
  (`app_settings.courier.maxActivePerDriver = 2`). La cuenta se serializa por
  motorizado para que dos aceptaciones simultáneas no pasen el tope.
- **Reglas de operación** (en esto coinciden los dos):
  1. **Una sola entrega en mano a la vez.**
  2. **Si hay comida lista para recoger, va primero.** Una entrega que ya se
     recogió se termina antes (~5 min).
  3. **Una entrega aceptada pero no recogida se suelta** si entra comida y no
     da el tiempo.
- **Por qué 2 y no 1:** hay ~158 de 300 min libres por noche (L–V), y una
  entrega toma ~11.5 min de asignada a entregada. Con 1 se desperdicia esa
  holgura. Sin tope, nada impide acumular pedidos que nadie atiende.
- **Límite por teléfono:** se queda en 1 por celular de quien pide. **Se
  exime a los usuarios con rol `admin`** (comprobado en `user_roles`). Así
  Jesús crea los pedidos de WhatsApp que haga falta.

## 4. App mínima del motorizado

Una sección **«Entregas»** en el inicio actual, con tarjetas azules para
distinguirlas de la comida. La lista (disponibles y mías) se refresca cada
15 s.

| Botón | Qué hace | Cuándo aparece |
|---|---|---|
| **Aceptar** | `accept`, con el tope de 2 | Disponible |
| **Llamar a quien entrega** / **Llamar a quien recibe** | `tel:` | Siempre, mientras está asignada |
| **Recogido** | Paso atómico: salir → llegar → [cobrar] → recoger. Pide *Yape / Efectivo* solo si paga quien entrega | Aceptada |
| **Entregado** | Paso atómico: salir → [cobrar] → entregar. Pide *Yape / Efectivo* solo si paga quien recibe | Recogida |
| **No se pudo** | Motivo: *No estaba listo · No contestan · Otro*. Después de recoger, dice «Devuélvelo a quien lo entregó y llama a Jesús» | Cualquier estado no terminal |
| **Soltar** | `release` | Solo antes de recoger y sin cobro |

**Reglas:**

- Antes de salir, el motorizado **llama a quien entrega**. Si no está listo,
  no sale y marca «No se pudo · No estaba listo».
- Durante el turno, **la app queda abierta en pantalla**. **Jesús mira las
  solicitudes** y avisa por WhatsApp o llamada si alguna lleva más de 2 min
  sin aceptar. No hay push en el MVP.
- **Cobro:** primero Yape a su **propio QR** (en su celular o impreso). El
  efectivo se acepta con el sencillo que le da Jesús.

## 5. Cierre de caja

**No se construye** `courier_remittances` ni `driver_payment_qrs`.

1. Al cerrar el turno, Jesús corre la **consulta de cuadre**
   (`Docs/Entregas/consultas.sql`) en el panel de Supabase. Da, por
   motorizado y noche (hora de Lima), las entregas **cobradas**, contadas
   **por `transport_collected_at`** (incluidas las canceladas que se cobraron),
   y los totales en Yape y en efectivo.
2. El motorizado muestra su historial de Yape y el efectivo.
3. **Lo cobrado se descuenta del pago del turno.** Si cobró S/ 9, Jesús le
   paga S/ 21 de los S/ 30. Si algo no cuadra, se anota y se revisa al día
   siguiente.

## 6. Medición

Sale de la **consulta de medición** con los datos que ya se guardan, **sin
campos nuevos**:

- **Canal:** es WhatsApp si `customer_user_id` es **el UUID de Jesús**.
  Regla: Jesús no usa su cuenta para entregas propias.
- **Entregas por día, canal y pagador**, y cuánto se cobró por Yape y en
  efectivo.
- **«No se pudo» por motivo** (`cancel_reason`), incluidas las que vencieron
  sin motorizado (`no_driver`).
- **Tiempos:** creado → aceptado → recogido → entregado (`created_at`,
  `accepted_at`, `picked_up_at` y `delivered_at`). Los tiempos intermedios se
  pierden por los pasos compuestos, y se acepta.
- **Fuera del software:** los minutos diarios de Jesús y las demoras de comida
  atribuibles a Entregas, anotados a mano.

## 7. Construcción · jueves y viernes (22–24 h)

| # | Día | Tarea | Archivos o módulos | h | Terminado cuando |
|---|---|---|---|---|---|
| 1 | Jue AM | **Migración `0235`**: coordenadas nullable (el `CHECK` y el polígono solo si hay valor, `distance_m` nulo); `ready_in_min` forzado a 0; nombres de respaldo; exención `admin` del límite por teléfono; `maxActivePerDriver` con lock por motorizado en `accept`; método obligatorio en `collect_transport`; `release` prohibido tras cobrar; `cancel` que exige ser el motorizado asignado; `driver_courier_step` atómico e idempotente; `get_courier_tracking` con `null`; revocar `select` de `directory_businesses` | `supabase/migrations/0235_*.sql`, `apps/api/lib/__tests__/courier-orders.integration.test.ts` | 5 | Tests de integración en verde en local (tras `db reset` + `pnpm db:seed:e2e`), incluidos los de dos aceptaciones simultáneas y un paso repetido |
| 2 | Jue PM | **Contrato + API de creación**: coordenadas opcionales, celulares obligatorios, nombres opcionales, `readyInMin: z.literal(0)` | `packages/contracts/src/courier.ts`, `apps/api/app/api/v1/customer/courier-orders/route.ts` | 1.5 | Un POST sin coordenadas crea el pedido; sin celular, da 422 |
| 3 | Jue PM | **Formulario de una pantalla** que reemplaza al del mapa. Desmontar `courier-map-host` y el lector del directorio. Seguimiento solo en texto | `apps/customer/features/courier/*`, `apps/customer/app/layout.tsx`, `apps/customer/app/entregas/*` | 5 | Se crea un pedido de cada pagador en local; el seguimiento abre en una sesión nueva sin errores |
| 4 | Jue noche | **`supabase db push` + `pnpm db:types`**, y revisar `get_advisors` | — | 0.5 | La `0235` está en `tindivo-prod` y los tipos compilan |
| 5 | Vie AM | **API del motorizado**: `GET /driver/courier-orders` (disponibles y mías) y `POST /driver/courier-orders/[id]/step` (`accept`, `pick_up`, `deliver`, `fail`, `release`), con `requireRole('driver')` | `apps/api/app/api/v1/driver/courier-orders/*` | 3 | Test de integración del ciclo completo con los dos pagadores y los cuatro motivos |
| 6 | Vie PM | **Sección «Entregas»** en el inicio del motorizado: tarjetas, botones, hoja de método y hoja de motivo, polling de 15 s | `apps/motorizados/components/home/*`, `apps/motorizados/hooks/*` | 5 | Desde un celular, un motorizado acepta, recoge, cobra y entrega; la comida sigue funcionando igual |
| 7 | Vie PM | **Textos y configuración**: quitar «todos los días» y «5 min» hardcodeados; revisar `app_settings.courier` en producción (precio 3, horario, `enabled`) | `courier-orders/route.ts`, textos de `apps/customer` | 1 | Los textos coinciden con la configuración |
| 8 | Vie noche | **`consultas.sql`** (cuadre y medición) + regresión de comida + `pnpm lint`, `type-check` y `test` | `Docs/Entregas/consultas.sql` | 2 | Las consultas dan el resultado esperado sobre los pedidos de prueba; todo en verde |

Son **23 h**. Si el viernes a las 8 pm no está todo, **se corta en este
orden:**

1. El diseño de la sección del motorizado (quedan botones simples).
2. La consulta de medición: los datos ya se guardan, así que se escribe el
   lunes.
3. **Si aun así no cierra, se lanza el martes 6.** Nunca se recorta cobro,
   autorización ni reintento.

**Antes del jueves (Jesús, hoy):**

- Confirmar que su cuenta tiene los roles `customer` y `admin`.
- Pasar su UUID para la consulta de medición.
- Autorizar el MCP de Supabase en Claude Code (`/mcp`) para las consultas del
  §9.

## 8. Ensayo del domingo 4 (5 conocidos + el motorizado)

**Cada conocido pide desde su propio celular, a partir de un enlace enviado
por WhatsApp, sin explicación previa.**

| # | Caso | Qué se comprueba |
|---|---|---|
| 1 | Web · paga quien recibe · **Yape** | El cobro al entregar queda registrado |
| 2 | Web · paga quien entrega · **efectivo** | No se puede marcar «Recogido» sin cobrar |
| 3 | **Jesús crea 2 pedidos de WhatsApp a la vez** | La exención `admin` funciona |
| 4 | Un conocido pide **2 a la vez** con su celular | El límite de 1 por teléfono lo frena con un mensaje claro |
| 5 | **«No estaba listo»**: el motorizado llama y no sale | Termina en «No se pudo» con motivo `not_ready` |
| 6 | Se recoge y **nadie recibe** | Devolución al origen y llamada a Jesús |
| 7 | El motorizado **acepta una tercera** entrega | El tope de 2 la rechaza |
| 8 | **Celular bloqueado** 5 min con una solicitud nueva | Si se entera o no (esperado: no; Jesús avisa) |
| 9 | **Se corta el internet** al marcar «Recogido» y se reintenta | No queda a medias ni se cobra dos veces |
| 10 | Entra un **pedido de comida** con una entrega en curso | Si la comida se retrasó |

**Al cierre:**

- La consulta de cuadre coincide **al centavo** con lo que muestra el
  motorizado.
- **4 de 5 conocidos** crearon su pedido sin ayuda.
- Se anotan las dudas de cada uno: son lo primero que se corrige el lunes
  por la mañana.

## 9. Pendiente de medir en `tindivo-prod` (antes del lunes)

1. Cuántos pedidos de comida activos tiene a la vez cada motorizado, por hora,
   de 19 a 22 h, L–V y fin de semana. Sirve para validar el tope de 2.
2. Cuántas filas tiene `directory_businesses` en producción: si tiene
   teléfonos, la fuga ya es real.
3. Valor actual de `app_settings.courier`.

## 10. Desacuerdos para Jesús (2)

**1. El tope de 2 entregas, ¿en el software o solo como regla?**
- **Codex:** solo como regla de operación. Los datos no demuestran que 2
  sean inocuas, y un tope estricto obliga a serializar por motorizado.
- **Claude:** regla **y** software. Serializar son ~30 min
  (`pg_advisory_xact_lock`). Sin tope, un motorizado puede aceptar 5 y nadie
  se entera a tiempo.
- **Recomendación:** en el software, con el valor en `app_settings`, para
  poder subirlo a 3 sin desplegar. Ya está incluido en la tarea 1; si Jesús
  prefiere solo la regla, se ahorra ~30 min.

**2. Fines de semana**
- **Codex:** L–V desde el lunes, y decidir antes del sábado 10.
- **Claude:** todos los días, con `courier.enabled` como válvula (hoy el
  horario no mira el día, así que cuesta 0 h).
- **Recomendación de Claude (Codex no la vio):** L–V más el **domingo 11**
  desde la primera semana; el domingo tiene menos comida que el sábado (19.8
  contra 29 pedidos/día). El **sábado abre** tras una semana sin demoras de
  comida. Todo se maneja con el interruptor, sin programar calendario:
  Jesús lo apaga el sábado a las 6 pm y lo prende el domingo.
