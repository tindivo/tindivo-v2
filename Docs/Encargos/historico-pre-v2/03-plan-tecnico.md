# 03 · Plan técnico de Encargos

> v0.2 · 2026-09-18 (decisiones de Jesús incorporadas: precio fijo, cobro al recoger o al entregar, dinero al motorizado). Basado en lo leído en el repo ese día: migraciones hasta la `0228` (la siguiente libre es la **`0229`**, comprobar con `supabase migration list` antes de crearla), `DECISIONS.md`, apps `customer`, `motorizados` y `api`.
> Nada de esto está construido.

---

## 1. Decisión de fondo: tabla propia, no `orders`

El roadmap sugería añadir `delivery_type` a `orders`. Hoy no conviene. Lo comprobado:

- `orders.business_id` es **`NOT NULL`** (`0002`) y todo el agregado gira en torno a un negocio: aceptación, prepago, tiempos de cocina, comisión, `ord_driver_read`, triggers de deuda.
- **Ocho funciones escriben `orders.status`** y `DECISIONS`/`CLAUDE.md` (invariante 8) documentan que se verificaron una por una para garantizar que `delivered` es terminal. Un tipo nuevo de pedido obligaría a re-verificar las ocho.
- Los **estados no encajan**: Encargos no tiene `pending_acceptance`, `preparing`, `waiting_driver` ni `ready_for_pickup`; tiene «cobro en A» y «entrega en B», que un pedido de restaurante no conoce. `DECISIONS §5` ya explicó qué pasa cuando se reutiliza un estado con otro significado: mete un dato falso en cada reporte futuro.
- Reglas de dinero distintas (`02`): otra contraparte, otro libro.

**Decisión propuesta [D-01]:** módulo/tabla propios (`errands`), **reutilizando la infraestructura**, no el agregado.

### Qué se reutiliza tal cual

| Pieza | Dónde vive hoy |
|---|---|
| Motorizados y su disponibilidad | `drivers`, `driver_availability` |
| Usuarios, roles, JWT claims | `users`, `user_roles` (rol `driver` y `customer` ya existen) |
| Teléfono verificado, dirección por defecto | `customer_profiles` (`phone_verified_at`, `default_*`) |
| Mapa y selector de punto | `apps/customer/components/map-picker.tsx` |
| Polígono de cobertura | `app_settings.coverage_polygon` |
| Push | Edge Function `send-push`, `push_subscriptions`, hooks de `motorizados` y `customer` |
| Tiempo real | Supabase Realtime + `canalUnico(...)` |
| Idempotencia | `Idempotency-Key` + `apps/api/lib/http/idempotency.ts` |
| Storage | Bucket para fotos del artículo (uno nuevo, `errand-photos`) |
| Patrón de QR de cobro | Estructura de `business_payment_qrs` (`0184`) y contrato `PaymentQrInput`: billetera + número + titular + imagen. **Hoy solo existe para negocios; el motorizado no tiene el suyo** (`02` §4) |
| Rendición con auto-confirmación 24 h | Lógica de `cash_settlements` (copiada, no compartida) |

### Distancia: Haversine, y ya existe dos veces

Sí se puede, y no hace falta Leaflet ni ninguna dependencia nueva. Comprobado en el repo:

- `apps/customer/lib/coverage.ts` ya tiene `haversineKm(a, b)` (usado en el checkout) y `apps/motorizados/lib/geo.ts` tiene otra copia en metros.
- Leaflet 1.9.4 (`apps/customer`) trae `latlng.distanceTo(otro)` y `map.distance(a, b)`, que devuelven **metros en línea recta**. Su propio código usa la misma fórmula del semiverseno, aunque el comentario diga «ley de cosenos».
- Leaflet **no calcula rutas por calles**; eso exige un servicio externo (`06-backlog.md` B-3).

Encargos sería el **tercer** uso (cliente, motorizado y ahora el servidor). Regla del repo: extraer con 3+ usos. **Propuesta:** una sola función pura en `packages/contracts` (o `packages/core`, según dónde caiga mejor), usada por `create_errand` en el servidor; y el cliente puede mostrar la distancia con la misma función. **La calcula el servidor, no se acepta la del cliente.**

### Qué NO se toca

`orders`, `advance_order`, `create_customer_order`, `cash_settlements`, `business_charges`, las colas de `waiting_driver`. Encargos vive al lado.

