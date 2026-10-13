# Campañas y consentimientos: propuesta aparte del plan móvil

> **Propuesta pendiente de aprobación de Jesús. No manda.** 2026-10-12 · Trabajo, no canon. Es lo que la spec de la app
> nativa ([`../movil-enmienda/spec.md`](../movil-enmienda/spec.md)) trae sobre campañas y consentimientos, sacado del plan
> móvil por decisión de Jesús: son un producto propio, con su propia aprobación, y no deben retrasar ni condicionar las
> apps. Las filas de origen están en [`../movil-enmienda/clasificacion.md`](../movil-enmienda/clasificacion.md) («Fuera de alcance →
> campañas»: 3, 12, 15, 43, 44, 47, 51, 52, 55, 61, 63, 64, 65, 89, 96, 99).

## 1. Qué trae la spec

- **Consentimientos** (§2.8, §6, §7): `consent_events` solo de inserción (transaccional y promocional, con `text_version`);
  dos textos (`orders-v1` tras el primer pedido, `promo-v1` en la siguiente apertura o en Cuenta › Notificaciones); estado
  vigente con `current_consent`; gestión en la app.
- **Campañas** (§2.11, §5, §6, §7): `campaigns` (borrador, programada, enviando, enviada, cancelada), `campaign_deliveries`
  (bitácora con el motivo de cada omisión), `notification_opens`; segmentos por categoría de «Clientes Frecuentes»; tope de
  frecuencia y ventana horaria; envío por FCM/APNs; «probar en mi dispositivo»; embudo enviado → abierto → pedido → ingresos.
- **Atribución** (§7): `campaignId` en el *deep link*, guardado con el carrito y enviado al crear el pedido
  (`orders.campaign_id`), ventana de 24 h desde la apertura.
- **Inicio por segmento** (§5): bloques comerciales «para el segmento del usuario» (la parte sin segmento está en
  D-52 de la enmienda).

## 2. Lo que el plan ya dice y esta propuesta debe respetar

| Tema | Dónde | Qué dice |
|---|---|---|
| Consentimiento y marketing | `Docs/planes/movil/decisiones.md` D-24 (**abierta**) | Empezar por `order_updates` (no comercial) y añadir `promotions` más tarde; texto estándar |
| Motor de notificaciones | D-25 (**abierta**) | FCM/APNs directos para lo transaccional; evaluar un servicio gestionado **solo para campañas** si construir segmentos y programación cuesta más de lo que vale |
| Quién financia cupones y promos | D-34 (**abierta**) | Depende del modelo económico; Tindivo no retiene fondos |
| App Store 4.5.4 | `Docs/trabajo/movil/07-publicacion-tiendas.md` R7 | Interruptor aparte para promociones, apagado por defecto; los avisos del pedido no dependen de él. Solo obliga **si la app envía promociones** |
| Análisis | `Docs/trabajo/movil/03-requisitos/NAT-capacidades-nativas.md` | `NAT-CON-001…003` (M1), `NAT-MKT-001…007` (M2, ya con segmentos, tope y silencio) |
| Revisión legal | D-04, D-23/D-24 | La hace Jesús; hay orientación técnica sobre la Ley 29733, no asesoría |
| Dinero | `AGENTS.md` invariante 9 | Todo cambio que toque dinero (descuentos, comisiones, tarifas) requiere la revisión explícita de Jesús antes de aplicarse |

Ninguna de las tres decisiones abiertas (D-24, D-25, D-34) está resuelta: esta propuesta las toca, así que no se puede
aprobar sin cerrarlas.

## 3. Cuidado con los datos de la spec

- **«Categorías de Clientes Frecuentes: VIP, Activo, Dormido o Nuevo»**: esa segmentación **no existe en el repo**. La spec
  misma dice «sin verificar su nombre en código».
  - `grep -rni dormido` sobre el repo (sin `node_modules`) da dos aciertos y ninguno es un segmento: el comentario de
    `apps/customer/features/tracking/hooks/use-tracking.ts:89` («un canal de Realtime pudo quedarse dormido») y una frase
    de `DECISIONS.md:1232` («con Jesús dormido»). `VIP` no aparece como segmento en ninguna parte.
  - Lo que sí existe es la **segmentación A/B/C/D del admin** (`/monitoreo`, función de la migración
    `0192_monitoring_online_and_conversion.sql`, líneas 159-162; `apps/admin/app/monitoreo/page.tsx:541-600`): por número de
    pedidos reales en v2, **5 o más → A, de 2 a 4 → B, 1 → C, 0 → D** (D es el histórico del v1, «no accionable»). No mira
    cuánto hace que el cliente pidió por última vez, que es lo que significa «dormido». Y está pensada para el cruce con
    clientes **sin cuenta** (`profiles_without_phone`).
  - Conclusión: «Dormido» es un segmento **nuevo** que habría que definir y construir; no hay nada que reutilizar salvo los
    pedidos (`orders.customer_phone`, `orders.delivered_at`, índices `orders_customer_phone_idx` y `orders_delivered_at_idx`
    en `0002_tables.sql`).
