# Tindivo: briefing para debate con Codex

## Envíos (recojos A→B) + Encargos (compras): producto, precios, velocidad y alianzas

> Preparado por Claude (mentor de negocio de Tindivo), 30 de septiembre de 2026.
> Propósito: que Codex revise, critique y mejore estas propuestas antes de implementarlas en la web.

---

## 0. Qué le pedimos a Codex

Actúa como segunda opinión crítica, no como validador. En concreto:

1. **Dónde estás en desacuerdo** con las propuestas y por qué.
2. **Riesgos o casos límite** que no estemos viendo (operativos, de producto o técnicos).
3. **Alternativas mejores** de flujo, precio o implementación.
4. **Orden de implementación** en la web actual, con el menor esfuerzo posible.

Filtro obligatorio para cualquier idea: **¿lo puede sostener una sola persona?** Jesús es fundador único: lleva producto, software, redes, alianzas y además apoya en la operación. Se prioriza automatización y simplicidad sobre soluciones que requieran equipo.

Empieza respondiendo las preguntas abiertas de la sección 12.

---

## 1. Contexto del negocio

- **Qué es:** plataforma de logística de última milla en **San Jacinto (Nepeña, Áncash, Perú)**, el pueblo donde nació y vive el fundador. Inspirada en el modelo de inDrive.
- **Producto actual:** marketplace de restaurantes aliados + flota propia de motorizados con software propio. El cliente pide en tindivo.com y paga contra entrega o subiendo su comprobante de Yape.
- **Tecnología:** 3 aplicaciones web (consumer, negocios/partners, motorizado). Sin apps nativas en producción. La **app móvil está planeada para octubre–noviembre 2026** (AWS). La idea es definir y validar estos flujos en la web antes de pasarlos a la app.
- **Principio operativo:** todo pedido entra por la web (control y datos). WhatsApp sirve solo para coordinar un pedido ya creado y para consultas.
- **Horario operativo:** 6 pm – 11 pm.
- **Flota entre semana:** 1 motorizado por noche (S/30/noche) + Jesús de apoyo.
- **Problema de adopción:** mucha gente del pueblo no sabe entrar a una web o prefiere llamar; falta hábito de uso.
- **Promoción actual:** videos en Facebook y afiche A6 (promo "primer delivery gratis" para los primeros 100 usuarios nuevos, solo restaurantes).
- **Alianza en curso:** Veneburguer, restaurante con delivery propio y sin tecnología, usará el sistema de Tindivo para recibir pedidos ordenados; la flota de Tindivo actúa como respaldo. Es la plantilla para futuros partners similares. Se prevé cobrar mensualidad a partners recién cuando salga la app móvil.

### Demanda (solo pedidos de restaurantes, 8 ago – 16 sep 2026)

| Día | Promedio de pedidos/día |
|---|---|
| Lunes | 15.4 |
| Martes | 10.0 |
| Miércoles | 14.0 |
| Jueves | 13.4 |
| Viernes | 13.7 |
| Sábado | 29.0 |
| Domingo | 19.8 |

- Promedio histórico ≈ 16.5 pedidos/día. **Hoy, entre semana: ~13 pedidos/día.**
- Sábado es el pico (casi el doble que el resto); martes es el valle.
- **Última semana (7 días): 126 pedidos (18/día en promedio) y S/428.50 de comisión** (≈ S/3.40 por pedido, ≈ S/61 por día).
- **Meta actual: 17 pedidos/día.** En promedio semanal ya se cumple (18/día), pero gracias al fin de semana: entre semana el promedio es ~13/día. **El hueco real está de lunes a viernes: faltan ~4 pedidos por día.** El umbral de rentabilidad que Jesús busca a mediano plazo es ~20/día.

---

## 2. Modelo actual de monetización (100% logística)

| Línea | Quién paga | Total por pedido |
|---|---|---|
| Pedido de restaurante partner | Restaurante: S/1.50 fijo. Cliente: S/2–2.50, cobrado por el restaurante en nombre de Tindivo | S/3.50–4 |
| Encargos actuales (manuales, por WhatsApp) | Solo el cliente | S/3–3.50 |

