# Pago simple: evaluación

> Borrador de trabajo: **no manda**. Pedido de Jesús del 2026-10-26, corregido por él el 2026-10-27 (versiones 2 y 3).
> Lo escribió la sesión 82, a partir de un barrido de Gemini (solo lectura, 16 archivos) contrastado a mano en
> `develop@29f5e8cc`. La versión 3 incorpora la revisión de diseño de Codex (ronda 1, `no firmo`, CAX-001..007) y las
> decisiones A, B y C de Jesús. Cuando Jesús apruebe, lo aprobado pasa al canon (`Docs/negocio/antifraude.md`,
> `Docs/negocio/servicios/pedidos-restaurante.md`) y esta carpeta se borra.

## Lo que pidió Jesús

> 26-oct: «Para aquellos que son "usuarios confiables" o "usuarios validados" no quiero que haya dos opciones de
> "prepago" y de "pago contraentrega" […]. Si no es usuario confiable, dejar como está ahora. Me parece que eso
> ayudará a mejorar la adopción.»
>
> 27-oct (versión 2): no se descarta el efectivo. Para el de confianza, **dos opciones: «Efectivo» y «Yape o Plin»**,
> con una descripción corta. En «Yape o Plin» el pedido entra igual. Si quiere, sube su captura (es opcional); el
> restaurante o el motorizado la revisan mientras se cocina. También puede pagar al final, o yapear en la puerta sin
> subir nada.
>
> 27-oct (versión 3), tras la revisión de Codex:
> - **A.** El motorizado ve la captura desde que la suben, pero solo cuenta como pagado si el restaurante confirma que
>   le llegó, o si el motorizado, ya en la puerta, mira el celular del cliente y marca «Pagó por Yape», como hoy.
> - **B.** Si en la puerta se marca un Yape que era falso, se resuelve como hoy, entre restaurante y motorizado:
>   Tindivo no genera devolución ni deuda por eso.
> - **C.** Las dos opciones son **solo para delivery**. En el recojo se quita «pagar en el local»: **un recojo pedido
>   desde la app va siempre con prepago**, por simplicidad.

## Cómo funciona hoy

- **Quién es de confianza** (`antifraude.md` §4): compra previa (`customer_trusted_for_contraentrega`), sin strikes,
  pedido hasta **S/ 80** (`prepay_threshold`). Paga al recibir **sin llamada**. Quien solo tiene el GPS en San Jacinto
  paga al recibir **con llamada** (`validando`).
- **Checkout del delivery**, para el de confianza (`payment-rules.ts`): efectivo al recibir (`pending_cash`), Yape al
  recibir (`pending_yape`) o prepago (`prepaid`). Dos de las tres son Yape.
- **Checkout del recojo** (`antifraude.md`, «En el mostrador no se fía»):
  - «ahora»: efectivo en caja, que se cobra al aceptar y antes de cocinar (`0224`), o prepago;
  - «más tarde»: solo prepago.
- **Prepago:** nace en `pending_acceptance`. Al aceptarse pasa a `awaiting_payment` y el cliente tiene 15 min para
  subir el Yape. El negocio valida en 10 min (`validando` → `confirmed`) y **no se cocina hasta validarlo**. Dos
  rechazos cancelan el pedido (`proof_rejected_final`).
- **En la puerta** (`deliver-sheet.tsx`): el motorizado elige cómo pagó el cliente de verdad (`paid_cash`,
  `paid_yape`, `paid_mixed`), muestra el QR del Yape del negocio y confirma el Yape mirando la pantalla del cliente.
- **El `payment_intent` no cambia nunca** después de crear el pedido.

## La propuesta (versión 3)

### Delivery

| Quién | Opciones del checkout |
|---|---|
| Cliente de confianza | **Efectivo**: «Pagas al recibir. ¿Con cuánto pagas?» (`pending_cash`) · **Yape o Plin**: «Paga cuando quieras: ya mismo, subiendo tu captura, o al recibir, en la puerta» (`pending_yape`) |
| El resto | Como hoy |

Con **Yape o Plin**, el pedido entra y se cocina sin esperar el pago. Después:

1. **Captura opcional.** Desde que el negocio acepta hasta que el motorizado empieza a cobrar, el seguimiento ofrece
   «¿Ya pagaste? Sube tu captura». Hay dos intentos.
2. **El negocio confirma que le llegó el dinero**, mirando su Yape. Puede hacerlo con la captura **o sin ella** (el
   cliente yapeó y no la subió). Anota el importe recibido. Esa es la única confirmación que vale como «dinero
   recibido» (decisión A).
3. **El negocio puede rechazar una captura** (no le llegó, es vieja o por otro monto). Rechazarla no cancela el pedido
   ni da strike, y no borra un ingreso que el negocio ya confirmó.
