# 02 · El servicio: reglas y flujo del cliente

## 1. Nombre y promesa

- **Público:** **Tindivo Encargos**. Bajada fija: *«Te lo compramos y te lo
  llevamos.»*
- **Técnico:** `courier_orders.kind = 'purchase'` (`08`).
- **Cambia una regla escrita** (`Docs/Encargos/04`): Entregas nunca debía
  llamarse «encargo». Eso sigue valiendo **para Entregas**, y hoy no se cumple:
  las plantillas de WhatsApp del motorizado (`apps/motorizados/lib/courier-whatsapp-templates.ts`)
  dicen «recoger **el encargo**». Se cambian a «el pedido» antes del lunes,
  para que una palabra signifique una sola cosa.
- **Promesa de tiempo:** *«Llega en 30 a 50 min.»* Comida con pedido
  anticipado: *«Llega en 45 a 70 min.»* Se promete un rango, nunca una hora.

## 2. Qué se compra y qué no

| Sí | No |
|---|---|
| Botica: medicamentos **de venta libre**, pañales, higiene | **Medicamentos con receta** en v1 (antibióticos, controlados). Con receta, en v1.1, si el cliente sube la foto y la botica la acepta |
| Bodega y minimarket: abarrotes, bebidas sin alcohol, snacks, limpieza | **Alcohol y cigarros.** Regla escrita, como en Entregas (D5) |
| Librería: útiles, impresiones ya enviadas a la librería | **Balón de gas, bidón de 20 L, sacos**: pasan los **5 kg** o no caben en la mochila (45×45×45 cm) |
| Pastelería y panadería | Recargas, pagos de servicios, cobros, giros: **no se lleva dinero** |
| Comida de un restaurante **no aliado**, con pedido anticipado (§4) | Comida de un **aliado** de Tindivo: se manda a su carta (§4) |
| Lo que el cliente escriba, si cabe en las reglas | Cosas de más de **S/ 40** (S/ 20 si el cliente es nuevo) en v1 (`04` §3) |
| | Lo que exige DNI o firma del cliente (chips, contratos) |

El motorizado **puede negarse** a algo que no está en la lista y se ve mal
(frágil sin forma de llevarlo, cadena de frío larga). Marca «No lo puedo
llevar» y se aplica el plan B de ese artículo (`03` §1).

## 3. Cuándo y cuánto

- **Lunes a jueves, 6:00 a 10:00 pm** para pedir (D4). Las tiendas de San
  Jacinto cierran de 10 a 11 pm: aceptar más tarde es mandar al motorizado a
  una puerta cerrada. Todo en `app_settings.courier.purchase.hours`.
- **Viernes a domingo: cerrado** en el lanzamiento. Sábado y domingo van al
  doble de pedidos de comida (`01` §3). Se abre el viernes cuando cuatro
  semanas L–J salgan sin una sola demora de comida.
- **1 encargo activo por motorizado.** Uno más no se ofrece hasta cerrar el
  anterior.
- **La comida manda:** con **2 o más pedidos de comida activos**, el motorizado
  no ve encargos nuevos; esos encargos esperan su turno con el reloj de 15 min
  corriendo. El cliente ve *«Nuestro motorizado está con pedidos de comida; tu
  encargo sale en cuanto se libere.»*
- **15 min para que alguien lo acepte** (como Entregas). Si nadie lo hace, se
  cancela solo y sin cobro, con un aviso honesto al cliente.
- **1 encargo activo por celular.** Puede tener a la vez un pedido de comida.

## 4. Comida: aliados no, el resto con pedido anticipado

**Aliado de Tindivo** (Pizza Priamo, Pollería Nadia, Al Punto, La Florencia):
**no hay encargo.** Si el cliente busca «pollo», los aliados salen **primero**
con *«Pide directo: llega más rápido»*, que abre su carta. Si teclea a mano el
nombre de un aliado, el formulario lo para y le ofrece su carta. Dos razones:
el aliado paga su S/ 1.50 y no se le compite desde dentro, y por su carta el
pedido llega antes.

**Restaurante no aliado** (Pollería El Sabroso, Pollería Alicia, Cevichería
Leyton…): sí, como **encargo con pedido anticipado**:

1. El cliente escribe qué quiere («1/4 de pollo con papas y ensalada»).
2. Al aceptar, el motorizado **llama al restaurante** desde la app (el teléfono
   solo lo ve él), hace el pedido «para Tindivo» y anota **«listo a las 8:20»**.