---

## 2. Feature flag y horario

Todo parte apagado. `app_settings.errands`:

```jsonc
{
  "enabled": false,
  "pricing": { "basePrice": 3.00, "tiers": [] },
                                  // S/ 3 fijo [D-04]; `tiers` (por distancia en línea recta) vacío hasta tener datos
  "pickupWaitMinutes": 5,         // espera en cada punto antes de reportar
  "maxDeclaredValue": 200,        // decidido; cada categoría puede fijar el suyo
  "maxWeightKg": 5,               // propuesto, sin confirmar [D-19]
  "backpackCm": [45, 45, 45],     // decidido; solo para la imagen y el texto
  "categories": [ /* catálogo permitido, ver 05 §2 (id, label, enabled, maxDeclaredValue, requiresAdultReceiver, sealedRequired, note) */ ],
  "remittance_qr": { "wallet": "yape", "accountNumber": "…", "accountName": "…", "qrUrl": "…" }
                                  // cuenta de Tindivo a la que el motorizado rinde por Yape
}
```

`pricing` (S/ 3 fijo), `maxDeclaredValue`, `maxWeightKg` y `backpackCm` están decididos.

**El plazo de búsqueda NO vive aquí.** `DECISIONS §10` fija que los plazos salen de `app_settings.timers` y de ningún otro sitio (la `0174` deshizo el caso contrario). Se añade `timers.errandSearchMinutes` (**15**, decidido, [D-14]) y lo aplica `expire_errands()` desde un cron por minuto, como `cancel_expired_prepay_orders()` hace con la aceptación del negocio (`timers.acceptanceMinutes`, hoy 8 desde la `0186`).

**Solo de noche:** Encargos usa el horario de la plataforma (`is_within_platform_schedule`, `use-platform-schedule`); fuera de él, `create_errand` responde 409 con motivo, igual que el guard de «cerrado» de restaurantes (`DECISIONS §19`). Se aplica la regla del repo: **cualquier plazo lo lee de `app_settings`**, no de un `interval '5 minutes'` escrito en SQL (la `0174` existe para deshacer justo eso). Piloto: `enabled` solo visible para un usuario de prueba hasta validar de punta a punta.

---

## 3. Modelo de datos (propuesta)

Convenciones: dinero `numeric(10,2)`, coordenadas `numeric(10,7)`, código y DB en inglés, RLS en **todas** las tablas, migraciones idempotentes.

### `errands`

| Grupo | Columnas |
|---|---|
| Identidad | `id`, `errand_number` (secuencia atómica, nunca `Date.now()`), `short_id` (mismo alfabeto de 8 chars, validado solo al crear) |
| Partes | `customer_user_id`, `driver_id` (null hasta aceptar) |
| Artículo | `category` (id del catálogo de `app_settings`, **validado en `create_errand`**: una categoría desactivada o inexistente se rechaza en el servidor, no solo en la UI), `description`, `declared_value`, `fits_backpack`, `adult_receiver_confirmed` |
| Punto A | `pickup_address`, `pickup_reference`, `pickup_lat/lng`, `pickup_contact_name`, `pickup_contact_phone` |
| Punto B | `dropoff_address`, `dropoff_reference`, `dropoff_lat/lng`, `recipient_name`, `recipient_phone` |
| Servicio | `direction` (`to_me` \| `from_me`, solo para la UI), `distance_m` (Haversine calculado **en el servidor**; hoy **solo se guarda**, más adelante decidirá escalones) y `price` (snapshot de `app_settings.errands.pricing`) |
| Cobro | `pay_at` (`pickup` \| `dropoff`), `payment_method` (`cash` \| `yape`), `collected_at`, `collected_amount`. `collected_at` es lo que habilita `pickup`/`deliver` según `pay_at` |
| Estado | `status` (`errand_status`), marcas de tiempo por transición (`accepted_at`, `arrived_pickup_at`, `picked_up_at`, `arrived_dropoff_at`, `delivered_at`, `cancelled_at`, `expired_at`), `cancel_reason`, `cancelled_by` |
| Notas | `customer_notes`, `driver_notes` |
| Evidencia | `dropoff_photo_url` (nullable; **preparada, sin pantalla en v1**, `06` B-13). Sin foto al recoger ni del cliente |

