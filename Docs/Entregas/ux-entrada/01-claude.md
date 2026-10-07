# 01 · Claude · Cómo se entra a pedir una entrega

> 2026-10-07. Escrita sin leer `01-codex.md`. Contexto: Jesús quiere una sola
> entrada a Entregas, con autocompletados, y dijo que el flujo A → B → detalles
> «está perfecto»; «recoger de un negocio» solo si se priorizan y cargan los
> negocios.

## 1. Mi pantalla `place-pick` sobra, y lo digo yo

La empecé hoy («¿Dónde recogemos?» con lista de lugares antes del mapa). Con
los datos delante, **pone un paso más justo en el caso más común**:

- **Persona a persona** (mandar algo de una casa a otra) es lo que más se
  pide. Antes, al abrir, el mapa ya estaba en tu ubicación por GPS y bastaba
  «Confirmar recojo». Con mi pantalla hay que tocar primero «Marcar en el
  mapa». Un toque más en cada pedido, para todos.
- **La lista no es de negocios.** De los 60 lugares cargados, 14 son «otro»,
  8 de deporte, 6 de recreación, 2 religiosos. Nadie recoge un paquete en el
  estadio. Como referencia en el mapa sirven (ya salen como chapas); como lista
  de recojo son ruido.
- **Sin teléfonos**, elegir un lugar ni siquiera ahorra lo que más cuesta
  escribir: el nombre y el celular de quien entrega.

Lo que sí vale de esa pantalla: **repetir una entrega anterior** y **buscar un
lugar por su nombre**. Las dos caben dentro del mapa, sin pantalla nueva.

## 2. Lo que propongo

**Una sola entrada, y el mapa de A primero, como Jesús lo aprobó.** La
tarjeta del inicio y `tindivo.com/entregas` abren lo mismo.

**Paso 1 · Mapa de A** (el de hoy, con GPS), con dos atajos encima:

1. **«Repetir»**, solo si la persona ya pidió antes: una tarjeta arriba del
   panel, «Botica Santa Rosa → María». Un toque llena los dos puntos, los
   contactos, qué se lleva y quién paga, y salta a «Detalles» para revisar y
   pedir. «Listo y pagado» se vuelve a marcar: es de este envío. Hasta 3
   rutas, sin repetidas.
2. **Buscar un lugar** (lupa arriba, junto a «volver»): se escribe «botica»,
   salen los lugares que coinciden y, al tocar uno, el mapa vuela ahí y deja
   puesta la referencia. La persona solo confirma. Sirve igual en el paso 2
   («entregar en el colegio»). Sin lista entera ni categorías: aparece cuando
   se escribe.

**Paso 2 · Mapa de B**, igual que hoy, con la misma lupa.

**Paso 3 · Detalles**, igual que hoy. «Soy yo», contactos recientes y las
etiquetas de «qué llevamos» ya existen.

**El enlace de una tienda** (`tindivo.com/entregas?lugar=…`) abre el paso 2
con el recojo ya puesto en esa tienda. Es el enlace que la tienda comparte por
WhatsApp.

## 3. «Recoger de un negocio»: sí, pero primero los datos

Hoy no hay de dónde autocompletar: el directorio tiene 0 filas y los lugares
no tienen teléfono. Lo que hace rápido «recoger de un negocio» es **no tener
que escribir quién entrega ni su celular**. Para eso:

1. **Jesús carga 10 negocios**, no 60: los que de verdad mandan cosas.
   Boticas, bodegas, librerías, la vendedora de Facebook. **No restaurantes**:
   la comida preparada no va por Entregas, para proteger a los aliados
   (`plan-final`). Campos: nombre, punto, referencia, **celular**, y quién
   atiende.
2. Esos negocios salen **primero** en la búsqueda, con su etiqueta, y al
   elegir uno quedan puestos el punto **y** «quién entrega».
3. Su enlace propio es lo que se le da a cada tienda.
4. Antes de cargar un solo teléfono, se cierra el hueco de `directory_businesses`
   (hoy `anon` lee `phone`). Que el cliente con sesión vea el celular de una
   tienda está bien: es público. Que cualquiera lo raspe sin sesión, no.

Mientras esos 10 no estén cargados, la búsqueda funciona con los 60 lugares de
hoy (punto y referencia, sin contacto).

## 4. Autocompletados, por rendimiento

| Autocompletado | Ahorra | Costo | Veredicto |
|---|---|---|---|
| **Repetir una entrega** | Todo el pedido | Bajo (ya hecho y probado) | **Sí, primero** |
| GPS en el punto A | Arrastrar el mapa | Ya existe | Se queda |
| «Soy yo» y contactos recientes | Nombre y celular | Ya existe | Se queda |
| **Negocio con contacto** | Punto, nombre y celular | Cargar 10 negocios + cerrar el hueco | **Sí, cuando estén cargados** |
| Buscar lugar por nombre | Arrastrar el mapa hasta allá | Bajo | Sí |
| Lista completa de 60 lugares con categorías | — | — | **No**: ruido |
| «Lugares recientes» aparte de las rutas | Poco: lo cubre «Repetir» | Medio | No |

## 5. Lo que no haría

- Una pantalla antes del mapa.
- Mostrar la lista de lugares sin que se escriba nada.
- Restaurantes como punto de recojo de Entregas.
- Una página `/entregas` distinta del flujo.