**Costos de flota:** S/30 por motorizado por noche; gasolina ≈ S/40/semana; personal ≈ S/210/semana.

**Semana real:** S/428.50 − S/210 de personal − ~S/40 de gasolina ≈ **S/178.50 netos para Jesús** (≈ S/25 por día), y además él trabaja como motorizado de apoyo. El volumen ya está cerca de la meta; el problema de fondo es el margen.

**Aritmética clave:** con S/3.40 promedio por pedido, se necesitan ~9 pedidos solo para pagar un turno de S/30. **Todo pedido adicional en un turno que ya está pagado es casi margen puro**, porque solo cuesta gasolina. Esa es la lógica de este plan: **rentabilizar al motorizado llenando su capacidad ociosa entre semana**, sin sumar costo fijo.

---

## 3. Competencia

**Zorritos Delivery (competidor principal):**

- Jesús trabajó antes con ellos y cree que copiaron su primera versión.
- Priorizan volumen promocionando los números de los restaurantes: el cliente llama al restaurante, el restaurante coordina y luego solicita a Zorritos por un sistema propio.
- **Cobran S/0 al negocio y S/2 al cliente final.** Ya ocupan gran parte del mercado local.

**Mototaxis:** cobran ~S/2 por compras o encargos. Son informales y no dejan trazabilidad.

**Referencia de precio del mercado:** la gente paga S/1.50–2 en promedio; S/3 es raro.

**Diferenciación propuesta para Tindivo:**

- Zorritos **lleva** los pedidos que el negocio ya tiene. **Tindivo trae clientes nuevos** con los encargos ("te lo compramos y te lo llevamos").
- Plataforma propia: pedidos registrados, estados, datos y confianza.
- Envíos persona a persona, no solo de negocio a cliente.

**Riesgo de desintermediación:** un directorio público con teléfonos de negocios haría que el cliente coordine directo con el negocio y se salte a Tindivo, o que use a Zorritos para el traslado.

---

## 4. Productos y precios propuestos

Nombres internos: **Tindivo Recojos** (envíos A→B) y **Tindivo Encargos** (compras). En la interfaz se usan botones con verbos (ver sección 5).

| Producto | Qué es | Precio propuesto | Justificación |
|---|---|---|---|
| **Pedir comida** | Marketplace de restaurantes aliados (sin cambios) | S/1.50 restaurante + S/2–2.50 cliente | El partner paga porque recibe marketplace + sistema de pedidos |
| **Enviar algo** (recojo) | Llevar algo que ya es tuyo o ya está pagado, de A a B. Persona a persona o negocio a persona | **S/2 al cliente, S/0 al negocio** | Iguala a Zorritos; se hace en turnos ya pagados, así que S/2 es casi margen |
| **Comprar algo** (encargo) | El motorizado compra por el cliente en una tienda y se lo lleva | **S/3.50 con 1 tienda**; +S/1 por tienda extra o por plan B "otra tienda" | Servicio que Zorritos no ofrece; incluye el tiempo de compra |

**Tensión de precio a debatir:** el afiche y el plan anterior decían "recojo desde S/3", pero el mercado paga S/2. La propuesta es S/2 en envíos (volumen sobre capacidad ociosa) y S/3.50 en encargos (diferenciación, más tiempo por pedido).

**Reglas de encargos:**

- Tope de compra de S/50 (S/20–30 en el primer pedido). Arriba de S/50, prepago obligatorio.
- Una tienda incluida; cada tienda extra suma S/1.
- El precio definitivo depende del tiempo medido: si el encargo promedio supera 35–40 min, subir a S/4–5.
- Si más adelante hay un motorizado dedicado a encargos, se le paga **por encargo** (ejemplo: S/2 de cada S/3.50), nunca por turno, hasta tener volumen probado.

**Parámetros de envíos ya definidos por Jesús:** solo dentro de San Jacinto; hasta 5 kg; el pedido queda confirmado cuando el motorizado lo acepta; seguimiento por estados, sin GPS; se cancela tras 5 min de espera si no está listo; el motorizado puede rechazar lo difícil de transportar (por ejemplo, tortas).

---

## 5. Producto web

### 5.1 Secciones nuevas de la web

