# Ronda 2: dinero (solo el diff)

Rama `docs/canon-dinero`, commit `81f9d43` (base de tu ronda 1: `b8a4f88`). No cambiaré de rama en este worktree
mientras lees (en la ronda 1 lo hice: fallo mío).

Apliqué tus cambios. Datos nuevos de `tindivo-prod` (crudos):

```
pagos que no cuadran con sus cargos vinculados: 0 · cargos settled sin payment_id: 0
único refund_charge: pedido GWYVM24F, cancel_reason=business_cancelled, payment_intent=prepaid,
  payment_proof_status=verified, total 20.50 = cargo 20.50, report_id NULL, creado 2026-08-21, liquidado 2026-08-30
advance_order rama 'pickup' (líneas 188-195 vivas):
  -- La banda ya no la declara el motorizado (0120): sale del pedido, que es donde la dejará el cálculo por
  -- ubicación (web) o la cajera (manual). El parámetro se sigue aceptando para no romper llamadas existentes.
  v_band := COALESCE((p_params ->> 'band')::distance_band, v_order.delivery_distance_band, 'near')
app_settings.fraud_coverage = {"maxMonthlyCoverage":200,"tindivoCoveragePercentage":50}; ninguna función viva lo lee
app_settings.promo_free_delivery.active = false · update_business_manual_order existe
```

Ataca solo: ¿quedó mal aplicado alguno de tus cambios? ¿Algo nuevo del diff es falso? Respuesta corta. Veredicto.

