# 00 · Visión de producto — Tindivo v2

> Documento maestro de visión. Describe **qué es Tindivo**, **a quién sirve**, **cómo gana dinero** y **cómo se organiza operativamente**. Sin tecnicismos, sin código, sin nombres de tablas ni endpoints.
>
> Audiencia: producto, diseño, desarrollo, stakeholders, futuros constructores.
> Idioma: español peruano.
> Estado del documento: vigente para MVP v2 (mayo 2026).

---

## Tabla de contenidos

- [1. ¿Qué es Tindivo?](#1-qué-es-tindivo)
- [2. El problema que resuelve](#2-el-problema-que-resuelve)
- [3. Los cinco roles del ecosistema](#3-los-cinco-roles-del-ecosistema)
- [4. El triángulo operativo](#4-el-triángulo-operativo)
- [5. Modelo de negocio · cómo gana dinero Tindivo](#5-modelo-de-negocio--cómo-gana-dinero-tindivo)
- [6. Arquitectura física · cinco subdominios](#6-arquitectura-física--cinco-subdominios)
- [7. El "papelito de color" — pieza única del modelo](#7-el-papelito-de-color--pieza-única-del-modelo)
- [8. Capacidades de negocio combinables](#8-capacidades-de-negocio-combinables)
- [9. Diferencias con el sistema v1](#9-diferencias-con-el-sistema-v1)
- [10. Métricas de éxito del piloto](#10-métricas-de-éxito-del-piloto)
- [11. Fuera de alcance del MVP v2](#11-fuera-de-alcance-del-mvp-v2)
- [12. Glosario](#12-glosario)

---

## 1. ¿Qué es Tindivo?

**Tindivo** es un **servicio de delivery hiperlocal** diseñado para **pueblos del interior de Perú** donde:

- Los restaurantes pequeños no tienen motorizados propios.
- Los clientes piden por teléfono, WhatsApp, presencialmente, **y ahora también desde la web**.
- Los motorizados son pocos (1-3 al inicio) y trabajan contratados directamente por Tindivo.
- Hay un único administrador (el fundador) que opera el sistema mientras el modelo crece.

A diferencia de Rappi, Uber Eats o PedidosYa, **Tindivo no es un marketplace de descubrimiento masivo**. Es una **operación coordinada**: su valor está en que un restaurante chico pueda ofrecer delivery sin contratar motorizados propios, y que un motorizado pueda trabajar un turno con varios restaurantes sin volverse loco.

El primer mercado piloto es **San Jacinto, Áncash** (con la pizzería-hamburguesería **Priamo** como restaurante inicial), pero el sistema está diseñado para replicarse en cualquier pueblo de tamaño similar (5,000 – 50,000 habitantes).

## 2. El problema que resuelve

En pueblos pequeños del Perú:

1. **Los restaurantes pierden ventas** porque el cliente no quiere ir a recoger ni esperar a un motorizado del local (que no existe).
2. **Los motorizados libres no encuentran trabajo estable** porque cada local los contrata solo cuando ya están saturados — sin coordinación entre locales.
3. **Los clientes no tienen forma de pedir** sino llamando por teléfono y esperando "alguien va a llegar en un rato".
4. **El dinero se descuadra** porque el motorizado lleva efectivo de varios pedidos a varios restaurantes y al final del turno nadie sabe cuánto le toca a quién.

Tindivo automatiza el punto 1, da estabilidad al punto 2, da una experiencia digital al punto 3, y hace verificables el cuadre del punto 4.

## 3. Los cinco roles del ecosistema

| Rol | Quién es | Dominio donde opera | Cuántos hay en MVP |
|---|---|---|---|
| **Cliente final** | Persona que pide comida desde su casa | `tindivo.com` (PWA pública) | N (crece) |
| **Negocio** | Restaurante / dueño que recibe pedidos | `negocios.tindivo.com` (PWA con UI condicional) | N (crece) |
| **Motorizado** | Driver contratado por Tindivo | `motorizados.tindivo.com` (PWA) | 1-3 al inicio |
| **Admin** | Fundador / operador de Tindivo | `admin.tindivo.com` (panel control) | 1 (en MVP) |
| **Soporte** *(opcional, post-MVP)* | Operador adicional para atender disputas | mismo dominio admin, permisos limitados | 0-1 |

**Notas sobre multi-rol**: un mismo usuario humano puede tener más de un rol. Caso típico: el dueño de un restaurante también es admin de Tindivo (en MVP), o un motorizado que también es dueño de un negocio en algún momento. El sistema diferencia identidad (`User`) de rol (capacidades activas), permite roles múltiples y, al login, muestra un selector si N>1.

## 4. El triángulo operativo

```
                       ADMIN
                         ▲
                         │ supervisa, resuelve, factura
                         │
              ┌──────────┴──────────┐
              │                     │
   NEGOCIO ──pedido──►  MOTORIZADO ──entrega──► CLIENTE FINAL
              ▲                     │
              └─efectivo del turno──┘
```

- El **cliente final** o el **negocio** crean el pedido (web o llamada).
- El **motorizado** lo ejecuta (recoge en el local, entrega al cliente, cobra si aplica).
- El **admin** monitorea, interviene en emergencias, factura comisiones semanales y resuelve disputas de efectivo.
- El **cliente final** recibe el pedido y, si quiere, consulta el link público de tracking que se le envía por WhatsApp (o que ve en `tindivo.com/pedidos/<shortId>` si fue cliente web).

## 5. Modelo de negocio · cómo gana dinero Tindivo

### 5.1 Cobro por pedido entregado

Tindivo cobra **al negocio** por cada pedido **entregado** (no por cancelado):

| Caso | Cobro a Tindivo |
|---|---|
| Negocio publica catálogo en `tindivo.com` y el cliente recoge en el local (pickup) | **S/ 0.50** por pedido |
| Negocio usa motorizado Tindivo + cliente está cerca del local (banda Cerca) | **S/ 3.00** por pedido |
| Negocio usa motorizado Tindivo + cliente en banda Media | **S/ 3.25** por pedido |
| Negocio usa motorizado Tindivo + cliente en banda Lejos | **S/ 3.50** por pedido |

La **banda de distancia** la declara el motorizado al recoger el pedido (es subjetiva basada en su conocimiento del pueblo, no calculada por coordenadas — ver `02-requerimientos-no-funcionales.md`).

### 5.2 Liquidación semanal

Cada lunes 10:00 (zona horaria Lima), el admin abre la sección **Cobros** y genera las liquidaciones de la semana anterior (lunes a domingo):

1. El sistema calcula por negocio: `pedidos entregados × comisión correspondiente`.
2. El admin revisa el preview, puede excluir negocios pequeños o ajustar fechas.
3. Confirma → se crean liquidaciones con estado `pending`.
4. Admin envía los cobros por WhatsApp (manual, fuera del sistema).
5. Cuando el negocio paga (Yape, transferencia, efectivo), admin toca **Marcar como pagado**.
6. El sistema descuenta la deuda; si el negocio estaba bloqueado por mora, se desbloquea automáticamente.

### 5.3 Liquidación diaria de efectivo (entre driver y negocio)

Al final de turno, el motorizado regresa al negocio con el efectivo acumulado de pedidos pagados cash o mixto. Flujo digital:

1. Driver toca **Entregar efectivo** y declara el monto.
2. Negocio recibe push y ve la solicitud en su sección **Efectivo**.
3. Cajero cuenta físicamente y elige **Confirmar** o **Reportar diferencia**.
4. Si reporta diferencia, pasa a **Disputas** del admin, quien resuelve.

**Regla cultural importante**: el driver NO discute con el cajero. Si hay diferencia, el cajero la reporta en la app y el admin Tindivo la resuelve.

### 5.4 Lo que NO cobra Tindivo

- **Comisión variable al driver**: el driver gana sueldo fijo, no por entrega.
- **Propinas al driver**: no gestionadas en el sistema (si el cliente da propina, queda al margen).
- **Promociones / cupones / descuentos al cliente**: no existen en MVP (sería responsabilidad futura del marketplace público).
- **Membresía al negocio**: NO hay mensualidad. Modelo 100% transaccional.

## 6. Arquitectura física · cinco subdominios

El ecosistema se reparte en cinco apps autónomas, cada una en su propio subdominio:

| Subdominio | Quién la usa | Tipo | Función principal |
|---|---|---|---|
| `tindivo.com` | Cliente final | PWA pública | Marketplace, carrito, checkout, tracking del pedido |
| `negocios.tindivo.com` | Dueño de negocio / cajero | PWA con UI condicional | Recibir pedidos, gestionar menú, pedir motorizado, ver efectivo y deuda |
| `motorizados.tindivo.com` | Motorizado | PWA mobile-first | Recibir asignaciones, marcar estados, gestionar equipo, entregar efectivo |
| `admin.tindivo.com` | Admin Tindivo | Panel de control responsive | Vigilancia operativa, resolución de emergencias, facturación |
| `api.tindivo.com` | Las cuatro apps anteriores | REST único | Lógica de negocio, autenticación, persistencia |

**Por qué subdominios y no route groups en una sola app**:

1. **Aislamiento de cookies y sesiones** — un motorizado logueado no comparte sesión con el cajero del mismo celular si abren ambos dominios.
2. **Bundles más pequeños** — la PWA del cliente no carga código de admin ni viceversa.
3. **Equipos independientes** — diferentes ritmos de release por app.
4. **Capacitor-ready** — cuando se empaqueten apps nativas, cada PWA es un bundle independiente.

**Trade-off**: cinco deploys en Vercel (uno por app) en lugar de uno solo. Mitigación: Turborepo cache + pipeline CI/CD compartido. Ver `13-deploy-y-devops.md`.

## 7. El "papelito de color" — pieza única del modelo

Cada negocio activo en Tindivo tiene un **color de papel asignado** (rosado, azul cielo, verde menta, amarillo limón, lavanda, naranja, lila, turquesa, etc.). El cajero usa un cuaderno o block de papel de **ese color exacto** para anotar a mano los datos físicos de cada pedido manual:

- Dirección y referencia visual ("frente al grifo azul")
- Teléfono del cliente
- Notas especiales ("sin cebolla")

El papelito viaja **físicamente con el pedido**: el driver lo recibe del cajero junto con la bolsa al recoger. Esta es la **redundancia analógica** del sistema — aunque la app falle, el driver llega al cliente con el papel en la mano.

### Reglas asociadas al color

1. **El color es único por negocio activo**. Dos negocios activos no pueden compartir color (para que el driver identifique de un vistazo de qué local viene el papelito).
2. **El color de acento en la app = el color del papelito físico**. Cuando el admin crea un negocio, elige un color. Ese color aparece como dot vertical o franja a la izquierda del nombre en TODAS las tarjetas de pedido (admin, driver, negocio). **Debe coincidir con el color del papel físico**.
3. **Negocios desactivados liberan su color**. Si Negocio A (azul) se desactiva, Negocio B (nuevo) puede tomar azul.
4. **En la PWA del negocio**, antes de crear un pedido manual, hay un recordatorio visual: *"¿Ya anotaste dirección y teléfono en tu papelito [COLOR]?"*.

Aunque la app captura los datos del cliente digitalmente (cliente final vía `tindivo.com` o cajero digitándolo), **el papelito se mantiene como respaldo offline** en MVP. En post-MVP se evaluará si conserva sentido cuando >70% de pedidos vengan vía web.

## 8. Capacidades de negocio combinables

Un negocio no tiene un "tipo único". Tiene un set de **capacidades granulares combinables**. La razón: el cliente final SIEMPRE elige en checkout entre **pickup** (recoge en el local) o **delivery** (motorizado entrega), pero esas opciones deben estar habilitadas por el negocio. Son dimensiones ortogonales.

| Capacidad | Significado |
|---|---|
| `publishes_catalog` | Su menú aparece en `tindivo.com` (visible en marketplace público). |
| `accepts_web_pickup` | Clientes pueden ordenar **pickup** desde la web. El cliente recoge en el local. Requiere `publishes_catalog`. |
| `accepts_web_delivery` | Clientes pueden ordenar **delivery** desde la web. Tindivo entrega. Requiere `publishes_catalog` + `uses_tindivo_drivers`. |
| `uses_tindivo_drivers` | Recibe motorizados Tindivo (para delivery web o para pedidos manuales con entrega). |
| `primary_capability` *(derivada)* | Modo principal para resolver UI default: `drivers_only`, `catalog_pickup`, `catalog_delivery`, `catalog_full`, `pickup_local`. |

### Reglas de consistencia (constraints en BD)

1. `accepts_web_pickup = true` requiere `publishes_catalog = true` (sin menú visible, el cliente no puede pedir pickup web).
2. `accepts_web_delivery = true` requiere `publishes_catalog = true` Y `uses_tindivo_drivers = true` (sin drivers, no hay quién entregue).
3. Si `publishes_catalog = true`, al menos uno de `accepts_web_pickup` o `accepts_web_delivery` debe ser `true` (publicar menú sin aceptar pedidos web no tiene sentido — para eso, simplemente no se publica).

### Combinaciones canónicas

| Caso real del negocio | publishes_catalog | accepts_web_pickup | accepts_web_delivery | uses_tindivo_drivers | primary_capability |
|---|---|---|---|---|---|
| Solo motorizado (manual del cajero + delivery, sin catálogo web) | ❌ | ❌ | ❌ | ✅ | `drivers_only` |
| Catálogo solo pickup (cliente recoge, sin drivers Tindivo) | ✅ | ✅ | ❌ | ❌ | `catalog_pickup` |
| Catálogo solo delivery (cliente recibe en casa, sin opción de recoger) | ✅ | ❌ | ✅ | ✅ | `catalog_delivery` |
| Catálogo full (cliente elige pickup o delivery en checkout) | ✅ | ✅ | ✅ | ✅ | `catalog_full` |
| Manual sin web ni drivers (cajero registra, cliente va al local) | ❌ | ❌ | ❌ | ❌ | `pickup_local` |

### Escalabilidad del modelo

Un negocio puede **escalar capacidades** sin migración de datos. Ejemplos:

- **Empieza `catalog_pickup`** (publica menú, clientes recogen) → al contratar el servicio de motorizados de Tindivo, activa `accepts_web_delivery` y `uses_tindivo_drivers` → pasa a `catalog_full`. Su menú y pedidos antiguos quedan intactos.
- **Empieza `drivers_only`** (cajero registra por teléfono, drivers entregan) → al publicar carta online, activa `publishes_catalog` + `accepts_web_pickup` y/o `accepts_web_delivery` → pasa a `catalog_delivery` o `catalog_full`. Sus drivers y datos quedan.
- **`catalog_pickup` quita catálogo** temporalmente (vacaciones) → desactiva `publishes_catalog`. Su menú no se borra, vuelve a aparecer al reactivar.

### UI condicional en `negocios.tindivo.com`

- **Home dashboard** se renderiza diferente según `primary_capability`:
  - `drivers_only` → hero card con CTA enorme **"Pedir moto"** + form rápido (cliente, dirección, monto). Sin sección de catálogo. Sí tiene cash, deuda.
  - `catalog_pickup` → tabs **"Pedidos pendientes"** (de la web, todos pickup) + **"Mi carta"** (editor de menú). Sin sección de drivers, sin cash de drivers. Solo deuda Tindivo (S/0.50 por pickup).
  - `catalog_delivery` → tabs **"Pedidos pendientes"** (todos delivery) + **"Mi carta"** + **"Efectivo"** + **"Deuda"**. NO ofrece botón "pedido manual" porque su modelo es 100% web.
  - `catalog_full` → dashboard completo. Cada pedido pendiente muestra **badge "pickup" o "delivery"** para que el cajero sepa qué prep aplica. Botón "pedido manual" disponible si quiere registrar uno por teléfono.
  - `pickup_local` → vista mínima de pedidos manuales registrados (sin drivers, cliente va al local). Útil para negocios que solo quieren un registro digital sin más.

- **Sidebar / bottom-nav**: filtra items según capacidades activas.
- **Onboarding**: wizard de capacidades al primer login, con checkboxes que respetan las reglas de consistencia (no se puede activar `accepts_web_delivery` sin antes activar `uses_tindivo_drivers`).
- **Cambio de modo**: en `Configuración → Capacidades`, toggles independientes. La UI se actualiza inmediatamente vía Zustand reactivo a `business.profile`.
- **Migración de datos**: cero. Cambiar capacidades es solo flip de booleanos. Los pedidos antiguos conservan sus datos (snapshot de `delivery_method` en cada `orders`).

### Comportamiento del cliente en `tindivo.com`

En el checkout, el toggle **Delivery / Pick-up** se renderiza condicional:

- Si negocio tiene `accepts_web_pickup = true` Y `accepts_web_delivery = true`: **toggle visible con ambas opciones**, default Delivery.
- Si solo `accepts_web_pickup = true`: toggle deshabilitado en Pickup con texto "Este negocio solo ofrece recojo en el local".
- Si solo `accepts_web_delivery = true`: toggle deshabilitado en Delivery con texto "Este negocio solo ofrece envío a domicilio".
- Negocios con `publishes_catalog = false` NO aparecen en el marketplace público — el cliente nunca llega a su checkout.

**Por qué no enum exclusivo de tipos**: cambiar de tipo implicaría migración de UI completa, posible pérdida de menú, y fricción operativa. Booleanos granulares + `primary_capability` derivada dan el mismo "look" de tipos pero permiten transición fluida y casos mixtos reales (un negocio puede ofrecer pickup web pero NO delivery web, o viceversa).

## 9. Diferencias con el sistema v1

Resumidas para que el lector entienda qué cambia respecto al sistema actual (`C:\Users\mauri\Documents\Tindivo`):

| Tema | v1 (actual) | v2 (este doc) |
|---|---|---|
| Apps de staff | Monolito `apps/web` con admin/restaurant/driver en un bundle | Tres PWAs independientes por subdominio |
| Marketplace cliente | `apps/customer` parcialmente implementado | PWA completa `tindivo.com` réplica exacta del demo |
| Tipos de negocio | Solo "restaurant" (rol único) | Capacidades granulares combinables (publishes_catalog, accepts_web_pickup, accepts_web_delivery, uses_tindivo_drivers) |
| Scheduling de deadlines | Cron pg_cron cada 1 min (polling) | Inngest delayed steps (precisión ~2-5s) por pedido |
| Bug de latencia push | Hasta 60s en notificar overdue | < 5s objetivo |
| Modelo de cobro | Comisión configurable por negocio (default S/1) | Tabla fija: S/0.50 pickup, S/3.00-3.50 delivery por banda |
| Estado de las suscripciones push | `push_delivery_log` sin RLS (bug de seguridad) | RLS activado desde init |
| Outbox de eventos | `domain_events` sin política de retención (4,381 filas creciendo) | Cron diario de prune con retención configurable |
| Logout | `signOutLocal()` scope local (correcto) | Igual |
| Sesión multi-dispositivo | Cookies por dispositivo (correcto) | Igual |
| Capacitor mobile | Preparado en API REST (no Server Actions) | Igual, listo para empaquetar |

## 10. Métricas de éxito del piloto

El piloto v2 se considera exitoso si en sus primeros 90 días de operación cumple:

| Métrica | Objetivo |
|---|---|
| Pedidos entregados en San Jacinto | ≥ 1,000 |
| Latencia P99 de push de "overdue" al motorizado | < 5 segundos |
| Tasa de cancelación (pedido cancelado / pedido creado) | < 5% |
| Tasa de disputas de efectivo (disputas / pedidos cash) | < 2% |
| Tiempo promedio de aceptación (creación → driver acepta) | < 90 segundos |
| Tiempo promedio de entrega total (creación → delivered) | < 35 minutos |
| Negocios activos | ≥ 3 (Priamo + 2 más) |
| Motorizados activos | ≥ 2 |
| Uptime de las 5 apps | ≥ 99.5% |
| Core Web Vitals de `tindivo.com` (LCP) | < 2.5s |

Si todas las métricas se cumplen, se replicará el modelo en un segundo pueblo a partir del mes 4.

## 11. Fuera de alcance del MVP v2

Lo siguiente NO está en el MVP. Pasa al doc `14-roadmap-y-fuera-de-mvp.md`:

- **Encomiendas** (un motorizado lleva un paquete cliente A → cliente B, no comida).
- **`tienda.tindivo.com`** (productos de almacén directos de Tindivo).
- **Apps nativas iOS/Android** (Capacitor). La API está lista, pero el packaging es post-MVP.
- **Pasarela de pago digital** (Niubiz, Culqi). MVP usa Yape manual al recibir o efectivo.
- **Real-time GPS tracking** del motorizado al cliente.
- **Cupones / promociones / códigos** para el cliente final.
- **Propinas digitales** al motorizado.
- **Heatmap geográfico de demanda** (qué barrios piden a qué hora).
- **Sistema multi-tenant** para replicar a otros pueblos sin duplicar Supabase.
- **App de soporte** (rol adicional separado del admin).
- **Verificación de teléfono por SMS** del cliente (MVP confía en confirmación humana del negocio por teléfono).
- **i18n** (todo está en español Perú, sin traducciones).

## 12. Glosario

| Término | Significado |
|---|---|
| Banda de distancia | Cerca / Media / Lejos. Declarada por el driver al recoger. Afecta la comisión. |
| Capacidades | Set de booleanos que determinan qué puede hacer un negocio en el sistema. |
| Cola urgente FCFS | Pedidos que esperaron >5 min sin asignación. Aparecen en bandeja de todos los drivers autorizados. First-come-first-served. |
| Confirmación humana | El negocio llama al cliente por teléfono para confirmar antes de preparar. No hay auto-confirmación en MVP. |
| Cuadre de efectivo | Liquidación diaria driver↔negocio del cash recolectado en pedidos cobrados al cliente. |
| Idempotency key | UUID v4 generado por el cliente y enviado en `Idempotency-Key` header. Evita pedidos duplicados por doble-click o retry. |
| Liquidación semanal | Cobro de Tindivo al negocio por los pedidos entregados de la semana anterior. |
| MVP | Producto mínimo viable. Esta versión 2 del sistema. |
| Occupancy slots | Slots de mochila ocupados por un pedido (1, 2 o 3). Declarado por el driver al recoger. |
| Onboarding diferido | El cliente puede explorar el menú y armar carrito sin login. La cuenta se exige solo al avanzar a checkout. |
| Outbox pattern | Tabla `domain_events` donde se persisten eventos de dominio dentro de la misma transacción que cambia el estado. Un relay externo los publica a push/realtime. |
| Papelito de color | Cuaderno de papel del color exacto del negocio, donde el cajero anota a mano los datos del pedido como respaldo analógico. |
| Push overdue | Notificación al motorizado cuando un pedido lleva >5 min en `waiting_driver` sin asignación. |
| R1-R5 | Reglas de asignación automática de motorizados (agrupación, capacidad restaurante, capacidad mochila, rotación, cola). |
| Realtime | Supabase Realtime — emite cambios de filas Postgres al frontend automáticamente. |
| RLS | Row Level Security. Policies de acceso aplicadas en la base de datos. |
| ShortId | Identificador público de 8 caracteres del pedido (ABC12345). Aparece en links de tracking. |
| Timeout-as-accept | Patrón de las transferencias entre drivers: si el dueño del pedido no responde en 30s, se interpreta como aceptación. |
| Tracking link | URL pública `tindivo.com/pedidos/<shortId>` con info mínima del pedido. Compartida por WhatsApp al cliente. |
| Urgente | Flag transversal del pedido. Activo cuando lleva >5min sin asignación o cuando un driver rechaza. |

---

**Este documento se complementa con**:
- `01-requerimientos-funcionales.md` — qué construir, en detalle.
- `08-flujo-admin.md`, `09-flujo-negocios.md`, `10-flujo-motorizados.md`, `07-flujo-cliente.md` — cómo se usa cada app.
- `12-billing-y-liquidaciones.md` — cómo se cobra y liquida.
