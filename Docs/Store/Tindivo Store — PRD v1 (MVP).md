# Tindivo Store — PRD v1 (MVP)

Oct 2, 2026 · @Jesús

## Resumen y objetivo

Tindivo Store es una sección de tindivo.com para vender cualquier artículo, nuevo o de segunda, dentro de San Jacinto. El comprador elige en la web, pide por WhatsApp y recibe con la flota de Tindivo pagando al recibir.

En el MVP hay un solo vendedor: Jesús. Tindivo gana el delivery (S/2.00–2.50 por venta). Ropa, calzado, perfumes y mochilas son el primer lote, pero la ficha sirve igual para una planta o un cable.

El experimento dura 14 días desde la primera publicación y responde dos preguntas por separado: si hay compradores y si el contenido trae gente a tindivo.com.

| Métrica (14 días) | Mínimo para seguir | Meta | Base del cálculo |
| --- | --- | --- | --- |
| Artículos publicados | 15 | 25 | Lote propio: casacas, polos, zapatillas, perfumes, mochilas |
| Visitas a /store | 150 | 250 | Hoy tindivo.com recibe \~10 visitas al día (\~140 en 14 días); la meta casi lo duplica |
| Clics a WhatsApp | 20 | 40 | \~15% de las visitas |
| Ventas entregadas | 5 | 8 | \~1 de cada 5 chats se cierra |
| Ingreso por artículos | S/150 | S/250 | Precio promedio estimado de S/30 por artículo |
| Ingreso por delivery | S/10 | S/18 | Promedio de S/2.25 por venta |
| Visitantes que pasan a restaurantes | 5% | 10% | Mide si la tienda ayuda a la adopción |
| Tiempo de Jesús | — | Máx. 4 h por semana | Si pasa de esto, no lo sostiene una sola persona |

El mínimo decide si se sigue; la meta decide si se escala. El ingreso del MVP es casi todo venta de artículos propios y no se repite: el delivery deja unos S/2.25 por venta. El ingreso recurrente solo llega si otros venden aquí (ver Siguientes versiones). Mientras el agente construye, los mismos artículos se publican ya en Facebook Marketplace y estados de WhatsApp para no perder días de venta.

## Usuarios y principios

Hay dos usuarios, y los dos están en el celular.

- **Comprador:** vecino de San Jacinto que llega desde un link en Facebook o WhatsApp. No está acostumbrado a navegar webs ni a crear cuentas.
- **Admin (Jesús):** sube artículos desde el celular, entre otras tareas. Cada minuto que cueste publicar es un artículo menos publicado.

Principios que deciden cualquier duda de diseño:

1. Cualquier artículo cabe. La ficha no depende de la categoría; lo específico va en "talla o medida" y en la descripción.
2. Del link al WhatsApp en dos toques como máximo.
3. Celular primero: diseñado para 360–414 px, escritorio es secundario.
4. Publicar un artículo con fotos toma menos de 2 minutos.
5. Verdad visible: condición, estado del 1 al 10, defectos y precio original real.
6. Sin cuentas, sin carrito, sin pago en línea. Todo se cierra por WhatsApp.

Decisiones tomadas: vendedor único, sin control de stock (cada publicación es una pieza; si hay dos iguales se duplica), solo San Jacinto, pago contra entrega o Yape.

## Alcance del MVP

El MVP es una vitrina con buen buscador y un botón a WhatsApp, más un panel para publicar rápido. Todo lo que implique transacción dentro de la web queda fuera.

| Entra | Queda fuera |
| --- | --- |
| Listado /store con búsqueda, categorías, filtro Nuevo/Segunda y orden por precio | Carrito y checkout |
| Detalle /store/\[slug\] con galería, estado y botón de WhatsApp | Pago en línea |
| Vista previa al compartir (Open Graph) y botón Compartir | Cuentas de comprador y favoritos |
| Panel admin: crear, editar, duplicar, cambiar estado, copiar texto para redes | Varios vendedores, perfiles y suscripción |
| Configuración: número de WhatsApp y precio de delivery | Chat interno, reseñas, ofertas dentro de la web |
| Registro de eventos para medir el experimento | Entregas fuera de San Jacinto y mapa |

## Modelo de datos

Son tres tablas nuevas y una de configuración. Los nombres son sugeridos; el agente los adapta a la convención de la base actual de tindivo.com.

**store\_products**

