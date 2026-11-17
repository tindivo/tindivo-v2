# CHK · Confirmar pedido

> **Decisiones de Jesús del 2026-11-17 que cambian esta pantalla** (donde choquen con el texto de abajo, manda esto):
> - «¿Cómo pagas?»: el confiable elige «Efectivo» o «Yape o Plin» (con logos); se elimina el selector «Al recibir» / «Pagar ahora»; el no confiable ve «Yape o Plin por adelantado» (CUS-CHK-024, 025). La maqueta `Checkout-adelantado` aún dibuja «Yape o Plin al recibir» en gris: sobra.
> - Resumen siempre con subtotal, envío y total (CUS-CHK-026). Cliente sin historial: «Te llamaremos para confirmar tu pedido» y el número verificado debajo (CUS-CHK-027). Todo recojo es prepago y no se pregunta «¿Vas al local ahora?» (CUS-CHK-028).
> - Tras confirmar, el pedido espera a que el negocio acepte: `TRK-esperando-aceptacion`.

> Piloto de formato: las demás pantallas copian esta estructura. Maquetas: canvas «Tindivo app — pantallas», tableros
> `5 · Confirmar: confiable, efectivo`, `5b · Confiable, billetera digital`, `5c · No confiable: solo adelantado`.

| | |
|---|---|
| **Tarea de la persona** | Revisar a dónde llega, quién recibe y cómo paga, y confirmar. Una sola acción primaria. |
| **Se llega desde** | Bolsa → «Ir a pagar» (`CRT`). Si no hay sesión o faltan datos, antes pasa por el flujo `flujos/acceso-y-datos.md`. |
| **Se sale hacia** | Pedido creado → Seguimiento (`TRK-seguimiento`), **reemplazando** esta pantalla (CUS-CHK-011). Volver → Bolsa. |
| **Requisitos** | CUS-CHK-001…020, CUS-CRT-008, CUS-ADR-012, CUS-PAY-008, CUS-CAT-012 |
| **Endpoints** | `POST /customer/checkout/quote` (envío, total, decisión de pago) · `POST /customer/orders` con `Idempotency-Key` · `GET /config` (⚙) · hojas: `GET/POST /customer/addresses`, `POST /customer/phone/send-code`, `POST /customer/phone/verify` |
| **Estado** | Android: 🟡 funciona con el diseño anterior; rediseño v3 ⬜ · iOS: ⬜ |

## Contenido, de arriba abajo

1. **Barra superior (fija).** Volver · nombre del negocio · «[N] productos · llega en [PLAZO] min» · «Ver», que abre una
   hoja con los productos, sus opciones y notas (CUS-CHK-001). No lleva el título «Confirmar pedido»: lo dice el botón.
2. **Tarjeta de entrega** (solo delivery; en recojo no existe, CUS-CHK-018):
   - Dirección: «[línea] · [etiqueta]» y la referencia debajo. «Cambiar» → hoja `ADR-elegir-direccion`.
   - Quién recibe: nombre y celular. «Cambiar» → hoja `AUT-celular` (cambiar el celular exige verificarlo, CUS-AUT-009).
   - Nota para el motorizado: campo de una línea, opcional, ≤ 200 caracteres, placeholder «Nota para el motorizado
     (opcional)» (CUS-CHK-005).
3. **«¿Cómo pagas?»** — las opciones dependen de la decisión del servidor (`quote`), nunca de la app (CUS-CHK-006/007):

   | Situación del cliente | Opciones habilitadas | Opciones en gris |
   |---|---|---|
   | **Confiable** (`trusted`) | «Efectivo» · «Yape o Plin» (con logos; «Ves el número cuando el negocio acepte»). Sin selector «Al recibir» / «Pagar ahora» | — |
   | **No confiable** por faltas o riesgo (`risk_blocked`, ≥ ⚙ `strikes.prepaymentOnlyThreshold`) | «Yape o Plin por adelantado» · «Pagas apenas el local acepte» | «Efectivo», con candado y el motivo **una sola vez**: «Por pedidos anteriores sin recibir» |
   | **No confiable por monto** (total con envío > ⚙ `prepay_threshold`) | igual | motivo: «Pedido mayor a S/ [⚙ prepay_threshold]» |
   | **Sin historial con GPS en cobertura** (`no_history`) | las del confiable; el pedido pasa a `validando` (la cajera llama) | — · bajo el botón: «Te llamaremos para confirmar tu pedido» y, debajo, el número verificado (CUS-CHK-027) |

   - La opción elegida se expande; las demás quedan en una línea (§10.7 del sistema de diseño).
   - **Efectivo elegido:** «¿Con cuánto pagas?» con chips «Exacto», «S/ 20», «S/ 50», «S/ 100», «Otro» y las reglas de
     billete y vuelto de CUS-CHK-008. Si el vuelto de la noche es 0: «Esta noche el negocio no tiene vuelto».
   - **Yape o Plin:** con los logos de Yape y de Plin (decisión de Jesús, 2026-11-17, que revierte la billetera
     agnóstica del 16-nov). No se paga aquí: el número aparece en el seguimiento cuando el negocio acepta (CUS-PAY-014).
   - **Recojo** (sin tarjeta de entrega): solo «Yape o Plin por adelantado» y la línea «Pagas por adelantado y lo preparamos
     apenas confirmemos el pago» (CUS-CHK-028). No hay pregunta «¿Vas al local ahora?».