- **Inicio:** tres botones (Comida / Comprar / Enviar) con la regla de clasificación visible.
- **Cómo funciona:** una sección por servicio, con 3 pasos ilustrados y un caso de uso real.
- **Negocios aliados:** el directorio de Puntos Tindivo (ver 5.8), con el ranking "Top aliados del mes".
- **Preguntas frecuentes:** cuánto cuesta, cómo pago, qué no se lleva, horarios y zona.
- **Súmate como aliado:** la propuesta para negocios y un botón que abre WhatsApp con Jesús, como captación de alianzas.

### 5.2 Inicio: tres botones y una regla

- **Pedir comida:** "De restaurantes aliados".
- **Comprar algo:** "Te lo compramos y te lo llevamos · desde S/3.50". Ejemplos: farmacia, bodega, librería.
- **Enviar algo:** "Llevamos lo que ya tienes o ya pagaste · S/2". Ejemplos: llaves, ropa, un táper, lapiceros.

La regla que se repite en todo el contenido:

> **¿Hay que pagar algo en el camino? → Comprar. ¿Ya es tuyo o ya está pagado? → Enviar.**

Cada tarjeta muestra su disponibilidad ("Disponible desde las 6 pm", "Solo de lunes a viernes").

### 5.3 Autocorrección: que el error se corrija solo

No se diseña para que el usuario acierte siempre, sino para que el error se corrija solo:

- En **Enviar**, si el texto contiene "cómprame", "compra", "precio", etc., aparece: "Parece que necesitas que lo compremos. ¿Cambiar a Comprar?". El cambio conserva lo que el usuario escribió.
- En **Comprar**, si el texto contiene "ya está pagado", "recoger", "recoge", etc., aparece la sugerencia inversa.
- El motorizado puede **reclasificar** el pedido desde su app con un toque.

### 5.4 Flujo "Enviar algo"

1. **Recoger en:** referencia en texto ("casa verde frente al colegio"), pin opcional o "usar mi ubicación", y **nombre y celular de quien entrega**.
2. **Llevar a:** referencia, pin opcional y **nombre y celular de quien recibe**. En un pueblo que se orienta por referencias, el celular vale más que el mapa.
3. **¿Qué es?:** texto corto, "¿Cabe en una mochila?" (sí/no) y casilla "Frágil". Límite de 5 kg.
4. **¿Quién paga el envío?:** yo / quien recibe. Esto resuelve el pendiente de quién paga el transporte.
5. **Nota para el motorizado:** opcional.

Extras de confianza y marketing:

- **Botón "Avisar a quien recibe":** abre WhatsApp con un mensaje prearmado y el link de seguimiento. Así cada envío presenta Tindivo a una persona nueva.
- **Foto de entrega (V1.1):** el motorizado toma una foto al entregar y le llega a quien envió.
- **Seguridad:** el motorizado puede pedir ver el contenido; si no se deja ver, no se lleva.

### 5.5 Flujo "Comprar algo"

1. **¿Qué necesitas?:** un producto por línea, con un ejemplo en el placeholder ("1 Ariel 900 g (o el que haya) / 2 pilas AA"), y el botón **"Agregar foto"** para el producto o su empaque vacío.
2. **¿Dónde lo compramos?:** Puntos Tindivo filtrados por categoría y **abiertos ahora**, "Donde haya, el más cercano", u "Otro lugar" en texto libre.
3. **Si no hay:** buscar en otra tienda (+S/1), llevar algo parecido, o no comprar ese producto.
4. **Gasta máximo:** S/__ (tope).
5. **Llevar a:** referencia y celular.

Comprar es para **tiendas** (farmacia, bodega, librería, ferretería, panadería…), no para comida preparada. Un restaurante que no está en "Pedir comida" es un partner por conseguir, no un encargo.

### 5.6 Pago en encargos: fondo rotativo y pago al entregar