4. **El motorizado ve la captura** desde que la suben, solo para saber. **No la puede confirmar desde lejos.**
5. **En la puerta**, la tarjeta del motorizado lee el servidor:
   - **dinero recibido por el total** → «Ya pagado. No cobres nada»;
   - **dinero recibido por menos** → «Cobra la diferencia: S/ X»;
   - **sin confirmar** → cobra como hoy. Si el cliente le muestra que ya yapeó, el motorizado marca «Pagó por Yape»,
     igual que hoy. Si la captura sigue sin revisar, el motorizado ve un aviso para llamar al negocio.
6. **Lo que marca el motorizado en la puerta es una declaración, como hoy.** Queda registrada con su nombre, pero no
   es «dinero recibido» para Tindivo: no genera devolución ni deuda del negocio (decisión B).

### Recojo (decisión C)

**Un recojo pedido desde la app va siempre con prepago**, sea «ahora» o «más tarde». Desaparece «pagar en el local».
El prepago del recojo sigue como hoy: no se cocina hasta que el negocio valida. Lo que la cajera registra a mano en su
panel (pedidos de mostrador) no cambia.

## Reglas de servidor (lo que pidió Codex)

### Datos

Un pedido `pending_yape` de delivery gana:

- **Capturas** (tabla propia, una fila por intento):
  - pedido, número de intento (1 o 2), ruta en Storage y hora de subida;
  - resolución (`pendiente`, `aceptada`, `rechazada`), quién la resolvió y cuándo.
  - Único por (pedido, intento).
- **Ingreso confirmado por el negocio** (en el pedido): importe recibido (`numeric(10,2)`), quién lo confirmó, cuándo
  y una referencia opcional (número de operación). Una sola vez por pedido.
- **Cobro en curso:** quién empezó a cobrar y cuándo.
- **Versión de pago:** un entero que sube con cada cambio de los anteriores.
- Ningún cliente escribe estas columnas directamente: solo las RPC.

### Quién puede qué (CAX-005)

| Acción | Quién | Condiciones |
|---|---|---|
| Subir captura | El cliente dueño del pedido | Delivery `pending_yape`, aceptado, no terminal, sin cobro en curso, sin ingreso confirmado, menos de 2 intentos |
| Confirmar ingreso (con o sin captura) | Personal del negocio del pedido | No terminal; sin cobro en curso o cobro abandonado; una sola vez |
| Rechazar captura | Personal del negocio del pedido | Intento pendiente; el número de intento coincide |
| Ver la captura | Dueño, negocio del pedido, **motorizado asignado ahora**, admin por rol | Enlace firmado de pocos minutos, generado por la API tras comprobar el permiso |
| Empezar o abandonar el cobro, y entregar | Motorizado asignado ahora | Como hoy, más la versión de pago |
| Validar | Nadie más: ni el admin ni un motorizado reasignado | Se deniega por defecto |

- **Identidad:** la API toma al actor del JWT. Las RPC que reciben al actor como parámetro son exclusivas del servicio
  (`service_role`), como la de `0248`.
- **Helpers:** `SECURITY DEFINER` con `SET search_path = ''`, `GRANT` explícitos, y RLS en la tabla de capturas.
- **Reasignación:** el motorizado saliente pierde la lectura y el cobro en cuanto cambia la asignación. Se comprueba
  dentro de la misma operación, con el pedido bloqueado.

### Estados y carreras (CAX-002)

- **Bloqueo:** subir, confirmar, rechazar, empezar el cobro, abandonarlo, entregar, cancelar y reasignar bloquean la
  fila del pedido (`FOR UPDATE`).
- **Versión:** cada operación comprueba el estado esperado y la versión de pago. Una pantalla desactualizada recibe
  `409` y recarga.
- **Resolución:** cada intento se resuelve una sola vez. Repetir la misma decisión es idempotente; la decisión
  contraria es `409`.
- **Cobro:** al abrir la hoja de cobro, el motorizado **empieza el cobro** con la versión que ve.
  - Desde ese momento se rechazan subidas y confirmaciones: el negocio ve «el motorizado está cobrando».
  - Si cierra la hoja sin entregar, el cobro se abandona.
  - Si nadie lo cierra, el cobro caduca a los N minutos (`app_settings`).
- **Entrega:** `advance_order` a `delivered` exige la versión vigente.
  - Con ingreso confirmado por el total, registra `paid_yape` por ese importe sin pedir más.
  - Con ingreso parcial, el motorizado registra cómo cobró la diferencia.
- **Fin:** en `delivered` o `cancelled` no se sube, confirma ni rechaza nada.
- **Outbox:** el agregado y su evento en `domain_events` cambian en la misma transacción.

### Ingreso sin captura y discrepancias (CAX-003)

- **Sin captura:** el negocio confirma el ingreso igual, con importe y referencia si la tiene.
- **Discrepancia en la puerta** (el cliente dice que pagó y no hay confirmación): el motorizado llama al negocio desde
  la tarjeta. Si el negocio confirma, la tarjeta cambia sola. Si no, se cobra como hoy, o el motorizado marca lo que
  vio (decisión B).
