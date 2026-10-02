# Tindivo Store — PRD v2 (MVP)

Versión 2 · 2 de octubre de 2026 · Autor: Jesús (Tindivo)

La v2 mantiene el producto de la v1 e incorpora la revisión de diseño de las primeras pantallas. La sección 0 resume qué cambia; el resto del documento es la especificación completa y reemplaza a la v1.

Criterio para cualquier duda: **¿esto ayuda a que alguien encuentre un producto, confíe y escriba por WhatsApp, o ayuda a Jesús a publicar y vender más rápido?** Si la respuesta es no, queda fuera del MVP.

---

## 0. Cambios de la v2

| Área | v1 | v2 |
| --- | --- | --- |
| Cabecera del listado | Logo + insignia Store + título grande "Tindivo Store" + subtítulo + ícono de perfil | Header compacto "Tindivo · Store", franja de una línea "Entrega desde S/2 · Pagas al recibir". Sin título duplicado ni ícono de perfil |
| Filtros | Fila de categorías + fila Todo/Nuevo/Segunda + botón de orden | Una sola fila de categorías. Nuevo/Segunda y Orden van en un ícono de filtros dentro del buscador, que abre una hoja inferior |
| Destacados | Carrusel arriba, repetía productos de la grilla | Eliminado del MVP |
| Contraste de tarjetas | Disponibles se veían apagados y el vendido con contraste total (error) | Disponible 100 %, Reservado ~85 % + insignia, Vendido en gris y solo en la sección "Vendidos recientemente" |
| Vendidos | Al final de la misma grilla, todos | Sección propia "Vendidos recientemente", máximo 6 |
| Fotos | Ilustraciones de muestra | Portada 1:1 recortada (cover) con punto central elegido por Jesús; foto original completa en el detalle. Diseñar y validar con fotos reales |
| Ficha del detalle | 4 cajas (Condición, Talla, Para, Estado) | Una línea compacta "Usado · Talla M · Dama" + línea de estado con barra |
| Descuento en el detalle | −50 %, precio tachado y "Ahorras S/30" | −50 % sobre la foto + precio tachado. Sin "Ahorras" |
| Código TS-0012 | Chip arriba del título | "Ref. TS-0012" pequeño al final del detalle |
| Galería | Puntos + "1/4" | Solo "1/4". Tocar la foto abre el visor |
| Confianza | Solo "pagas al recibir" | Junto al botón: "Revísalo antes de pagar · Si no es como en las fotos, no pagas nada" |
| Pie fijo en Reservado | Botón gris que parecía desactivado | Etiqueta pequeña "RESERVADO" + botón con borde de marca "Avísame si se libera" |
| Botón volver | Sin definir | Vuelve a la pantalla anterior de Tindivo; si llegó desde un link externo, va a /store |
| Cambio de estado en el admin | Selector en cada fila + hoja de acciones | El estado de la fila es solo informativo. Tocar la fila abre acciones contextuales según el estado, con Deshacer |
| Formulario | "Se guarda al publicar" + botón "Guardar borrador" | Borrador en servidor desde la primera foto, guardado automático, indicador "Guardando… / Guardado". Solo botón "Publicar" |
| Borradores | Sin lugar claro | Aviso "Tienes 2 borradores pendientes · Continuar" arriba de la lista, solo si existen |
| Botón Nuevo artículo | Tapaba la última fila | Espacio inferior en la lista igual a su altura + margen |
| Tipografía | Varios textos de 10–11 px en gris claro | Nada menor a 12 px; grises con contraste suficiente (ver sección 8) |

---

## 1. Resumen y objetivo

Tindivo Store es una sección de tindivo.com para vender cualquier artículo, nuevo o de segunda, dentro de San Jacinto. El comprador elige en la web, pide por WhatsApp y recibe con la flota de Tindivo pagando al recibir.

En el MVP hay un solo vendedor: Jesús. Ropa, calzado, perfumes y mochilas son el primer lote, pero la ficha sirve igual para una planta o un cable.

