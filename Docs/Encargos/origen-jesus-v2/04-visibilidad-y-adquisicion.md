# 04. Visibilidad y adquisición de Recoge y Lleva

> Lee primero `00-maestro.md`. Problema de fondo: la gente no sabe que Tindivo existe o prefiere llamar. Recoge y Lleva no puede depender de que la gente lo descubra sola. Tres frentes: (a) que sea visible dentro de tindivo.com, (b) que llegue por los negocios, (c) que llegue por el afiche y las redes.

## 1. Principios

- **Un solo mensaje:** *"¿Ya pediste y no puedes ir a recogerlo? Nosotros vamos. Desde S/3."*
- **Ofrecer Recoge y Lleva en el momento en que nace la intención**, no antes: justo después de llamar a un negocio, o justo después de terminar un pedido.
- **Nada intrusivo:** sin modales bloqueantes al cargar, máximo un aviso por sesión, siempre con botón de cerrar.
- Todo enlace lleva `?src=` para medir qué canal funciona.

## 2. Puntos de entrada dentro de tindivo.com

| # | Dónde | Gatillo | Mensaje | Frecuencia |
|---|---|---|---|---|
| 1 | **Navegación principal** | Siempre visible | Ícono + "Recoge y Lleva" | Fijo |
| 2 | **Home** | Tarjeta bajo el saludo/hero | "¿Pediste y no puedes ir? Nosotros vamos. Recoge y Lleva desde S/3." + botón | Fijo, descartable con "×" (vuelve en 7 días) |
| 3 | **Tarjeta de cada negocio no partner** | En lista y mapa | Botón "Pedir Recoge y Lleva" junto a "Llamar" | Fijo |
| 4 | **Sheet posterior a "Llamar"** | El usuario vuelve a la pestaña tras tocar "Llamar" | "¿Ya hiciste tu pedido a [Negocio]? Que Tindivo lo recoja · S/3" | Una vez por llamada; no reaparece ese día para ese negocio |
| 5 | **Pantalla final de un pedido de partner** | Al terminar un pedido de restaurante | "¿Necesitas que recojamos algo más? Recoge y Lleva desde S/3" | Una vez por pedido |
| 6 | **Buscador sin resultados / negocio no listado** | El usuario busca algo que no está | "¿No lo encuentras? Indícanos dónde recogerlo y te lo llevamos: Recoge y Lleva" | Cuando ocurre |

**Prioridad de implementación:** 3 → 4 → 1 → 2 → 5 → 6.

## 3. Reglas de los avisos (pop-ups)

- **Nunca** aparecen al cargar la página ni durante el flujo de un pedido.
- Formato: *bottom sheet* discreto, no un modal a pantalla completa.
- Un solo aviso por sesión, salvo el de "post-Llamar" (que se dispara por una acción del usuario).
- Botón de cierre visible; si se cierra, no vuelve durante el resto del día.
- No mostrar avisos de Recoge y Lleva en pedidos de partners en horas pico, si el servicio está pausado o fuera de horario (6 pm a 11 pm; ver 01, sección 2).
- Textos cortos, con un solo botón de acción.

## 4. El gancho principal: aviso posterior a "Llamar"

**Por qué:** el momento en que alguien llama a un negocio es exactamente cuando decide cómo recibirá el pedido. Es el punto de mayor intención.

**Lógica:**
1. Al tocar "Llamar" en un negocio no partner: guardar en `localStorage` `{ negocio_id, ts }` y registrar `click_llamar`.
2. Al volver a la página (evento `visibilitychange` a `visible`, y también en la carga de la página) dentro de **30 minutos**: mostrar el bottom sheet **"¿Ya hiciste tu pedido a [Negocio]? Que Tindivo lo recoja · S/3"** con un botón **"Pedir Recoge y Lleva"** que abre el flujo con `?src=popup` y el negocio ya elegido.
3. Borrar el registro tras mostrar el aviso o tras 30 minutos.

**Nota:** en algunos celulares el navegador recarga la página al volver de la llamada; por eso la lógica debe correr también en la carga inicial.

## 5. Enlaces directos y QR

