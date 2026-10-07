# 07 · Aliados y catálogo

## 1. Tres clases de tienda

| Clase | Ejemplo | Compromiso | En la web |
|---|---|---|---|
| **Aliado de encargos** | Botica La Merced, Bodega Kira, Librería Leni | Sí (§2), de palabra y con sticker | Pin naranja, «Aliado Tindivo», productos, primero en las búsquedas y en «Donde haya» |
| **Tienda** | Inkafarma, Tienda Mass (cadenas: no firman nada) | Ninguno | Pin gris, se puede elegir, sin productos salvo los que salgan de los encargos (§3.2) |
| **Aliado de comida** | Pizza Priamo, Pollería Nadia, Al Punto, La Florencia | El que ya tienen | «Pide directo» a su carta. **Nunca encargo** (`02` §4) |

Es lo mismo que el spec del 21-sep (`Tindivo — Catálogo de negocios y
Encargos (spec v1).md` §3.1), con una clase nueva: el **aliado de encargos**.

## 2. El acuerdo con el aliado de encargos

### 2.1 Lo que recibe (gratis)

- **Ventas nuevas sin hacer nada:** gente que no iba a ir a su tienda.
- **Ir primero:** aparece arriba en su rubro y en «Donde haya».
- **Su reporte del mes** por WhatsApp, generado desde los datos: *«En octubre,
  Tindivo te compró 23 veces por S/ 412. Lo que más se pidió: Panadol (9),
  pañales (6), alcohol (4).»* Es el argumento para renovar y para que la tienda
  de al lado quiera entrar.
- **Sticker «Aliado Tindivo · Te lo llevamos»** en su puerta, con el QR a
  `tindivo.com/encargos?tienda=<id>`, que abre el encargo con esa tienda puesta.
  Es publicidad gratis para los dos.

### 2.2 Lo que se compromete a hacer

1. **Atender primero** al motorizado de Tindivo.
2. **Contestar el WhatsApp de «¿lo tienes listo?» en ≤ 5 min** y separar la
   compra (`05` §3.1).
3. **Aceptar Yape** (y en v1.1, que el cliente le pague directo, `04` §3).
4. **Boleta o nota de venta** siempre.
5. **Cambiar** un producto vencido o en mal estado al día siguiente.
6. **Aceptar la devolución** de un producto cerrado **esa misma noche** si el
   cliente no estuvo. Es lo que más reduce las pérdidas (`04` §6).

**No paga nada a Tindivo en v1.** Una comisión llega cuando el reporte del mes
demuestre ventas. Antes, cobrar ahuyenta.

### 2.3 Discurso de 30 segundos (para el sábado)

> «Estoy armando Tindivo Encargos: la gente de San Jacinto pide desde la web lo
> que necesita de tu tienda y mi motorizado viene, te compra y se lo lleva. Es
> gratis para ti. Solo te pido que lo atiendas rápido, que aceptes Yape y que
> me des boleta. Cada mes te mando cuánto te compramos.»

Objeción *«ya trabajo con Zorritos»*: *«No es exclusivo. Zorritos te lleva lo
que tú ya vendiste. Yo te traigo compradores que no te conocían.»*

### 2.4 Los primeros cinco (sábado 10)

De los 60 lugares que ya están en `map_landmarks`, por rubro y por lo que más
se pide en un pueblo de noche:

| Rubro | Candidato | Por qué |
|---|---|---|
| Botica | **Botica La Merced** | El encargo más urgente es un remedio. Inkafarma entra como «Tienda» |
| Bodega | **Bodega Kira** o **Bodega Aida Mota** | El volumen está en abarrotes y bebidas |
| Librería | **Librería Leni** | Útiles a última hora, en noches de colegio: justo lunes a jueves |
| Pastelería | **Pastelería Arlita** | Tortas y bocaditos: encargo de ticket alto. Se prueba el caso «frágil» |
| Comida no aliada | **Pollería El Sabroso** | Ya aparece en prod. Se le pide solo el teléfono para el pedido anticipado; aún no es aliado |

