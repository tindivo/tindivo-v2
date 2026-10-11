# NEG · App de negocios / cajera (`apps/negocios`)

> **Nivel de detalle: capacidad.** El Customer es lo que se reescribe primero (`CUS-cliente.md`, a nivel
> de especificación); esta app se cataloga por **qué hace y qué reglas sostiene**, con lo suficiente
> para decidir qué va a móvil (fase M3) y para conocer **lo que el Customer consume de ella**.
> Es la app más grande del sistema (≈ 29,6 k líneas, 12 páginas, 103 accesos directos a tablas).
> Formato y leyendas: [`00-formato-y-convenciones.md`](00-formato-y-convenciones.md).
>
> **Contexto que cambia la prioridad:** **619 de los 716 pedidos** entran por esta app (la cajera
> teclea lo que le dicen por teléfono). El Customer es el 13,5 %. La migración móvil del cliente busca
> **desplazar** parte de ese tecleo hacia el autoservicio; por eso esta app **no debe romperse**.

## Páginas actuales

`/` (tablero) · `/nuevo` (pedido manual) · `/efectivo` · `/deuda` (+ `/deuda/devoluciones/[id]`) ·
`/historial` · `/menu` (+ `/menu/extras`, `/menu/item/[id]`) · `/rendimiento` · `/resenas` ·
`/configuracion`.

**Disposición por defecto:** `DIFERIR · M3` (candidata a nativo, a decidir); lo dependiente del
navegador es `SOLO-WEB · W`; lo del sonido y las alertas es `ADAPTAR · M3`.

> **Cambio por `D-30` (2026-09-20):** Negocios pasa a ser **la primera app nativa, solo Android, y es lo más urgente**.
> Las filas marcadas «DIFERIR · M3» que entran en el primer alcance (`NEG-TAB-001…010`, `012` y `013`,
> `NEG-MAN-001…004` y `006`, `NEG-APE-001…002`, `NEG-EFE-001`, `NEG-CFG-004`; ver
> [`05-arranque/03-plan-de-ejecucion.md`](../05-arranque/03-plan-de-ejecucion.md) §7) se ejecutarán **antes** que
> Customer M2. Se reclasificarán al subir este documento a nivel de requisito (paso **N0**); la matriz generada aún
> refleja la clasificación anterior. Dato: entre los usuarios de negocio con push hay 2 en Android, 3 en Windows,
> 2 en Mac y 1 en iPhone; quien use escritorio o iPhone seguirá con la web.

---

## NEG-TAB · Tablero de pedidos

