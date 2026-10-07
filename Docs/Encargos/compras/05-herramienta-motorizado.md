# 05 · La herramienta del motorizado: el modo compra

> **Principio:** el motorizado no piensa, no suma, no redacta, no negocia.
> Toca lo que tiene delante y la app le dice el siguiente paso. Si un paso le
> exige decidir algo que el cliente pudo decidir antes, el defecto está en el
> formulario del cliente, no en él.

## 1. Lo que enseñan los datos de producción

En las dos compras de Pollería El Sabroso, **«recogido» y «entregado» se
tocaron en el mismo minuto** (`01` §1). El motorizado no toca los botones
mientras maneja, y eso está bien. De ahí salen tres reglas de diseño:

1. **Solo son obligatorios los pasos que mueven dinero o que el cliente
   necesita ver:** «Compré» (total + foto) y «Cobré». «Salgo», «Llegué a la
   tienda» y «Voy a tu casa» son **opcionales**. Si se saltan, la app no se
   traba.
2. **Los artículos se marcan dentro de la tienda**, que es el único momento en
   que el motorizado está quieto con el celular en la mano.
3. **Todo funciona sin señal.** Los gestos se encolan como ya hace
   `apps/motorizados/lib/offline-queue.ts`. La foto de la boleta se sube cuando
   vuelva la señal. Lo único que **exige señal** es preguntar al cliente (§3.3).

## 2. Dónde vive

En el **mismo tablero** que la comida y las entregas, con su propio color y la
etiqueta **«ENCARGO»**. El color se elige del subset de iconos y colores de la
app, sin chocar con el violeta de «En reparto» ni con el morado del Yape
(`canvas-tarjeta-del-motorizado`). Se propone **verde azulado**, por confirmar
en el diseño.

**La tarjeta en espera** dice, sin abrirla:

> **ENCARGO · Botica La Merced → Barrio Nuevo**
> 3 artículos · tope S/ 25 · paga en efectivo con S/ 50
> «Sin esto no»: Panadol Antigripal
> **Aceptar encargo** · vence en 12:40

Si el motorizado tiene 2 pedidos de comida activos, la tarjeta no aparece (`02`
§3). Si ya tiene un encargo activo, aparece en gris con *«Termina tu encargo
primero»*.

## 3. El modo compra, paso a paso

### 3.1 Al aceptar

- **Tienda del directorio:** botón **Llamar** (el teléfono solo lo ve él) y
  **Cómo llegar** (pin en el mapa compartido de `@tindivo/map`).
- **Aliado:** botón **«Avisar a la tienda»**, que abre WhatsApp con el mensaje
  listo: *«Hola, soy el motorizado de Tindivo. Voy en 5 min por: 1 Panadol
  Antigripal x12, 1 paquete de pañales Huggies M, 1 alcohol 250 ml. ¿Lo tienes
  listo?»*. Así el aliado separa la compra mientras él llega. Es contacto con
  la tienda, no aviso al cliente.
- **Restaurante no aliado:** **Llamar para pedir** y un campo **«Listo a las…»**
  con botones +10, +15, +20, +30 min. La app le recuerda a esa hora (`02` §4).

### 3.2 En la tienda: la lista

Una pantalla, una lista, artículos grandes:

```
 Botica La Merced                      Tope S/ 25.00
 ───────────────────────────────────────────────────
 ★ 1 Panadol Antigripal x12           [Compré] [No hay]
     Sin esto no quiero nada
 · 1 Pañales Huggies M (paquete)      [Compré] [No hay]
     Si no hay: algo parecido
 · 1 Alcohol 250 ml                   [Compré] [No hay]
     Si no hay: sáltalo
 ───────────────────────────────────────────────────
 Llevas S/ 0.00 de S/ 25.00
                  [ Terminé de comprar ]
```

- **«Compré»** abre un teclado numérico grande: *«¿Cuánto costó?»* Con un
  precio de referencia (`07` §3), viene escrito y basta con confirmar.
- **«No hay»** **no pregunta**: aplica el plan B del cliente y se lo dice:
  - *Algo parecido* → *«Busca otra marca o tamaño, hasta S/ 9.60. Si hay,
    toca Compré; si no, Ninguno.»*
  - *Pregúntame* → §3.3.
  - *Sáltalo* → tacha y sigue.
  - *Sin esto no quiero nada* → *«No compres nada. Toca Cancelar encargo.»*
    Por eso los imprescindibles van **arriba**: se descubre antes de gastar.
