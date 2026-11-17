# Rediseño de la app cliente Android — propuesta (fase B)

Estado: **propuesta**, no es canon. Autor: Claude (Opus) como revisión de UX/UI, 16-nov-2026.

## Principio: la web es el diseño de Tindivo

La web cliente es lo que la gente de San Jacinto **ya usa y reconoce**. La app Android no se rediseña desde cero:
**primero se iguala a la web** (mismos bloques, textos, colores y gestos), y solo después se cambia algo **si el
cambio favorece al usuario y se puede probar**. Cada mejora sobre la web va marcada y es una decisión de Jesús.

Material: capturas de la app (`capturas/actual/`, tablet SM-T733, 14 y 16-nov), mapa de la web hecho por Gemini Flash
sobre `apps/customer/features/{catalog,cart}/components/*` (21 archivos, 16-nov), referencias de Rappi, PedidosYa,
Tynda y Llamafood (`capturas/referencias/`), `componentes.md` y `reglas.md`.
Marcas: **[obs]** visto en captura · **[cód]** en el código · **[web]** así lo hace la web hoy · **[dep]** necesita algo
que la API no da a la app hoy · **[mejora]** cambio sobre la web, a decidir.

---

## 1. Diagnóstico: la app va atrás de la web

| Pantalla | Web hoy [web] | App Android hoy [obs] |
|---|---|---|
| Inicio | Cabecera con logo, dirección, bolsa y perfil; saludo «Buenas noches, Jesús 🍕»; tarjetas de servicio con degradado naranja y «X abiertos ahora» con punto verde; carrusel; buscador; negocios con logo 72 px | Título «Restaurantes»; servicios en tarjetas blancas de solo texto; negocios en tarjeta gris con inicial; sin dirección, buscador ni saludo |
| Negocio | Foto panorámica (o degradado del color del negocio), logo circular, «Abierto · cierra 10:00 p. m.» con horario desplegable, «Llega en 25–35 min», selector Delivery/Recojo, pestañas subrayadas, tarjetas de plato con foto 92 px y botón «+» | Logo cuadrado e inicial, nombre; sin estado, tiempo, horario ni selector; platos en filas con el mismo ícono gris de «sin foto» |
| Plato | Hoja con foto arriba (o respaldo de color con el nombre), precio en naranja, opciones en cajas con «Obligatorio»/«Listo» y «X/Y», nota con ejemplo «sin cebolla…», barra fija con cantidad + «Agregar · S/ X» o «Completa 1 opción» | Hoja sin foto, nota «Nota (opcional) 0/140», contador con «−» casi invisible, «Agregar · S/ 25.00» |
| Bolsa | Miniatura 48 px por línea, opciones y nota en chip, «Eliminar» con ícono, «Seguir agregando platos» punteado, barra con «SUBTOTAL» y «Ir a pagar»; aviso si el local cerró | Líneas sin miniatura, «Quitar» en texto, «+ Agregar más», «Continuar» (ya no queda bajo la barra tras #172/#173) |

Conclusión: **paridad visual con la web es la mejora más grande y la de menor riesgo**: el usuario que ya pidió por la
web reconoce la app al instante. Casi todo lo que hace falta ya tiene datos en la API (logo, acento, cerrado,
minutos, foto de plato) **[cód]**. Lo que no: foto panorámica del negocio, hora de apertura/cierre, selector de recojo
por negocio y carrusel **[dep]** — revisar si el catálogo ya lo envía y la app no lo lee.

---

## 2. Fase B1 — igualar la web (sin decisiones nuevas)

Orden por impacto en «pedir fácil»:

1. **Tarjeta de plato de la web**: foto 92 px a la derecha, botón «+» circular sobre la foto (agrega directo si no
   tiene opciones obligatorias), descripción en 2 líneas, «Desde S/ X · Personalizable» cuando tiene opciones,
   **respaldo de color con inicial** en vez del ícono gris. Fila compacta para bebidas como la web.
2. **Hoja del plato de la web**: foto o respaldo arriba, opciones en cajas con «Obligatorio» → «Listo», botón
   «Completa 1 opción» en vez de desactivarse en silencio, nota con el ejemplo de la web, píldora de cantidad.
3. **Cabecera del negocio**: estado «Abierto · cierra…» / «Cerrado · abre…», «Llega en 25–35 min», banner ámbar de
   cerrado, pestañas subrayadas fijas. Foto panorámica y selector Delivery/Recojo si el catálogo los envía **[dep]**.
4. **Inicio**: saludo con nombre (o «¿Qué pedimos hoy?»), tarjetas de servicio con el degradado y «X abiertos
   ahora», negocios con logo 72 px, cerrados atenuados con «Cerrado ahora» y abajo de los abiertos, buscador.
5. **Bolsa**: miniatura por línea, «Eliminar» con ícono, «Seguir agregando platos», «SUBTOTAL» e «Ir a pagar»
   (mismo texto que la web).

Criterio de aceptación de cada paso: captura de la app y de la web lado a lado en `capturas/propuestas/` con el mismo
negocio de prueba; mismos textos y mismo orden de bloques; Maestro sigue llegando a la identificación.

---

## 3. Mejoras sobre la web (cada una es decisión de Jesús)

| # | Mejora [mejora] | Por qué favorece al usuario | Cómo probarla | Riesgo |
|---|---|---|---|---|
| M1 | **Contraste del botón principal.** Blanco sobre `#F97316` = **2,8:1** (mínimo 4,5:1). Opción suave: rellenar el botón con el mismo degradado de las tarjetas de servicio que termina en `#C2410C`, o el texto del botón a 18 sp negrita sobre `#EA580C` (3,6:1, válido como texto grande). | Se lee bajo el sol de la calle y con poca vista; la marca sigue naranja. | Test de contraste en `:core:designsystem`; ver la app al aire libre. | Si se hace solo en Android, app y web dejan de verse iguales: **hacerlo en ambas o en ninguna**. |
| M2 | **Pedir la cuenta en un solo toque**: hoy «Entrar» abre otra pantalla con «Continuar con Google» **[obs]**. Propuesta: hoja sobre la bolsa con el total visible y el botón oficial de Google directo. | Un toque y una pantalla menos justo antes de pagar; no pierde de vista su total. | Maestro + 5 personas: ¿llegan al checkout?, ¿entienden por qué se pide? | Bajo; no cambia la API. |
| M3 | **Ancho máximo en tablet** (640 dp centrado o 2 columnas en el inicio). | En la tablet todo se estira a 2 400 px **[obs]**. | Captura en horizontal. | Ninguno en teléfono. |
| M4 | **«−» visible aunque esté desactivado** (con cantidad 1). | Hoy parece que falta el botón **[obs]**. | Captura. | Ninguno. |

Lo que **no** propongo tocar: los textos, el orden de los bloques, las píldoras, el naranja como color de acento, el
punto verde de «abiertos ahora» y los respaldos de color: son parte de cómo la gente ya reconoce Tindivo.

---

## 4. Reglas nuevas (propuesta, para `reglas.md`)

| Regla | Cómo verificar |
|---|---|
| **Paridad**: cada pantalla de la app que exista en la web usa los mismos textos y el mismo orden de bloques, salvo una mejora aprobada y anotada aquí. | Captura web y app lado a lado en el PR. |
| Una imagen ausente nunca deja un ícono gris: respaldo de color con inicial, como la web. | `@Preview` con y sin foto. |
| Todo texto sobre relleno de marca cumple 4,5:1 (3:1 si es texto grande) — si se aprueba M1. | Test de contraste sobre los tokens. |
| El total está a la vista desde la bolsa hasta confirmar. | Maestro: texto `S/ …` igual al total en cada paso. |
| En ancho Medium o mayor, el contenido de lectura no pasa de 640 dp — si se aprueba M3. | Captura en tablet. |

---

## 5. Decisiones para Jesús

1. ¿Aprobamos **B1 (igualar la web)** como siguiente bloque de trabajo de la app? (Recomendado.)
2. M1 contraste: ¿lo hacemos en web y app a la vez, o lo dejamos como está?
3. M2 cuenta en un toque: ¿sí?
4. M3 tablet y M4 «−» visible: ¿sí? (Bajo riesgo.)
5. De `componentes.md`: radio de tarjeta 24 como la web (recomendado) y cifras tabulares con Geist.

## 6. Cómo se trabaja cada paso

PR chico por pantalla; `@Preview` con estados; Maestro antes y después en la tablet con la barra de tareas visible;
captura web/app lado a lado en `capturas/propuestas/android-<pantalla>-<estado>.png`. Lo que dependa de datos que la
app no recibe **[dep]** se investiga primero en el contrato del catálogo antes de prometerlo.