- **Cuántos pueden recibir un push hoy**: el análisis midió (2026-09-20, `NAT-capacidades-nativas.md`) 11 de 77 cuentas de
  cliente con push y 0 en iPhone. El techo de una campaña por push es esa cifra mientras no haya app instalada. Hay que
  volver a medirlo antes de decidir.
- **Operación real**: `tindivo-prod` tiene 386 teléfonos distintos en 44 días (`decisiones.md` §4, supuesto 2); 254 pidieron una
  vez. El universo de «dormidos» es pequeño y de pocos días: cualquier umbral hay que elegirlo con la distribución real.

## 4. Experimento sin desarrollo (empezar ya)

**Idea:** antes de construir campañas, comprobar si una oferta mueve pedidos. Si no los mueve, no se construye el sistema.

1. **Segmento «Dormido» provisional**, sacado a mano con una consulta de solo lectura (no existe en el sistema): clientes con
   al menos un pedido entregado cuyo último pedido entregado fue hace más de *N* días, con *N* elegido mirando la
   distribución (con la base tan joven, algo como 21 días; el valor es una propuesta). Boceto, a validar contra el esquema
   real antes de ejecutar:

   ```sql
   select customer_phone,
          max(delivered_at) as ultimo,
          count(*) as pedidos
   from public.orders
   where status = 'delivered' and customer_phone is not null
   group by customer_phone
   having ((now() at time zone 'America/Lima')::date
           - (max(delivered_at) at time zone 'America/Lima')::date) > 21;
   ```

   Hora de Lima, nunca `current_date` (invariante 10).
2. **Dos grupos al azar** con la misma lista: *oferta* y *control* (no se les escribe). Tamaño: el que dé la lista; con grupos
   chicos solo se verá un efecto grande, y hay que aceptarlo antes de empezar.
3. **Oferta con código propio**, la misma para todos los del grupo, con vigencia corta. El código es una palabra que la
   cajera reconoce al tomar el pedido (la cajera teclea el 86 % de los pedidos, `decisiones.md` §5).
   **El coste lo decide Jesús** (D-34): si la oferta es un descuento o un envío gratis a cargo de Tindivo, toca dinero y
   necesita su revisión (invariante 9). La promo de lanzamiento (`0187`) ya tiene su ledger en `promo_redemptions`; reutilizarla
   para este fin es un cambio de configuración y de reglas, no un «sin desarrollo», y no se propone aquí.
4. **Canal**: *Web push* a quien esté suscrito (no llega a quien no tenga la PWA ni a iPhone sin instalar) y *WhatsApp* manual
   desde el número de Tindivo a quien no. Por escrito y a mano, sin automatizar. **Consentimiento:** quien pidió a Tindivo
   conoce al negocio, pero que le escriban ofertas no es lo mismo que recibir el aviso de su pedido; el texto de
   privacidad vigente es de 2026-05 y no menciona marketing (`07` R5). Hasta que Jesús lo decida, el mensaje es
   **una sola oferta puntual, con forma de baja («responde NO y no te escribimos»)**, y quien responda queda anotado.
5. **Medición**: sin código nuevo. A los 14 días, una consulta de solo lectura que cuente pedidos entregados por teléfono
   de cada grupo desde la fecha del envío, y cuántos nombraron el código (la cajera lo anota en las notas del pedido).
   Comparar *oferta* frente a *control*.
6. **Criterio de decisión, fijado antes de empezar**: por ejemplo, «el grupo de oferta pide al menos X pedidos más que el
   control y el coste por pedido adicional es menor que Y». X e Y los pone Jesús; sin ellos, el experimento no se lanza.

**Qué no prueba:** no mide el sistema de campañas (programación, tope, atribución por *deep link*) ni la aceptación del
permiso de push en la app; mide solo si **una oferta a clientes que dejaron de pedir** trae pedidos de vuelta.

## 5. Si el experimento funciona: el sistema

Se parte de la spec, pero con el plan por delante:

1. Cerrar **D-24, D-25 y D-34** (consentimiento, motor, quién paga).
2. Registro de dispositivos y envío nativo (paso 5 del contrato): es prerrequisito, no parte de campañas.
3. Consentimiento y baja (`consent_events`), con la revisión de Jesús del texto.
4. Segmento «Dormido» (y los demás) como consulta sobre `orders`, no como tabla; tope de frecuencia y ventana horaria en
   `app_settings`, no en el código.
5. Campañas con bitácora de entregas y atribución. La atribución por 24 h y el `campaign_id` en `orders` tocan `create_customer_order`
   (dinero y pedidos): Codex.
6. Si D-25 resulta en un servicio gestionado, la propuesta de `campaigns`/`campaign_deliveries` se reduce a la atribución.

Cada paso se propone y se aprueba aparte; nada de esto se lanza antes de que el experimento de §4 diga que vale la pena.

## 6. Preguntas para Jesús

1. ¿Qué *N* de días y qué oferta (descuento, envío gratis, obsequio) para el experimento, y quién la paga? (D-34, dinero).
2. ¿Qué diferencia de pedidos y de coste decide que vale la pena construir? (§4.6).
3. ¿Aceptas escribir por WhatsApp a quien ya pidió, con baja explícita, antes de que exista la política de privacidad nueva?
4. ¿Se cierran D-24, D-25 y D-34 ahora o después del experimento?
