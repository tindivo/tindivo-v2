# ADM · Panel de administración (`apps/admin`)

> **Nivel de detalle: capacidad.** Formato y leyendas: [`00-formato-y-convenciones.md`](00-formato-y-convenciones.md).
> Es el panel del equipo de Tindivo (≈ 14,4 k líneas, **26 páginas**, 40 rutas de API `role:admin`).
> **Disposición por defecto: `SOLO-WEB · W`** — es una herramienta de escritorio de uso interno con
> mapas de edición, tablas y reportes; no hay razón para llevarla a nativo. Lo importante aquí es
> **qué configura para los demás** (sección final): el Customer depende de ello.

## Navegación actual (`lib/nav.ts`)

**Operaciones:** Dashboard · Pedidos · Monitoreo online · Métricas —
**Casos:** Apelaciones · Casos —
**Finanzas:** Efectivo · Cobros —
**Gestión:** Negocios · Reseñas · Motorizados · Agenda · Zonas de cobro · Referencias del mapa —
**Sistema:** Strikes · Auditoría · Configuración.

## ADM-OPE · Operación y métricas

| ID | Capacidad | Reglas clave | Fuente (ruta API) | Est. | Móvil |
|---|---|---|---|---|---|
| ADM-OPE-001 | **Listar y ver** cualquier pedido con su historial, eventos, cargos y strikes. | Solo lectura salvo las acciones de abajo. | `GET /admin/orders`, `/admin/orders/:id` | ✅ | SOLO-WEB · W |
| ADM-OPE-002 | **Cancelar** un pedido (también en `picked_up`, con advertencia). | Usa `advance_order`. | `POST /admin/orders/:id/cancel` | ✅ | SOLO-WEB · W |
| ADM-OPE-003 | **Corregir la banda** de distancia de un pedido (`near/far`). | Recalcula el envío y el libro; auditado. | `PATCH /admin/orders/:id/distance-band`; `admin_correct_delivery_band` | ✅ | SOLO-WEB · W |
| ADM-OPE-004 | Ver la **captura de un prepago**. | URL firmada. | `GET /admin/orders/:id/prepay-proof` | ✅ | SOLO-WEB · W |
| ADM-OPE-005 | **Métricas** del negocio: pedidos, ingresos, series, desglose por forma de pago, punto de equilibrio (~10 pedidos/noche). | `admin_metrics` (8 KB de SQL). | `GET /admin/metrics` | ✅ | SOLO-WEB · W |
| ADM-OPE-006 | **Monitoreo online**: pedidos del canal cliente y **conversión** (embudo). | Separado por canal; base del objetivo «más autoservicio». | `GET /admin/online-stats`, `/admin/conversion-stats` | ✅ | SOLO-WEB · W |
| ADM-OPE-007 | Estadísticas de la **promo** de envío gratis. | `admin_promo_free_delivery_stats`. | `GET /admin/promo` | 🗑️ | SOLO-WEB · W |

## ADM-CAS · Casos, apelaciones y fraude

| ID | Capacidad | Reglas clave | Fuente (ruta API) | Est. | Móvil |
|---|---|---|---|---|---|
| ADM-CAS-001 ★ | Gestionar **apelaciones** de comprobante: listar, marcar en revisión, **resolver** (a favor del cliente o del restaurante) y **registrar el reembolso**. | A favor del restaurante = **strike automático** («intento de fraude»); el reembolso exige captura del Yape/Plin enviado y que el monto coincida con el total; las tres RPC validan `auth.uid()` y rol admin. | `/admin/appeals*`; `resolve_appeal`, `register_appeal_refund`, `mark_appeal_in_review` | ✅ | SOLO-WEB · W |
| ADM-CAS-002 | Bandeja de **reportes/casos** y su resolución. | Tipos: `no_show`, `rejected_proof_disputed`, `cash_difference`, `restaurant_fake`, `strike_reactivation`, `advance_dispute`, `prepay_refund_review`. | `/admin/reports*` | ✅ | SOLO-WEB · W |
| ADM-CAS-003 | Revisar **incidentes** reportados por motorizados. | `review_customer_incident`. | `/admin/incidents*` | ✅ | SOLO-WEB · W |
| ADM-CAS-004 | Resolver **reclamos de cobertura de fraude** de negocios. | `resolve_fraud_claim`. | `/admin/fraud-claims*` | ✅ | SOLO-WEB · W |
| ADM-CAS-005 | Ver **strikes** por teléfono y dirección. | 2 → contraentrega bloqueada; 3 → bloqueo ⚙ 30 días; no hay botón «paga y vuelve». | `GET /admin/strikes` | ✅ | SOLO-WEB · W |

## ADM-FIN · Finanzas

