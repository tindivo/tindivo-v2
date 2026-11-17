# CHK · Confirmar pedido

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
   | **Confiable** (`trusted`) | «Efectivo» (al recibir) · «Billetera digital» con selector **«Al recibir»** (por defecto) / **«Pagar ahora»** (solo si el negocio acepta prepago; opcional) | — |
   | **No confiable** por faltas o riesgo (`risk_blocked`, ≥ ⚙ `strikes.prepaymentOnlyThreshold`) | «Billetera digital por adelantado» | «Efectivo» y «Billetera digital al recibir», con candado y el motivo **una sola vez**: «Por pedidos anteriores sin recibir» |
   | **No confiable por monto** (total con envío > ⚙ `prepay_threshold`) | igual | motivo: «Pedido mayor a S/ [⚙ prepay_threshold]» |
   | **Sin historial con GPS en cobertura** (`no_history`) | las del confiable; el pedido pasa a `validando` (la cajera llama) | — · falta definir el texto que lo avisa → `decisiones-abiertas.md` |

   - La opción elegida se expande; las demás quedan en una línea (§10.7 del sistema de diseño).
   - **Efectivo elegido:** «¿Con cuánto pagas?» con chips «Exacto», «S/ 20», «S/ 50», «S/ 100», «Otro» y las reglas de
     billete y vuelto de CUS-CHK-008. Si el vuelto de la noche es 0: «Esta noche el negocio no tiene vuelto».
   - **Billetera digital:** sin logos de Yape ni Plin en la opción (decisión de Jesús, 2026-11-16): ícono genérico de
     billetera. «Pagar ahora» muestra la línea «Opcional: sube tu captura cuando el local acepte».
4. **Resumen:** «Envío S/ [ENVÍO]» y «Total S/ [TOTAL]» (CUS-CHK-001; envío tachado si hay promo, CUS-CHK-016).
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
CA-CHK-P1 · Confiable con billetera: «Al recibir» es la opción por defecto
  Dado un cliente con decisión trusted y un negocio que acepta prepago
  Cuando elige «Billetera digital»
  Entonces el selector muestra «Al recibir» marcado y «Pagar ahora» disponible
  Y confirmar sin tocar el selector crea el pedido con pago al recibir

CA-CHK-P2 · No confiable: el motivo se dice una vez
  Dado un cliente con decisión risk_blocked
  Cuando abre «¿Cómo pagas?»
  Entonces solo «Billetera digital por adelantado» se puede elegir
  Y «Efectivo» y «Billetera digital al recibir» aparecen en gris con candado
  Y el texto «Por pedidos anteriores sin recibir» aparece exactamente una vez

CA-CHK-P3 · La opción no elegida ocupa una línea
  Dado «Efectivo» elegido
  Entonces «Billetera digital» se muestra en una sola fila, sin subtítulo
```

Los escenarios CA-CHK-01…05 de `requisitos/CHK.md` también aplican.

## Movimiento

Botón: escala 0,97 al tocar. Opción elegida: se expande en 200 ms. Opciones en gris: si se tocan, la línea del motivo
vibra 150 ms. Al confirmar: check animado y paso al seguimiento. Respeta «reducir movimiento».

## Pendiente (va a `decisiones-abiertas.md`)

- Texto del caso `no_history` → `validando` (la cajera llama): no está diseñado.
- Variante de **recojo** (pregunta «¿Vas al local ahora?», CUS-CHK-004) no tiene maqueta v3.
- La maqueta v3 quitó el **subtotal** y el chip **S/ 20**: confirmar con Jesús si se mantienen (el código los tiene).