- Jesús le da al motorizado un **fondo rotativo de S/100 en su Yape**, y con eso se paga la compra. El motorizado **nunca** pone plata de su bolsillo.
- El motorizado toma foto de la boleta, registra el monto en su app y le envía al cliente el total (compra + servicio) con una plantilla de WhatsApp.
- **Al entregar, el cliente le yapea al motorizado el monto exacto.** La bolsa no se entrega sin ver el Yape en el celular del motorizado. Sin efectivo y sin vuelto.
- **Cuadre automático al cierre:** fondo inicial + Yapes recibidos − compras = servicio a rendir a Tindivo.
- **Riesgo de cliente que no recibe:** se controla con tope bajo en el primer pedido, bloqueo a quien falle y prepago para compras de más de S/50.
- **Tiendas que no aceptan Yape:** en V1 no se compra ahí. Tener un pequeño fondo en efectivo queda como alternativa a debatir.

> **Alternativa a debatir:** que el cliente prepague todo al Yape de Tindivo antes de la compra. Es más seguro, pero suma mensajes y devoluciones de vuelto, y convierte a Jesús en cuello de botella del dinero.

### 5.7 App del motorizado

- La lista del cliente se convierte en un **checklist** donde marca cada producto.
- **Plantillas de WhatsApp de un toque:** "Voy en camino", "No hay X, ¿llevo Y a S/Z?", "Llegué", "Tu total es S/__".
- **Temporizador de plan B:** si el cliente no responde en 3 min, se aplica lo que eligió.
- Foto de boleta y registro del monto gastado.
- Botón "Yape recibido" para cerrar el encargo.
- Reclasificación del pedido (Enviar ↔ Comprar).
- Llamada de un toque a la tienda (el teléfono del negocio solo lo ve el motorizado).

### 5.8 Directorio de negocios (Puntos Tindivo)

El directorio vive **dentro del flujo Comprar**, porque ahí es donde el cliente decide dónde comprar. El mapa suelto (Leaflet, partners en rojo y demás en gris) queda para una fase posterior como vitrina.

| Se muestra | No se muestra |
|---|---|
| Nombre, logo o foto de fachada | Teléfono / WhatsApp del negocio |
| Categoría | Carta con precios (salvo partners de comida) |
| **Horario** (filtra "abierto ahora") | Dirección exacta (basta la zona o referencia) |
| Zona o referencia | |
| "Lo que puedes pedir aquí": 5–8 productos típicos, sin precio | |
| Si acepta Yape | |
| Distintivo "Aliado Tindivo" | |

"Lo que puedes pedir aquí" se alimenta con los datos reales de los encargos. En 6–8 semanas hay un catálogo construido por la demanda, sin mantenimiento manual de precios.

### 5.9 Estados sugeridos (borrador para debatir)

- **Envío:** `creado → aceptado → yendo_a_recoger → recogido → en_camino → entregado`, más `cancelado` (incluye el caso "no estaba listo tras 5 min").
- **Encargo:** `creado → aceptado → comprando → [sin_stock → esperando_cliente (3 min) → plan_b_aplicado] → comprado (monto + foto de boleta) → en_camino → entregado (Yape confirmado)`, más `cancelado` y `rechazado_en_puerta`.

### 5.10 Datos mínimos (borrador)

- **Pedido:**
  - tipo: comida | envío | encargo;
  - recojo: referencia, pin opcional, nombre, celular;
  - destino: referencia, pin opcional, nombre, celular;
  - lo pedido: descripción, foto opcional, cabe_en_mochila, frágil, quién_paga;
  - encargo: tienda_id, plan_b, tope, monto_gastado, foto_boleta;
  - estado y marca de tiempo por cada estado (para medir tiempos).
- **Negocio (Punto Tindivo):** nombre, categoría, horario, zona/referencia, productos típicos, acepta_yape, nivel (punto | partner), teléfono privado y tiempo de respuesta promedio.

---

## 6. Propuestas para que todo sea lo más rápido posible

La lentitud mata la rentabilidad del motorizado. El principio es que **todas las decisiones se tomen antes de que el motorizado salga.**