| Campo | Tipo | Oblig. | Notas |
| --- | --- | --- | --- |
| id | uuid | sí |  |
| codigo | texto | sí | Corto y legible, autogenerado: TS-0001. Se usa en el mensaje de WhatsApp |
| slug | texto único | sí | Del título + código: casaca-jean-m-ts-0001 |
| titulo | texto ≤ 60 | sí | "Casaca jean talla M" |
| descripcion | texto ≤ 600 | no | Detalles, medidas, defectos |
| categoria\_id | fk | sí | Ver lista abajo |
| para | enum | no | dama, caballero, niños, unisex. Solo ropa, calzado, accesorios |
| condicion | enum | sí | nuevo\_con\_etiqueta, nuevo\_sin\_uso, usado |
| estado\_puntaje | entero 1–10 | si usado | Oculto cuando es nuevo |
| talla\_medida | texto ≤ 20 | no | "M", "38", "100 ml", "2 m", "maceta mediana" |
| precio | decimal S/ | sí |  |
| precio\_original | decimal S/ | no | Solo se muestra si es mayor que precio |
| es\_remate | booleano | no | Muestra la etiqueta Remate |
| negociable | booleano | no | Muestra "Acepta ofertas" |
| fotos | lista de {url, url\_mini, orden} | sí | 1 a 6. La primera es la portada |
| estado\_publicacion | enum | sí | borrador, disponible, reservado, vendido, oculto |
| destacado | booleano | no | Aparece arriba |
| vendido\_en | fecha-hora | no | Se llena al marcar vendido |
| vendedor\_id | fk | no | Vacío en el MVP. Deja lista la versión con varios vendedores |
| creado\_en, actualizado\_en | fecha-hora | sí |  |

**store\_categories** (lista fija, editable solo por base de datos): Ropa, Calzado, Bolsos y accesorios, Perfumes y belleza, Tecnología, Hogar y plantas, Deporte, Otros. Campos: id, nombre, slug, icono, orden.

**store\_events**: id, tipo (view\_list, view\_product, search, click\_whatsapp, share, nav\_out), product\_id, termino\_busqueda, ref (fuente del link), session\_id anónimo, creado\_en.

**store\_settings**: whatsapp\_numero (51906550166), delivery\_min (S/2.00), delivery\_max (S/2.50), texto\_entrega. El monto exacto según distancia se confirma por WhatsApp.

## Experiencia del comprador

Dos pantallas públicas: el listado y el detalle. El comprador debe entender en 3 segundos qué es, cuánto cuesta y cómo lo recibe.

### Listado /store

1. **Cabecera:** "Tindivo Store" y una línea: "Cosas nuevas y de segunda en San Jacinto. Te lo llevamos desde S/2 y pagas al recibir."
2. **Buscador fijo arriba** al hacer scroll. Busca en título, descripción, categoría y talla, sin distinguir mayúsculas ni tildes. Filtra al escribir, sin botón.
3. **Chips de categoría** en fila deslizable, con ícono y cantidad: Todo (24), Ropa (9), Calzado (5)… Las categorías sin artículos no aparecen.
4. **Segunda fila:** Todo / Nuevo / Segunda, y un selector de orden: Recientes, Menor precio, Mayor precio.
5. **Destacados:** carrusel horizontal, solo si hay artículos marcados.
6. **Grilla de 2 columnas.** Cada tarjeta lleva:
   - Foto cuadrada con una sola insignia arriba a la izquierda. Prioridad: −X% (si hay precio original), Remate, Nuevo con etiqueta, Estado 9/10.
   - Precio grande; precio original tachado al lado.
   - Título en máximo 2 líneas y talla o medida.
7. **Reservados** se quedan en su lugar con la insignia gris "Reservado". **Vendidos** van al final, foto en gris y franja "Vendido". Son la prueba social de que la gente compra.
8. **Búsqueda sin resultados:** "No lo tenemos aún. Escríbenos y te avisamos si llega" con botón a WhatsApp. Ese mensaje es demanda medible.
9. **Pie:** "Cómo funciona" en 3 pasos: eliges, nos escribes, te lo llevamos y pagas al recibir. Debajo, un enlace a los restaurantes de Tindivo.

### Detalle /store/\[slug\]

