# 07 · Claude · Los puntos de Jesús al probarlo (segunda tanda)

> 2026-10-07. Escrita sin leer `07-codex-ronda-jesus.md`.

## 1. Qué se busca y qué se pinta: negocios primero, lo público solo si se escribe

**De acuerdo con Jesús, a medias.** Para **recoger**, casi siempre es un
negocio: una botica, una bodega, un restaurante. Una losa deportiva o una
iglesia no son de donde se recoge un paquete. Pero para **entregar** sí
sirven: «llévalo a la plaza», «al colegio Fe y Alegría». Y son las
referencias con las que la gente del pueblo se ubica.

Propuesta:

- **Al tocar el buscador, sin escribir:** una fila de **chips de negocios**
  (Boticas · Restaurantes · Bodegas y tiendas · Hospedajes · Otros negocios) y
  debajo tus lugares. Tocar un chip lista esos negocios (hasta 5, con su
  scroll) y **los resalta en el mapa**.
- **Al escribir:** busca en todo, también lo público: si alguien escribe
  «plaza», que la encuentre. Los negocios primero.
- **En el mapa:** las chapas de los negocios, como hoy. Las de espacios
  públicos, más tenues o solo al acercar el zoom.

El problema de fondo es de **datos**: «otro» mezcla negocios (librería,
pastelería, spa, grifo) con cosas que no lo son («Entrada fábrica»,
Hidrandina). Antes de filtrar hace falta poner bien las categorías. Agregaría
`restaurante` y `hotel` al enum si no existen (en el mapa ya se ven) y una
categoría `comercio` para separar «otros negocios» de «otro».

## 2. «Ver anteriores» en una ventana aparte: sí

De acuerdo. Desplegarlo dentro del panel empuja el título y encoge el mapa.
Una **hoja que sube desde abajo** («Tus entregas anteriores», hasta 3, un toque
y a Detalles), igual que las otras hojas de la app, es más clara y se cierra
sin dejar rastro.

## 3. «Mi dirección»: más limpio, de acuerdo

El panel del paso 2 hoy apila cinco cosas: paso, título, «Recogemos en…», el
estado y el botón de «Mi dirección», además del campo y el botón. Es mucho.

- **«Mi dirección» pasa a la esquina**, en la fila del paso, a la derecha:
  «Paso 2 de 2 · 🏠 Mi dirección», igual que «Ver anteriores» en el paso 1.
- **«Recogemos en…» sale del panel.** Lo resuelve mejor el mapa: el globo de A
  con su nombre, que ya existe. Lo que falta es que A no quede fuera de la
  pantalla (ver el pendiente del §7 del README).
- El estado («Mueve el mapa hasta la puerta») se queda: dice si el pin ya
  está listo.

## 4. Detalles: mismo ancho y flecha de volver

- **Mismo ancho:** en el celular ya ocupan lo mismo. En una pantalla ancha, el
  panel del pin va al 100 % y Detalles va centrado a 640 px. Lo estándar en la
  app son las hojas centradas: el panel del pin **también debería ir centrado**
  con el mismo ancho máximo. Así se ve igual en los tres pasos.
- **Flecha de volver: sí.** Los pasos 1 y 2 tienen flecha; Detalles tiene una
  X que cierra todo. Detalles es el paso 3: la flecha lo devuelve al mapa de B.
  La X, que hoy cierra el pedido entero, sobra: se sale volviendo hacia atrás,
  igual que desde el paso 1.

## 5. Los chips de contacto: quitar los recientes, dejar «Soy yo»

**Casi de acuerdo.** La captura muestra lo que falla: «Botica Central» tres
veces (mismo nombre, distinto celular) y «Quien recibe», que es el nombre que
se manda por defecto cuando nadie escribe uno. Además se repiten idénticos en
las dos tarjetas. Son ruido.

- **«Soy yo» se queda.** Es el atajo más usado: quien pide casi siempre es
  quien entrega o quien recibe, y le ahorra escribir 9 dígitos.
- **Los recientes salen como chips.** Ya están en dos sitios mejores: «Ver
  anteriores» (la ruta entera) y la búsqueda (el sitio **con** su contacto).
  Si se quieren aquí, solo como sugerencias **mientras se escribe** el nombre.
- **Error a corregir igual:** los nombres por defecto («Quien entrega», «Quien
  recibe») no deben guardarse ni ofrecerse como contactos.

## 6. Seed de lugares

Los 60 lugares de producción son los reales (los cargó Jesús). El seed copia
esos 60 a la base local, con un script aparte del mundo e2e para no tocar sus
pruebas. OpenStreetMap no estaba disponible para completarlo (Overpass
respondió 504).