| ID | Capacidad | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| NEG-TAB-001 | Tablero en tiempo real con columnas **Nuevos**, **En cocina** y **En reparto** (solo monitoreo, con reloj desde la recogida) y una pestaña **Entregados** (hoy); filtro Todos / Delivery / Recojo. | En tablet cae a la vista móvil; **no hay cuarta columna** (aprieta el escritorio a 1280 px). | `components/dashboard/pedidos-view.tsx:177-180,531-698`; `DECISIONS.md §8` | ✅ | DIFERIR · M3 |
| NEG-TAB-002 ★ | Ordenar «En cocina» por **urgencia**: P1 crítico (`buffer_p3` 15 min+ sin moto, cocina retrasada, espera > 10 min), P2 atención, P3 normal por tiempo restante; las críticas se dibujan expandidas. | Umbral de escalada ⚙ `queueLeadMinutes`. | `lib/orders/view-model.ts` (`getUrgencyTier`); `DECISIONS.md §24` | ✅ | DIFERIR · M3 |
| NEG-TAB-003 ★ | **Aceptar** un pedido con el tiempo de preparación. | 1-120 min. Contraentrega → `preparing`; **prepago → `awaiting_payment`** (el cliente paga); recojo «ahora» → la cajera **cobra en el mismo modal** (`paymentReal = paid_cash | paid_yape`). | `api/.../business/orders/[id]/transition`; `advance_order('accept')`; `DECISIONS.md §8` | ✅ | DIFERIR · M3 |
| NEG-TAB-004 | **Rechazar/cancelar** con motivo. | `cancelReasonDetail` obligatorio en cancelaciones de negocio; códigos `out_of_stock, closed, out_of_zone, invalid_proof, no_answer, other`. | `apps/api/lib/http/order-transition.ts:17-83` | ✅ | DIFERIR · M3 |
| NEG-TAB-005 ★ | **Validar el comprobante** de un prepago (aprobar o rechazar con motivo) viendo la captura. | Ventana ⚙ `prepayVerificationMinutes` (10); **máx. 2 intentos**; primer rechazo devuelve a `awaiting_payment`; al segundo, `proof_rejected_final`. La captura se ve por URL firmada. | `POST /business/orders/:id/validate`; `GET .../prepay-proof`; `validate_order` | ✅ | DIFERIR · M3 |
| NEG-TAB-006 ★ | **Validar por llamada** un pedido retenido por antifraude (`validando`). | Cliente nuevo, monto grande o con strike; ⚙ 5 min; `reason_code`; `request-validation` para pedir la validación. | `.../request-validation`; `validate_order` | ✅ | DIFERIR · M3 |
| NEG-TAB-007 | **Extender** el tiempo de preparación. | +⚙ 10 min, **máx. 2 veces**; notifica al motorizado. | `POST .../extend-prep`; `extend_order_prep` | ✅ | DIFERIR · M3 |
| NEG-TAB-008 ★ | Marcar **«Pedido listo»**. | Recorta `estimated_ready_at` a `now() + queue_lead_minutes` (⚙ 10); `ready_early_used` **no oculta** el contador; copy distinto según responsabilidad («Lista · esperando moto mm:ss»). | `advance_order('ready')`; `DECISIONS.md §23` | ✅ | DIFERIR · M3 |
| NEG-TAB-009 ★ | Cerrar un **recojo**: «Se lo llevó» (`handover`) o «Nadie vino» (`pickup_no_show`). | `handover` → `delivered` + comisión de recojo; `pickup_no_show` → `cancelled/no_show`, **sin strike si estaba pagado**; suelo `noShowWaitMinutes` desde `ready_for_pickup_at`. Una bolsa en el mostrador **no se autocancela**. | `advance_order`; `DECISIONS.md §5, §8` | ✅ | DIFERIR · M3 |
| NEG-TAB-010 | **Avisar por WhatsApp** que el recojo está listo. | Abre `wa.me` con mensaje que se presenta y lleva el `short_id`; el monto solo si hay algo que cobrar; **no promete plazos**; sella `tracking_link_sent_at/by`; se puede repetir («Avisado hh:mm»). | `POST .../notify-pickup`; `mark_pickup_notified` | ✅ | DIFERIR · M3 |
| NEG-TAB-011 | Detalle del pedido con acciones según estado; **imprimir** el ticket. | Menú de impresión. | `components/dashboard/pedido-detail*`; `print-dropdown.tsx` | ✅ | SOLO-WEB · W |
| NEG-TAB-012 | Contador de cocina en `mm:ss` (≥ 60 min → `Xh Ym`) con color por umbral. | Concordancia con la app del motorizado. | `DECISIONS.md §23` | ✅ | DIFERIR · M3 |
| NEG-TAB-013 | **Alarma sonora y vibración** ante pedido nuevo; comprobación de sonido y salud del canal. | Depende de un `AudioContext` que el navegador suspende; si no hay suscripción push, el aviso no llega. | `lib/use-audio-alert.ts`; `components/sound-check.tsx`; `hooks/use-channel-health.ts`, `use-push-status.ts` | ⚠️ | ADAPTAR · M3 |
| NEG-TAB-014 | Modo catálogo: navegación reducida a Menú y Configuración. | Salvo pedidos en vuelo al cambiar de modo. | `DECISIONS.md §18` | ✅ | DIFERIR · M3 |

## NEG-MAN · Pedido manual (el canal principal hoy)

