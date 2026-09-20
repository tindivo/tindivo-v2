# 06 · Backlog de Encargos (fuera de v1)

> v0.1 · 2026-09-18. Ideas que **no entran en la primera versión**, con lo que hay que saber antes de retomarlas. Cada una lleva su **condición de entrada**: el dato que diría que ya toca.

---

## B-1 · Subir la oferta mientras se busca motorizado

**La idea (Jesús):** si nadie acepta, el cliente puede **subir el monto de S/ 0.50 en S/ 0.50** para que el encargo gane prioridad y salga más rápido. Además, monetiza.

**Mi opinión: buena idea, pero no en v1, y hay una decisión previa que la cambia entera.**

1. **Hoy subir el precio no motiva al motorizado.** Con sueldo fijo y todo el dinero yéndole a Tindivo como deuda (`02` §5), un encargo de S/ 4.00 y uno de S/ 3.50 valen **lo mismo para él**. Para que la subida acelere algo, hay que decidir **a dónde va el extra**:
   - **(a) Todo a Tindivo** → monetiza, pero **no cambia el comportamiento** del motorizado.
   - **(b) Todo al motorizado, como bono** → sí lo motiva, y a Tindivo le cuesta cero. Es lo que hace inDrive con «ofrece tu tarifa».
   - **(c) Repartido** (p. ej. mitad y mitad).
   *Si se hace, recomiendo (b) o (c).* Con (a) el cliente paga más y nada mejora.

2. **Con un solo motorizado, «prioridad» tiene poco que ganar.** El cuello de botella no es que los motorizados prefieran otro encargo, es que **hay uno solo y puede estar ocupado con comida**. Subir el precio no lo multiplica. Solo ayuda a decidir el orden entre encargos, o a que un motorizado prefiera un encargo a una espera.

3. **No debe pasar por encima de un pedido de restaurante.** Es comida caliente de un cliente que ya pagó y de un negocio que es quien sostiene la plataforma hoy. La subida ordena los encargos **entre sí**, nunca contra los pedidos.

4. **Complejidad real, pero acotada.** Hace falta `boost_amount` **separado** de `price` (para no reescribir el precio congelado), pasos y tope (propuesta: +S/ 0.50, máximo +S/ 2.00), un push «subió a S/ X» a los motorizados, y que la deuda sea `price + boost_amount`. Todo dentro de `searching`.

**Condición de entrada:** cuando la tasa de encargos `expired` (nadie aceptó) supere el **15 %** (`04`, métricas) **o** haya más de un motorizado activo. Antes, no hay problema que resolver.

**Alternativa barata (cuando se trabaje el admin):** avisar al admin si una solicitud lleva unos minutos sin aceptar, para que **llame al motorizado**. Por ahora **no se hace** (decisión de Jesús): los avisos y el panel del admin se trabajan después.

---

## B-11 · Servicio de día y motorizados independientes

**La idea (Jesús):** empezar solo de noche, como prueba. Más adelante, **darle el software a amigos que hacen mototaxi** para que atiendan encargos durante el día.

**Lo que hay que saber antes:**

1. **Hoy los motorizados son de Tindivo, con sueldo fijo** (`DECISIONS §4`), y el modelo de dinero de Encargos (`02`) está armado para eso: el motorizado le debe a Tindivo el precio completo.
2. **Un mototaxista independiente no trabaja por sueldo, trabaja por viaje.** Ganaría una parte del S/ 3 y le debería el resto a Tindivo. **La deuda derivada de `02` §5 sirve igual** (deuda = precio − su parte), y por eso conviene dejar la fórmula parametrizable desde ahora: `debt = price − driver_share`, con `driver_share = 0` mientras sea sueldo fijo.
3. **Esto es el bono del motorizado (B-8) de verdad**, y probablemente lo que destraba también la subida de oferta (B-1): si el motorizado gana por encargo, subir el precio sí lo motiva.
4. **Multi-tenant y motorizados de terceros** están hoy **fuera de alcance** (`DECISIONS §14`, roadmap). Requiere alta de motorizados por el admin, su método de cobro y sus reglas de horario. La tabla `drivers` y `driver_availability` ya soportan la mayor parte.
5. **El horario** (hoy `platform_schedule` ≈ 18:00–23:00) tendría que ser **por motorizado**, no de la plataforma.

**Condición de entrada:** que la prueba nocturna cuadre bien el dinero durante unas semanas y haya demanda medida fuera de horario (`04`, intentos de pedir de día).

---

## B-2 · Tarifa por distancia o segunda tarifa `far`

**En v1 va S/ 3 fijo** (`02` §2), y **`distance_m` se guarda desde el primer encargo**. Este punto es la activación posterior: con datos reales, añadir escalones por distancia (`pricing.tiers`, hoy vacío). Jesús ya adelantó que **S/ 3.50 sería el tope** («si cobramos más, va a ser un poquito más complicado») y que lo pensaría para trayectos largos, p. ej. del grifo al centro (5–10 km, por medir).