4. **Resumen:** siempre «Subtotal S/ [SUBTOTAL]», «Envío S/ [ENVÍO]» y «Total S/ [TOTAL]» (CUS-CHK-026; envío tachado si hay promo, CUS-CHK-016). La maqueta solo dibuja Envío y Total: la decisión 13 la corrige.
5. **Términos:** «Al confirmar aceptas los Términos y la Privacidad», con enlaces de 48 dp de alto.
6. **Barra de acción (fija):** «Confirmar pedido» + píldora «S/ [TOTAL]». Si falta algo, el botón dice qué hacer y lleva
   al campo, en el orden de CUS-CHK-013.

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Cargando la cotización | Esqueletos en resumen y pagos; botón deshabilitado | CUS-CHK-014 |
| Revalidando la bolsa | Botón deshabilitado con «Estamos verificando tu bolsa con el menú actual.» | CUS-CHK-014 |
| Falta un dato | Botón con la acción («Agrega tu dirección», «Verifica tu celular», «¿Con cuánto pagas?») | CUS-CHK-013 |
| GPS dudoso con historial y pago al recibir | Hoja de bloqueo: «Reintentar» / «Pagar por adelantado» | CUS-CHK-009 |
| Negocio cerrado o pausado | Aviso y botón deshabilitado | CUS-CAT-012/014 |
| Caso de pago sin resolver | No se entra: se lleva al caso | CUS-CHK-019, CUS-PAY-008 |
| Cuenta bloqueada | Vista de bloqueo con soporte por WhatsApp | CUS-CHK-012 |
| Error del servidor | Mensaje comprensible según `code`, nunca el texto crudo | CUS-CHK-020 |
| Enviando | Botón con progreso; no se puede tocar dos veces; misma `Idempotency-Key` si hay que reintentar | CUS-CHK-010 |

## Criterios de aceptación propios de la pantalla

```
CA-CHK-P1 · [RETIRADO, decisión de Jesús 2026-11-17: ya no hay selector] Confiable con billetera: «Al recibir» es la opción por defecto
  Dado un cliente con decisión trusted y un negocio que acepta prepago
  Cuando elige «Billetera digital»
  Entonces el selector muestra «Al recibir» marcado y «Pagar ahora» disponible
  Y confirmar sin tocar el selector crea el pedido con pago al recibir

CA-CHK-P2 · No confiable: el motivo se dice una vez
  Dado un cliente con decisión risk_blocked
  Cuando abre «¿Cómo pagas?»
  Entonces solo «Yape o Plin por adelantado» se puede elegir
  Y «Efectivo» aparece en gris con candado
  Y el texto «Por pedidos anteriores sin recibir» aparece exactamente una vez

CA-CHK-P3 · La opción no elegida ocupa una línea
  Dado «Efectivo» elegido
  Entonces «Yape o Plin» se muestra en una sola fila, sin subtítulo
```

Los escenarios CA-CHK-01…05 de `requisitos/CHK.md` también aplican.

## Movimiento

Botón: escala 0,97 al tocar. Opción elegida: se expande en 200 ms. Opciones en gris: si se tocan, la línea del motivo
vibra 150 ms. Al confirmar: check animado y paso al seguimiento. Respeta «reducir movimiento».

## Pendiente (va a `decisiones-abiertas.md`)

- Resueltos el 2026-11-17: texto de `validando` (CUS-CHK-027), recojo (CUS-CHK-028) y subtotal (CUS-CHK-026).
- Sigue abierto el chip «S/ 20» (la maqueta trae Exacto / S/ 50 / S/ 100 / Otro): punto Y.