| ID | Capacidad | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| NEG-MAN-001 ★ | Crear un pedido tecleando el **total** (con envío incluido). | **Entra el TOTAL, sale la comida:** `order_amount = total − delivery_fee` en la RPC; un total que no cubre el envío se rechaza con ambos números; zona **near/far obligatoria** y **sin precios visibles**; nombre del cliente **obligatorio**; nace en `preparing`. | `app/nuevo`; `features/nuevo/*`; `create_business_manual_order`; `DECISIONS.md §22` | ✅ | DIFERIR · M3 |
| NEG-MAN-002 | Autocompletar la **dirección por el teléfono**. | Desde `address_directory` (908 filas); la cajera la escribe una sola vez; `source = business_created`. | migraciones 0144, 0145; `address_directory` | ✅ | DIFERIR · M3 |
| NEG-MAN-003 | Registrar el **vuelto**. | `client_pays_with`, `change_to_give`, `change_advanced`; ver el sencillo disponible de la noche. | 0131, 0146, 0185 | ✅ | DIFERIR · M3 |
| NEG-MAN-004 ★ | **Editar** un pedido manual con concurrencia optimista. | `p_expected_updated_at`; motivo; auditoría. | `PATCH /business/orders/:id`; `update_business_manual_order` | ✅ | DIFERIR · M3 |
| NEG-MAN-005 | Pago **mixto** (efectivo + billetera). | Solo en manual; en el canal cliente no existe. | `create_business_manual_order` | ✅ | DIFERIR · M3 |
| NEG-MAN-006 | El pedido manual **no tiene idempotencia**. | Un doble toque o reintento duplica (`DAT-01`). | `POST /business/orders` | ⚠️ | DIFERIR · M3 |

## NEG-APE · Apertura, pausa y horario

| ID | Capacidad | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| NEG-APE-001 ★ | **Declarar la apertura del día**. | Una fila por `service_date` (una noche es un día, 0176). Sin ella, los pedidos web se rechazan (`CUS-CAT-013`). | `features/apertura/*`; `lib/opening/service-day.ts` | ✅ | DIFERIR · M3 |
| NEG-APE-002 | **Pausar y reanudar** la recepción de pedidos. | `POST/DELETE /business/pause`; `accepting_orders_until` significa «pausado hasta» (el nombre miente); no afecta al botón de WhatsApp. | `pause_business_orders`, `resume_business_orders` | ✅ | DIFERIR · M3 |
| NEG-APE-003 | Editar el **horario semanal** (turno 1 y 2, cruce de medianoche). | `day_of_week` 0=lunes; el cálculo lo hace `getOpenStatus`. | `features/configuracion/*`; `business_schedule` | ✅ | DIFERIR · M3 |

## NEG-MEN · Menú

| ID | Capacidad | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| NEG-MEN-001 | Categorías: crear, ordenar, activar. | Las vacías no las ve el cliente. | `app/menu`; `features/menu/*` | ✅ | DIFERIR · M3 |
| NEG-MEN-002 | Platos: nombre, descripción, precio, foto, etiquetas, destacado, agotado, orden y **borrado lógico**. | Foto: compresión perfil `product` (1200 px), bucket `menu-items` (3 MB, webp/jpeg/png); el plato que sale del menú **conserva su historia** (0152); `is_compact` significa «destacado». | `features/menu/item-edit/*` (21 ficheros); `packages/images` | ✅ | DIFERIR · M3 |
| NEG-MEN-003 | Grupos de modificadores y opciones, con biblioteca de extras reutilizable. | `single/multi`, obligatorio, `min/max`, `price_display` `delta|total` (0156); precio adicional; disponibilidad. | `app/menu/extras`; `features/menu/modifiers/*` | ✅ | DIFERIR · M3 |
| NEG-MEN-004 ★ | **Franja horaria** de un plato. | Días 0=lun…6=dom, desde/hasta; no toca `is_available` (dos hechos, dos columnas). | 0226; `contracts/menu-availability.ts` | ✅ | DIFERIR · M3 |
| NEG-MEN-005 | **Envío gratis por plato** y tope de tarifa. | La decide `create_customer_order`; el cliente solo la muestra (`CUS-CHK-016`). | 0227, 0228, 0229, 0230 | ✅ | DIFERIR · M3 |

## NEG-CFG · Configuración del local