1. **Pre-decisiones del cliente:** la tienda, el plan B y el tope se eligen al pedir, así no hay esperas en la tienda.
2. **Temporizador de 3 min:** si el cliente no responde, se aplica su plan B.
3. **Confirmación de stock antes de salir:** el motorizado manda una plantilla al Punto ("¿Tienes X? Voy en 5 min"). Si no responde en 5 min, va a otro Punto de la misma categoría.
4. **Pedido listo al llegar:** los Puntos se comprometen a armar la bolsa cuando reciben el mensaje; el motorizado solo paga y recoge.
5. **Ranking interno por velocidad de respuesta:** los Puntos que responden rápido aparecen primero en "¿Dónde lo compramos?".
6. **Agrupar por zona:** si hay un pedido de comida hacia la zona X, el sistema le sugiere al motorizado los envíos o encargos de esa misma zona.
7. **Pedidos programados (a debatir):** opción "Lo antes posible" o "Programado (7–7:30 pm)" con un pequeño descuento, para mover demanda hacia los valles y agrupar rutas.
8. **Checklist y plantillas:** el motorizado no escribe mientras maneja.
9. **Direcciones guardadas** ("Casa", "Trabajo") después del primer pedido.
10. **Medir tiempos por estado desde el día 1:** aceptación, tiempo en tienda y tiempo total.

### Capacidad disponible (estimación a validar)

- Entre semana: 1 motorizado + Jesús × 5 h = hasta ~10 horas-motorizado por noche, si Jesús sale toda la noche. Ese tiempo compite con su tiempo de desarrollo.
- Comida: ~13 pedidos × ~20 min ≈ 4.3 h.
- Quedan ≈ 5–6 h, que alcanzan para ~6–8 encargos (30–45 min cada uno), ~12–15 envíos, o una mezcla.
- **Objetivo de la fase 1: +4 a +6 pedidos/día entre semana, para llegar a 17–19 sin sumar costo fijo.**

Supuestos a validar: 20 min por pedido de comida, 30–45 min por encargo y ~20 min por envío.

---

## 7. Alianzas: que se sienta competitivo

Jesús puede cerrar alianzas rápido. La meta es que los negocios quieran estar y compitan por destacar.

### 7.1 Dos niveles

- **Punto Tindivo** (gratis). Es para cualquier negocio: farmacias, bodegas, librerías, pastelerías, ferreterías, vendedoras de Facebook.
  - **Recibe:** aparece en el directorio, recibe encargos (clientes nuevos) y tiene su enlace/QR para pedir envíos a S/2, que paga el cliente.
  - **Se compromete a:** responder al motorizado en menos de 5 min, tener el pedido listo, aceptar Yape y pegar el sticker/QR de Tindivo en su mostrador. El sticker es un canal de distribución gratis.
- **Partner** (restaurantes, S/1.50 por pedido). Tiene carta en el marketplace y usa el sistema de pedidos. La mensualidad se activará con la app móvil.

### 7.2 Discurso de venta (30 segundos)

> "Estoy armando el directorio de negocios de San Jacinto en Tindivo. Es gratis. Cuando alguien quiera algo de tu tienda y no pueda venir, nosotros te lo compramos y se lo llevamos. Tú vendes más sin hacer nada. Solo te pido que atiendas rápido a mi motorizado y aceptes Yape."

Objeción "ya trabajo con Zorritos": *"No es exclusivo. Zorritos te lleva lo que ya vendiste; yo te traigo compradores nuevos."*

### 7.3 Catálogo sin trabajo manual

- El aliado manda **fotos** de sus productos más vendidos por el grupo de WhatsApp o por privado, y Jesús sube solo los 5–8 principales.
- No se transcriben cartas ni precios de tiendas. El catálogo crece con los datos de los encargos.
- El supermercado de un amigo de Jesús entra como Punto Tindivo, sin integración técnica en V1.

### 7.4 Comunidad de WhatsApp de aliados

- **Una comunidad de WhatsApp con subgrupos por categoría:** Farmacias, Bodegas, Librerías, etc.
- **Dinámica "¿Quién lo tiene?":** cuando un encargo es "donde haya", el motorizado publica en el subgrupo "Pedido Tindivo: ¿quién tiene pañales Huggies talla M?". **El primer Punto que confirma se lleva la venta.** Esto resuelve el problema de stock y genera competencia real entre negocios.
- Usos adicionales: promos exclusivas de Tindivo, avisos y ranking mensual.
- **Riesgo a debatir:** ruido y grupos silenciados. Se mitiga con reglas claras: solo pedidos y ranking, nada de spam.