1. **Galería** deslizable con puntos; un toque abre pantalla completa con zoom.
2. **Precio**, precio original tachado y "Ahorras S/30". Insignias: Pieza única, Remate, Acepta ofertas.
3. **Título** y una fila de datos: condición, estado 1–10 con su texto, talla o medida, para quién.
4. **Descripción** completa.
5. **Bloque de entrega:** "Entrega en San Jacinto: S/2.00–2.50 según distancia · Pagas al recibir en efectivo o Yape. Revísalo al recibir: si no lo quieres, solo pagas el delivery; si no es como en las fotos, no pagas nada."
6. **Botón fijo abajo**, siempre visible: "Lo quiero — pedir por WhatsApp". Reservado: "Reservado — avísame si se libera". Vendido: botón desactivado y "Ver parecidos".
7. **Compartir:** usa el menú nativo del celular; si no existe, copia el link.
8. **También te puede gustar:** 4 artículos disponibles de la misma categoría.

### Requisitos técnicos de la vitrina

- **Vista previa al compartir:** cada detalle genera en servidor sus etiquetas Open Graph (foto de portada, "Casaca jean M — S/30", estado). Sin esto, el link en WhatsApp o Facebook se ve vacío. Si la web es una SPA, se resuelve con una ruta del servidor o prerender.
- **Imágenes:** WebP de 1080 px para el detalle y 400 px para tarjetas, con carga diferida.
- **Velocidad:** el listado con 30 artículos carga en menos de 2 segundos con 4G.
- **Los links aceptan ?ref=** (fb, mp, wa\_estado, grupo, tiktok) y se guarda la fuente en la sesión.

## Panel de admin

El panel vive en /admin/store, detrás del login de admin que ya existe. Tiene una lista y un formulario, ambos pensados para el pulgar.

### Lista de artículos

- Cada fila: miniatura, código, título, precio, estado de publicación, vistas y clics a WhatsApp.
- El estado se cambia con un toque desde la misma fila (selector), sin abrir el artículo.
- Pestañas por estado: Disponibles, Reservados, Vendidos, Borradores, Ocultos.
- Arriba, el resumen del experimento: días transcurridos, visitas, clics, ventas y monto vendido.
- Botón flotante "+ Nuevo artículo".

### Formulario (una sola pantalla, en este orden)

1. **Fotos** primero: cámara o galería, hasta 6, arrastrar para ordenar. La primera es la portada. Se comprimen en el navegador antes de subir.
2. **Título** y **precio**.
3. **Precio original** (opcional), con la ayuda: "Solo si es el precio real que pagaste o el de tienda".
4. **Categoría** y **condición** como botones grandes, no listas desplegables.
5. **Estado 1–10** con deslizador y su texto, visible solo si es usado.
6. **Talla o medida** y **para quién** (este último solo en ropa, calzado y accesorios).
7. **Descripción** con texto guía: "Marca, medidas, cómo está, si tiene algún detalle".
8. Interruptores: Remate, Acepta ofertas, Destacado.
9. Botones: "Guardar borrador" y "Publicar".

El formulario recuerda la última categoría y condición usadas, para cargar lotes parecidos más rápido.

### Acciones rápidas por artículo

- **Duplicar:** copia todo menos las fotos. Sirve para perfumes o zapatillas iguales.
- **Reservar, Vender, Ocultar** en un toque. Vender guarda la fecha.
- **Copiar link** con la fuente elegida (Facebook, Marketplace, estado de WhatsApp, grupo, TikTok).
- **Copiar texto para redes:** genera el texto listo para pegar, por ejemplo: "Casaca jean M · Estado 9/10 · S/30 (antes S/60) · Te la llevo en San Jacinto, pagas al recibir · tindivo.com/store/casaca-jean-m-ts-0012?ref=fb". Esto le ahorra a Jesús escribir cada publicación.

### Configuración

Una pantalla mínima para editar el número de WhatsApp, el delivery mínimo y máximo y el texto de entrega, sin tocar código.

## Compra por WhatsApp y entrega

La venta se cierra en WhatsApp y la entrega usa el mismo flujo que ya existe para registrar entregas. El motorizado no necesita nada nuevo.

1. El comprador toca "Lo quiero". Se abre wa.me/51906550166 con el mensaje ya escrito:

   > Hola Tindivo, quiero: Casaca jean talla M (S/30) — código TS-0012. tindivo.com/store/casaca-jean-m-ts-0012 ¿Sigue disponible?