El experimento dura 14 días desde la primera publicación y responde dos preguntas por separado: si hay compradores y si el contenido trae gente a tindivo.com.

| Métrica (14 días) | Mínimo para seguir | Meta | Base del cálculo |
| --- | --- | --- | --- |
| Artículos publicados | 15 | 25 | Lote propio: casacas, polos, zapatillas, perfumes, mochilas |
| Visitas a /store | 150 | 250 | Hoy tindivo.com recibe ~10 visitas al día (~140 en 14 días) |
| Clics a WhatsApp | 20 | 40 | ~15 % de las visitas |
| Ventas entregadas | 5 | 8 | ~1 de cada 5 chats se cierra |
| Ingreso por artículos | S/150 | S/250 | Precio promedio estimado de S/30 |
| Ingreso por delivery | S/10 | S/18 | Promedio de S/2.25 por venta |
| Visitantes que pasan a restaurantes | 5 % | 10 % | Mide si la tienda ayuda a la adopción |
| Tiempo de Jesús | — | Máx. 4 h por semana | Si pasa de esto, no lo sostiene una sola persona |

El mínimo decide si se sigue; la meta decide si se escala. El ingreso del MVP es casi todo venta de artículos propios y no se repite. El ingreso recurrente solo llega si otros venden aquí (sección 13).

---

## 2. Usuarios y principios

- **Comprador:** vecino de San Jacinto que llega desde un link en Facebook o WhatsApp, casi siempre directo a un producto. No está acostumbrado a navegar webs ni a crear cuentas. Puede tener 45–60 años y mirar el celular al sol.
- **Admin (Jesús):** sube y despacha artículos desde el celular, entre otras tareas. El admin es una herramienta para despachar inventario rápido, no un panel de e-commerce.

Principios:

1. Cualquier artículo cabe. La ficha no depende de la categoría.
2. Del link al WhatsApp en dos toques como máximo.
3. Celular primero: 360–414 px. Escritorio es secundario.
4. Publicar un artículo con fotos toma menos de 2 minutos.
5. Verdad visible: condición, estado del 1 al 10, defectos y precio original real.
6. Sin cuentas, sin carrito, sin pago en línea. Todo se cierra por WhatsApp.
7. El primer viewport muestra productos.

Decisiones tomadas: vendedor único, sin control de stock (cada publicación es una pieza; si hay dos iguales se duplica), solo San Jacinto, pago contra entrega o Yape, WhatsApp 906 550 166, delivery S/2.00–2.50 según distancia.

---

## 3. Alcance

| Entra en el lanzamiento | Queda fuera del MVP |
| --- | --- |
| Listado /store con búsqueda, categorías y hoja de filtros (Nuevo/Segunda, orden) | Carrito, checkout, pago en línea |
| Detalle /store/[slug] con galería, ficha compacta y pie fijo por estado | Cuentas de comprador, perfil, favoritos |
| Vista previa al compartir (Open Graph) y botón Compartir | Destacados |
| Admin: lista, acciones contextuales con Deshacer, formulario con guardado automático, configuración | Varios vendedores, perfiles y suscripción |
| Portada cuadrada con punto central | Chat interno, reseñas, ofertas dentro de la web |
| Registro de eventos del experimento | Entregas fuera de San Jacinto y mapa |

Después del lanzamiento, solo si hace falta: editor completo de reencuadre (mover y zoom), volver a la misma posición de scroll, limpieza automática de borradores abandonados, análisis fino del uso de filtros.

---

## 4. Modelo de datos

Los nombres son sugeridos; el agente los adapta a la convención de la base actual de tindivo.com.

**store_products**