**Dos de cada rubro son mejor que uno**: con una sola botica, «no hay»
significa viaje en vano. El objetivo de la segunda semana es tener **dos
boticas y dos bodegas**.

## 3. El catálogo: «la idea», no la lista de precios

**El problema:** un catálogo completo con precios se queda viejo en una semana
y Jesús no lo puede mantener. Pero sin ninguna idea de qué hay, el cliente no
sabe qué pedir ni cuánto le va a costar.

**La respuesta: tres capas, y ninguna exige mantenimiento continuo.**

### 3.1 Capa 1 · «Qué encuentras aquí» (a mano, una vez)

Por cada tienda, **5 a 8 etiquetas** de lo que vende: *Medicamentos sin
receta · Pañales · Higiene · Leche en polvo*. Se escriben en el alta (`06` §6).
Para «Donde haya», el cliente busca por esas etiquetas.

### 3.2 Capa 2 · Productos frecuentes con precio de referencia (a mano al
principio, solos después)

- **El sábado**, Jesús fotografía **10 a 15 productos** por aliado (los que el
  dueño le diga que más salen) y anota el precio. **15 min por tienda.**
- **Después se alimenta solo:** cada «Compré» del motorizado guarda **producto,
  precio y fecha** (`08` §2). A las 2 o 3 semanas, la tienda tiene sus
  productos más pedidos con su último precio real, **sin que nadie los
  cargue**.
- En la web se muestran como **«aprox. S/ 8.50 · visto el 3 de octubre»**.
  Nunca como precio fijo: el motorizado paga lo que diga la caja.
- Tocar un producto lo pone en la lista con su precio. Así se calcula un **tope
  sugerido** creíble (`02` §5).

### 3.3 Capa 3 · Lo que el cliente escriba

Siempre hay un **«Escribe lo que necesitas»** abierto. El catálogo **ayuda,
nunca limita**. Lo que se pide a mano y se compra pasa a la capa 2.

### 3.4 Qué se muestra y qué no (D7)

En la conversación del 4-oct, Jesús quería los aliados en el mapa «con toda la
info menos el número ni el catálogo». Esta propuesta **lo matiza**:

| Se muestra | No se muestra |
|---|---|
| Nombre, foto de fachada, rubro, horario («Abierto ahora») | **Teléfono y WhatsApp** (solo los ve el motorizado) |
| Referencia y pin | Una **carta completa** con precios |
| «Qué encuentras aquí» (capa 1) | — |
| **Productos frecuentes con precio aproximado** (capa 2) | — |
| «Aliado Tindivo» | — |

La razón del matiz: sin ninguna idea de productos, el formulario es una caja en
blanco y el tope es una adivinanza. Con «aprox.» y fecha no se promete un
precio, y Jesús no mantiene nada. **Si Jesús prefiere sin productos, se quita
la capa 2 de la web y se deja solo para el motorizado.**

## 4. De restaurante no aliado a aliado

Cada encargo de comida a un restaurante no aliado (`02` §4) se cuenta. Al
llegar a **10 en un mes**, el admin lo marca: *«Pollería El Sabroso: 12
encargos en octubre, S/ 264.»* Es la visita de venta para pasarlo a aliado de
comida con su carta. **Los encargos de comida son la manera más barata de
encontrar al próximo aliado.**

## 5. Fuera de v1

- **Panel para el aliado** (ver sus pedidos, marcar «listo»). El WhatsApp con
  mensaje listo cubre lo mismo sin otra app que aprender.
- **Grupo o comunidad de WhatsApp de aliados** y la dinámica «¿quién lo
  tiene?» (`propuesta-claude.md` §7.4). Con 5 aliados no hace falta, y el
  debate del 30-sep la descartó por el ruido.
- **Puntos y ranking** de aliados. Lo único que se mide en v1 es el tiempo en
  tienda y los «no hay» por tienda, para decidir a quién se pone primero.
- **Comisión al aliado.** Con el primer reporte mensual en la mano.