- **El tope se vigila solo.** Si un precio lo pasa, la app dice qué artículo
  dejar (caso 9 de `03`).
- **Atajo «Todo»:** en una compra de 1 o 2 artículos que sí estaban, basta
  «Terminé de comprar» con el total, sin precio por artículo. El detalle es
  deseable, no obligatorio.

### 3.3 Preguntar al cliente

Solo cuando el plan es **«Pregúntame»** o el tope no alcanza:

1. El motorizado **saca una foto** de la alternativa y escribe el precio.
   Opcional: un texto corto con plantillas (*«Solo hay en caja de 6»*, *«Hay de
   otra marca»*).
2. Toca **Preguntar**. Al cliente le llega un push y la tarjeta **Sí / No** en
   su seguimiento (`02` §5).
3. En la app del motorizado corre un **reloj de 3 min**. Mientras tanto,
   **sigue con el resto de la lista**.
4. Llega la respuesta (o vence) y el artículo se resuelve solo: verde si es sí,
   tachado si es no o si venció.

**No hay chat.** Un chat abierto en la tienda es justo el tiempo que se quiere
quitar.

### 3.4 «Terminé de comprar»

- **Total pagado en la tienda** (prellenado con la suma de los artículos;
  editable, porque la caja manda).
- **Cómo pagué:** *Con el fondo* (por defecto) · *Con mi Yape*.
- **Foto de la boleta** (o de los productos sobre el mostrador si no hay
  boleta). **Obligatoria**: es la prueba en la puerta y en el cuadre.

Al confirmar, el cliente recibe *«Compra lista: S/ 21.80 + S/ 3.50 = S/ 25.30»*
con la foto. El motorizado ve en grande **lo que va a cobrar**.

### 3.5 En la puerta

- **Cobrar S/ 25.30.**
  - *Efectivo:* **«Recibes S/ 50 · das S/ 24.70»**. Si el cliente trae otro
    billete, lo cambia con un toque (S/ 20 · S/ 50 · S/ 100 · otro).
  - *Yape:* **«Espera el Yape de S/ 25.30 en tu celular»** → *Me yapeó*.
- **No contesta:** botón **«No está»** con contador de 5 min (como Entregas) y
  después *«Vuelve con la bolsa. Guárdala hasta mañana.»* (caso 19 de `03`).
- **No paga:** botón **«No quiere pagar»** → la app muestra la lista con fotos
  para enseñársela. Si aun así no paga, vuelve con la bolsa. El celular queda
  bloqueado.

## 4. El cierre de la noche

Pestaña **«Mi cuadre»**, la misma pantalla para encargos y entregas (`04` §5.3):
qué debe tener en el canguro, cuánto yapear, encargo por encargo con su boleta.
Dos botones. Nada que sumar.

## 5. Lo que hay que enseñarle el domingo (10 minutos)

1. La lista se marca **dentro de la tienda**, no después.
2. **La foto de la boleta siempre.**
3. **«No hay» no se pregunta, se toca.** La app dice qué hacer.
4. **El canguro de encargos no se mezcla** con su plata ni con el sencillo de la
   comida.
5. **La comida va primero.** Si con un encargo encima entra comida, **termina la
   compra y avisa con «Voy con comida» en la app**. El cliente del encargo ve
   *«Tu encargo se demora unos minutos»*. Nunca al revés.

## 6. Iconos

`apps/motorizados` usa un **subset cerrado** de Material Symbols (invariante 9
de `CLAUDE.md`). Comprobado hoy contra `apps/motorizados/public/fonts/icons.txt`:

- **Ya están:** `shopping_bag`, `shopping_cart`, `receipt_long`,
  `photo_camera`, `storefront`, `timer`. Alcanzan para la tarjeta, la lista, la
  boleta y el reloj.
- **No están:** `remove_shopping_cart`, `local_pharmacy`, `add_a_photo`,
  `help`. O se usa un equivalente de la lista de arriba, o se regenera el
  `.woff2` (`public/fonts/README.md`). **Esto se resuelve el miércoles**, no
  el domingo.
