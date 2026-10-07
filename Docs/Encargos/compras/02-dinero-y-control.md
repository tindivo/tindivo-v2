# 02 · Dinero y control

## 1. La idea en una frase

> **El motorizado compra con su plata y la recupera en la puerta, minutos
> después. Del servicio se queda S/ 1 y le rinde S/ 2.50 a Tindivo esa misma
> noche.**

Tindivo **no pone plata** en ninguna compra. Lo único que pasa por sus manos
son los S/ 2.50 de cada encargo.

**Por qué no el fondo de la v1:** un fondo que Jesús entrega y cuenta cada
noche hace que el motorizado dependa de él a diario. **Por qué no lo que hace
Rappi** (una tarjeta que se recarga al pagar): no existe a esta escala, y el
problema que resuelve tampoco. Allá el repartidor espera una semana para que
le devuelvan; aquí la recupera en 15 minutos, en la puerta.

## 2. El reparto

| | Una tienda | Con segunda tienda |
|---|---|---|
| Paga el cliente | Productos + **S/ 3.50** | Productos + **S/ 4.50** |
| El motorizado recupera | Productos (su plata) | Productos (su plata) |
| **Bono del motorizado** | **S/ 1** | **S/ 2** |
| **Tindivo** | **S/ 2.50** | **S/ 2.50** |

Tindivo siempre se queda con S/ 2.50. **El sol de la segunda tienda es
entero del motorizado**, porque el tiempo extra es suyo y porque así le
conviene rescatar el encargo en lugar de cancelarlo.

El bono va **encima de su pago del turno**, no lo reemplaza.

## 3. La rendición, cada noche

Es la que ya existe para Entregas (`0237`): cobrado → «Entregar» del
motorizado → «Confirmar» de Jesús en el admin. Para encargos solo cambia
**cuánto** se rinde: **S/ 2.50 por encargo**, no todo lo cobrado.

- **Cada noche, no cada semana.** Con motorizados que pueden no volver el
  lunes, la deuda no se acumula.
- El motorizado lo **yapea a Jesús** al cerrar y toca «Entregar». La app le
  dice el monto exacto: *«4 encargos · rinde S/ 10.00 · tu bono S/ 4.00»*.
- **Comida, Entregas y Encargos salen en una sola pantalla de cierre.** Un
  cierre, no tres.

## 4. La prueba de cada compra

El 90 % de los restaurantes de San Jacinto **no da boleta** (dan los
minimarkets, dos restaurantes y las farmacias). Pero **todos aceptan Yape**.

1. **Se paga a la tienda con Yape, siempre que se pueda.** La constancia trae
   el monto, el nombre del negocio y la hora, y no se puede inventar. **Es la
   boleta.** El motorizado le toma captura y la sube en «Compré».
2. **Si se paga en efectivo:** foto de lo comprado sobre el mostrador y el
   monto escrito. Es más débil, y por eso se prefiere el Yape.
3. **El cliente ve la foto y el total antes de que llegue el motorizado.** En
   un pueblo donde todos saben cuánto cuesta medio pollo, el cliente es el
   mejor auditor: si el monto está inflado, lo dice.

**Los topes de Yape no son un problema a esta escala.** Según la
investigación de Gemini (§5), una cuenta personal recibe hasta unos S/ 26 750
al mes y envía S/ 500 al día de forma estándar. Diez encargos de S/ 30 son
S/ 300 al día. **Hay que confirmar con el motorizado** su tope diario de
envío.

## 5. Quién pierde qué

| Qué pasó | Quién pierde | Qué más pasa |
|---|---|---|
| El cliente no paga, no está o rechaza lo bien comprado | **Tindivo** le devuelve al motorizado lo que gastó (decidido con Jesús) | El celular queda **bloqueado** para encargos. Si se puede, lo cerrado se devuelve a la tienda |
| El motorizado compró otra cosa sin preguntar | El cliente paga solo lo correcto. **La primera vez, Tindivo**; si se repite, el motorizado | Se anota |
| Faltante en la rendición | Se habla. Sin disputas formales, como en `0237` | — |

**La condición para que Tindivo cubra la pérdida:** el encargo estaba en el
sistema, el motorizado tocó «Llegué», esperó los 5 minutos y subió la foto de
la compra. Sin eso, no hay forma de distinguir una pérdida de un desvío.

**Presupuesto de pérdidas:** S/ 15 por semana. Si se pasa, se baja el tope o
se pide adelantar el pago a los clientes nuevos (`06`).

## 6. El adelanto (cuando el motorizado no tiene plata)

- Jesús adelanta **un día como mucho**, y solo a un motorizado que ya lleva
  **más de 2 semanas**. A uno que llegó el lunes no se le presta.
- Basta con que tenga lo de **un encargo** (unos S/ 50): con un encargo activo
  a la vez, la plata vuelve en la puerta antes de la siguiente compra.
- El que no tiene ni eso hace solo encargos chicos o no hace encargos esa
  semana. El servicio no se cae: lo hace Jesús cuando sale de apoyo.

## 7. El control, en una página

| Lo que Jesús quiere saber | De dónde sale, sin preguntarle a nadie |
|---|---|
| ¿Hizo encargos por fuera? | Lo registrado contra los mensajes de WhatsApp de Jesús. El bono **solo** se paga por lo registrado. El cliente no tiene el número del motorizado (`03`) |
| ¿Infló el precio? | La constancia de Yape a la tienda. El cliente ve el total con la foto |
| ¿Cumple lo que promete? | «Te atiendo en 20 min» contra la hora real de salida |
| ¿Demora la comida? | Pedidos de comida que esperaron mientras él tenía un encargo |
| ¿Rindió? | La rendición de cada noche, igual que Entregas |

**Lo que no se puede controlar con software:** que un cliente lo reconozca en
la calle y le pida algo directamente. Eso se contiene con el bono (registrar
le conviene), con un número que no se da (`03`) y con que los motorizados
rotan. Se acepta como riesgo.
