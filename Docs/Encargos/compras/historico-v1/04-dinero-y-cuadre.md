# 04 · Dinero y cuadre

> **El riesgo número uno de este servicio no es técnico: es que al final de la
> noche falte plata y nadie sepa por qué.** Todo este documento existe para que
> el cuadre salga solo y al céntimo.

## 1. La idea en una frase

> **Tindivo adelanta la compra con un fondo que lleva el motorizado. El cliente
> paga al recibir lo comprado más el servicio. Al cerrar, el motorizado devuelve
> el fondo y los servicios, y la app le dice exactamente cuánto debe tener en
> efectivo y cuánto debe yapear.**

Ningún sol sale del bolsillo del motorizado. Ningún sol del cliente se cobra
antes de que la bolsa esté en su puerta.

**Choque con `DECISIONS §4/§7` («Tindivo no retiene fondos»):** aquí Tindivo
**adelanta** su propio dinero, no retiene el del cliente. Se anota en §33 cuando
Jesús apruebe. Es la misma matización que ya se hizo con la deuda de Entregas
(`Docs/Encargos/02` §1).

## 2. El fondo (D1)

- **S/ 100 por motorizado y por noche**, en efectivo, en un **canguro aparte**
  que solo se usa para encargos. Jesús lo entrega al empezar el turno y lo
  registra en la app con un toque: *«Fondo entregado: S/ 100»*.
- **Composición:** S/ 80 en billetes de S/ 10 y S/ 20, y **S/ 20 en monedas**
  para el vuelto. El sencillo es lo que primero se acaba.
- **¿Por qué S/ 100?** Con un encargo activo a la vez y tope de S/ 40, alcanza
  con margen; lo cobrado del encargo anterior vuelve al canguro antes del
  siguiente.
- **Lo que hay que saber de Jesús (D1):** cómo se cobran hoy los encargos de
  WhatsApp, quién pone la plata y si ha habido pérdidas. Si hoy el motorizado
  pone su propia plata, **esto lo cambia y conviene decírselo a él**.

**Alternativa descartada: que el cliente pague antes.** Es más seguro, pero
suma pasos al pedir, devoluciones de vuelto y obliga a alguien a verificar cada
Yape. El cliente de San Jacinto **llama y paga al recibir** (89 % de los pedidos
de comida los carga el restaurante). Se mantiene «pagas al recibir» y el riesgo
se controla con topes. El pago directo a la tienda queda para v1.1 (§3).

## 3. Cuánto se puede comprar sin adelanto (D2)

El tope de compra depende del **historial del celular** del cliente en
`tindivo-prod`. Ese historial es el antifraude que ya tenemos gratis: 300
celulares distintos con pedidos entregados en 28 días.

| Nivel | Quién | Tope de productos |
|---|---|---|
| **Conocido** | ≥ 2 pedidos entregados (comida, entrega o encargo) con ese celular y sin incidencias | **S/ 40** |
| **Nuevo** | 0 o 1 pedido entregado | **S/ 20** |
| **Bloqueado** | No pagó, no estuvo o rechazó un encargo bien hecho | **Sin encargos.** Jesús lo desbloquea desde el admin (`06` §5) |

- Todo en `app_settings.courier.purchase.caps`; Jesús lo cambia sin desplegar.
- **Más de S/ 40, en v1.1:** *pago directo a la tienda*. En la tienda, el
  motorizado toca «Total listo» y el cliente recibe el QR de Yape **del aliado**
  para pagarle a él; el aliado confirma que vio el ingreso y el motorizado se
  lleva la bolsa. Tindivo no toca ese dinero. Solo con aliados que tengan Yape.

## 4. Cómo se cobra en la puerta

El cliente eligió al pedir: **efectivo** (y con qué billete) o **Yape**.

- **Antes de llegar**, el cliente ya vio el total con la foto de la boleta
  (`02` §5). En la puerta no hay sorpresa.
- **Yape:** al **QR del motorizado**, el mismo de Entregas. El motorizado ve el
  ingreso en su celular y toca *«Me yapeó S/ 30.80»*.
- **Efectivo:** la app ya sabe con qué billete paga. Muestra en grande
  **«Recibes S/ 50 · Das S/ 19.20 de vuelto»**. El motorizado toca *«Cobrado»*.