| ID | Capacidad | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| NEG-CFG-001 | Editar datos del negocio (nombre, eslogan, dirección, WhatsApp público, ETA, tarifas). | **No** puede cambiar capacidades ni color: lo hace solo el admin (validado en servidor). | `PATCH /business/profile`; `DECISIONS.md §18, §21` | ✅ | DIFERIR · M3 |
| NEG-CFG-002 ★ | Gestionar las **cuentas de cobro Yape/Plin** y su QR. | Hasta `MAX_PAYMENT_QRS`; una predeterminada + **QR de reserva** (0184); el QR se guarda **sin pérdida**; lo ve el cliente en el prepago. | `GET/PUT/PATCH/DELETE /business/payment-qrs`; `contracts/payment-qr.ts` | ✅ | DIFERIR · M3 |
| NEG-CFG-003 | Ver las capacidades del negocio (solo lectura). | Secciones ocultas por modo (`hiddenFor`). | `app/configuracion/page.tsx` | ✅ | DIFERIR · M3 |
| NEG-CFG-004 | Declarar el **sencillo** (vuelto) disponible esa noche. | Alimenta `effective_max_change`, que limita lo que el cliente puede pagar con billete grande. | 0185; `effective_max_change` | ✅ | DIFERIR · M3 |

## NEG-EFE · Efectivo · NEG-DEU · Deuda · resto

| ID | Capacidad | Reglas clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| NEG-EFE-001 ★ | **Confirmar o discrepar** el efectivo que entrega el motorizado, cliente por cliente. | Una liquidación por pedido (0157); confirma con el monto real; la discrepancia va al admin y avisa al motorizado. | `POST /business/cash-settlements/:id/confirm|dispute` | ✅ | DIFERIR · M3 |
| NEG-DEU-001 | Ver **saldo y deuda** con Tindivo. | `balance_due` derivado del libro `business_charges` (trigger de recálculo); límite ⚙ `debt_block_threshold` (600) **solo avisa**; el bloqueo lo decide un admin. | `app/deuda`; `GET /business/account/summary` | ✅ | DIFERIR · M3 |
| NEG-DEU-002 | Ver el detalle de una **devolución** (apelación aprobada). | Comprobante por URL firmada. | `/business/account/refunds/[id]` | ✅ | DIFERIR · M3 |
| NEG-HIS-001 | **Historial** de pedidos con filtros. | — | `app/historial`; `lib/order-history` | ✅ | DIFERIR · M3 |
| NEG-REN-001 | **Panel de rendimiento** con comparación consigo mismo y meta. | `business_performance_metrics` (13 KB de SQL); 0210, 0222. | `app/rendimiento`; `packages/core/src/reports` | ✅ | DIFERIR · M3 |
| NEG-REN-002 | **Reporte PDF** de rendimiento. | Chromium serverless; fuentes embebidas; la rama de producción no se puede probar en Windows. | `apps/api/lib/pdf/*`; `/business/reports/rendimiento/pdf` | ✅ | SOLO-WEB · W |
| NEG-RES-001 | Ver las **reseñas**: nota y etiquetas, **nunca el texto**. | `GRANT` por columna (0217). | `app/resenas`; 0215-0218 | ✅ | DIFERIR · M3 |
| NEG-FRA-001 | **Reclamar cobertura** de un pedido falso. | `POST /business/fraud-claims` (idempotente); Tindivo cubre ⚙ 50 % con tope mensual ⚙ 200. | `create_fraud_claim`; `app_settings.fraud_coverage` | ✅ | DIFERIR · M3 |

---

## Lo que el Customer consume de esta app

| Dato/Acción del negocio | Quién lo lee en el Customer | Requisito |
|---|---|---|
| Catálogo: categorías, platos, modificadores, precios, franja, agotado | Ficha, bolsa, validación | `CUS-CAT-005…011`, `CUS-CRT-005` |
| Horario y **apertura del día**; pausa | Estado abierto/cerrado y rechazo 409/403 | `CUS-CAT-012…014` |
| Aceptar / rechazar / cancelar / listo / handover | Estados y avisos del seguimiento | `CUS-TRK-002…010` |
| Validación de comprobante | Prepago: etapas, reintento, apelación | `CUS-PAY-*` |
| Cuenta de cobro y QR | Datos de pago del prepago | `CUS-PAY-002` |
| Vuelto de la noche | Tope de efectivo | `CUS-CHK-008` |
| Capacidades (`accepts_web_*`, `catalog_only`, WhatsApp) | Selector de método y modo catálogo | `CUS-CAT-015…017` |
