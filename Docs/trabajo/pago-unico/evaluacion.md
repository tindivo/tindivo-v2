# Pago simple para el cliente de confianza: evaluación

> Borrador de trabajo: **no manda**. Pedido de Jesús del 2026-10-26, corregido por él el 2026-10-27 (versión 2). Lo
> escribió la sesión 82, a partir de un barrido de Gemini (solo lectura, 16 archivos) contrastado a mano en
> `develop@29f5e8cc`. Cuando Jesús decida, lo aprobado pasa al canon (`Docs/negocio/antifraude.md`,
> `Docs/negocio/servicios/pedidos-restaurante.md`) y esta carpeta se borra.

## Lo que pidió Jesús

> 26-oct: «Para aquellos que son "usuarios confiables" o "usuarios validados" no quiero que haya dos opciones de
> "prepago" y de "pago contraentrega": quiero que haya un solo botón. […] Si no es usuario confiable, dejar como está
> ahora. Me parece que eso ayudará a mejorar la adopción.»
>
> 27-oct (corrección): no se descarta el efectivo. Para el de confianza, **dos opciones: «Efectivo» y «Yape o Plin»**,
> con una descripción corta que se entienda. En «Yape o Plin» el pedido entra igual. Luego, si quiere, **sube su
> captura**: es opcional, como en el prepago de hoy. Puede ir pagando mientras se cocina, y **el restaurante o el
> motorizado, cualquiera de los dos**, lo valida. También puede pagar al final, cuando el motorizado ya llega, o
> yapear en la puerta sin subir nada. Lo que confunde es tener dos caminos para Yape: tiene que haber uno solo.

## Cómo funciona hoy

- **Quién es de confianza** (`antifraude.md` §4): tiene compra previa (`customer_trusted_for_contraentrega`), no tiene
  strikes y el pedido no pasa de **S/ 80** (`prepay_threshold`). Ese cliente puede pagar al recibir **sin llamada**.
  Quien solo tiene el GPS en San Jacinto puede pagar al recibir, pero **con llamada** (`validando`): no es de confianza.
- **En el checkout, el de confianza elige entre tres opciones** (`payment-rules.ts`), y dos de ellas son Yape:
  - **efectivo al recibir** (`pending_cash`), con «¿con cuánto pagas?» para el vuelto;
  - **Yape al recibir** (`pending_yape`): en la puerta paga al Yape del restaurante;
  - **prepago** (`prepaid`): Yape antes, con captura.
- **Prepago:** el pedido nace en `pending_acceptance`. Cuando el negocio acepta pasa a `awaiting_payment` y el cliente
  tiene 15 min para subir el Yape. El negocio lo valida en 10 min (`validando` → `confirmed`) y **no se cocina hasta
  validarlo**. Un rechazo vuelve a `awaiting_payment`; el segundo cancela el pedido (`proof_rejected_final`).
- **En la puerta** (`apps/motorizados/components/order/deliver-sheet.tsx`):
  - el motorizado elige cómo pagó el cliente de verdad: efectivo, Yape o mixto (`paid_cash`, `paid_yape`,
    `paid_mixed`);
  - muestra el QR del Yape del negocio;
  - confirma el Yape mirando la pantalla del cliente.
  O sea, **hoy el motorizado ya valida un Yape en la puerta**, con el antifraude humano de siempre.
- **El `payment_intent` no cambia nunca** después de crear el pedido. Nada en el código lo actualiza.

## La propuesta (versión 2)

Para el cliente de confianza, y solo para él, el checkout ofrece **dos opciones**:

| Opción | Descripción en pantalla (borrador) | Por dentro |
|---|---|---|
| **Efectivo** | «Pagas al recibir. ¿Con cuánto pagas?» (para el vuelto) | `pending_cash`, como hoy |
| **Yape o Plin** | «Paga cuando quieras: ya mismo subiendo tu captura, o al recibir, en la puerta.» | `pending_yape`, como hoy, más un **comprobante opcional** |

Con **Yape o Plin**:

1. **El pedido entra y se cocina sin esperar el pago**, como hoy un Yape al recibir.
2. **Ya aceptado**, el seguimiento muestra «Ya pagaste? Sube tu captura» (opcional) hasta que el pedido se entrega.
3. **Quién lo valida:** el restaurante (en su panel, mirando su Yape) **o** el motorizado (en su app, antes de llegar
   o en la puerta). El primero que lo confirma lo deja **verificado**. Si lo rechaza, se cobra en la puerta, como si
   no hubiera subido nada; el pedido no se cancela ni hay strike.
4. **En la puerta**, la tarjeta del motorizado dice una de tres cosas:
   - **verificado** → «Ya pagado. No cobres nada»;
   - **captura subida sin validar** → «El cliente subió su captura: confírmala aquí» (la abre, la compara con el Yape
     del negocio o con la pantalla del cliente, y la confirma o la rechaza);
   - **sin captura** → cobra como hoy (efectivo, Yape en la puerta con el QR, o mixto).
