# Tindivo Entregas · Estado actual (inventario para auditar)

> 2026-09-30, rama `tindivo-courier` (commit de hoy). Qué existe, cómo viaja la
> información y qué falta. Verificado en código y en `tindivo-prod`.

## 1. Cliente (`apps/customer`, tindivo.com)

1. **Mapa del punto A:** arrastra el mapa (el pin fijo al centro) + **referencia
   obligatoria** («frente a la plaza»). GPS opcional.
2. **Mapa del punto B:** igual.
3. **«Confirma tu pedido»:** nombre y celular (9 dígitos) de quien entrega y de
   quien recibe. Botón **«Soy yo»** en cada uno. Contactos recientes.
4. **«¿Quién paga?»:** quien entrega (se cobra al recoger) o quien recibe (al
   entregar).
5. **«¿Qué llevamos?»:** chips (Papeles, Paquete, Medicinas) + descripción
   (≤ 120), «Es frágil», y la casilla **«Ya está listo y pagado. Tindivo no
   compra ni adelanta dinero. Máx. 5 kg»**. Botón «Pedir entrega · S/ 3».
6. **Seguimiento:** buscando motorizado → confirmado → recogido → en camino →
   entregado / cancelado. Se actualiza en vivo (realtime + consulta periódica).
   El cliente puede cancelar.

**Para pedir hace falta cuenta:** Google o correo, más el celular del perfil.
**Reglas al crear** (en la base): servicio encendido, dentro del horario
(18–23 h, **todos los días**: no distingue días), al menos un motorizado
«disponible», A y B dentro de la zona de cobertura, **1 pedido activo por
celular** (salvo la cuenta de WhatsApp de Jesús), precio S/ 3 de la
configuración, «listo ahora» forzado.

## 2. Motorizado (`apps/motorizados`)

- **«En espera»:** tarjetas **azules** «Entregas por aceptar», arriba de la
  comida. Muestran «Pedido a nombre de…», referencias de A y B, qué es, y
  «Cobrar S/ 3 al recoger / al entregar». **Sin teléfonos.** Botón «Aceptar
  entrega». Aviso si ya tiene el máximo.
- **«Míos»:** sus entregas, **con «Llamar»** a quien entrega y a quien recibe.
  Botones:
  - **Recogido:** si paga quien entrega, pregunta **Yape / Efectivo**.
  - **Entregado:** si paga quien recibe, pregunta **Yape / Efectivo**.
  - **No se pudo:** motivo (No estaba listo · No contestan · Otro). Si ya
    recogió: «Devuélvelo a quien te lo entregó y llama a Jesús».
  - **Soltar:** solo antes de recoger y si no cobró.
- **Se entera por consulta cada 15 s, solo con la app abierta en pantalla.**

## 3. Reglas del servidor (migración `0235`)

- Cada botón es **una sola transacción** e **idempotente**: repetirlo tras un
  corte no duplica ni deja a medias.
- **Tope de 2 entregas activas por motorizado** (`app_settings`), con bloqueo
  para que dos toques simultáneos no lo pasen.
- **No se recoge sin cobrar** si paga quien entrega; **no se entrega sin
  cobrar** si paga quien recibe. El método (Yape/efectivo) es obligatorio.
- **No se puede soltar lo ya cobrado.** Un motorizado no puede tocar la
  entrega de otro.
- Sin aceptar en **15 min** → se cancela sola (motivo `no_driver`), sin cobro.

## 4. Cómo viaja la información

```
Cliente (web) ──POST /customer/courier-orders──► create_courier_order
                                                   └► courier_orders (requested)
                                                   └► courier_order_events
                                                   └► Inngest: vence a los 15 min
Motorizado (app abierta) ──GET cada 15 s──► /driver/courier-orders
Motorizado (botón) ──POST /driver/courier-orders/:id/step──► driver_courier_step
Cliente (seguimiento) ◄── realtime + GET /public/courier/:shortId
```

## 5. Lo que NO existe

| Qué | Consecuencia |
|---|---|
| **Panel de admin** de Entregas | Jesús solo ve solicitudes en el panel de Supabase o con `consultas.sql` |
| **QR de Yape del motorizado en la app** | Lo muestra en su celular o impreso |
| **Crear pedido «a nombre de» otro cliente** (canal WhatsApp) | Jesús usa su cuenta; su nombre sale como «a nombre de» |

## 5-bis. Hecho el 2026-10-01 (`0238`)

- **Push de Entregas**, por el mismo outbox que la comida (`courier_order_events`
  → trigger → `domain_events` `CourierStepped` → `send-push`):
  - Motorizados: «📦 Entrega nueva» y «🔓 Entrega libre otra vez» (abre `/entrega/[id]`).
  - Cliente: tomada, recogida, entregada, no se pudo, vencida (abre `/entregas/[shortId]`);
    la hoja de seguimiento le ofrece activar los avisos.
  - Motorizado: «Entrega cuadrada» cuando Jesús confirma la rendición.
- **Horario por días**: `courier.hours.days` (ISO 1–7). Encendido 18–23 h, lunes a domingo.
- **Sin descuentos**: promo de lanzamiento `active: false` y envío gratis por plato en NULL.

- **La entrega activa se ve en vivo** (`0239`): `courier_orders` no estaba en
  la publicación de Realtime, así que el banner «Entrega en curso», el badge
  de «Pedidos» y el seguimiento nunca recibían eventos. Además el store recarga
  al pedir, al volver a la app y al cambiar de sesión.
- **`/pedidos` lista las entregas** junto a la comida (las vivas primero).
- **Mapas** (`@tindivo/map`): el mapa del motorizado usa las mismas piezas que
  el del cliente — pines A/B con su globo, línea punteada y las referencias del
  pueblo (`map_landmarks`). Mosaicos: CARTO en producción (con su key); en
  desarrollo sin key, OpenStreetMap.

- **Abre en su horario aunque nadie esté «Disponible»** (`0240`): ni la card
  ni `create_courier_order` exigen ya un motorizado con el interruptor
  prendido. El push llega a todos los activos; si nadie la toma, vence a los
  15 min sin cobro.
- **`/entregas` muestra «Lugares»** de `map_landmarks` (negocios de todo tipo,
  colegios, plazas, iglesias…), las mismas referencias de los mapas del
  cliente y del motorizado, no `directory_businesses`. Tocar uno → «Recoger
  aquí» abre el pedido con ese punto como recojo.

## 6. Estado en `tindivo-prod`

- `0232` y `0233` aplicadas; **`0234` y `0235` pendientes** (`supabase db push`).
- Entregas **apagado** (`enabled: false`), 0 pedidos, 0 negocios en el directorio.
- La rama no está en `main`: producción no tiene nada de esto en las apps.

## 7. Pruebas que ya pasan (local)

- 32 tests de integración de la base (creación, límites, tope, cobro, soltar,
  idempotencia, ajenos, «listo ahora», cuenta de WhatsApp).
- e2e del cliente: pedir con el mapa hasta «Buscando motorizado».
- e2e del motorizado: aceptar → recogido → entregado con Yape, verificado en la base.
