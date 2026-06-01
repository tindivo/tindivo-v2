# 14 · Roadmap y fuera de alcance del MVP

> Lo que NO está en el MVP v2. Cada item incluye qué es, por qué se posterga, qué espacio dejamos en el modelo de datos para que su implementación futura no requiera migración mayor.

---

## Tabla de contenidos

- [1. Principios para post-MVP](#1-principios-para-post-mvp)
- [2. Encomiendas](#2-encomiendas)
- [3. tienda.tindivo.com](#3-tiendatindivocom)
- [4. Apps nativas iOS / Android](#4-apps-nativas-ios--android)
- [5. Pasarela de pago digital](#5-pasarela-de-pago-digital)
- [6. Real-time GPS tracking](#6-real-time-gps-tracking)
- [7. Cupones, promociones y descuentos](#7-cupones-promociones-y-descuentos)
- [8. Propinas digitales al motorizado](#8-propinas-digitales-al-motorizado)
- [9. Heatmap geográfico de demanda](#9-heatmap-geográfico-de-demanda)
- [10. Multi-tenant (replicar a otros pueblos)](#10-multi-tenant-replicar-a-otros-pueblos)
- [11. Rol de soporte](#11-rol-de-soporte)
- [12. Verificación de teléfono por SMS](#12-verificación-de-teléfono-por-sms)
- [13. Internacionalización (i18n)](#13-internacionalización-i18n)
- [14. Calificaciones y reviews](#14-calificaciones-y-reviews)
- [15. Programa de fidelización del cliente](#15-programa-de-fidelización-del-cliente)
- [16. Roadmap propuesto en fases](#16-roadmap-propuesto-en-fases)

---

## 1. Principios para post-MVP

Antes de listar features pendientes, dejamos por escrito los principios que ordenan las prioridades:

1. **No se agrega nada nuevo si no se completa lo anterior.** Si una feature post-MVP queda a medias, ensucia el sistema.
2. **Cualquier feature post-MVP debe poder construirse SIN romper el esquema de BD actual.** El MVP deja "huecos" deliberados (campos opcionales, tablas placeholder) para no requerir migración mayor.
3. **Las features post-MVP no compiten contra los principios v2**: REST único, vertical slicing, RLS, idempotencia. Se construyen DENTRO de la misma arquitectura.
4. **Prioridad = volumen × dolor del cliente actual**. No se construye nada "porque sería interesante". Se construye porque resuelve un dolor verificado.

---

## 2. Encomiendas

**Qué es**: un cliente paga a Tindivo para que un motorizado lleve un paquete (no comida, no de un restaurante) desde una dirección de origen a una dirección destino. Caso típico: documentos urgentes, regalos, paquetes pequeños.

**Por qué se posterga**:
- Requiere un nuevo flujo de creación (origen + destino, no restaurante).
- Cobro al cliente directo, no al negocio — modelo financiero distinto.
- Riesgo legal (qué transportar y qué no).
- No hay validación de demanda real todavía.

**Espacio que dejamos**:
- `orders` ya tiene los campos suficientes (pickup_address, delivery_address, client_phone). Solo faltaría `delivery_type` con valores `food` (default) | `parcel`.
- `businesses` no se usaría — el origen sería un cliente persona o el propio Tindivo.
- En `01-requerimientos-funcionales.md` no se incluye sección de encomiendas, pero el dominio `packages/core/src/modules/` puede crecer con un módulo `parcels/` heredando de `orders/`.

**Cuándo construirlo**: fase 2 (mes 4-6 post-MVP), si llegan ≥ 10 pedidos/mes de clientes preguntando "¿pueden llevarme un paquete?".

---

## 3. tienda.tindivo.com

**Qué es**: subdominio con productos de un almacén propio de Tindivo (no de negocios afiliados). Caso típico: agua embotellada, snacks, productos esenciales. Tindivo compra inventario y revende con margen + delivery propio.

**Por qué se posterga**:
- Implica capital de trabajo (inventario).
- Logística de almacenamiento.
- Pricing strategy (competir con bodegas locales).
- Cambia el modelo: de orquestador a vendedor.

**Espacio que dejamos**:
- Subdominio `tienda.tindivo.com` se puede crear como nueva PWA en `apps/tienda/` reusando 100% de `packages/ui`, `packages/api-client`, `packages/contracts`.
- En BD: nueva tabla `tindivo_products` análoga a `menu_items` pero sin `business_id` (es propio).
- En `businesses` se podría crear UN registro especial `name='Tindivo'` con flag `is_platform=true`.

**Cuándo construirlo**: fase 3 (mes 6-12 post-MVP), si el MVP demuestra capacidad operativa y se valida demanda de productos no-comida.

---

## 4. Apps nativas iOS / Android

**Qué es**: empaquetar las PWAs (`tindivo.com`, `negocios.tindivo.com`, `motorizados.tindivo.com`) como apps nativas usando **Capacitor**, distribuidas en App Store y Play Store.

**Por qué se posterga**:
- La PWA en iOS 16.4+ con instalación en Home Screen cubre el caso de uso del cliente y motorizado.
- App Store / Play Store implican proceso de revisión, certificados, fees ($99/año Apple).
- Diferenciación visual nativa vs web es marginal cuando la PWA ya está bien construida.

**Espacio que dejamos**:
- La API es REST puro, no Server Actions — **listo para Capacitor**.
- `packages/api-client` ya es typed y portable.
- El service worker de cada PWA es compatible con Capacitor (con ajustes mínimos).
- `Web Push VAPID` es reemplazable por APNs/FCM con poco cambio en `send-push` Edge Function.

**Cuándo construirlo**: fase 2-3, **solo si** los reviews del cliente o el feedback del motorizado piden explícitamente "una app del Play Store". Hasta entonces, la PWA gana en velocidad de iteración.

---

## 5. Pasarela de pago digital

**Qué es**: integración con Niubiz, Culqi, MercadoPago o similar para que el cliente pague con tarjeta antes de que el pedido salga del local. El dinero llega a Tindivo, que después liquida al negocio.

**Por qué se posterga**:
- El piloto opera con Yape al recibir / efectivo / prepago Yape (transferencia manual). Funciona porque la confianza local es alta.
- Costos de pasarela: ~3-5% por transacción. En pedidos de S/15-50, eso son S/0.50-2.50. Demasiado para el margen de S/1 que ya tomamos.
- Compliance PCI-DSS si manejamos tarjetas directamente.

**Espacio que dejamos**:
- `payment_intent` en `orders` ya tiene los campos `status`, `amount`, `client_pays_with`. Agregar `gateway_transaction_id` y `gateway_provider` es trivial.
- Tabla nueva `payment_gateway_events` para webhooks de Niubiz/Culqi.
- El módulo `notifications/` ya soporta webhooks via Edge Functions.

**Cuándo construirlo**: fase 3-4, si llegamos a un pueblo donde la cultura del Yape no esté tan instalada o si los negocios piden cobro digital adelantado para reducir cancelaciones de "el cliente no contestó".

---

## 6. Real-time GPS tracking

**Qué es**: el cliente ve en `tindivo.com/pedidos/<shortId>` un mapa con un pin que se mueve mostrando la posición del motorizado en tiempo real.

**Por qué se posterga**:
- Requiere consumo continuo de batería del motorizado (problema reportado de Tindivo en otros pueblos).
- Consumo de Realtime de Supabase crece con N drivers × N clientes mirando.
- Precisión GPS en pueblos pequeños es inconsistente (calles sin nombre, GPS rebota).
- Crea expectativa que no siempre se cumple ("¿por qué el pin no se movió 5 min?").

**Espacio que dejamos**:
- `drivers` ya puede tener `last_location_at`, `last_lat`, `last_lng` opcionales.
- El service worker del motorizado puede tener `setInterval(updateLocation, 30000)` con visibilidadAPI.
- La PWA del cliente puede agregar un componente `<LiveDriverMap />` cuando esté disponible.

**Cuándo construirlo**: fase 3+, solo si la encuesta al cliente pide explícitamente "saber dónde está el motorizado". Hoy el ETA y el estado funcionan.

---

## 7. Cupones, promociones y descuentos

**Qué es**: códigos promocionales que el cliente ingresa al checkout (`DESCUENTO20`, `BIENVENIDA`), descuentos por volumen, ofertas relámpago de un negocio.

**Por qué se posterga**:
- Complejidad de modelado (códigos únicos, límites de uso, fechas válidas, restricciones por usuario / por negocio / por categoría).
- Riesgo de fraude (códigos compartidos en grupos de WhatsApp).
- No es el principal driver de adquisición en pueblos pequeños (es boca a boca).

**Espacio que dejamos**:
- En `orders` agregar `discount_amount` y `coupon_code` (opcional, default null).
- Nueva tabla `coupons` con `code`, `discount_pct` o `discount_amount`, `valid_until`, `max_uses`, `business_id` (null si es Tindivo-wide).
- En `payment_intent`: `subtotal`, `discount`, `total`.

**Cuándo construirlo**: fase 2 si llega Black Friday / Día de la Madre / Fiestas Patrias y un negocio piloto pide "una promoción para mover stock".

---

## 8. Propinas digitales al motorizado

**Qué es**: al final del pedido, el cliente puede dejar una propina al driver vía la app (S/2, S/5, S/10, o monto custom). El dinero llega al driver vía Yape automatizado o se acumula y se paga semanal.

**Por qué se posterga**:
- En pueblos pequeños, la propina se da en mano cuando el driver llega — la digital pierde el ritual.
- Requiere flujo de pago del cliente al driver (no a Tindivo) — complica el modelo.
- Posible incomodidad social ("ya pagué la propina por la app, no le doy nada al driver").

**Espacio que dejamos**:
- `orders` puede tener `tip_amount` (opcional).
- `driver_tips_log` para acumular propinas pendientes de pago al driver.

**Cuándo construirlo**: solo si los drivers lo piden activamente. No hoy.

---

## 9. Heatmap geográfico de demanda

**Qué es**: visualización en el admin de qué zonas del pueblo piden a qué hora, para decidir dónde apostar driver, qué negocios sugerir abrir.

**Por qué se posterga**:
- Requiere ≥ 1,000 pedidos para que el heatmap muestre algo útil. Si el piloto MVP termina con 1,000, ya tenemos data y podemos construir.
- Implica integración con `react-leaflet` heatmap layer + GeoJSON de zonas.

**Espacio que dejamos**:
- `orders.delivery_latitude` y `orders.delivery_longitude` ya existen.
- `admin/metrics/demand-heatmap` endpoint placeholder. La query SQL sería: `SELECT lat, lng, count(*) FROM orders WHERE created_at > now() - 30d GROUP BY round(lat,3), round(lng,3)`.

**Cuándo construirlo**: fase 2 (cuando haya ≥ 500 pedidos con coords).

---

## 10. Multi-tenant (replicar a otros pueblos)

**Qué es**: que Tindivo opere simultáneamente en N pueblos (San Jacinto, Casma, Chimbote, ...) con datos aislados pero código compartido.

**Por qué se posterga**:
- MVP es un solo pueblo. Antes de pensar en multi-pueblo, validar que UN pueblo funciona.
- Multi-tenancy en Supabase requiere o `tenant_id` en cada tabla (riesgo de bug) o un proyecto Supabase por tenant (más caro pero más aislado).

**Espacio que dejamos**:
- Decidir en fase 2 entre:
  - **Schema único + `tenant_id`**: agrega columna en cada tabla, RLS filtra por `tenant_id` del user. Más eficiente, más riesgoso (un bug en RLS expone todo).
  - **Schema por tenant**: cada pueblo tiene su schema en Postgres. Más aislado, más caro de mantener.
  - **Proyecto Supabase por tenant**: máxima isolación, máximo costo. Para >5 pueblos no escala.
- En MVP NO agregamos `tenant_id` para no contaminar el modelo. Si se hace multi-tenant, migración expand-contract.

**Cuándo construirlo**: fase 3+, si el piloto en San Jacinto es exitoso y queremos abrir Casma como segundo pueblo.

---

## 11. Rol de soporte

**Qué es**: un usuario humano adicional al admin, con permisos limitados (puede resolver disputas, ver historial, pero no editar settings ni datos sensibles).

**Por qué se posterga**:
- En MVP el admin es uno solo (el fundador). No hay equipo.
- Agregar el rol implica decidir permisos granulares y diseñar UI condicional.

**Espacio que dejamos**:
- En `users.role` ya hay enum. Agregar `'support'` como valor.
- En `admin.tindivo.com` el menú puede filtrar items por rol (si `support` → ocultar Configuración, Cobros, Auditoría).

**Cuándo construirlo**: cuando el admin no dé abasto (estimado: mes 6-9 post-MVP).

---

## 12. Verificación de teléfono por SMS

**Qué es**: al registrar un cliente, enviar SMS con código OTP para confirmar que el teléfono es real.

**Por qué se posterga**:
- Costo de SMS (~S/0.10 por mensaje en Perú). En miles de registros, suma.
- En MVP la confianza viene de la **llamada del negocio** confirmando el pedido (ver `07-flujo-cliente.md` regla "Confirmación humana"). Si el teléfono es falso, el negocio se entera en la primera llamada.

**Espacio que dejamos**:
- `customer_profiles` puede tener `phone_verified_at` (default null).
- Endpoint `/public/customer-auth/verify-phone` con código OTP.
- Integración Twilio o servicio peruano (Infobip, MessageBird).

**Cuándo construirlo**: si la tasa de "teléfono no contesta" supera el 10% en MVP.

---

## 13. Internacionalización (i18n)

**Qué es**: traducir todas las cadenas a otros idiomas.

**Por qué se posterga**:
- Tindivo opera en pueblos peruanos de habla hispana. No hay caso de uso.
- Agregar i18n implica reescribir strings hardcoded.

**Espacio que dejamos**:
- En MVP, todos los strings están en JSX directo (no `useTranslation`). Si llega el momento, se hace refactor con `next-intl` o `lingui`.

**Cuándo construirlo**: si Tindivo se expande a Bolivia, Ecuador o regiones con quechua / aymara. No previsto.

---

## 14. Calificaciones y reviews

**Qué es**: tras la entrega, el cliente puede calificar al negocio (1-5 estrellas) y al motorizado, dejar comentario.

**Por qué se posterga**:
- En pueblos pequeños, todos se conocen — un review negativo daña relaciones reales.
- Tindivo no busca ser "el TripAdvisor de pueblos chicos".

**Espacio que dejamos**:
- Tabla `reviews` con `order_id`, `business_rating`, `driver_rating`, `comment`. Placeholder, sin endpoints en MVP.

**Cuándo construirlo**: cuando lleguen ≥ 10 pueblos con N negocios donde el cliente no conoce personalmente al dueño y necesite señales de calidad.

---

## 15. Programa de fidelización del cliente

**Qué es**: el cliente acumula puntos por cada pedido entregado. Cada X puntos = un descuento.

**Por qué se posterga**:
- Complejidad de modelado (puntos, expiración, canje, restricciones).
- En pueblos pequeños la fidelidad ya existe por confianza personal, no por programa.

**Espacio que dejamos**:
- Tabla `customer_loyalty_points` con `user_id`, `points`, `valid_until`. Placeholder.
- En `orders`, campo `points_earned` (default 0).

**Cuándo construirlo**: fase 3-4, si hay churn de clientes y queremos retención artificial.

---

## 16. Roadmap propuesto en fases

| Fase | Mes | Foco | Features clave |
|---|---|---|---|
| **MVP v2** | 0-3 | Operar en San Jacinto | Las 5 apps + fix bug push + capacidades de negocio |
| **Fase 2** | 4-6 | Madurez del piloto | Encomiendas, cupones (si hay demanda), heatmap, rol soporte |
| **Fase 3** | 7-12 | Expansión geográfica | Multi-tenant a 2-3 pueblos, real-time GPS, apps nativas Capacitor |
| **Fase 4** | 13-18 | Productización | `tienda.tindivo.com`, pasarela pago, calificaciones, fidelización |
| **Fase 5+** | 18+ | Escalamiento | i18n, multi-tenant a 10+ pueblos, BFF por canal, infra dedicada |

**Reglas para promover una feature de "fuera de MVP" a una fase activa**:
1. Hay ≥ 3 usuarios actuales pidiéndola explícitamente.
2. El esfuerzo estimado cabe en un sprint de 2 semanas.
3. No bloquea otras features ya planificadas.
4. Tiene métrica de éxito definida (qué pasa si se construye).

---

**Notas finales**:

- Este documento se revisa cada cuatrimestre. Si una feature aquí pasa a ser prioridad, se mueve a un doc `Docs/post-mvp/<feature>.md` con su propio PRD.
- El MVP NO se compromete a entregar nada de este doc. Si el usuario o stakeholder lee este doc, debe entender que cualquiera de estos items "podría" ocurrir, no que "ocurrirá".
