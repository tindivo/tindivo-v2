# Promociones: arquitectura propuesta

> **Propuesta de Claude, 2026-10-26. Trabajo, no canon.** Jesús pidió verla antes de decidir cómo serán las
> promociones («aún ando evaluando»). Nada de esto se activa: en `tindivo-prod` no hay ninguna promo encendida
> (medido el 2026-10-26, solo lectura: `promo_free_delivery.active = false` y cero platos con `free_delivery_days` o
> `free_delivery_until`). Todo lo que toque dinero pasa por la revisión de Jesús (`AGENTS.md`, invariante 9) y por
> Codex. Complementa a [`propuesta.md`](propuesta.md) (campañas y consentimientos), que cubre **a quién se le avisa**;
> esto cubre **qué descuento se aplica y quién lo paga**.

## 1. Lo que hay hoy

Lo mapeó Gemini (lectura de 0187–0275, la cotización y el checkout web); Claude comprobó en el código las afirmaciones
de las que depende esta propuesta (quién paga y las condiciones vigentes en 0275).

| Mecanismo | Dónde se configura | Quién entra | Tope y registro | Quién paga |
|---|---|---|---|---|
| Promo de lanzamiento (0187, 0209) | `app_settings.promo_free_delivery`: `{code, active, from, to, max_redemptions}` | Delivery con tarifa > 0, jornada de servicio en la ventana, teléfono verificado; una por cuenta y una por teléfono | Tope global; `promo_redemptions` con reserva → canje al entregar → liberación al cancelar | Tindivo: envío a 0, el negocio paga su comisión igual (0187, líneas 22-29) |
| Envío gratis por plato, días de semana (0227) | `menu_items.free_delivery_days` | Solo `customer_pwa`, delivery, carrito de **un solo plato** | Sin tope ni registro | Tindivo |
| Envío gratis por plato hasta una fecha (0230) | `menu_items.free_delivery_until` | Igual que la anterior | Sin tope ni registro | Tindivo |
| Recojo en el local | `businesses.accepts_web_pickup` | `pickup` | No es promo: no hay envío | Nadie |

Las fechas usan la jornada de Lima (`current_service_date()`, corte a las 05:00), nunca `current_date`.

### Problemas que una promo nueva heredaría

1. **Cada promo nueva reescribe `create_customer_order`.** La función se redefinió en **39 migraciones**; 0275 son 660
   líneas. Cada redefinición es una copia entera de la función de dinero más crítica, con el riesgo de perder algo al
   copiar.
2. **La cotización calcula por su cuenta.** `POST /customer/checkout/quote` vuelve a decidir con dos RPC de vista previa
   (`current_customer_promo_free_delivery`, `cart_item_free_delivery`). Si las reglas cambian en un lado y no en el
   otro, el cliente ve «envío gratis» y paga envío, o al revés.
3. **Las promos por plato no dejan rastro.** Solo `delivery_fee_source = 'promo'`: no se sabe cuánto costó cada una,
   a quién se le aplicó ni bajo qué regla.
4. **La app nativa no tendría las promos por plato**: exigen `p_source = 'customer_pwa'` (pendiente de la D-33).
5. **Un candado global en cada pedido.** `create_customer_order` toma `FOR UPDATE` sobre la fila
   `promo_free_delivery` en **todo** pedido de delivery con tarifa, **aunque la promo esté apagada**: dos pedidos de
   delivery simultáneos de cualquier negocio se esperan entre sí. Hoy el volumen lo tapa.
6. **La métrica de cliente nuevo está mal.** `prior_delivered_count` compara `orders.customer_phone` (9 dígitos) con el
   teléfono del perfil (E.164 desde 0277): siempre da 0 por teléfono. Solo afecta a la estadística, no a quién entra.
7. **Solo se configura por SQL.** El admin solo lee las estadísticas (`GET /admin/promo`).
8. **Siempre paga Tindivo.** Que lo pague el negocio es la D-34, abierta.

## 2. Propuesta: un solo motor de promociones

### 2.1 Datos

- **`promotions`**: una fila por promo.
  - Identidad: `id`, `code`, `title` (lo que ve el cliente).
  - `kind`: `free_delivery` (envío a 0) o `delivery_discount` (resta un monto fijo al envío). Los descuentos sobre
    platos quedan fuera hasta que Jesús los pida.
  - `funded_by`: `tindivo` o `business`. Mientras la D-34 siga abierta, solo `tindivo`.
  - Alcance: `business_id` (nulo = todos), platos en `promotion_items` (vacío = cualquiera), `single_item_only`
    (conserva la regla actual de «solo ese plato»).
  - Audiencia: `all`, `first_delivered_order` (sin entregas previas con ese número **ni** con esa cuenta) o `segment`
    (lo llena la iniciativa de campañas).
  - Cuándo y dónde: canales (`web`, `android`, `ios`; resuelve el punto 4), método (`delivery`), ventana
    `from`/`to` en jornada de Lima, días de semana y franja horaria opcionales.
  - Límites: `max_redemptions` global, `max_per_customer` (por cuenta y por número verificado),
    `min_order_amount`, `discount_amount numeric(10,2)` para `delivery_discount`.
  - Estado: `draft` · `active` · `paused` · `ended`. **`paused` es el interruptor de apagado**, desde el admin.