`errand_status`: `searching`, `heading_to_pickup`, `at_pickup`, `in_transit`, `at_dropoff`, `delivered`, `cancelled`, `expired`. Fuente única en `packages/contracts` con test de *drift* contra el esquema generado (el mismo mecanismo de `enum-drift.ts`).

### Tablas de apoyo

| Tabla | Para qué |
|---|---|
| `errand_status_history` | Historial inmutable de transiciones (análogo a `order_status_history`). |
| `errand_event_log` | Auditoría de negocio por encargo (análogo a `order_event_log`). |
| `errand_remittances` | Rendición del motorizado a Tindivo: `driver_id`, `method` (`cash` \| `yape`), `declared_amount`, `confirmed_amount`, `status`, `confirmed_by`, `dispute_note`, `resolved_*`. Estados: los mismos de `cash_settlement_status`, con el admin como contraparte. Pueden ser **parciales**: la deuda es un saldo. |
| `errand_debt_waivers` | Condonaciones del admin sobre un encargo entregado sin cobro (`errand_id`, `note`, `waived_by`). |
| `driver_payment_qrs` | Método de cobro **del motorizado**: mismo esquema que `business_payment_qrs`, con `driver_id`. Sin él no puede aceptar encargos. **Jesús lo precarga** (QR, número y titular de cada motorizado) desde el admin; el motorizado puede verlo en su perfil. Ruta `admin/drivers/[id]/payment-qrs` (`admin/drivers/[id]` ya existe) |

**La deuda no se guarda: se deriva.** `debt(driver) = Σ price de encargos delivered − Σ confirmed_amount de sus rendiciones − Σ condonaciones`. Igual que `balance_due`, que la `0124` volvió derivado tras el defecto de `generate_delivery_charges`: **una columna mantenida a mano es un saldo que se descuadra.** Se expone por una vista o una función, no por un contador.

Ya **no** hace falta la tabla de conciliación de Yape que tenía la v0.1: el Yape entra a la cuenta del motorizado, que lo ve.

### Cierres de acceso (RLS)

- **Cliente:** ve y crea solo lo suyo. Crea **solo por RPC/API**, no con `INSERT` directo.
- **Motorizado:** ve los `searching` (sin datos personales: se sirven vía API/vista con columnas limitadas, no `select *`) y **el detalle completo solo de los suyos**. No puede escribir `status` a mano.
- **Admin:** lectura y operación total, incluido cancelar.
- Helpers `SECURITY DEFINER` con `SET search_path = ''`; `anon` sin acceso a nada.

---

## 4. RPC y rutas

### RPC (solo `service_role`)

| RPC | Hace |
|---|---|
| `create_errand(...)` | Valida cobertura de **ambos puntos** en servidor, **lee el precio de `app_settings`** (no confía en el del cliente), fija snapshot, emite evento. Idempotente. |
| `advance_errand(id, actor, role, action, params)` | Acciones: `accept`, `arrive_pickup`, `collect_payment`, `pickup`, `arrive_dropoff`, `deliver`, `cancel`, `report_problem`. Toda transición: historial + evento en **la misma transacción**. `accept` es una sola sentencia condicionada a `status='searching' and driver_id is null` (la carrera se resuelve en la base). **Guardas del cobro:** `pickup` exige `collected_at` si `pay_at='pickup'`; `deliver` exige `collected_at` si `pay_at='dropoff'`. `accept` exige que el motorizado tenga fila en `driver_payment_qrs`. |
| `expire_errands()` | Cron por minuto: `searching` con más de `app_settings.timers.errandSearchMinutes` → `expired`. Idempotente, verifica estado antes de mutar. |
| `create_errand_remittance(...)`, `confirm_…`, `dispute_…`, `resolve_…`, `waive_errand_debt(...)` | Rendición, disputa y condonación. |

### Rutas en `apps/api` (`/api/v1`)

```
customer/errands            POST (crear), GET (mis encargos)
customer/errands/[id]       GET
customer/errands/[id]/cancel POST
customer/errands/quote      POST (precio + cobertura antes de pedir)
public/errands/[shortId]    GET (tracking público, campos mínimos)
driver/errands              GET (buscando + los míos)
driver/errands/[id]         GET (detalle completo solo si es suyo)
driver/errands/[id]/transition POST (incluye collect_payment)
driver/payment-qrs          GET, PUT (su método de cobro)
driver/errand-debt          GET (deuda derivada + detalle por encargo)
driver/errand-remittances   POST (rendir)
admin/errands               GET
admin/errands/[id]/cancel   POST
admin/errand-settings       GET, PATCH (precio, interruptor, cuenta de Tindivo)
admin/errand-remittances    GET
admin/errand-remittances/[id]/resolve POST
admin/errand-debt           GET (por motorizado), POST waive
```