| Campo | Tipo | Oblig. para publicar | Notas |
| --- | --- | --- | --- |
| id | uuid | sí | |
| codigo | texto | sí | Autogenerado: TS-0001. Va en el mensaje de WhatsApp |
| slug | texto único | sí | Del título + código: casaca-jean-m-ts-0001 |
| titulo | texto ≤ 60 | sí | Puede estar vacío mientras es borrador |
| descripcion | texto ≤ 600 | no | Detalles, medidas, defectos |
| categoria_id | fk | sí | Ver lista abajo |
| para | enum | no | dama, caballero, niños, unisex. Solo ropa, calzado, accesorios |
| condicion | enum | sí | nuevo_con_etiqueta, nuevo_sin_uso, usado |
| estado_puntaje | entero 1–10 | si es usado | Oculto cuando es nuevo |
| talla_medida | texto ≤ 20 | no | "M", "38", "100 ml", "2 m", "maceta mediana" |
| precio | decimal S/ | sí | |
| precio_original | decimal S/ | no | Solo se muestra si es mayor que precio |
| es_remate | booleano | no | Etiqueta Remate |
| negociable | booleano | no | Etiqueta "Acepta ofertas" |
| fotos | lista de {url, url_mini, url_portada, orden} | sí (≥ 1) | Máx. 6. La primera es la portada |
| portada_foco | {x, y} de 0 a 1 | no | Punto central del recorte cuadrado. Por defecto el centro (0.5, 0.5) |
| estado_publicacion | enum | sí | borrador, disponible, reservado, vendido, oculto |
| vendido_en | fecha-hora | no | Se llena al marcar vendido; se limpia al deshacer o volver a disponible |
| vendedor_id | fk | no | Vacío en el MVP |
| creado_en, actualizado_en | fecha-hora | sí | |

El campo `destacado` de la v1 se elimina.

**store_categories** (fija): Ropa, Calzado, Bolsos y accesorios, Perfumes y belleza, Tecnología, Hogar y plantas, Deporte, Otros. Campos: id, nombre, slug, icono, orden.

**store_events**: id, tipo, product_id, termino_busqueda, ref (fuente del link), session_id anónimo, creado_en. Tipos: view_list, view_product, search, filter_open, filter_apply, click_whatsapp, click_notify (avísame si se libera), share, nav_out.

**store_settings**: whatsapp_numero (51906550166), delivery_min (S/2.00), delivery_max (S/2.50), texto_entrega.

---

## 5. Experiencia del comprador

### 5.1 Listado /store

El primer viewport tiene solo esto, en orden: marca compacta, promesa de entrega, buscador con filtros, categorías y productos.

1. **Header compacto:** "Tindivo · Store". Sin ícono de perfil ni otros botones.
2. **Franja de una línea:** "Entrega desde S/2 · Pagas al recibir".
3. **Buscador**, fijo arriba al hacer scroll. Busca en título, descripción, categoría y talla, sin distinguir mayúsculas ni tildes, y filtra al escribir. A la derecha, dentro del campo, un **ícono de filtros** con un punto indicador cuando hay alguno activo.
4. **Hoja de filtros** (al tocar el ícono): Condición (Todo / Nuevo / Segunda) y Orden (Recientes / Menor precio / Mayor precio). Botón "Ver X artículos".
5. **Chips de categoría**, una sola fila deslizable, con ícono y cantidad. Las categorías sin artículos no aparecen.
6. **Grilla de 2 columnas** con disponibles y reservados, más recientes primero (o según el orden elegido).
7. **Vendidos recientemente:** sección al final con título propio, máximo 6, más recientes primero.
8. **Pie:** "Cómo funciona" en 3 pasos (Eliges → Nos escribes → Te lo llevamos y pagas al recibir), la frase de confianza y un enlace a los restaurantes de Tindivo.

Los filtros elegidos se guardan en la URL (`/store?categoria=ropa&condicion=segunda&orden=precio_asc`), para poder compartirlos y volver a ellos.

**Tarjeta de producto**

- Portada cuadrada recortada según `portada_foco`.
- Una sola insignia arriba a la izquierda, por prioridad: −X % (si hay precio original), Remate, Nuevo con etiqueta, Estado 9/10.
- Precio grande; precio original tachado al lado.
- Título en máximo 2 líneas y talla o medida siempre visible.