- Cada negocio tiene una URL corta: **`tindivo.com/r/<slug>`**, que abre Recoge y Lleva con ese negocio como punto A.
- Parámetro de origen: `?src=qr`, `?src=whatsapp`, `?src=afiche`.
- **Un QR por negocio**, generado automáticamente desde el panel admin (botón "Descargar QR").
- **QR general** para el afiche: `tindivo.com/recoge-y-lleva?src=afiche_reverso`.

## 6. Kit para negocios (lo que Jesús les entrega en la visita)

El canal real de Recoge y Lleva son los negocios. El kit debe ser **cero esfuerzo** para ellos:

1. **Frase para decir por teléfono** (cuando el cliente pide para llevar):
   > "Si quieres, te lo llevamos a tu casa con Tindivo. Pídelo aquí: tindivo.com/r/[slug]."
2. **Texto para su estado de WhatsApp o Facebook:**
   > "¿No puedes venir? Pide y Tindivo lo recoge y te lo lleva. Desde S/3 👉 tindivo.com/r/[slug]"
3. **Imagen o sticker con el QR** para su mostrador o ventana (útil sobre todo para quienes pasan por el local y piden que se los lleven después).
4. **Nombre en la pantalla del motorizado:** el negocio no debe hacer nada; el motorizado llega y dice "vengo por el pedido de [nombre]".

Registrar en `nota_interna` si el negocio aceptó usar el kit (ver 02).

## 7. Afiche (A6, dos caras)

- **Frente:** pedidos de comida desde tindivo.com, con la promo de primer delivery gratis (**solo restaurantes**).
- **Reverso:** guía para pedir y un bloque de **Tindivo Recoge y Lleva**, claramente separado del resto.
- El brief completo para el diseño está en `brief-publicidad-recoge-y-lleva.md`.
- **Mensaje del bloque:** *"Recogemos lo que ya pagaste y lo llevamos a donde indiques. Desde S/3."*
- **Aclaración obligatoria:** *"Solo recogemos y llevamos lo que ya está pagado y listo. No compramos ni pagamos por ti."*
- **La promo de primer delivery gratis no aplica a Recoge y Lleva**, y así debe decirse en el afiche.
- **Dos enlaces o QR con `src` distinto:** frente → `tindivo.com?src=afiche_frente`; reverso → `tindivo.com/recoge-y-lleva?src=afiche_reverso`.
- **WhatsApp:** solo para consultas, no para hacer pedidos. Número: por confirmar.
- Comunicar la ventaja en positivo ("llega caliente y bien cuidado"). **Nunca** decir públicamente que el delivery de otro negocio entrega mal.
- No prometer tiempos de llegada, no decir "de todo tipo", no hablar de compras.

## 8. Contenido para redes (sale de la tabla de negocios)

- Serie **"Conoce a [Negocio]"**: logo + foto del local + descripción + "pídelo y te lo llevamos". Cada negocio registrado da una publicación casi gratis, porque ya se visitó para pedir los 4 datos.
- Publicaciones con **promociones y novedades** de partners.
- Estados de WhatsApp de Jesús con recordatorios: "Martes de Recoge y Lleva".
- Cada publicación con enlace `tindivo.com/r/<slug>?src=redes`.

## 9. Página pública del catálogo

Una página en tindivo.com ("Negocios de San Jacinto"), alimentada por la misma tabla. Con:
- Buscador y filtros por categoría.
- Vista lista/mapa.
- Tarjeta de Recoge y Lleva destacada al inicio.

## 10. Publicidad futura (no construir aún)

Si el catálogo llega a tener tráfico sostenido, se podría vender: marcador destacado, aparición prioritaria en la lista, o un banner. **[POR CONFIRMAR]** el umbral de visitas semanales que Jesús considere suficiente para empezar. Hasta entonces no se promete nada a nadie.

## 11. Medición

- Por `src`: visitas, clics en "Pedir Recoge y Lleva", recojos completados.
- **Clics en "Llamar" vs "Pedir Recoge y Lleva"** por negocio y por punto de entrada.
- Tasa de apertura → clic del aviso posterior a "Llamar".
- Qué negocios traen recojos (y cuáles solo llamadas), para decidir dónde vale la pena seguir visitando.