2. Jesús confirma con una respuesta rápida de WhatsApp Business y pide ubicación y hora. Con la ubicación confirma el delivery: S/2.00 o S/2.50 según distancia, y recuerda que puede revisarlo al recibir (ver Políticas del comprador).
3. Jesús marca el artículo como **Reservado** en el panel. Para otros compradores queda visible pero sin botón de compra.
4. Jesús registra la entrega en la plataforma con su propia cuenta, como hace hoy con los pedidos por WhatsApp. Monto a cobrar: precio + delivery.
5. El motorizado entrega y cobra en efectivo o Yape.
6. Entregado: se marca **Vendido**. Si el comprador cancela o no está: vuelve a **Disponible**.

**Estados de un artículo:** borrador → disponible → reservado → vendido. Desde reservado se puede volver a disponible. Cualquier estado puede pasar a oculto.

**Mensaje cuando está reservado:** "Hola Tindivo, vi que TS-0012 está reservado. Avísame si se libera."

**Respuestas rápidas sugeridas para WhatsApp Business:** /disponible (sí está + pide ubicación y hora), /reservado, /vendido (con link a la tienda).

### Reglas de entrega

- Solo dentro de San Jacinto. Fuera, solo con coordinación previa.
- Entregas preferentemente fuera del pico de restaurantes, para no competir por moto los sábados en la noche.
- Una reserva sin respuesta en 24 horas vuelve a disponible (manual en el MVP).

Las reglas de revisión, rechazo, ausencia y devoluciones están en Políticas del comprador.

## Guía visual y de textos

La tienda usa la marca de Tindivo, con dos colores reservados: verde WhatsApp solo para el botón de compra, y rojo o naranja solo para descuentos y Remate. Si todo destaca, nada destaca.

- **Tarjetas:** fondo blanco, esquinas de 12 px, foto cuadrada, precio de 18–20 px en negrita. Mucho espacio entre tarjetas.
- **Fotos:** fondo claro, luz natural, el artículo completo primero, luego etiqueta o talla, luego cualquier defecto.
- **Tono:** cercano, de tú, sin exagerar. Frases cortas.

| Lugar | Texto |
| --- | --- |
| Botón principal | Lo quiero — pedir por WhatsApp |
| Botón reservado | Reservado — avísame si se libera |
| Insignia de pieza única | Pieza única |
| Entrega | Te lo llevamos en San Jacinto desde S/2 |
| Pago | Pagas al recibir: efectivo o Yape |
| Búsqueda vacía | No lo tenemos aún. Escríbenos y te avisamos si llega |
| Estado 10 | Impecable |
| Estado 8–9 | Muy buen estado |
| Estado 6–7 | Buen estado, con uso |
| Estado 1–5 | Con detalles visibles (ver fotos) |

## Métricas y lectura del experimento

El embudo es: visitas a /store → vistas de producto → clics a WhatsApp → ventas. Las primeras tres salen de store\_events; las ventas, de los artículos marcados como vendidos. Todo se separa por fuente (ref).

Para la pregunta de adopción se mide también nav\_out: cuántos visitantes de la tienda pasan a los restaurantes de Tindivo.

El día 14 se lee así:

| Qué pasó al día 14 | Qué significa | Siguiente paso |
| --- | --- | --- |
| Menos de 150 visitas | El contenido no mueve gente | Cambiar formato o canal antes de tocar la tienda |
| 150+ visitas, menos de 20 clics | Precio, fotos o surtido no convencen | Bajar precios o rehacer fotos de lo más visto; 7 días más |
| 20+ clics, menos de 5 ventas | Se pierde en la conversación | Revisar chats: precio, rapidez de respuesta, entrega |
| 5–7 ventas | Hay demanda, aún chica | 14 días más sumando el stock de la mamá |
| 8+ ventas y S/250+ en artículos | Hay demanda clara | Sumar mamá y primas (v2) y medir ventas por semana para la suscripción |
| Más de 4 h por semana de Jesús | El proceso no escala | Simplificar antes de crecer |

Si la tienda vende pero nadie pasa a los restaurantes, es un buen negocio lateral, pero no resuelve la adopción. Son decisiones distintas.

## Reglas de contenido y precios

La confianza es el activo de Tindivo en un pueblo donde todos se conocen. Estas reglas la protegen.