| Estado | Cómo se ve |
| --- | --- |
| Disponible | Contraste total. Es el estado que más debe destacar |
| Reservado | Mismo lugar en la grilla, ~85 % de opacidad, insignia gris "Reservado" en lugar de la insignia normal. Precio y título siguen legibles |
| Vendido | Solo en "Vendidos recientemente". Foto en escala de grises con franja "Vendido", textos atenuados |

**Búsqueda sin resultados:** "No lo tenemos aún. Escríbenos y te avisamos si llega", con botón a WhatsApp. El mensaje incluye lo buscado: "Hola Tindivo, busco: cargador solar. ¿Me avisan si llega?". Debajo, "Mientras tanto" con 4 artículos disponibles.

### 5.2 Fotos

- **Portada en la grilla:** cuadrada, recortada para llenar la tarjeta (cover), centrada en el punto `portada_foco`.
- **Detalle:** foto original completa, sin recorte, sobre fondo neutro si sobra espacio.
- **Tamaños:** WebP de 1080 px (detalle), 400 px cuadrada (tarjeta), carga diferida.
- **Validación de diseño:** las pantallas se prueban con 15 fotos reales tomadas con celular (fondos distintos, una planta alta, un cable horizontal, una zapatilla de lado), no con ilustraciones.

### 5.3 Detalle /store/[slug]

De arriba abajo:

1. **Galería** deslizable con indicador "1/4". Tocar cualquier parte de la foto abre el visor a pantalla completa con zoom. Insignia −X % o Remate sobre la foto. Arriba, botón volver (izquierda) y compartir (derecha).
2. **Título.**
3. **Precio** grande y precio original tachado. Insignias pequeñas: Pieza única, Acepta ofertas.
4. **Ficha compacta en una línea:** "Usado · Talla M · Dama" (se omite lo que no aplica).
5. **Estado** (solo si es usado): "Estado 7/10 · Buen estado, con uso" con barra de 10 segmentos.
6. **Descripción.**
7. **Entrega:** "Te lo llevamos en San Jacinto desde S/2 (S/2.00–2.50 según distancia) · Pagas al recibir: efectivo o Yape".
8. **También te puede gustar:** 4 disponibles de la misma categoría.
9. **Ref. TS-0012**, pequeño, al final.

**Pie fijo según estado:**

| Estado | Pie fijo |
| --- | --- |
| Disponible | Botón verde "Lo quiero — pedir por WhatsApp". Debajo: "✓ Revísalo antes de pagar · Si no es como en las fotos, no pagas nada" |
| Reservado | Etiqueta pequeña "RESERVADO" y botón con borde del color de marca y fondo blanco: "🔔 Avísame si se libera". Arriba en la página, un aviso: "Otra persona lo pidió. Si no se concreta, vuelve a estar disponible" |
| Vendido | Etiqueta pequeña "VENDIDO" y botón de marca "Ver parecidos" |

El verde se usa únicamente para el botón de compra por WhatsApp.

### 5.4 Botón volver

- Si hay navegación previa dentro de Tindivo, vuelve a esa pantalla, con los filtros de la URL intactos.
- Si llegó directo desde un link externo (Facebook, WhatsApp, TikTok), lleva a /store. Para ese usuario, el botón es la puerta al resto del catálogo.
- Volver a la misma posición de scroll queda para después del lanzamiento.

### 5.5 Requisitos técnicos

- **Open Graph en servidor** para cada detalle: portada, "Casaca jean M — S/30", condición. Sin esto, el link en WhatsApp o Facebook se ve vacío.
- **Links con ?ref=** (fb, mp, wa_estado, grupo, tiktok); la fuente se guarda en la sesión.
- **Velocidad:** listado con 30 artículos en menos de 2 segundos con 4G.
- **Compartir:** menú nativo del celular; si no existe, copia el link.

---

## 6. Admin /admin/store

Vive detrás del login de admin actual. Todo lo que se toca mide 44 px o más.

### 6.1 Lista

