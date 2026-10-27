# Pago único para el cliente de confianza: evaluación

> Borrador de trabajo: **no manda**. Pedido de Jesús del 2026-10-26. Lo escribió la sesión 82, a partir de un barrido de
> Gemini (solo lectura, 16 archivos) contrastado a mano en `develop@29f5e8cc`. Cuando Jesús decida, lo que se apruebe
> pasa al canon (`Docs/negocio/antifraude.md`, `Docs/negocio/servicios/pedidos-restaurante.md`) y esta carpeta se borra.

## Lo que pidió Jesús

> «Para aquellos que son "usuarios confiables" o "usuarios validados" no quiero que haya dos opciones de "prepago" y de
> "pago contraentrega": quiero que haya un solo botón. Simplemente que pueda ingresar; una vez lo acepten, puede ir
> subiendo su comprobante. Ahí mismo le llega al restaurante y al motorizado, en caso suba. Si no es usuario
> confiable, dejar como está ahora. Me parece que eso ayudará a mejorar la adopción.»

## Cómo funciona hoy

- **Quién es de confianza** (`antifraude.md` §4): tiene compra previa (`customer_trusted_for_contraentrega`), no tiene
  strikes y el pedido no pasa de **S/ 80** (`prepay_threshold`). Ese cliente puede pagar al recibir **sin llamada**.
  Quien solo tiene el GPS en San Jacinto puede pagar al recibir, pero **con llamada** (`validando`): no es de confianza.
- **En el checkout, el de confianza elige** entre tres opciones (`payment-rules.ts`):
  - **efectivo al recibir** (`pending_cash`), con «¿con cuánto pagas?» para el vuelto;
  - **Yape al recibir** (`pending_yape`): en la puerta paga al Yape del restaurante;
  - **prepago** (`prepaid`).
- **Prepago:** el pedido nace en `pending_acceptance`. Cuando el negocio acepta pasa a `awaiting_payment` y el cliente
  tiene 15 min para subir el Yape. El negocio lo valida en 10 min (`validando` → `confirmed`) y **no se cocina hasta
  validarlo**. Un rechazo vuelve a `awaiting_payment`; el segundo cancela el pedido (`proof_rejected_final`).
- **El `payment_intent` no cambia nunca** después de crear el pedido. Nada en el código lo actualiza.

## La propuesta, en concreto

Para el cliente de confianza, y solo para él:

1. **Un solo botón: «Hacer pedido».** El pedido entra como hoy entra un pago al recibir: se acepta y se cocina sin
   esperar el pago.
2. **Ya aceptado**, el seguimiento le ofrece **«Adelantar el pago con Yape»**, que es opcional. Sube su comprobante y
   le llega al negocio.
3. **El negocio lo valida** con su propio Yape, como hoy. Si lo confirma, el motorizado ve «Ya pagado. No cobres
   nada». Si lo rechaza, el pedido **no se cancela**: se cobra al recibir, como si no hubiera subido nada.
4. **Si no sube nada**, paga al recibir.

Para el que no es de confianza, nada cambia.

**Por qué tiene sentido:** quita una decisión del checkout justo al cliente que más pide. Y **el riesgo no sube**: ese
cliente ya puede hoy pagar al recibir sin llamada. El adelanto solo reduce lo que el motorizado cobra en la puerta.

## Cómo se haría por dentro

**No cambiar el `payment_intent` a mitad del pedido.** El barrido encontró 8 sitios que dependen de que no cambie:

- la RPC del comprobante (`0248`);
- el tope de S/ 80 (`0275`);
- el vuelto, que se borra si el pedido no nace en efectivo (`0275`);
- los botones del negocio (`pedido-detail.tsx`);
- el seguimiento del cliente (`prepay-stage.ts`);
- la tarjeta del motorizado, que dice «no cobres» con solo ver `prepaid` (`collect-card.tsx`);
- la regla del recojo «más tarde»;
- la devolución, que mira solo `prepaid` (`handle_prepaid_refund_on_cancel`, `0124`).

Cambiarlo los rompería, y el de la tarjeta del motorizado sería una fuga de comida sin cobrar.

**En su lugar:** el pedido conserva su forma de pago al recibir y gana un **adelanto** aparte: un estado (`ninguno`,
`en revisión`, `verificado`, `rechazado`), su comprobante y su intento. Cada consumidor lo lee así:

| Quién | Qué cambia |
|---|---|
| Base de datos | Columnas del adelanto; una RPC para registrarlo (dueño, estado del pedido, archivo en Storage, como `0248`) y otra para que el negocio lo valide; el evento en `domain_events` en la misma transacción (invariante 4) |
| **Devolución (dinero)** | Si el negocio o el admin cancelan un pedido con **adelanto verificado**, se registra la devolución en `business_charges` igual que en un prepago. **Hoy no pasaría:** el trigger solo mira pedidos que nacieron `prepaid` |
| API y contrato REST | `payment-options` dice si toca el botón único; una ruta para subir el adelanto; el estado del adelanto en el detalle del pedido. Todo se **añade** sin romper la v1 (API-3) |
| Web del cliente | Checkout con un solo botón para el de confianza; en el seguimiento, «Adelantar el pago con Yape» |
| Negocios | Validar el adelanto sobre un pedido que ya se cocina; «Pago adelantado verificado» en la tarjeta |
| Motorizados | La tarjeta lee el adelanto: verificado → «Ya pagado. No cobres nada»; si no, cobra como hoy. Un push cuando se verifica |
| App Android | Su checkout aún no existe: nace ya con el botón único |

## Decisiones que necesito de ti

Cada una con mi recomendación.

1. **¿Quién recibe el botón único?** **Recomiendo:** exactamente quien hoy paga al recibir sin llamada (compra previa,
   sin strikes, hasta S/ 80, que no sea recojo «más tarde»). Quien entra con llamada por GPS sigue como hoy.
2. **El vuelto.** Sin preguntar nada, el motorizado no sabe cuánto vuelto llevar. **Recomiendo:** el botón único y,
   debajo, una sola línea opcional: «¿Pagas en efectivo? ¿Con cuánto?». Si la deja vacía, se trata como pago exacto o
   Yape en la puerta.
3. **¿Hasta cuándo puede adelantar?** **Recomiendo:** desde que el negocio acepta hasta que el motorizado recoge el
   pedido. Si al entregarlo al motorizado el comprobante sigue en revisión, la cajera lo resuelve ahí mismo: lo
   confirma o lo rechaza antes de soltar el pedido. **Por qué:** así el motorizado nunca sale con la duda de si cobrar,
   y se evita el doble cobro (Yape y efectivo).
4. **Si el negocio cancela con el adelanto verificado** (dinero, invariante 9). **Recomiendo:** devolución igual que un
   prepago, registrada en `business_charges`.
5. **Si el negocio rechaza el comprobante.** **Recomiendo:** no se cancela ni hay strike; se cobra al recibir. Dos
   intentos, como el prepago.
6. **Más de S/ 80 y recojo «más tarde».** **Recomiendo:** sin cambios; siguen con prepago obligatorio.
7. **No-show con adelanto verificado.** **Recomiendo:** sin strike, como un recojo ya pagado (`0224`): el negocio no
   perdió nada.

## Riesgos

- **Doble cobro:** el cliente paga por Yape y el motorizado cobra igual. Lo evita la decisión 3: ningún pedido sale del
  local con el adelanto en revisión.
- **Comprobante falso:** lo frena la cajera validando en su propio Yape, como hoy. Si lo rechaza, se cobra en la
  puerta: nadie pierde la comida.
- **El motorizado no se entera:** el push al verificarse lleva su tag `${event_type}-${shortId}` (invariante 5), y la
  tarjeta lee el estado del servidor, no el aviso.

## Tamaño y orden

Son cuatro PR, cada uno con su revisión:

1. **Base de datos y API** (migración, RPC, devolución, contrato). Pasa por Codex (dinero y RLS) **y por tu revisión de
   dinero**.
2. **Negocios y motorizados.** Tienen que estar antes que el botón: si no, un adelanto no le llegaría a nadie.
3. **Web del cliente:** el botón único y el adelanto en el seguimiento.
4. **Android:** entra con el checkout de la app.

## Siguiente paso

Que Jesús decida 1–7. Con eso, el diseño exacto de la migración se pasa a Codex como revisión de riesgos (dinero y
seguridad) **antes de escribir código**.