### 7.5 Puntos para aliados (gamificación)

Lo ideal es que el sistema mida los puntos automáticamente.

| Acción | Puntos sugeridos | ¿Se mide solo? |
|---|---|---|
| Responder al motorizado en menos de 5 min | +2 | Sí (tiempo de respuesta) |
| Tener el pedido listo al llegar el motorizado | +2 | Sí (lo marca el motorizado) |
| Cada venta vía encargo | +1 | Sí |
| Ganar un "¿Quién lo tiene?" | +3 | Semi (lo registra el motorizado) |
| Tener el sticker/QR visible en el mostrador | +5 (una vez) | Manual (foto) |
| Compartir un post de Tindivo en su estado de WhatsApp | +2 | Manual (captura en el grupo) |
| Referir a otro negocio que se una | +10 | Manual |

**Recompensas de costo casi cero:**

- "Top aliado del mes", destacado en el directorio y en la página de Facebook.
- Distintivo "Aliado Oro".
- Primeras posiciones en "¿Dónde lo compramos?".
- Envíos gratis para sus clientes en días valle (capacidad ociosa).
- Más adelante, espacio publicitario gratis en la web.

### 7.6 Incentivos para usuarios (costo controlado)

- **Tarjeta de sellos digital:** cada 5 pedidos entre semana, el 6.º envío es gratis.
- **Referidos:** quien invita y quien se une reciben S/1 de descuento en su próximo envío.
- Solo aplican de lunes a viernes (capacidad ociosa), nunca en el pico del fin de semana.

### 7.7 Monetizar el tráfico después

Con tráfico en la web y en Facebook se puede vender: destacados pagados en el directorio, "negocio del día", banners y publicidad en la página de Facebook. **No conviene vender publicidad hasta tener una métrica de tráfico que la justifique.**

---

## 8. Fases de lanzamiento

**Recomendación:** lanzar ambos productos **juntos**, pero acotados: de lunes a viernes, de 6 a 11 pm. Comparten el mismo esqueleto de flujo, y lanzarlos por separado duplica el esfuerzo de comunicación. La confusión se ataca con la regla y la autocorrección, no escalonando el lanzamiento.

| Fase | Periodo | Qué incluye |
|---|---|---|
| **0 – Preparación** | Esta semana | Reclutar 10–15 Puntos Tindivo (3 por día). Cargar el directorio: foto de fachada, horario y productos típicos (5 min por negocio). Armar el fondo rotativo y las plantillas de WhatsApp. Jesús hace y **cronometra los primeros 10 encargos**. |
| **1 – Lanzamiento L–V** | Semanas 1–2 | Enviar y Comprar en vivo de lunes a viernes, de 6 a 11 pm, junto a comida. **Sábado y domingo: solo comida** (pico, flota llena). Promo de primer envío a S/1. Stickers en los Puntos. 3 videos de casos reales. |
| **2 – Ajuste** | Semanas 3–4 | Ajustar el precio de encargos según los tiempos medidos. Activar la comunidad de WhatsApp, "¿Quién lo tiene?" y los puntos. Sumar foto de entrega, link de seguimiento y direcciones guardadas. |
| **3 – Ampliar** | Mes 2 | Fines de semana (con recargo o capacidad extra). Franja de tarde si la demanda lo justifica, con pago por encargo. Mapa público y publicidad. Pasar lo validado a la app móvil. |

### Qué entra en cada versión

- **V1:**
  - Los tres botones con la regla.
  - Los formularios de Enviar y Comprar.
  - La autocorrección por palabras clave.
  - El directorio dentro de Comprar, con horarios.
  - En la app del motorizado: checklist, plantillas y foto de boleta.
  - El pago al entregar con fondo rotativo.
  - La medición de tiempos por estado.
- **V1.1:**
  - Link de seguimiento para quien recibe.
  - Foto de entrega.
  - Direcciones guardadas.
  - Ranking de Puntos por velocidad.
- **V2:**
  - **Envío con cobro por Yape** para vendedoras de Facebook: la clienta le yapea a la vendedora y el motorizado entrega al ver el Yape, así que Tindivo no toca la plata.
  - Pedidos con varias paradas.
  - Saldo a favor.
  - Pedidos programados.
  - Mapa público.