- **Resumen del experimento** arriba: "Día 6 de 14", visitas, clics a WhatsApp, ventas y monto vendido, cada uno con su barra contra el mínimo y la meta.
- **Aviso de borradores**, solo si existen: "Tienes 2 borradores pendientes · Continuar", con "actualizado hace 2 h" en el más reciente.
- **Pestañas:** Disponibles · Reservados · Vendidos · Más (Ocultos).
- **Fila:** miniatura, código, título, precio, chip de estado (solo informativo), vistas y clics a WhatsApp.
- **Tocar la fila** abre la hoja de acciones.
- **Botón flotante "+ Nuevo artículo"** abajo a la derecha. La lista deja espacio inferior igual a su altura + área segura + margen, para que nunca tape la última fila.

### 6.2 Hoja de acciones contextual

| Estado | Acción principal | Secundarias |
| --- | --- | --- |
| Disponible | Reservar | Marcar vendido (venta directa sin reserva), Editar, Duplicar, Copiar link, Copiar texto para redes. Ocultar al final, discreta |
| Reservado | Marcar vendido | Volver a disponible, Editar, Copiar link. Ocultar al final, discreta |
| Vendido | — (ver datos: vistas, clics, fecha de venta) | Duplicar. Volver a disponible al final, discreta |
| Oculto | Volver a publicar | Editar |
| Borrador | Continuar editando | Eliminar borrador |

- Cada cambio de estado muestra durante 5 segundos un aviso inferior: "Marcado como vendido · Deshacer". No hay ventanas de confirmación.
- Deshacer devuelve el estado anterior y, si aplica, limpia `vendido_en`.
- **Copiar link** pide la fuente con chips (Facebook, Marketplace, Estado de WhatsApp, Grupo, TikTok). La fuente elegida se usa también en **Copiar texto para redes**, por ejemplo: "Casaca jean M · Estado 9/10 · S/30 (antes S/60) · Te la llevo en San Jacinto, pagas al recibir · tindivo.com/store/casaca-jean-m-ts-0012?ref=fb".

### 6.3 Formulario de artículo

- **Encabezado:** "Nuevo artículo" con indicador discreto "Guardando…" / "Guardado".
- **Guardado automático:** al subir la primera foto se crea el artículo como borrador en el servidor. Cada foto se sube por separado y cada campo se guarda solo, con un pequeño retraso al escribir.
- **Orden de campos:**
    1. **Fotos:** Cámara o Galería, hasta 6, arrastrar para ordenar. La primera es la portada.
    2. **Portada:** vista previa cuadrada tal como saldrá en la tienda, con la instrucción "Toca el punto que debe quedar al centro".
    3. **Título** y **precio**.
    4. **Precio original** (opcional): "Solo si es el precio real que pagaste o el de tienda".
    5. **Categoría** y **condición** como botones grandes. Se recuerdan las últimas usadas.
    6. **Estado 1–10** con deslizador y su texto, visible solo si es usado.
    7. **Talla o medida** y **para quién** (solo ropa, calzado y accesorios).
    8. **Descripción** con texto guía: "Marca, medidas, cómo está, si tiene algún detalle".
    9. Interruptores: Remate y Acepta ofertas.
- **Un solo botón fijo abajo: "Publicar".** Se activa cuando están los campos obligatorios: al menos una foto, título, precio, categoría, condición y estado si es usado. Si falta algo, el botón dice qué falta.

### 6.4 Configuración

Número de WhatsApp, delivery mínimo y máximo, y texto de entrega, con una vista previa "Así se ve en la tienda".

---

## 7. Compra por WhatsApp y entrega

1. El comprador toca "Lo quiero". Se abre wa.me/51906550166 con el mensaje escrito: "Hola Tindivo, quiero: Casaca jean talla M (S/30) — código TS-0012. tindivo.com/store/casaca-jean-m-ts-0012 ¿Sigue disponible?"
2. Jesús confirma con una respuesta rápida de WhatsApp Business, pide ubicación y hora, confirma el delivery (S/2.00 o S/2.50 según distancia) y recuerda que puede revisarlo al recibir.
3. Jesús marca el artículo como **Reservado**.
4. Jesús registra la entrega en la plataforma con su propia cuenta, como hace hoy con los pedidos por WhatsApp. Monto a cobrar: precio + delivery.
5. El motorizado entrega y cobra en efectivo o Yape.
6. Entregado: **Vendido**. Si el comprador cancela o no está: **Volver a disponible**.