5. **Si no sube nada**, todo es como hoy un Yape al recibir.

Para el que no es de confianza, nada cambia: sigue el prepago obligatorio cuando corresponde.

**Lo que desaparece:** la opción «prepago» como camino aparte para el de confianza. Ya no hay dos maneras de pagar
con Yape: hay una, y la captura es opcional.

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

Cambiarlo los rompería; el de la tarjeta del motorizado sería una fuga de comida sin cobrar.

**En su lugar:** un pedido `pending_yape` gana un **comprobante opcional** aparte: estado (`ninguno`, `en revisión`,
`verificado`, `rechazado`), archivo, intento, **quién lo validó** (`negocio` o `motorizado`) y cuándo.

| Quién | Qué cambia |
|---|---|
| Base de datos | Columnas del comprobante opcional. Una RPC para subirlo: dueño del pedido, pedido aceptado y sin entregar, archivo en Storage, como `0248`. Otra para validarlo, que admite **al negocio del pedido o al motorizado asignado**, y a nadie más. El evento va en `domain_events`, en la misma transacción (invariante 4) |
| **Devolución (dinero)** | Si el negocio o el admin cancelan un pedido con el comprobante **verificado**, la devolución se registra en `business_charges`, igual que en un prepago. **Hoy no pasaría:** el trigger solo mira los pedidos que nacieron `prepaid` |
| Entrega | `advance_order` a `delivered` con comprobante verificado registra `paid_yape` sin pedir otra confirmación; con comprobante en revisión, obliga a resolverlo antes |
| API y contrato REST | `payment-options` devuelve las dos opciones para el de confianza. Se añaden una ruta para subir el comprobante, otra para validarlo y el estado en el detalle del pedido, todo sin romper la v1 (API-3) |
| Web del cliente | Checkout con las dos opciones y la descripción; «Sube tu captura» en el seguimiento |
| Negocios | Ver y validar el comprobante en un pedido que ya se cocina; «Pago verificado» en la tarjeta |
| Motorizados | Ver la captura y validarla; la tarjeta con los tres estados de arriba; un push cuando el cliente la sube |
| App Android | Su checkout aún no existe: nace ya con las dos opciones |

## Decisiones que necesito de ti

1. **¿Quién recibe las dos opciones?** **Recomiendo:** exactamente quien hoy paga al recibir sin llamada: compra
   previa, sin strikes, hasta S/ 80 y que no sea recojo «más tarde».
2. **¿El motorizado puede validar una captura antes de llegar?** Él no ve el Yape del negocio; solo ve la imagen.
   **Recomiendo:** que pueda, pero que en la puerta, si la validó él, igual mire la pantalla del cliente, como hoy.
   El negocio, que sí ve su Yape, es la validación fuerte. Lo discuto con Codex (abajo).
3. **Si el negocio cancela con el comprobante verificado** (dinero, invariante 9). **Recomiendo:** devolución igual
   que un prepago, en `business_charges`. Si lo verificó solo el motorizado, ¿también? Lo discuto con Codex.
4. **Si se rechaza la captura.** **Recomiendo:** sin cancelar ni strike; se cobra en la puerta. Dos intentos.
5. **Más de S/ 80 y recojo «más tarde».** **Recomiendo:** sin cambios; siguen con prepago obligatorio.
6. **No-show con comprobante verificado.** **Recomiendo:** sin strike, como un recojo ya pagado (`0224`).

## Riesgos

- **Doble cobro** (Yape antes y efectivo en la puerta): la tarjeta del motorizado lee el estado del servidor. Un
  comprobante en revisión se resuelve en la puerta antes de entregar.
- **Captura falsa:** el negocio la compara con su Yape. Si solo la mira el motorizado, el riesgo es el mismo de hoy
  en la puerta, y por eso él igual mira la pantalla del cliente.
- **El motorizado no se entera:** el push lleva su tag `${event_type}-${shortId}` (invariante 5), y la tarjeta lee
  el estado del servidor, no el aviso.

## Tamaño y orden

Son cuatro PR, cada uno con su revisión:

1. **Base de datos y API**: migración, RPC, devolución y contrato. Pasa por Codex (dinero y RLS) **y por tu revisión
   de dinero**.
2. **Negocios y motorizados.** Van antes que el checkout: si no, una captura no le llegaría a nadie.
3. **Web del cliente:** las dos opciones y la captura en el seguimiento.
4. **Android:** entra con el checkout de la app.

## Siguiente paso

Codex revisa este diseño (dinero y seguridad) **antes de escribir código**. Con su respuesta y tus decisiones 1–6,
se diseña la migración.