- **Importes:**
  - un ingreso parcial deja la diferencia por cobrar;
  - un excedente queda anotado para que el negocio lo devuelva fuera de la app. Tindivo no retiene fondos;
  - un ingreso confirmado poco antes de una cancelación cuenta como ingreso (ver devolución).

### Devolución (CAX-004, dinero, invariante 9)

- **Cuándo:** solo si el **negocio confirmó el ingreso** y el pedido se cancela por un motivo elegible, los mismos que
  hoy dan devolución al prepago (cancela el negocio o el admin; no un no-show del cliente).
- **Dónde e importe:** en `business_charges`, por el importe recibido, igual que un prepago.
- **Sin devolución:** una declaración del motorizado en la puerta nunca crea un cargo.
- **Una sola vez:** cada devolución tiene una identidad única por pedido y origen (`prepaid` o `yape_confirmado`),
  compartida por el trigger y la gestión manual del admin, con índice único e inserción idempotente. Así no se duplica
  la misma devolución, y dos devoluciones distintas no se confunden.
- **Obligación ≠ devolución hecha:** que el cargo exista no prueba que el cliente recibió su dinero. Se sigue como hoy.
- **Revisión:** la de dinero de Jesús, antes de aplicar código.

### Capturas en Storage (CAX-006)

- **Dónde:** el bucket privado de los comprobantes. La ruta va ligada a dueño, pedido e intento, y es inmutable
  (sin sobrescritura, como `0258`).
- **Lectura:** solo por la matriz de arriba, con enlaces firmados de pocos minutos. Si reasignan al motorizado, puede
  seguir viendo la captura como mucho hasta que vence el enlace que ya pidió. Esa ventana queda documentada.
- **Retención y purga:** la misma que los comprobantes del prepago, incluidas las capturas rechazadas y los archivos
  subidos que no llegaron a registrarse. En el PR 1 se comprueba qué purgan hoy `0269` y la purga general, y se amplía
  lo que falte. No se da por hecho.

### Consumidores que cambian (CAX-002, pregunta 6)

| Dónde | Cambio |
|---|---|
| `collect-card.tsx` (motorizado) | Lee ingreso confirmado, diferencia y captura en revisión; no deduce nada del `payment_intent` solo |
| `deliver-sheet.tsx` (motorizado) | Empieza y abandona el cobro con la versión; con ingreso confirmado no ofrece cobrar el total |
| `pedido-detail.tsx` (negocio) | Confirmar ingreso o rechazar captura en un pedido que ya se cocina. No usar la inferencia «si cocina, está pagado» del componente de prepago |
| `prepay-stage.ts` (cliente) | Nuevo estado del seguimiento para «Yape o Plin» |
| Ramas de no-show de `0224` | Delivery con ingreso confirmado: sin strike (el negocio no perdió). Sin ingreso: como hoy |
| Devolución (`0124`) | Segundo origen (`yape_confirmado`) con identidad única compartida |
| `payment-rules.ts` y CHECK del recojo | Delivery de confianza: `pending_cash` o `pending_yape`. Recojo desde la app: solo `prepaid` |
| Push | Al subir la captura (negocio y motorizado) y al confirmar el ingreso (motorizado), con tag `${event_type}-${shortId}` |

## Decisiones

| | Decisión | Estado |
|---|---|---|
| A | El motorizado ve la captura; solo cuenta como pagado lo que confirma el negocio o lo que el motorizado marca en la puerta | **Jesús, 27-oct** |
| B | Un Yape falso marcado en la puerta se resuelve como hoy; no hay devolución ni deuda | **Jesús, 27-oct** |
| C | Solo delivery; todo recojo desde la app va con prepago | **Jesús, 27-oct** |
| 1 | Las dos opciones, para quien hoy paga al recibir sin llamada (compra previa, sin strikes, hasta S/ 80) | Recomendación, falta tu visto |
| 2 | Devolución solo con ingreso confirmado por el negocio, como un prepago, identidad única | Recomendación; **revisión de dinero** |
| 3 | Captura rechazada: sin cancelar ni strike; dos intentos | Recomendación, falta tu visto |
| 4 | No-show en delivery con ingreso confirmado: sin strike | Recomendación, falta tu visto |

## Tamaño y orden

Cuatro PR, cada uno con su revisión:

1. **Base de datos y API**: tabla de capturas, columnas, RPC, devolución, CHECK del recojo y contrato REST. Pasa por
   Codex (dinero, RLS y concurrencia) **y por tu revisión de dinero**.
2. **Negocios y motorizados.** Van antes del checkout: si no, una captura no le llegaría a nadie.
3. **Web del cliente:** las dos opciones del delivery, el recojo solo con prepago y la captura en el seguimiento.
4. **Android:** entra con el checkout de la app.

## Siguiente paso

Codex revisa esta versión 3 (ronda 2 de 3). Con su firma y tu visto en 1–4, se diseña la migración.