Mensaje desde un artículo reservado: "Hola Tindivo, vi que TS-0012 está reservado. Avísame si se libera."

Reglas de entrega: solo dentro de San Jacinto (fuera, con coordinación previa); entregas preferentemente fuera del pico de restaurantes; una reserva sin respuesta en 24 horas vuelve a disponible (manual).

---

## 8. Guía visual

**Regla principal:** la tienda se ve como parte de tindivo.com. Usa el mismo sistema visual de las demás páginas: colores de marca, tipografía, radios, sombras, botones, íconos y navegación.

**Colores reservados:**

- Verde WhatsApp: solo el botón de compra.
- Rojo o naranja de acento: solo descuentos y Remate.
- El botón "Avísame si se libera" y "Ver parecidos" usan el color de marca, nunca verde.

**Tipografía:**

| Elemento | Tamaño |
| --- | --- |
| Precio en tarjeta | 18–20 px, negrita |
| Título en tarjeta | 15 px, máximo 2 líneas |
| Talla o medida en tarjeta | 13–14 px |
| Insignias | 12–13 px, con buen contraste |
| Cuerpo en el detalle | 16 px |
| Mínimo absoluto | 12 px, solo metadata secundaria |

- Los textos grises deben leerse al sol: contraste mínimo 4.5:1 sobre su fondo.
- Las tarjetas blancas se separan del fondo crema con un borde sutil o una sombra leve.

**Textos:**

| Lugar | Texto |
| --- | --- |
| Franja del listado | Entrega desde S/2 · Pagas al recibir |
| Botón de compra | Lo quiero — pedir por WhatsApp |
| Bajo el botón de compra | ✓ Revísalo antes de pagar · Si no es como en las fotos, no pagas nada |
| Pie reservado | RESERVADO + 🔔 Avísame si se libera |
| Pie vendido | VENDIDO + Ver parecidos |
| Insignia de pieza única | Pieza única |
| Búsqueda vacía | No lo tenemos aún. Escríbenos y te avisamos si llega |
| Sección de vendidos | Vendidos recientemente |
| Estado 10 | Impecable |
| Estado 8–9 | Muy buen estado |
| Estado 6–7 | Buen estado, con uso |
| Estado 1–5 | Con detalles visibles (ver fotos) |

Tono: cercano, de tú, frases cortas, sin exagerar.

---

## 9. Métricas y lectura del experimento

Embudo: visitas a /store → vistas de producto → clics a WhatsApp → ventas, separado por fuente (ref). Para la adopción se mide nav_out: cuántos visitantes de la tienda pasan a los restaurantes.

El uso de filtros (filter_open, filter_apply) solo se registra; con ~250 visitas la muestra es muy chica para decidir. Se revisa en la v2 con más catálogo y tráfico.

| Qué pasó al día 14 | Qué significa | Siguiente paso |
| --- | --- | --- |
| Menos de 150 visitas | El contenido no mueve gente | Cambiar formato o canal antes de tocar la tienda |
| 150+ visitas, menos de 20 clics | Precio, fotos o surtido no convencen | Bajar precios o rehacer fotos de lo más visto; 7 días más |
| 20+ clics, menos de 5 ventas | Se pierde en la conversación | Revisar chats: precio, rapidez de respuesta, entrega |
| 5–7 ventas | Hay demanda, aún chica | 14 días más sumando el stock de la mamá |
| 8+ ventas y S/250+ en artículos | Hay demanda clara | Sumar mamá y primas y medir ventas por semana para la suscripción |
| Más de 4 h por semana de Jesús | El proceso no escala | Simplificar antes de crecer |

---

## 10. Políticas del comprador

Regla base: revisas antes de pagar, y si no lo quieres, pagas solo el delivery.