- **Nunca se fía** (caso 24 de `03`). La bolsa no se entrega sin cobrar el
  total, como en Entregas.

## 5. El cuadre de la noche

### 5.1 Lo que registra la app, sin que el motorizado sume nada

Por cada encargo: **cuánto pagó en la tienda y con qué** (fondo en efectivo o
su Yape) y **cuánto cobró al cliente y cómo** (efectivo o Yape, billete y
vuelto). Ver `08` §2.

### 5.2 La fórmula

Con `F` = fondo entregado:

```
Efectivo que debe haber en el canguro =
    F − compras pagadas en efectivo + cobros en efectivo (ya restado el vuelto)

Yape neto en su celular =
    cobros por Yape − compras pagadas con su Yape

Lo que Tindivo debe recibir = F + servicios cobrados (S/ 3.50 o S/ 4.50 por encargo)
```

**Comprobación:** canguro + Yape neto = F + (cobros − compras) = F + servicios,
siempre que cada encargo se haya cobrado completo. Si no se cobró (cliente que
no pagó), la diferencia es exactamente esa compra y queda **marcada como
pérdida**, no como faltante del motorizado.

### 5.3 Lo que ve el motorizado al cerrar (ejemplo)

> **Cierre de encargos · lunes 12**
> 4 encargos · servicios S/ 14.00
> Fondo recibido: S/ 100.00
> **Entrega el canguro: debe tener S/ 92.50**
> **Yapea a Tindivo: S/ 21.50**
> *(Pagaste S/ 8.20 con tu Yape en Botica La Merced: ya está descontado.)*

Dos acciones: **«Entregué el canguro»** y **«Ya yapeé»**. Jesús cuenta,
confirma en el admin (`06` §4) y listo. Las Entregas (S/ 3) salen en la
**misma pantalla**: hoy ya tienen su rendición (`0237`) y se suman, para que el
motorizado haga **un solo cierre**.

### 5.4 Si no cuadra

- **Sobra plata:** casi siempre es un vuelto mal dado o un Yape de más (caso 23
  de `03`). Se anota y se devuelve.
- **Falta plata:** la app lista los encargos con su foto de boleta y su cobro.
  Jesús revisa cuál no cierra. **Sin disputas formales en v1**, como en `0237`:
  con un motorizado, se habla.

## 6. Quién absorbe cada pérdida

| Qué | Quién | Por qué |
|---|---|---|
| Cliente que no paga, no está o rechaza lo bien comprado | **Tindivo** | Es el riesgo del modelo. Se contiene con topes y bloqueo, **no** con el sueldo del motorizado |
| Motorizado compró otra cosa sin permiso | **Tindivo** en v1, registrado como error | Primero se mide. Descontar desde la primera semana mata la disposición a hacer encargos |
| Faltante sin explicación en el cuadre | Se habla. Si se repite, es otra conversación | — |
| Producto vencido de un aliado | **El aliado** lo cambia (`07` §2) | Es parte del acuerdo |

**Presupuesto de pérdidas:** S/ 15 por semana. Pasado eso, se aprietan los
topes (`03` §6).

## 7. El motorizado (D6)

Hoy cobra sueldo fijo y los encargos le dan **más trabajo y más
responsabilidad** que la comida: comprar, cuidar dinero, cuadrar. El debate del
30-sep descartó los bonos porque empujan a aceptar de más y relegar la comida.

**Propuesta:** **S/ 0.50 por encargo entregado que cuadra al céntimo.** Premia
la exactitud, no el volumen: con el tope de 1 activo, no puede «aceptar de
más». Con 5 encargos por noche son S/ 2.50, el 14 % de lo que dejan. Si Jesús
prefiere no darlo, que al menos **se le explique al motorizado** qué gana
Tindivo y por qué el encargo importa.

## 8. Lo que Jesús comprueba fuera del software

- **El Yape personal del motorizado.** Con encargos, recibe muchos más cobros
  de terceros y por montos mayores. **Comprobar el tope diario y si Yape bloquea
  cuentas personales con ese patrón.** No lo he verificado. Si hay riesgo, los
  encargos se cobran en efectivo hasta tener una cuenta de negocio.
- **El fondo:** de dónde sale y quién lo guarda de día.
- **La boleta:** a montos chicos la tienda la emite sin DNI. Pedir a los
  aliados **boleta o nota de venta** siempre.