| ID | Capacidad | Reglas clave | Fuente (ruta API) | Est. | Móvil |
|---|---|---|---|---|---|
| ADM-FIN-001 | **Cobros** a negocios: resumen, cargos, historial y **liquidar**. | Liquidación semanal **manual**; libro `business_charges`; `balance_due` derivado. | `/admin/charges*`; `settle_business_charges` | ✅ | SOLO-WEB · W |
| ADM-FIN-002 | **Efectivo**: ver y **resolver** discrepancias motorizado↔negocio. | `resolve_cash_settlement`; monto final. | `/admin/cash-settlements*` | ✅ | SOLO-WEB · W |
| ADM-FIN-003 | **Bloquear / desbloquear** un negocio (con motivo, p. ej. por deuda). | Un negocio suspendido no recibe pedidos, ni por enlace directo (`trg_orders_business_not_blocked`). | `POST /admin/businesses/:id/block|unblock` | ✅ | SOLO-WEB · W |

## ADM-GES · Gestión

| ID | Capacidad | Reglas clave | Fuente (ruta API) | Est. | Móvil |
|---|---|---|---|---|---|
| ADM-GES-001 | **Negocios**: alta, edición, presets «Delivery Tindivo» / «Solo catálogo (WhatsApp)», color de papelito, capacidades. | Único punto de control de capacidades y color (validado en servidor). | `/admin/businesses*` | ✅ | SOLO-WEB · W |
| ADM-GES-002 | **Motorizados**: alta, edición, asignar restaurantes. | Alta crea `users` + `user_roles` + `drivers`; si falla, hace rollback con `deleteUser`. | `/admin/drivers*` | ✅ | SOLO-WEB · W |
| ADM-GES-003 | **Zonas de cobro**: polígonos `near`/`far`. | Leaflet-draw; las lee el cliente para el envío. | `/admin/delivery-zones` | ✅ | SOLO-WEB · W |
| ADM-GES-004 | **Referencias del mapa** (puntos de interés). | `map_landmarks` (43); categorías fijas. | `/admin/map-landmarks` | ✅ | SOLO-WEB · W |
| ADM-GES-005 | **Reseñas**: ver nota, etiquetas y **texto** (solo el admin lo lee). | Se lee por API con *service-role* (si se lee por RLS, el texto desaparece sin error). Nada es público; la nota del motorizado **jamás** se publica. | `GET /admin/reviews`; `DECISIONS.md §28` | ✅ | SOLO-WEB · W |
| ADM-GES-006 | **Agenda** de contactos. | — | `app/agenda` | ✅ | SOLO-WEB · W |

## ADM-SIS · Sistema

| ID | Capacidad | Reglas clave | Fuente (ruta API) | Est. | Móvil |
|---|---|---|---|---|---|
| ADM-SIS-001 ★ | **Configuración** de `app_settings`: plazos, umbral de prepago, comisiones, bandas, cobertura, vuelto, horario de la plataforma, límite de crédito, strikes, validación. | Es **la fuente de todos los ⚙ del catálogo**. `PATCH /admin/settings`. | `/admin/settings` | ✅ | SOLO-WEB · W |
| ADM-SIS-002 | **Auditoría** de pedidos (`order_event_log`, inmutable). | — | `GET /admin/audit` | ✅ | SOLO-WEB · W |
| ADM-SIS-003 | **Impersonar** a un usuario («Modo Dios», enlace mágico). | ⚠️ Sin registro de auditoría ni MFA (`SEC-06`). | `POST /admin/impersonate/:userId` | ⚠️ | SOLO-WEB · W |

---

## Lo que el Customer consume de esta app (configuración remota)

Estos parámetros los edita el admin y **la app de cliente los debe leer del servidor**, no llevarlos
escritos (`MOB-02`, `DAT-07`):

| Clave / dato | Valor (2026-09-20) | Usado en |
|---|---|---|
| `timers` | acceptance 8 · payment 15 · prepayVerification 10 · validation 5 · noShowWait 5 · queueLead 10 · travel 20-25 · transferTtl 30 s · deliveryLate 20 · prepExtension 10 (máx. 2) | `CUS-TRK-004/005`, `CUS-CHK-015` |
| `prepay_threshold` | 80 | `CUS-CHK-007` |
| `max_cash_bill` / `max_change` | 100 / 50 | `CUS-CHK-008` |
| `delivery_bands` | near 2.00 · far 2.50 | `CUS-ADR-012` |
| `coverage_polygon` / `coverage` / `location_validation` | polígono San Jacinto; centro (-9.1465, -78.2779); precisión 500 m; aviso a 30 km | `CUS-ADR-003`, `CUS-CHK-009` |
| `platform_schedule` / `order_intake_cutoff` | 18:00-23:00 todos los días / «22:30» | saludo, horario |
| `strikes` | bloqueo 2 / temporal 3 / 30 días | `CUS-CHK-007` |
| `reviews` | etiquetas, `windowDays` 21, comentario 400 | `CUS-REV-*` |
| `support_whatsapp`, `terms_version` | número; «2026-05» | `CUS-SUP-*` |
| `delivery_zones` (tabla) | zonas `far` activas | `CUS-ADR-012` |
| `map_landmarks` (tabla) | 43 puntos | `CUS-ADR-008` |
| Capacidades y color por negocio | `accepts_web_*`, `catalog_only`, `accent_color` | `CUS-CAT-*` |