| Situación | Qué pasa |
| --- | --- |
| Cancela antes de que salga el motorizado | Sin costo |
| Lo revisa al recibir y no lo quiere | Paga solo el delivery (S/2.00–2.50) |
| No coincide con las fotos o la descripción, o tiene un defecto no mencionado | No paga nada, ni el delivery |
| No está o no contesta 5 minutos después de que llega el motorizado | Se cancela. Para volver a pedirlo, paga el delivery por adelantado con Yape |
| Ya pagó y recibió | No hay cambios ni devoluciones; por eso se revisa antes de pagar |

- Revisión: hasta 5 minutos frente al motorizado.
- Precio: el publicado es el final. Con "Acepta ofertas", el precio se acuerda por chat antes del envío, nunca en la puerta.
- Reserva: dura 24 horas desde que se confirma.
- Pago: efectivo o Yape. En efectivo, avisar si se necesita vuelto de más de S/20.

---

## 11. Reglas de contenido y precios

- Precio original solo si es real (lo que se pagó o el precio en tienda). Si no se sabe, se usa Remate sin tachar nada. Las ofertas con precio de referencia falso pueden ser sancionadas por Indecopi.
- Defectos mencionados en la descripción y visibles en al menos una foto.
- Fotos propias del artículo real, nunca de internet.
- Sin imitaciones de marca. Si no se puede confirmar que es original, la marca no va en el título.
- No se publica: medicamentos, productos vencidos, armas, artículos de procedencia dudosa.

---

## 12. Plan de construcción y criterios de aceptación

Se construye sobre el stack actual de tindivo.com, reutilizando el login de admin, el almacenamiento de imágenes y el registro de entregas.

1. **Vitrina:** tablas, categorías, API pública de listado y detalle (nunca devuelve borradores ni ocultos), páginas /store y /store/[slug], pie fijo por estado, botón volver.
2. **Admin:** lista, hoja de acciones contextual con Deshacer, formulario con guardado automático y punto central de portada, configuración.
3. **Difusión y medición:** Open Graph, compartir, links con ref, copiar texto para redes, store_events y resumen del experimento.

Criterios de aceptación:

- [ ] En 390 px, el primer viewport del listado muestra al menos una fila completa de productos.
- [ ] Un link de producto pegado en WhatsApp o Facebook muestra foto, título y precio.
- [ ] Desde el listado se llega a WhatsApp con el mensaje y el código ya escritos en dos toques.
- [ ] Disponible se ve con contraste total; reservado legible con su insignia; vendido solo en "Vendidos recientemente" (máximo 6).
- [ ] La portada se ve cuadrada y centrada en el punto elegido; el detalle muestra la foto completa.
- [ ] "casaca" encuentra "Casaca" y "movil" encuentra "móvil".
- [ ] Los filtros quedan en la URL y se conservan al volver desde un detalle.
- [ ] Desde un link externo, el botón volver lleva a /store.
- [ ] Borradores y ocultos no se ven ni se abren por URL pública.
- [ ] Si se cierra la app a mitad de cargar un artículo, al volver el borrador sigue ahí con sus fotos.
- [ ] Cada cambio de estado se puede deshacer en 5 segundos; deshacer "vendido" limpia la fecha de venta.
- [ ] Se crea un artículo con 3 fotos desde el celular en menos de 2 minutos.
- [ ] Ningún texto mide menos de 12 px y los grises cumplen contraste 4.5:1.
- [ ] El botón "Nuevo artículo" nunca tapa la última fila.
- [ ] El listado con 30 artículos carga en menos de 2 segundos con 4G.
- [ ] Cada clic a WhatsApp guarda un evento con el producto y la fuente.

---

## 13. Siguientes versiones

Nada de esto se construye hasta que el día 14 muestre demanda.

- **Varios vendedores:** la mamá y las primas con un perfil simple. El campo vendedor_id ya está listo.
- **Suscripción:** S/30 al mes para vendedores externos, cuando haya ventas semanales que la justifiquen.
- **Avisos:** "Avísame cuando llegue algo de Calzado" por WhatsApp.
- **App móvil:** notificaciones de artículos nuevos; pago con comprobante Yape reutilizando el flujo de restaurantes.