---

## 9. Contenido: vender problemas, no logística

Se comunican situaciones concretas con **casos reales**, en videos cortos para Facebook (por ejemplo: "María pidió pastillas a las 9 pm y le llegaron en 20 min"):

- Estás enfermo y necesitas algo de la farmacia.
- Estás trabajando y se te olvidó algo.
- Vendes por Facebook y no tienes quién entregue.
- Mamá con niños o persona mayor que no puede salir.
- Le quieres mandar algo a alguien (persona a persona).

---

## 10. Métricas y reglas de decisión

**Métricas semanales, separadas por tipo de pedido (comida / envío / encargo):**

- Pedidos por día (meta: 17 entre semana).
- Tiempo promedio por encargo y por envío.
- % de encargos fallidos (sin stock, cambio de precio, rechazo en puerta).
- Tiempo de respuesta de cada Punto.
- **Recompra a 14 días**: la métrica que dice si se está resolviendo un problema real.
- Pedidos generados por cada Punto.
- Rentabilidad por turno: ingresos − (S/30 + gasolina).

**Reglas de decisión:**

- Si el encargo promedio pasa de 40 min → subir a S/4–5.
- Si hay menos de 2 encargos/día tras 2 semanas → revisar comunicación y posicionamiento antes que el producto.
- Si hay más de 5 encargos/día sostenidos → evaluar un motorizado adicional **pagado por encargo**.
- Si un Punto no genera pedidos en un mes → se queda en el directorio, pero no se le dedican más visitas.

---

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El usuario confunde Enviar y Comprar | Regla única + autocorrección + reclasificación por el motorizado |
| El cliente no recibe o no paga la compra | Tope bajo en el primer pedido, bloqueo, prepago para compras de más de S/50 |
| Fondo rotativo en manos del motorizado | Máximo S/100 y cuadre diario automático |
| Desintermediación por el directorio | Sin teléfonos públicos; el único botón es "Pídelo con Tindivo" |
| Los partners reclaman si envíos cuesta S/0 al negocio | Son productos distintos: el partner recibe marketplace + sistema de pedidos |
| Paquetes de desconocidos con contenido ilícito | El motorizado puede revisar el contenido; si no se deja, no se lleva |
| Saturación del fundador | Nada que requiera transcribir catálogos; puntos medidos por el sistema; plantillas |
| Comunidad de WhatsApp con ruido | Reglas claras: solo pedidos y ranking |
| Fin de semana saturado | En la fase 1, Enviar y Comprar solo de lunes a viernes |

---

## 12. Preguntas abiertas para Codex

1. **Pago en encargos:** ¿pago al entregar con fondo rotativo en el Yape del motorizado, o prepago al Yape de Tindivo? ¿Qué riesgos ves en cada opción?
2. **Precio de envíos:** ¿S/2 sin cobrar al negocio (igualar a Zorritos) o mantener el "desde S/3" ya impreso? ¿Esto canibaliza el S/1.50 de los partners?
3. **Inicio:** ¿tres botones (Comida / Comprar / Enviar) o un solo botón "¿Qué necesitas?" con una pregunta de clasificación?
4. **Lanzamiento:** ¿ambos productos juntos de lunes a viernes, o escalonados?
5. **"¿Quién lo tiene?" en WhatsApp:** ¿vale la pena el ruido? ¿Hay una forma más automatizable, por ejemplo un mensaje desde el panel a varios Puntos a la vez?
6. **Gamificación:** ¿qué acciones se pueden medir 100% automático con los datos del sistema, sin trabajo manual de Jesús?
7. **Autocorrección:** ¿bastan las palabras clave o conviene otra técnica simple?
8. **Implementación:** con las 3 apps web existentes (consumer, partners, motorizado), ¿cuál es el orden de tareas más corto para tener la V1 en una semana? ¿Qué recortarías?
9. **Pedidos programados y agrupación por zona:** ¿valen la pena en la V1 o son sobreingeniería?
10. **Qué falta:** ¿qué problema real del cliente o del motorizado no está cubierto?