Sin Server Actions ni BFF (Capacitor-ready, `DECISIONS §1`); validación Zod en los límites; los esquemas viven en `packages/contracts`.

---

## 5. Frontend

| App | Qué se añade |
|---|---|
| **`customer`** | `features/errands/`: wizard de 4 pasos (qué llevamos → A → B → resumen y pago), pantalla «Buscando motorizado», seguimiento con Realtime, ruta pública `encargos/[shortId]`. Tarjeta en el home y en «Pedidos»; el home nuevo está en **`docs/Home/`**. **Ojo:** `apps/customer/lib/active-orders.ts` cuenta solo `orders`; el badge de `BottomNav` y el banner del home deben **sumar los encargos activos** sin tocar el guard de «un pedido activo por restaurante». **Un cliente puede tener a la vez un encargo y un pedido a un restaurante** (confirmado por Jesús): son independientes, y «Pedidos» los lista **juntos con etiqueta**. El guard existente es «un pedido activo *por restaurante*» y **no debe** contar encargos. El `customer` carga Material Symbols completo desde Google Fonts, así que la regla de iconos de subset cerrado **no** aplica ahí (sí en `motorizados` y `negocios`) |
| **`motorizados`** | **Un solo panel** (decisión de Jesús): los encargos entran en `available-tab` y `mine-tab` (`components/home/`) mezclados con los pedidos. Hace falta un tipo unión `kind: 'order' \| 'errand'` sobre lo que hoy devuelve `hooks/use-driver-orders.ts`, una `errand-card` junto a `order-card` con insignia **«ENCARGO»** (color propio; **sin** franja de papelito), y `features/errands/`: detalle con acciones, cobro (**su** QR / efectivo exacto), notas, reporte de problema; en **Perfil**, cargar su método de cobro; y en **Efectivo**, una sección «Encargos» con su deuda encargo por encargo y la rendición. Suscripción realtime. |
| **`admin`** | Lista en vivo, ajustes (interruptor, precio, cuenta de Tindivo), incidencias, deuda por motorizado, rendiciones y condonaciones. |
| **`negocios`** | Nada. |

**Regla de iconos (invariante 9, obligatoria):** `apps/motorizados` usa un **subset cerrado** de Material Symbols (`apps/motorizados/public/fonts/icons.txt`). Comprobado hoy: existen `inventory_2`, `pin_drop`, `flag`, `qr_code_2`, `payments`, `call`, `chat`, `photo_camera`, `schedule`, `two_wheeler`, `local_shipping`; **no existe `package_2`**. Antes de usar cualquier icono, verificar; si falta, regenerar el `.woff2` siguiendo `apps/negocios/public/fonts/README.md`. Un icono ausente **no falla TypeScript ni lint**: aparece como texto roto.

---

## 6. Push

Añadir a la lista blanca explícita de `dispatch_event` (es explícita a propósito, `DECISIONS §25`) y a las ramas del Edge Function `send-push`. Tag = `${event_type}-${shortId}` (invariante 5).

| Momento | Destinatario |
|---|---|
| Nuevo encargo buscando motorizado | Todos los motorizados |
| Un motorizado aceptó | Cliente |
| Motorizado llegó a A / llegó a B | Cliente |
| Entregado | Cliente |
| Sin motorizado (`expired`) | Cliente |
| Cancelado por admin | Cliente y motorizado |
| Reporte de problema | Admin |
| Motorizado declaró una rendición | Admin |
| Rendición confirmada / con diferencia | Motorizado |

**Riesgo conocido:** `DECISIONS §25` deja anotado que `dispatch_event` es `net.http_post` a fondo perdido: si falla, el aviso se pierde y no hay reintento. Para Encargos, **el aviso al motorizado es lo que hace que el servicio exista**. Mitigación mínima: la sección de la app hace *polling* + Realtime y, si hay encargos `searching` que llevan más de un minuto, el admin lo ve destacado en su lista.

---

## 7. Invariantes que aplican (checklist)