- **Precio original solo si es real:** lo que se pagó o el precio en tienda. Si no se sabe, se usa Remate sin tachar nada. Las ofertas con precio de referencia falso pueden ser sancionadas por Indecopi.
- **Defectos a la vista:** se mencionan en la descripción y se muestran en al menos una foto.
- **Fotos propias** del artículo real, nunca de internet.
- **Sin imitaciones de marca.** Si no se puede confirmar que es original, la marca no va en el título.
- **No se publica:** medicamentos, productos vencidos, armas, artículos de procedencia dudosa.

## Políticas del comprador

La regla base es: revisas antes de pagar, y si no lo quieres, pagas solo el delivery. Así se cuida el viaje del motorizado sin quitarle confianza al comprador.

| Situación | Qué pasa |
| --- | --- |
| Cancela antes de que salga el motorizado | Sin costo |
| Lo revisa al recibir y no lo quiere | Paga solo el delivery (S/2.00–2.50) |
| No coincide con las fotos o la descripción, o tiene un defecto no mencionado | No paga nada, ni el delivery |
| No está o no contesta 5 minutos después de que llega el motorizado | Se cancela. Para volver a pedirlo, paga el delivery por adelantado con Yape |
| Ya pagó y recibió | No hay cambios ni devoluciones; por eso se revisa antes de pagar |

- **Revisión:** hasta 5 minutos frente al motorizado.
- **Precio:** el publicado es el final. En artículos con "Acepta ofertas", el precio se acuerda por chat antes del envío, nunca en la puerta.
- **Reserva:** dura 24 horas desde que se confirma; sin respuesta, se libera.
- **Pago:** efectivo o Yape. En efectivo, avisar por chat si se necesita vuelto de más de S/20.

**Texto visible en la web** (pie de la tienda y bajo el bloque de entrega): "Revísalo al recibir. Si no lo quieres, solo pagas el delivery. Si no es como en las fotos, no pagas nada."

## Plan de construcción y criterios de aceptación

Se construye en tres entregas cortas sobre el stack actual de tindivo.com, reutilizando el login de admin, el almacenamiento de imágenes y el registro de entregas que ya existen. Cada entrega se puede usar sola.

1. **Vitrina (día 1):** tablas y categorías; API pública de listado y detalle (nunca devuelve borradores ni ocultos); páginas /store y /store/\[slug\] con botón de WhatsApp. Los primeros artículos se cargan directo en la base de datos.
2. **Panel (día 2):** lista, formulario con subida y compresión de fotos, cambio de estado, duplicar, configuración.
3. **Difusión y medición (día 3):** Open Graph, compartir, links con ref, copiar texto para redes, store\_events y resumen del experimento en el panel.

### Criterios de aceptación

- [ ] Un link de producto pegado en WhatsApp o Facebook muestra foto, título y precio.
- [ ] Desde el listado se llega a WhatsApp con el mensaje y el código ya escritos en dos toques.
- [ ] "casaca" encuentra "Casaca" y "móvil" encuentra "movil".
- [ ] Un artículo reservado no muestra el botón de compra; uno vendido aparece al final en gris.
- [ ] Borradores y ocultos no se ven ni se abren por URL pública.
- [ ] El precio original solo aparece si es mayor que el precio; el porcentaje se redondea al entero.
- [ ] Se crea un artículo con 3 fotos desde el celular en menos de 2 minutos.
- [ ] El listado con 30 artículos carga en menos de 2 segundos con 4G.
- [ ] A 360 px no hay scroll horizontal y el botón de compra siempre se ve.
- [ ] Cada clic a WhatsApp guarda un evento con el producto y la fuente.

### Lo que Jesús define antes de lanzar

- [ ] Número de WhatsApp de la tienda: 906550166
- [ ] Precio de delivery: S/2.00 o S/2.50 según distancia
- [ ] Políticas del comprador: ver su sección
- [ ] Metas del experimento: ver Resumen y objetivo

## Siguientes versiones

Nada de esto se construye hasta que el día 14 muestre demanda.

- **v2, varios vendedores:** la mamá y las primas con un perfil simple (nombre y foto). Jesús sigue cargando sus artículos; el campo vendedor\_id ya está listo.
- **v3, suscripción:** S/30 al mes para vendedores externos, cuando la tienda muestre ventas semanales que justifiquen el pago.
- **Avisos:** "Avísame cuando llegue algo de Calzado" por WhatsApp.
- **App móvil:** notificaciones de artículos nuevos; pago con comprobante Yape reutilizando el flujo de restaurantes.