```diff
diff --git a/Docs/negocio/dinero.md b/Docs/negocio/dinero.md
index 8119499..05479f0 100644
--- a/Docs/negocio/dinero.md
+++ b/Docs/negocio/dinero.md
@@ -1,10 +1,12 @@
 # Dinero: quién paga qué, quién le debe a quién y cómo se cuadra
 
 > Verificado: 2026-10-10 · entorno: `tindivo-prod` (solo lectura: definiciones vivas de las funciones y conteos) +
-> `develop@7d00aa4` · Principios: `Docs/negocio/plataforma.md` · Nombres: `Docs/glosario.md`
+> `develop@7d00aa4` · Principios: `Docs/negocio/plataforma.md` · Nombres: `Docs/glosario.md` · Revisado por Codex
+> (`Docs/trabajo/squash/debate/02-codex-dinero.md`)
 
 Todo cambio en lo que describe este archivo requiere la revisión de Jesús antes de aplicarse (`AGENTS.md`,
-invariante 9).
+invariante 9). Este archivo describe **lo que hace el sistema**; lo que todavía no aprobó Jesús está marcado y
+preguntado en `Docs/trabajo/squash/preguntas-dinero.md`.
 
 ## En una frase
 
@@ -25,33 +27,42 @@ Mandan los valores de `app_settings`, no este archivo; al 2026-10-10:
 | Transporte de **Entregas** | S/ 3.00 | `courier.pricing.basePrice` | El cliente, a Tindivo (vía el motorizado) |
 
 - Un negocio puede tener comisión propia (`businesses.commission_override_delivery` / `_pickup`); hoy ninguno la tiene.
-- **La banda la declara el motorizado al recoger.** Si se equivocó, Jesús la corrige mientras el cargo de envío siga
-  sin liquidar (`admin_correct_delivery_band`): se recalcula el envío y el monto de la comida, nunca el total que pagó
-  el cliente.
-- **Toda la historia de producción** cobró S/ 1.50 de comisión por pedido con entrega y S/ 1.00 por recojo.
+- En todas las semanas con cargos, desde la primera (2026-08-03), la comisión fue S/ 1.50 por pedido con entrega y
+  S/ 1.00 por recojo. `DECISIONS.md §4` dice S/ 1.00: **pendiente de confirmar** (pregunta 1 de plataforma).
+- **La banda (cerca o lejos) la fija el pedido**, no el motorizado (desde la `0120`): la calcula el sistema por
+  ubicación en los pedidos de la app y la pone la cajera en los manuales. Al recoger, el motorizado no recalcula el
+  envío ya guardado. Después de entregar, Jesús puede corregir la banda mientras el cargo de envío siga pendiente
+  (`admin_correct_delivery_band`): cambia el reparto entre comida y envío y conserva el total que pagó el cliente.
+- Antes de que el motorizado llegue al local, la cajera puede modificar el total y la forma de pago de un pedido manual
+  (`update_business_manual_order`).
 
 ## La deuda del negocio con Tindivo
 
-1. **Al entregar** un pedido, un trigger (`generate_delivery_charges`) crea en `business_charges` dos cargos
-   `pending`: el **envío** que cobró (`delivery_fee`) y la **comisión** (`commission`). Un pedido cancelado no crea
-   ninguno.
+1. **Al entregar**, un trigger (`generate_delivery_charges`) crea en `business_charges` un cargo `pending` por cada
+   importe positivo: el **envío** cobrado (`delivery_fee`) y la **comisión** (`commission`). El recojo y el envío gratis
+   no generan cargo de envío. Un pedido cancelado no genera estos cargos, pero puede generar uno de reembolso (abajo).
 2. **La deuda** (`businesses.balance_due`) es la suma de los cargos `pending`. Es derivada: la recalcula un trigger
    (`recalc_business_balance`) con cada cambio en los cargos; nadie la escribe a mano.
 3. **El pago:** cuando el negocio paga (Yape, efectivo u otro), Jesús lo registra eligiendo los cargos exactos que
    cubre (`settle_business_charges`). El monto tiene que coincidir al céntimo con la suma de esos cargos; queda un
-   `restaurant_payments` y los cargos pasan a `settled`.
-4. **No hay bloqueo automático por deuda.** El pago desbloquea a un negocio marcado `blocked_for_debt`, pero nada en la
-   base ni en la API lo marca (comprobado). Tampoco hay una fecha fija de liquidación: se liquida cuando el negocio paga.
-
-Medido al 2026-10-10: S/ 3,144.50 en cargos liquidados y S/ 273.00 pendientes entre los cuatro aliados. Los 23 pagos
-registrados suman S/ 3,165.00, que es lo liquidado más un reembolso de S/ 20.50: **cuadra al céntimo**.
+   `restaurant_payments` y los cargos pasan a `settled`. El código no fija una periodicidad: se liquida cuando el
+   negocio paga (`DECISIONS.md §4` dice «semanal»: pendiente de confirmar).
+4. **Bloqueo por deuda: solo manual.** Jesús puede suspender a un negocio y marcar que es por deuda
+   (`block_business(…, p_for_debt)`, `0180`); registrar un pago levanta esa marca solo si la deuda queda en cero o
+   menos. No hay corte automático: la `0178` lo introdujo y la `0179` lo retiró como decisión de producto, porque
+   dejaba a un negocio sin vender un viernes por la noche sin que nadie lo hubiera decidido. `debt_block_threshold`
+   (S/ 600) es un aviso que ve el negocio, no un corte.
+
+Medido al 2026-10-10: S/ 3,165.00 liquidados (S/ 3,144.50 de comisión y envío más S/ 20.50 de reembolso) y S/ 273.00
+pendientes entre los cuatro aliados. Los 23 pagos registrados suman S/ 3,165.00 y **cada pago coincide al céntimo con
+los cargos que liquidó**; no hay cargos liquidados sin pago.
 
 ## Promociones de envío gratis
 
-En un pedido con envío gratis (`delivery_fee_source = 'promo'`), el cliente no paga envío y **al negocio no se le carga
-envío**; la comisión se cobra igual. **El envío gratis lo absorbe Tindivo.** Hubo 16 pedidos así (promoción de
-lanzamiento de inicios de septiembre, hoy inactiva en `app_settings.promo_free_delivery`, y envío gratis por plato
-desde la `0227`).
+En los 16 pedidos entregados con `delivery_fee_source = 'promo'`, el envío al cliente y el cargo de envío al negocio
+fueron S/ 0.00, con comisión de S/ 1.50: **el envío gratis lo absorbió Tindivo**. El código contempla una promoción
+general (`app_settings.promo_free_delivery`, hoy `active: false`) y envío gratis por plato (`0227`); los datos no dicen
+qué promoción originó cada pedido.
 
 ## El efectivo del motorizado
 
@@ -60,38 +71,42 @@ desde la `0227`).
 - **Lo que rinde** por pedido = adelanto + parte en efectivo del pedido (`cash_owed_at_delivery`, que calcula
   `advance_order` al entregar desde la `0146`). Si el cliente paga exacto o por Yape, el motorizado devuelve el adelanto
   igual.
-- **La rendición es pedido a pedido**, no una liquidación diaria: el motorizado declara que entregó el efectivo
-  (`deliver_order_cash` → un `cash_settlements` en `pending_confirmation`, con la fecha de servicio); el negocio lo
-  confirma (`confirm_order_cash`) o lo disputa con lo que contó (`dispute_cash_settlement`, que abre un reporte
-  `cash_difference`); Jesús resuelve la disputa con un monto (`resolve_cash_settlement`).
+- **La rendición es pedido a pedido**: el motorizado declara que entregó el efectivo (`deliver_order_cash` → un
+  `cash_settlements` en `pending_confirmation`, con la fecha de servicio); el negocio lo confirma (`confirm_order_cash`)
+  o lo disputa con lo que contó (`dispute_cash_settlement`, que abre un reporte `cash_difference`); Jesús resuelve la
+  disputa con un monto (`resolve_cash_settlement`). Quién cubre un faltante no lo dice el código.
+- **En un recojo no hay efectivo que rendir:** el negocio cobra en el mostrador, lo declara al aceptar o entregar, y
+  se genera la comisión de recojo.
 
-Medido al 2026-10-10: 340 rendiciones confirmadas (S/ 15,776.70), 1 pendiente y **ninguna disputa** en la historia.
+Medido al 2026-10-10: 340 rendiciones confirmadas (S/ 15,776.70), 1 pendiente y ninguna disputa.
 
 ## Reembolsos al cliente
 
-Tindivo no cobra al cliente, así que un reembolso sale del negocio. Tres caminos lo cargan a su deuda como
-`refund_charge`:
+El código registra tres caminos de **cargos de reembolso** (`refund_charge`) contra el negocio. **Registrar el cargo no
+ejecuta ninguna devolución**: quién le devuelve al cliente, y cuándo corresponde cargar la deuda con Tindivo, lo
+decide Jesús (preguntas 1 a 3).
 
-| Caso | Qué pasa | Función |
+| Caso | Qué registra el sistema | Función |
 |---|---|---|
-| El negocio, Jesús o el plazo de aceptación cancela un **prepago ya verificado** | Se carga automáticamente el total (comida + envío). No aplica si fue no-show o comprobante rechazado en firme | `handle_prepaid_refund_on_cancel` |
-| **Apelación aprobada**: el negocio rechazó por error un comprobante | Jesús le devuelve el total al cliente (con la captura del Yape o Plin) y se lo carga al negocio | `register_appeal_refund` |
-| **Reclamación de fraude** aprobada | Se carga el monto reclamado al negocio | `resolve_fraud_claim` |
+| El negocio, Jesús o el plazo de aceptación cancela un **prepago ya verificado** | Un cargo por el total (comida + envío). No aplica a no-show ni a comprobante rechazado en firme. Si el cargo falla, abre un reporte `prepay_refund_review` | `handle_prepaid_refund_on_cancel` |
+| **Apelación aprobada** (el negocio rechazó por error un comprobante) | Exige la captura del Yape o Plin enviado al cliente; carga el total al negocio | `register_appeal_refund` |
+| **Reclamación de fraude** aprobada | Carga el monto reclamado al negocio | `resolve_fraud_claim` |
 
-En toda la historia hubo **un** reembolso (S/ 20.50) y ninguna reclamación de fraude. Las preguntas sobre quién le
-devuelve al cliente en cada caso están en la sección de pendientes.
+Medido: un solo `refund_charge` en la historia, S/ 20.50, del pedido `GWYVM24F`: **el cargo automático** por un prepago
+verificado que canceló el negocio (2026-08-21; liquidado el 2026-08-30). Ninguna apelación con reembolso, ninguna
+reclamación de fraude.
 
 ## Tindivo Entregas
 
 El cliente paga los S/ 3 al motorizado al recoger o al entregar (según quién paga), en efectivo o Yape. El motorizado
-marca el cobro (`transport_collected_at`), lo rinde a Tindivo (`driver_remit_courier_fee` → `remitted_at`) y Jesús
-confirma haberlo recibido (`admin_confirm_courier_remittance`). El producto llega siempre pagado: el motorizado no lo
-cobra ni lo paga.
+registra el cobro al avanzar la entrega (`driver_courier_step` → `advance_courier_order`, `transport_collected_at`),
+lo rinde a Tindivo (`driver_remit_courier_fee` → `remitted_at`) y Jesús confirma haberlo recibido
+(`admin_confirm_courier_remittance`). El producto llega siempre pagado: el motorizado no lo cobra ni lo paga. Si una
+entrega se cancela después del cobro, el cobro se conserva y se puede rendir; el código no devuelve nada.
 
-Medido al 2026-10-10: 3 entregas, S/ 9.00 rendidos y **sin confirmar por Jesús**.
+Medido: 3 entregas con S/ 9.00 **declarados como rendidos** por el motorizado y sin confirmación de Jesús.
 
-## Pendientes
+## Tindivo Store
 
-Preguntas abiertas en `Docs/trabajo/squash/preguntas-dinero.md`: quién le devuelve al cliente en un prepago cancelado,
-el signo de la cobertura de fraude, si debe existir el bloqueo por deuda, el sueldo del motorizado y el punto de
-equilibrio.
+Store registra precio y estado vendido de cada producto; eso no es un cobro ni una liquidación. Quién cobra una venta
+de Store está preguntado.
diff --git a/Docs/trabajo/squash/preguntas-dinero.md b/Docs/trabajo/squash/preguntas-dinero.md
index 0ed9a11..58992da 100644
--- a/Docs/trabajo/squash/preguntas-dinero.md
+++ b/Docs/trabajo/squash/preguntas-dinero.md
@@ -1,53 +1,65 @@
 # Preguntas para Jesús: área de dinero
 
 > 2026-10-10 · Salen de escribir `Docs/negocio/dinero.md` desde las definiciones vivas de `tindivo-prod` (solo
-> lectura). Ninguna es un defecto activo: las rutas dudosas nunca se usaron o se usaron una vez. Se borra cuando estén
-> respondidas.
+> lectura), con la revisión de Codex. El uso escaso o nulo de una ruta no demuestra que no tenga defectos. Que el
+> sistema haga algo tampoco demuestra que esté aprobado: por eso las confirmaciones también son preguntas. Se borra
+> cuando estén respondidas.
 
 ## 1. Prepago verificado y cancelado: ¿quién le devuelve al cliente?
 
-`handle_prepaid_refund_on_cancel` carga al negocio el total del pedido como deuda **con Tindivo** cuando cancela un
-prepago que ya estaba verificado. Eso solo cuadra si **Tindivo** le devuelve el dinero al cliente. Si es el negocio
-quien le devuelve directamente (el Yape fue a su cuenta), con ese cargo pagaría dos veces.
+`handle_prepaid_refund_on_cancel` carga al negocio el total del pedido como deuda **con Tindivo** cuando se cancela un
+prepago ya verificado. Eso solo cuadra si **Tindivo** le devolvió el dinero al cliente; si el negocio le devolvió
+directamente (el Yape fue a su cuenta), con ese cargo pagó dos veces.
 
-Nunca ha ocurrido (el único reembolso de la historia fue por apelación). **Recomendación:** que el negocio le devuelva
-directamente al cliente y que el cargo automático desaparezca; el cargo a la deuda queda solo para cuando Jesús adelanta
-la devolución (apelaciones). **¿Cómo quieres que funcione?**
+**Ya pasó una vez:** pedido `GWYVM24F`, S/ 20.50, cancelado por el negocio el 2026-08-21; el cargo se liquidó el
+2026-08-30. **¿Quién le devolvió al cliente en ese caso?** Y para adelante: **¿quién devuelve, con qué evidencia y
+cuándo corresponde cargar deuda con Tindivo?** Recomendación: que el negocio devuelva directamente y que el cargo
+automático exista solo cuando Tindivo adelantó la devolución.
 
-## 2. La «cobertura de fraude» suma deuda al negocio
+## 2. Cobertura de fraude: ¿quién es el beneficiario y quién financia la pérdida?
 
-`resolve_fraud_claim`, al aprobar una reclamación, crea un `refund_charge` **positivo** contra el negocio: el negocio
-pasa a deber más. Si la cobertura existe para proteger al negocio de un cliente que lo estafó, el signo está al revés
-(debería restar deuda). Nunca se ha usado. **¿Para qué existe la cobertura de fraude?** Si no hay un caso de uso,
-recomiendo retirarla antes de que alguien la use.
+`app_settings.fraud_coverage` dice que Tindivo cubre el 50 % de la pérdida, hasta S/ 200 al mes, pero ninguna función
+lee esos valores. Y `resolve_fraud_claim`, al aprobar una reclamación, **suma** deuda al negocio. Nunca se ha usado.
+Recomendación: definir para quién es la cobertura y quién paga antes de cambiar el signo o retirar el flujo.
 
-## 3. Las apelaciones son la excepción a «no retener fondos»
+## 3. Apelaciones: ¿autorizas que Jesús adelante dinero propio y lo recupere del negocio?
 
-Con una apelación aprobada, Jesús le devuelve el dinero al cliente y se lo cobra al negocio por la deuda: Tindivo
-adelanta. Es lo que hacía el fondo de contingencia que se eliminó en la `0123`. **¿Lo aceptas como la única excepción
-del principio?** Si sí, se escribe así en el canon (hoy `plataforma.md` lo describe como «excepción viva en el
-código», sin aprobación tuya).
+`register_appeal_refund` exige la captura del Yape que Jesús le envió al cliente y carga el total al negocio. Adelantar
+dinero propio no es retener fondos del cliente, pero es la única forma en que Tindivo pone plata en el medio. Si lo
+autorizas, el principio de `plataforma.md` lo dirá así.
 
-## 4. Bloqueo por deuda
+## 4. Bloqueo por deuda: ¿solo manual?
 
-Existe la marca `blocked_for_debt` y el pago la quita, pero nada la pone: no hay bloqueo automático. **¿Quieres que lo
-haya?** (Con qué umbral o plazo.) Si no, recomiendo retirar la marca para que nadie crea que protege algo.
+Hoy es solo manual (`block_business` con `p_for_debt`, `0180`); el automático lo retiró la `0179` como decisión de
+producto, y `debt_block_threshold` (S/ 600) es solo un aviso. **¿Confirmas que así debe quedar?**
 
-## 5. Sueldo del motorizado y punto de equilibrio
+## 5. Comisión y periodicidad frente a `DECISIONS.md §4`
 
-`DECISIONS.md §4` dice: sueldo fijo de **~S/ 30 por noche** (no por entrega) y equilibrio en **~10 pedidos por noche**.
-La base no lo guarda. Hoy hay tres motorizados y ~17 pedidos entregados por noche de media. **¿Siguen valiendo?**
-(Misma pregunta que la 2 de plataforma: se responde una vez.)
+`§4` dice comisión de S/ 1.00 y liquidación de comisiones **semanal** y de efectivo **diaria**. Producción cobró
+siempre S/ 1.50, liquida cuando el negocio paga y rinde el efectivo pedido a pedido. **¿Confirmas lo que hace producción
+como regla vigente?** (Misma pregunta que la 1 de plataforma para la comisión.)
 
-## 6. Pendiente operativo (no es pregunta)
+## 6. Sueldo del motorizado y punto de equilibrio
 
-Hay **3 rendiciones de Entregas (S/ 9.00) sin confirmar**: el motorizado las rindió y falta tu confirmación en el
-panel de admin.
+`§4` dice ~S/ 30 por motorizado por noche y equilibrio en ~10 pedidos por noche; la base no lo guarda. **¿Sigue vigente
+el sueldo? ¿Con qué costos y con cuántos motorizados se calcula hoy el equilibrio?**
 
-## Lo que ya no es pregunta (documentación vieja, corregida en el canon)
+## 7. Faltantes de efectivo
 
-- **La comisión es S/ 1.50**, no S/ 1.00 (pregunta 1 de plataforma; evidencia: toda la historia de cargos).
-- **El efectivo se rinde pedido a pedido**, no en una liquidación diaria: 340 rendiciones, una por pedido.
-- **Las comisiones no se liquidan cada semana por regla**: se liquidan cuando el negocio paga.
-- **`advance_order` calcula bien lo que rinde el motorizado** desde la `0146` (la nota que decía lo contrario era de la
-  `0140`).
+Cuando el negocio disputa una rendición, Jesús la resuelve con un monto, pero el código no dice **quién cubre la
+diferencia**: el motorizado, el negocio o Tindivo. Nunca ha habido una disputa. **¿Quién la cubre?**
+
+## 8. Entregas cancelada después de cobrar
+
+Si una entrega se cancela después de que el motorizado cobró los S/ 3, el cobro se conserva y se rinde. **¿Se le
+devuelve al cliente? ¿Quién y cuándo?**
+
+## 9. Ventas de Store
+
+Store registra precio y estado vendido, pero no un cobro. **¿Quién cobra una venta de Store y cómo llega ese dinero
+(o la parte de Tindivo) a Tindivo?**
+
+## Pendiente operativo
+
+Hay **3 rendiciones de Entregas (S/ 9.00)** que el motorizado declaró haber rendido y que esperan tu confirmación en
+el panel de admin.

```