- [ ] RLS activada en **todas** las tablas nuevas, con policies explícitas (`CLAUDE.md` #3).
- [ ] `short_id` validado solo al **crear**, nunca al rehidratar (#1); `errand_number` desde secuencia (#2).
- [ ] Outbox: evento en la **misma transacción** que el cambio (#4).
- [ ] Tag de push con `event_type` (#5).
- [ ] Migraciones idempotentes, por CLI de Supabase, **nunca** por MCP `apply_migration` ni editor SQL. Después: `pnpm db:types` y revisar advisors.
- [ ] Tras `supabase db reset`, correr `pnpm db:seed:e2e`.
- [ ] Multi-rol respetado: un motorizado puede ser también cliente.
- [ ] Iconos verificados contra `icons.txt`; correr `pnpm --filter @tindivo/negocios test` si se toca `packages/ui`.
- [ ] TypeScript estricto, Zod v4, Biome.
- [ ] Commits en español con tilde, escritos desde fichero UTF-8 (`git commit -F`).
- [ ] Tests primero en la lógica de dinero y de estados (guardas de cobro por `pay_at`, carrera de `accept`, deuda derivada, rendición parcial).
- [ ] Graphify: `pnpm graphify:update` al terminar código.

---

## 8. Fases

| Fase | Contenido | Sale cuando |
|---|---|---|
| **0** | Cerrar `04-decisiones-abiertas.md`; añadir §29 a `DECISIONS.md`. | Jesús aprueba. |
| **1 · Base** | Migración `0229+`: tablas, enums, RLS, RPC, cron, `app_settings.errands`, `driver_payment_qrs`. Contratos Zod. Tests de guardas de cobro, transiciones, carrera de `accept` y cálculo de deuda. | Tests verdes contra la base local. |
| **2 · Cliente** | Wizard, «Buscando motorizado», seguimiento y ruta pública. | Un encargo se crea y se ve en tiempo real. |
| **3 · Motorizado** | Lista, aceptar, avance, cobro, notas, push. | Un encargo se completa de A a B con dos celulares. |
| **4 · Admin y cuadre** | Ajustes, lista, incidencias, deuda por motorizado, rendición y condonación. | Se cierra un día con dinero real, a mano y contra la app. |
| **5 · Piloto** | `enabled` solo para un usuario de prueba, luego para todos en horario acotado. | Métricas de `04` §Éxito. |

Cada fase pide **aprobación de Jesús** antes de la siguiente (regla de proceso del repo), y cada UI corre Playwright antes de darse por hecha.

---

## 9. Riesgos

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| **Dinero de Tindivo en el Yape personal del motorizado** | Se mezcla con el suyo y depende de que rinda; además, una cuenta personal que recibe muchos cobros podría tener límites o bloqueos (no verificado, `02` §4). | La deuda se deriva de los encargos entregados, no de lo que declare (`02` §5.1). Comprobar las condiciones de Yape antes del piloto. |
| **Categorías de más riesgo (medicinas; bebidas que incluyen alcohol)** | Reclamos y responsabilidad. | Van con reglas propias y un **interruptor por categoría** en el admin; se pueden pausar sin desplegar código (`05` §2). |
| **Nadie paga en B (pago al entregar)** | El motorizado ya hizo el viaje. | El artículo no se entrega sin cobrar; el caso pasa al admin (`01` §6). |
| **Artículos prohibidos o peligrosos** | Riesgo legal y de seguridad; el roadmap ya lo marcaba. | Lista de prohibidos aceptada explícitamente, el motorizado puede negarse a recoger, tope de valor. |
| **Competir con los pedidos de restaurante** | Con 1 motorizado y ~10 pedidos/noche (`CLAUDE.md`), un encargo puede dejar comida esperando. | Regla de capacidad [D-08]; horario propio del servicio. |
| **El aviso se pierde** | Sin push no hay servicio (§6). | Realtime + polling + alerta al admin. |
| **Fraude por no-show** | Sin prepago, el motorizado pierde el viaje. | Espera acotada, reporte, y regla de cargo por visita en vano [D-10]. |
| **Alcance que crece** | Es fácil colgar aquí compras, contra-reembolso, prepago. | Lo que no está en v1 está listado en `README` como «no es». |
| **Demanda no validada** | El roadmap pedía ≥10 consultas/mes antes de construir. | Feature flag + piloto acotado; medir antes de invertir en fases 4–5 completas. |