**Condición de entrada:** más del 20 % de los encargos por encima de un umbral de distancia que se decidirá con los datos.

---

## B-3 · Ruta real por calles

Leaflet **no calcula rutas**, solo dibuja y mide en línea recta. Una ruta por calles exige un servicio externo (OSRM, OpenRouteService o Google) con su costo, su límite y su dependencia. El servidor público de demostración de OSRM **no es para producción**. En un pueblo de trazado corto, la línea recta es una aproximación razonable.

**Condición de entrada:** que la diferencia entre línea recta y recorrido real cause reclamos o mala tarifa.

---

## B-4 · Código de entrega de 4 dígitos

Quien recibe le dice un código al motorizado antes de que suelte el artículo. Evita entregar a quien no es. Es la mejora con más valor antifraude por menos costo.

**Condición de entrada:** el primer reclamo de «lo entregó a otra persona», o antes de abrir medicinas a volumen o encender el alcohol.

---

## B-5 · Que el destinatario fije su propia ubicación

El destinatario abre un enlace y **él mismo marca** dónde recibir. Hace más exacta la dirección, pero es una pantalla pública nueva, con su seguridad y un estado «esperando que el destinatario confirme».

**Condición de entrada:** si los reportes de «no encontré la dirección» en B son frecuentes.

---

## B-6 · Prepago con captura y validación

Para quien pide desde lejos y no puede pagar ni en A ni en B. Es el mecanismo del prepago de restaurantes (`0181`), con el admin de validador.

**Condición de entrada:** demanda real de encargos pedidos sin nadie presente en ninguno de los dos puntos.

---

## B-7 · Compras por encargo

«Cómprame esto y tráemelo.» Cambia el riesgo del efectivo: el motorizado adelanta dinero, hay que devolvérselo, y hay que rendirlo. Se diseñaría entero aparte.

**Condición de entrada:** demanda repetida y un mecanismo de adelanto de dinero (fondo del motorizado) que hoy no existe.

---

## B-8 · Bono al motorizado por encargo

Hoy sueldo fijo sin extra (`02` §6). Ligado a B-1.

**Condición de entrada:** que los motorizados dejen de aceptar encargos, o que se contrate más de uno.

---

## B-9 · Encargos programados

«Recoge esto mañana a las 10.» Requiere horario, asignación anticipada y recordatorios.

---

## B-12 · Calificaciones en los dos sentidos

**La idea (Jesús):** el cliente **califica al motorizado**, y el motorizado **califica al cliente**, para saber **cuáles clientes son confiables** y armar con eso **una base de datos**. Se pensó a futuro, con los encargos de día y los mototaxistas (B-11). **Por ahora, al backlog; no se descarta.**

**Lo que ya existe y conviene aprovechar (no lo he leído a fondo):**

- La feature de reseñas de restaurantes (`apps/customer/features/reviews`, `docs/spec/spec_resenas.md`; `DECISIONS §28`: «se capturan desde el día 1, no se publican hasta que los números lo permitan»).
- Los **strikes** y `customer_trusted_for_contraentrega` (`DECISIONS §8`), que ya deciden si un cliente es de confianza para pagar contra entrega. **La calificación del motorizado al cliente sería una señal más para ese mismo antifraude**, y conviene pensarla como tal y no como un sistema paralelo.

**Sugerencia de diseño para cuando llegue:** que el motorizado califique con **un toque** (bien / con problemas) más una etiqueta opcional (no estaba, no pagó, mal trato), porque lo hace con una mano en la puerta. La reseña del cliente puede ser más completa.

**Condición de entrada:** que haya suficientes encargos para que una calificación signifique algo, o el primer cliente problemático que se quiera recordar.

---

## B-13 · Foto del motorizado al entregar

**La idea (Jesús):** que **el motorizado tome una foto al entregar el artículo**, para avalar que se hizo. Lo ha visto en InDrive. **«Ahora vamos a trabajar con una versión más pequeña, pero hay que considerarlo.»**

**Cómo se deja preparada sin construirla:** la columna `dropoff_photo_url` (nullable) y el bucket `errand-photos` entran en el modelo desde el principio (`03` §3); son gratis. Lo que se pospone es la **pantalla de captura y subida**. Foto **al recoger**, y foto del cliente al pedir: **no** (decidido).

**Condición de entrada:** el primer «no me llegó» o «lo dejaron en otro sitio».

---

## B-10 · Strikes por no-show en encargos

Reutilizar el sistema de strikes por teléfono para clientes que dejan al motorizado esperando.

**Condición de entrada:** el primer cliente reincidente.