- **`promotion_redemptions`**: generaliza `promo_redemptions`.
  - Vínculos: `promotion_id`, `order_id` único, `customer_user_id`, `verified_phone` (E.164).
  - Ciclo: `status` reserved → redeemed → released.
  - Importes: `waived_amount numeric(10,2)` y `funded_by` copiado de la promo al reservar.
- **`orders.promotion_id`**, nulo si no hubo promo. `delivery_fee_source = 'promo'` se mantiene.

### 2.2 Una sola función decide

- **`evaluate_promotion(contexto)`**, función SQL `STABLE` y sin efectos.
  - Recibe: negocio, cuenta, número verificado, canal, método, carrito, tarifa nominal y momento.
  - Devuelve la mejor promo aplicable con su monto, o el motivo por el que no aplica (`outside_window`,
    `exhausted`, `already_used`, `not_eligible`…).
  - **Las promos no se suman**: gana la de mayor descuento y, si empatan, la más antigua.
- **La cotización la llama para mostrar; `create_customer_order` la llama para aplicar.**
  - Las mismas reglas valen en los dos lados: se acaba el punto 2.
  - Aplicar = volver a evaluar dentro de la transacción del pedido, bloquear **solo la fila de esa promo** (y solo si
    tiene tope) y reservar con índices únicos por cuenta y por número.
  - Se acaba el candado global del punto 5.
- **Se redefine `create_customer_order` una última vez para promociones.** Sus dos bloques de promo pasan a ser una
  llamada a `evaluate_promotion`. Cada promo nueva después es una fila nueva, no una migración.
- **Montos:**
  - El descuento nunca supera la tarifa: `waived = least(tarifa, descuento)`.
  - Nunca deja tarifa negativa.
  - Todo en `numeric(10,2)`; en la API viaja como cadena decimal (invariante 13).

### 2.3 Quién paga

- **`tindivo`** (lo de hoy): el envío del pedido queda reducido y no nace deuda nueva para el negocio
  (`generate_delivery_charges` ya no inserta un cargo de 0); la comisión se cobra igual. El costo lo cuenta
  `promotion_redemptions`.
- **`business`** (solo si Jesús cierra la D-34 así):
  - Al entregarse el pedido nace en `business_charges` un cargo por el monto regalado.
  - Si se cancela, no nace nada: la reserva se libera.
  - Es la única tabla donde puede vivir esa deuda (invariante 9). Pide prueba propia y la revisión de dinero de
    Jesús.

### 2.4 Admin y métricas

- **Pantalla de promociones** en `apps/admin`: crear en borrador, activar, pausar y terminar.
  - Una promo activa no se edita en lo que cambia el dinero (monto, quién paga, tope): se termina y se crea otra, para
    que cada canje apunte a reglas que no cambiaron.
  - Cada cambio deja quién y cuándo.
- **Estadísticas por promo**: canjes, costo, clientes nuevos de verdad (por cuenta y número E.164, corrige el punto 6),
  pedidos liberados y recompra a 30 días de quienes la usaron.

### 2.5 Abuso

- El cupo «uno por cliente» se ata al **número verificado**, que desde S2a pertenece a una sola cuenta (D-63). Así,
  crear cuentas nuevas no repite la promo.
- Una cuenta con riesgo (bloqueo, prepago obligatorio) puede o no entrar. **Decisión de Jesús**; la recomendación es que
  sí entre: el riesgo ya lo cubre el prepago.

## 3. Por fases

| Fase | Qué | Cambia comportamiento | Revisión |
|---|---|---|---|
| 0 | Arreglar la métrica `prior_delivered_count` (E.164) y no tomar el candado cuando la promo está apagada | No para el cliente | Codex + Jesús (toca `create_customer_order`) |
| 1 | Tablas, `evaluate_promotion` y migrar las tres promos actuales como filas `ended`, con el admin en solo lectura | No | Codex |
| 2 | `create_customer_order` y la cotización usan el motor; canal nativo incluido | Sí, con todo apagado | Codex + Jesús |
| 3 | Admin para crear y pausar | Sí | Codex + Jesús |
| 4 | Promos que paga el negocio (si la D-34 lo decide) y audiencias por segmento (campañas) | Sí | Codex + Jesús |

La fase 0 sirve sola. Las fases 1 a 3 se pueden hacer antes de saber cómo serán las promos: con el motor listo,
probar una idea es crear una fila en borrador y no una migración.

## 4. Lo que tiene que decidir Jesús

1. **D-34:** ¿quién paga, Tindivo, el negocio o según la promo?
2. **¿Se suman?** Recomendado: no; gana la mayor.
3. **«Cliente nuevo»:** ¿sin entregas con esa cuenta **y** con ese número? Recomendado: las dos cosas.
4. **¿Entran las Entregas (`courier_orders`) o solo los pedidos de restaurante?** Recomendado: solo restaurante al
   principio. Las Entregas tienen otra tarifa y otra rendición.
5. **¿Entra un cliente con prepago obligatorio?** Recomendado: sí.
6. **¿Hay un tope de gasto por día o por promo, además del tope de canjes?** Recomendado: tope de canjes y de monto;
   se pausa sola al llegar al primero que se cumpla.