3. El cliente ve *«Tu pedido está en preparación en Pollería El Sabroso. Listo
   a las 8:20.»*
4. El motorizado sigue con la comida de Tindivo y vuelve a la hora. **No espera
   en la puerta**: así se evitan los 37 y 48 min de las dos compras de prod.
5. Paga con el fondo y lleva.

**Por qué conviene aunque compita un poco con los aliados:** cada restaurante
no aliado que acumula encargos es **un aliado por conseguir con datos en la
mano**: *«Este mes te compramos 14 pedidos por S/ 280.»* (`07` §4).
**Riesgo:** Pollería Nadia se molesta. Jesús lo habla con ella **antes** del
lunes; si se cierra, la comida de no aliados sale de v1 y no pasa nada más.

## 5. El flujo del cliente (tindivo.com)

Seis pasos, en el mismo patrón de hoja sobre el mapa que Entregas
(`Docs/Encargos/08-ux-conversion.md`):

1. **Dónde compramos.**
   - **Una tienda del directorio** (aliados primero, con su foto, horario y
     «Qué encuentras aquí»).
   - **«Donde haya»**: elige el rubro (Botica, Bodega, Librería) y el
     motorizado va al aliado más cercano de ese rubro. Es lo que más ahorra al
     cliente y lo que más sirve para «no hay» (`03` §1).
   - **Otra tienda**: nombre y referencia a mano. No debe bloquear: el
     directorio estará incompleto al principio.
2. **Qué compramos.** Una lista. Cada artículo lleva:
   - cantidad, qué es y detalle («Panadol Antigripal, caja de 12»);
   - **foto opcional** («así es la que quiero»). En Entregas no había foto;
     aquí ahorra la pregunta más común;
   - **«Si no hay»**: un chip por artículo, con uno marcado por defecto (`03` §1);
   - si la tienda tiene productos cargados, se toca un producto y entra a la
     lista con su **precio de referencia** (`07` §3).
3. **Tope.** *«¿Hasta cuánto gastamos en productos?»* Sugerido = suma de los
   precios de referencia + 20 %, redondeado. Máximo según el historial del
   celular (`04` §3). Si se pasa, el motorizado aplica lo que diga §1 de `03`.
4. **Dónde lo llevamos.** Mismo selector de Entregas: mapa + referencia
   obligatoria. Su última dirección ya viene puesta.
5. **Cómo pagas al recibir.** Efectivo o Yape. Si es efectivo: *«¿Con cuánto
   pagas?»* (S/ 20, S/ 50, S/ 100, exacto), para que el motorizado lleve el
   vuelto (`04` §4).
6. **Confirmar.** Resumen: lista, tope, *«Pagas lo que cueste + S/ 3.50»*,
   tiempo estimado. Casilla: *«Pagaré al recibir. Si no estoy o no pago, no
   podré volver a pedir encargos.»* Botón **«Pedir encargo»**.

Después, **seguimiento**, con los mismos estados de Entregas y tres momentos
propios:

- **«Comprando en Botica La Merced»**: ve qué artículos ya se compraron.
- **«Falta algo: decide»**: si su plan B era «Pregúntame», le llega un **push**
  y una **tarjeta en el seguimiento** con la foto de la alternativa: **Sí,
  llévalo** / **No, sáltalo**. Tiene 3 min. Si no contesta, se salta el
  artículo (`03` §1). **El aviso va por la app**, no por WhatsApp ni llamada:
  es regla del producto.
- **«Compra lista: S/ 27.30 + S/ 3.50 = S/ 30.80»**, con la foto de la boleta,
  **antes** de que el motorizado llegue a la puerta. Nadie se entera del total
  en la puerta.

## 6. Quién pide por WhatsApp

Hoy los encargos llegan al WhatsApp de Jesús. Durante el lanzamiento:

1. **Respuesta automática de WhatsApp Business** con el enlace:
   *«¡Hola! Ahora pides tus encargos aquí y te llega en 30-50 min:
   tindivo.com/encargos»*.
2. Quien no puede o no quiere: Jesús lo **crea desde el admin** en menos de un
   minuto (`06` §2) y le reenvía el enlace de seguimiento.
3. Se mide qué parte llega por cada canal. **El de Jesús tiene que bajar
   semana a semana**; si no baja, el formulario es el problema.
