# Funcionalidades del Dashboard del Restaurante - Tindivo Delivery

Este documento detalla de manera exhaustiva el funcionamiento, alcance, lógica de negocio y estructura técnica de la interfaz del restaurante en el sistema **Tindivo Delivery**. El dashboard es una herramienta operativa B2B diseñada para que el cajero o encargado de un restaurante afiliado gestione la creación manual de pedidos, controle las asignaciones de motorizados, gestione tiempos de preparación y coordine liquidaciones financieras al final de su turno.

---

## 1. Alcance, Organización del Código e Integraciones

La aplicación del restaurante está integrada dentro del monorepo en la aplicación `web` (`apps/web`), compartiendo librerías comunes de la interfaz y la capa de contratos/Zod con el resto del ecosistema.

### 1.1. Rutas y Páginas en el App Router
Toda la interfaz del restaurante se ubica bajo el directorio de rutas de Next.js en [apps/web/src/app/restaurante](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/app/restaurante):
*   **Layout base**: [layout.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/app/restaurante/(with-nav)/layout.tsx) — Gestiona la barra superior flotante (`GlassTopBar`) con la opción de cierre de sesión local (`fullSignOut`) y la barra de navegación inferior (`BottomNav`) con las pestañas principales.
*   **Inicio (Dashboard Principal)**: [page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/app/restaurante/(with-nav)/page.tsx) — Muestra el banner de estado de la plataforma, el carrusel de pedidos pendientes de aceptación (`PendingAcceptanceList`) y el listado de pedidos activos del turno (`ActiveOrders`).
*   **Crear Pedido Manual**: [nuevo-pedido/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/app/restaurante/nuevo-pedido/page.tsx) — Renderiza el formulario de creación manual de pedidos para ingresos desde llamadas telefónicas.
*   **Detalle del Pedido**: [pedidos/[id]/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/app/restaurante/(with-nav)/pedidos/[id]/page.tsx) — Renderiza los detalles de un pedido activo o histórico, permitiendo ejecutar acciones según su estado (cancelación, prórrogas, edición, listo antes).
*   **Gestión de Efectivo**: [efectivo/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/app/restaurante/(with-nav)/efectivo/page.tsx) — Muestra el efectivo total retenido por motorizados pendientes de liquidar y los cierres de caja del día por confirmar o en revisión.
*   **Historial de la Jornada**: [historial/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/app/restaurante/(with-nav)/historial/page.tsx) — Muestra los pedidos completados y cancelados del día actual.
*   **Deuda y Comisiones**: [deuda/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/app/restaurante/(with-nav)/deuda/page.tsx) — Permite verificar el balance acumulado adeudado a Tindivo por comisiones logísticas e instrucciones de pago.
*   **Perfil y Configuración**: [perfil/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/app/restaurante/(with-nav)/perfil/page.tsx) — Muestra los datos básicos del negocio (nombre, dirección, teléfono, correo, color asignado) y permite activar notificaciones push.
*   **Catálogo / Menú**: [negocio/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/app/restaurante/(with-nav)/negocio/page.tsx) — Deshabilitado. Muestra un banner indicando que la carta pública se administra desde la cuenta unificada en `tindivo.com`.

### 1.2. Módulos de Feature en el Cliente (Frontend)
El código sigue una arquitectura de división vertical por característica ("vertical slicing") bajo [apps/web/src/features/restaurante](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante):
*   [new-order](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/new-order) — Componente [new-order-form.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/new-order/components/new-order-form.tsx) que contiene toda la validación síncrona del formulario de creación y el gancho de mutación `useCreateOrder`.
*   [active-orders](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/active-orders) — Componentes para el listado de pedidos activos y la tarjeta de alerta de llamadas urgentes a soporte (`UrgentCallCard`).
*   [order-detail](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/order-detail) — Vista [restaurant-order-detail.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/order-detail/components/restaurant-order-detail.tsx) con la línea de tiempo vertical y acciones rápidas, y el modal de edición de pedidos [edit-order-sheet.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/order-detail/components/edit-order-sheet.tsx).
*   [pending-acceptance](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/pending-acceptance) — Gestiona la cola de aceptación de pedidos que provienen del cliente final (`customer_pwa`) con el modal [accept-order-sheet.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/pending-acceptance/components/accept-order-sheet.tsx).
*   [efectivo-recibido](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/efectivo-recibido) — Lista los montos de entregas líquidas pendientes de confirmación física y reportes de discrepancia.
*   [deuda](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/deuda) — Permite visualizar la deuda acumulada e historial de pagos manuales.
*   [perfil](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/perfil) — Gestiona la consulta de la configuración del restaurante y notificaciones push.

### 1.3. Endpoints de la API del Dashboard del Restaurante
Excompilados bajo [apps/api/app/api/v1/restaurant](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/api/app/api/v1/restaurant):
1.  `GET /api/v1/restaurant/profile`: Obtiene los datos generales del restaurante (nombre, color de papel asignado, dirección, balance).
2.  `GET /api/v1/restaurant/support-phone`: Obtiene el número de soporte telefónico Tindivo directo desde la tabla `app_settings` (clave `support_phone`).
3.  `POST /api/v1/restaurant/orders`: Crea un pedido de ingreso manual. Aplica validación CORS, verifica el horario de la plataforma y procesa la solicitud bajo el patrón de idempotencia (header `Idempotency-Key`).
4.  `GET /api/v1/restaurant/orders`: Obtiene todos los pedidos del restaurante. Admite filtrar por parámetro de consulta `?status=`.
5.  `GET /api/v1/restaurant/orders/pending-acceptance`: Obtiene los pedidos creados por clientes que requieren aceptación del local.
6.  `GET /api/v1/restaurant/orders/[id]`: Obtiene el detalle de un pedido junto a su historial de estados y las modificaciones de método de pago ocurridas en la entrega.
7.  `PATCH /api/v1/restaurant/orders/[id]`: Edita los datos modificables del pedido antes de que sea recogido por el motorizado.
8.  `POST /api/v1/restaurant/orders/[id]/accept`: Acepta un pedido pendiente y define el tiempo de preparación. Dispara la asignación reactiva de choferes.
9.  `POST /api/v1/restaurant/orders/[id]/cancel`: Cancela un pedido especificando el motivo.
10. `POST /api/v1/restaurant/orders/[id]/extension`: Pide minutos adicionales (+5 o +10 minutos) para la preparación del pedido.
11. `POST /api/v1/restaurant/orders/[id]/ready-early`: Indica que el pedido se terminó de preparar antes de lo previsto (adelanta la cola).
12. `GET /api/v1/restaurant/history`: Obtiene el historial de pedidos de la jornada (completados y cancelados).
13. `GET /api/v1/restaurant/cash-pending`: Obtiene los montos que los motorizados han cobrado pero aún no entregan al restaurante.
14. `GET /api/v1/restaurant/cash-settlements`: Obtiene las liquidaciones de efectivo cerradas por el motorizado del turno actual y anteriores.
15. `POST /api/v1/restaurant/cash-settlements/[id]/confirm`: Cierra el ciclo confirmando la recepción del efectivo.
16. `POST /api/v1/restaurant/cash-settlements/[id]/dispute`: Reporta una diferencia en la liquidación recibida.
17. `GET /api/v1/restaurant/payments`: Obtiene el saldo adeudado del restaurante e historial de transferencias registradas por administración.
18. `GET /api/v1/restaurant/settlements`: Obtiene cortes de facturación históricos.

### 1.4. Modelo de Datos y Tablas (Base de Datos Postgres/Supabase)
Definidos mediante el esquema de base de datos detallado en [Prisma Schema](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/Docs/base_de_datos_v3.md):
*   `restaurants`: Almacena el ID del restaurante, enlace al usuario de autenticación (`user_id`), datos de contacto, número de Yape/Plin (`yape_number`), código hexadecimal del color físico asignado (`accent_color`), balance debido comisiones (`balance_due`) e indicadores de bloqueo.
*   `orders`: Tabla principal del ciclo de vida. Contiene relaciones a restaurante y conductor, montos de venta (`order_amount`), comisiones de entrega (`delivery_fee`), método de pago (`payment_status`), tiempos de preparación (`prep_time_minutes`, `estimated_ready_at`, `appears_in_queue_at`), coordenadas y referencias del cliente, flags de prórrogas/adelantos (`extension_used`, `ready_early_used`), y el estado de entrega actual.
*   `order_status_history`: Tabla de auditoría inmutable de transiciones de estados del pedido.
*   `cash_settlements`: Control de cierres de caja de efectivo. Relaciona restaurante, motorizado y fecha del turno. Registra el monto entregado por motorizado (`delivered_amount`), confirmado por cajero (`confirmed_amount`), reportado en disputa (`reported_amount`), notas de discrepancia (`dispute_note`), y resoluciones del administrador.
*   `restaurant_payments`: Registra las amortizaciones que hace el restaurante para liquidar su deuda comisional con Tindivo.
*   `settlements`: Liquidaciones de comisiones agrupadas por períodos de facturación semanales.
*   `push_subscriptions`: Almacena las suscripciones Web Push activas por dispositivo (`user_id`, `endpoint`, claves criptográficas).
*   `domain_events`: Cola de eventos de dominio utilizada para triggers reactivos de base de datos y envío de notificaciones push.
*   `admin_alerts`: Registro de incidentes que requieren atención de soporte técnico o administrativo de Tindivo (como disputas de caja).

### 1.5. Servicios y Librerías Externas
*   **Supabase Realtime**: Implementado en el cliente vía el hook personalizado `useRealtimeChannel` en [use-realtime-channel.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/lib/supabase/use-realtime-channel.ts). Se suscribe a eventos de inserción y actualización (`*`) en la tabla `orders` filtrando por el `restaurant_id` del usuario autenticado, invalidando de inmediato las queries de TanStack Query para renderizar los cambios en menos de 5 segundos.
*   **Web Push (VAPID) y Service Workers**: Registro automático de Service Worker ([sw.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/sw.ts)) al iniciar la sesión para la recepción de push en background. La base de datos Postgres despacha eventos mediante la extensión `pg_net` llamando a la Edge Function `send-push` tras inserciones en `domain_events`.
*   **Web Audio API (Alertas acústicas sin archivos binarios)**: Utiliza síntesis de sonido en tiempo de ejecución (`OscillatorNode` y `GainNode`) en [use-overdue-feedback.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/shared/hooks/use-overdue-feedback.ts) para generar un beep doble (tonos de 880Hz y 1175Hz) cuando un pedido entra a zona roja de retraso.
*   **API de Vibración del Dispositivo**: Llama a `navigator.vibrate([400, 150, 400, 150, 400])` para alertar físicamente al cajero en terminales táctiles (tablets o móviles Android).

---

## 2. Inventario de Funcionalidades (HUs del Restaurante)

| HU ID | Nombre de la Funcionalidad | Componente / Archivo | Comportamiento Detallado | Validaciones y Reglas de Negocio |
| :--- | :--- | :--- | :--- | :--- |
| **HU-R-001** | Iniciar sesión | [(auth)/login/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/app/(auth)/login/page.tsx) | Autentica al cajero mediante correo y contraseña asignados por Tindivo. No existe autoregistro. | Bloquea el formulario temporalmente si se cometen fallos sucesivos de ingreso. |
| **HU-R-002** | Sesión persistente | [middleware.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/middleware.ts) | Mantiene la sesión activa por 7 días usando cookies con token de Supabase SSR. | El cierre del navegador no elimina la sesión. |
| **HU-R-003** | Cerrar sesión local | [sign-out.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/auth/services/sign-out.ts) | Limpia la sesión del dispositivo actual (`signOutLocal` con `scope: 'local'`). | Preserva sesiones abiertas de la misma cuenta en otros dispositivos (evita desloguear a otros cajeros/turnos). |
| **HU-R-004** | Recuperar contraseña | [(auth)/login/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/app/(auth)/login/page.tsx) | Enlace visual "Olvidé mi contraseña" que muestra instrucciones de contacto administrativo. | No hay flujo automatizado. Indica llamar al teléfono de Tindivo. |
| **HU-R-005** | Ver estado del servicio | [platform-closed-banner.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/shared/components/platform-closed-banner.tsx) | Indicador visual de si el servicio Tindivo está operativo en base a las reglas de horario. | Evalúa el horario forzando la zona horaria `America/Lima` (UTC-5) del servidor. |
| **HU-R-006** | Bloqueo por horario | [new-order-form.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/new-order/components/new-order-form.tsx) | Deshabilita los botones de creación de pedido si la plataforma está fuera de horario. | Aunque se evada la UI, el backend rechaza la petición HTTP con código `403 PLATFORM_CLOSED`. |
| **HU-R-007** | Alerta por deuda | [restaurant-profile.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/perfil/components/restaurant-profile.tsx) | Bloquea la operatividad de la cuenta si el restaurante tiene deudas vencidas con Tindivo. | Se deshabilita la creación de pedidos en el formulario. Permite ver el historial. |
| **HU-R-008** | Elegir preparación | [new-order-form.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/new-order/components/new-order-form.tsx) | Carrusel horizontal para seleccionar el tiempo de preparación. | Presets fijos de 10 a 50 minutos en intervalos de 5 min (10, 15, 20...). El por defecto es 20 min. |
| **HU-R-009** | Métodos de pago | [new-order-form.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/new-order/components/new-order-form.tsx) | Opciones desplegables según la opción de pago: `prepaid`, `pending_yape`, `pending_cash`, o `pending_mixed`. | Valida flujos de caja yape vs efectivo. |
| **HU-R-010** | Calcular vuelto | [new-order-form.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/new-order/components/new-order-form.tsx) | Muestra dinámicamente la diferencia calculada entre el efectivo entregado y el cobro. | `paysWith` no puede ser inferior al monto a cobrar (o a la porción cash si es mixto). |
| **HU-R-011** | Recordatorio papelito | [new-order-form.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/new-order/components/new-order-form.tsx) | Mensaje visual informativo contextualizado al color físico asignado al negocio. | Informativo. No bloquea el formulario. |
| **HU-R-012** | Validar formulario | [new-order-form.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/new-order/components/new-order-form.tsx) | Deshabilita el botón de confirmación hasta que las sumas y datos de contacto sean válidos. | El teléfono debe cumplir con `^9\d{8}$` si se empieza a llenar. Referencia máx. 500 caracteres. |
| **HU-R-013** | Confirmación exitosa | [new-order-form.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/new-order/components/new-order-form.tsx) | Redirige al cajero a la lista de pedidos activos y consume la clave de idempotencia local. | Se consume la clave de idempotencia síncronamente tras respuesta 2xx. |
| **HU-R-014** | Ver pedidos activos | [active-orders.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/active-orders/components/active-orders.tsx) | Tarjetas con ID corto, cliente, montos, conductor asignado, estado y tiempo de preparación restante. | Se ordenan ascendentemente por urgencia de entrega. Excluye estados finalizados (`delivered`, `cancelled`). |
| **HU-R-015** | Semáforo de estados | [active-orders.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/active-orders/components/active-orders.tsx) | Diferencia estados usando iconos y chips con colores para accesibilidad (Rojo, Amarillo, Naranja, Verde). | Cumple estándar WCAG AA con áreas de interacción de 44x44px. |
| **HU-R-016** | Alerta de demora | [urgent-call-card.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/active-orders/components/urgent-call-card.tsx) | Tarjeta roja prominente que insta a llamar a soporte si un pedido vence su preparación sin conductor. | Se activa si el pedido lleva >5 min sin motorizado y el tiempo de preparación caducó. |
| **HU-R-017** | Detalle de pedido | [restaurant-order-detail.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/order-detail/components/restaurant-order-detail.tsx) | Muestra la línea de tiempo vertical de timestamps de rutas, datos de contacto y opciones. | Las opciones (editar, prorrogar, cancelar) se inhabilitan según el estado del flujo. |
| **HU-R-018** | Actualización realtime | [use-restaurant-orders.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/active-orders/hooks/use-restaurant-orders.ts) | Actualiza las tarjetas instantáneamente al recibir notificaciones de Supabase Realtime. | Escucha la tabla `orders` filtrando por el ID del restaurante. |
| **HU-R-019** | Pedido listo antes | [restaurant-order-detail.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/order-detail/components/restaurant-order-detail.tsx) | Envía una alerta al conductor informándole que puede recoger el pedido de forma anticipada. | Disponible si faltan >10 min para el tiempo estimado inicial y el pedido está en `waiting_driver`. |
| **HU-R-020** | Prórroga de tiempo | [restaurant-order-detail.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/order-detail/components/restaurant-order-detail.tsx) | Permite añadir +5 o +10 minutos adicionales al tiempo de entrega si la cocina sufre demoras. | Se puede solicitar **solo una vez** por pedido y antes de que el motorizado llegue al local. |
| **HU-R-021** | Visualizar prórroga | [restaurant-order-detail.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/order-detail/components/restaurant-order-detail.tsx) | Deshabilita el botón de prórroga y añade un indicador temporal "⏱ Prórroga usada (+X min)". | Se registra en la línea de tiempo del detalle del pedido. |
| **HU-R-022** | Cancelación inicial | [restaurant-order-detail.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/order-detail/components/restaurant-order-detail.tsx) | Permite cancelar el pedido libremente y sin confirmaciones complejas si no hay conductor. | Válido en estado `waiting_driver` sin conductor asignado. |
| **HU-R-023** | Cancelación en camino | [restaurant-order-detail.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/order-detail/components/restaurant-order-detail.tsx) | Permite cancelar mostrando una advertencia visual de que el conductor está en tránsito. | Válido en estado `heading_to_restaurant`. Alerta al administrador y notifica al motorizado. |
| **HU-R-024** | Bloqueo cancelación | [restaurant-order-detail.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/order-detail/components/restaurant-order-detail.tsx) | Oculta el botón de cancelación si el conductor ya se encuentra físicamente en el negocio. | Bloqueado a partir del estado `waiting_at_restaurant`. Requiere contacto telefónico con soporte. |
| **HU-R-025** | Solicitud de efectivo | [cash-settlements-list.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/efectivo-recibido/components/cash-settlements-list.tsx) | Notifica en la pestaña Efectivo que el motorizado ha finalizado su turno e iniciado una entrega. | Muestra el desglose de pedidos con ID corto y monto parcial que componen la entrega. |
| **HU-R-026** | Confirmar efectivo | [cash-settlements-list.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/efectivo-recibido/components/cash-settlements-list.tsx) | Registra que el efectivo ingresó a caja, reseteando la deuda pendiente del motorizado a S/ 0. | Permite procesarlo síncronamente con un solo toque desde estado `delivered`. |
| **HU-R-027** | Reportar diferencia | [cash-settlements-list.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/efectivo-recibido/components/cash-settlements-list.tsx) | Registra una disputa de caja ingresando el monto real recibido y comentarios. | Evita confrontaciones. Pone el saldo "En revisión" (`disputed`) y notifica al administrador de Tindivo. |
| **HU-R-028** | Historial del día | [restaurant-history.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/historial/components/restaurant-history.tsx) | Filtros ("Todos", "Entregados", "Cancelados") para listar pedidos completados en el día actual. | Sólo de lectura. Permite abrir los detalles de cada pedido pasado. |
| **HU-R-029** | Métricas del turno | [restaurant-profile.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/perfil/components/restaurant-profile.tsx) | No implementado de forma masiva en el frontend. El perfil muestra el balance de deuda acumulada. | Solo lectura. Refleja saldos de comisiones. |
| **HU-R-030** | Información de cuenta | [restaurant-profile.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/perfil/components/restaurant-profile.tsx) | Muestra datos de registro, color físico asignado, deuda pendiente y botón para activar Web Push. | Datos de solo lectura. Modificables únicamente por la administración central. |

---

## 3. Flujo de "Solicitar Manual" (Crear Pedido) con Detalle Máximo

Este es el flujo principal a través del cual el restaurante registra los pedidos recibidos por teléfono.

### Paso 3.1: Inicio del Flujo
El flujo se activa al presionar el botón de gran tamaño (`SolarCTA`) **"PEDIR MOTO"** en la página de inicio. Esto redirige al usuario a la ruta `/restaurante/nuevo-pedido`, abriendo el componente [NewOrderForm](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/new-order/components/new-order-form.tsx).

### Paso 3.2: Campos y Formulario
El cajero ingresa la información requerida de manera progresiva. La estructura de datos y validaciones incluye:

1.  **Tiempo de Preparación (`prepMinutes`)**:
    *   **Control**: Carrusel horizontal interactivo.
    *   **Valores permitidos**: `[10, 15, 20, 25, 30, 35, 40, 45, 50]` minutos.
    *   **Por defecto**: `20` minutos.
    *   **Condición**: Obligatorio. Es el insumo básico para calcular el tiempo estimado de recogida.
2.  **Nombre del Cliente (`clientName`)**:
    *   **Control**: Campo de texto libre.
    *   **Límites**: Hasta 80 caracteres.
    *   **Condición**: Opcional. Si se deja en blanco, la base de datos registra null.
3.  **Teléfono del Cliente (`clientPhone`)**:
    *   **Control**: Entrada telefónica personalizada ([PhoneInputPe](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/packages/ui/src/primitives/phone-input-pe.tsx)).
    *   **Límites**: 9 dígitos numéricos.
    *   **Condición**: Opcional en base de datos. Sin embargo, **si el cajero escribe algún dígito, la interfaz valida que empiece por 9 y tenga exactamente 9 dígitos** (`/^9\d{8}$/`). Si no cumple, el formulario se bloquea.
4.  **Dirección o Referencia (`deliveryReference`)**:
    *   **Control**: Caja de texto multilinea (textarea).
    *   **Límites**: Hasta 500 caracteres (con contador en tiempo real).
    *   **Condición**: Opcional. Es de suma utilidad para que el conductor reciba indicaciones de cómo llegar.
5.  **Método de Pago (`payment`)**:
    *   **Opciones**:
        *   `prepaid` ("Ya pagó"): El cliente ya canceló (vía transferencia remota). El conductor sólo entrega.
        *   `pending_yape` ("Cobrar con Yape"): El conductor debe cobrar al cliente final usando el código QR del negocio.
        *   `pending_cash` ("Cobrar efectivo" - **seleccionado por defecto**): El conductor recibe efectivo del cliente.
        *   `pending_mixed` ("Yape + Efectivo"): El cobro se realiza combinado (una parte digital y otra en efectivo).

### Paso 3.3: Reglas de Cobros, Desgloses y Vuelto
El formulario activa condicionales según el método de pago seleccionado:
*   Si se selecciona **`prepaid`**:
    *   No se pide monto de pedido. Se asume cobro `S/ 0.00` para el conductor.
*   Si se selecciona **`pending_yape`**, **`pending_cash`** o **`pending_mixed`**:
    *   Se muestra el campo obligatorio **"Monto del pedido"** (`amount`), que debe ser un valor positivo mayor a 0.
*   Si se selecciona **`pending_mixed`**:
    *   Se despliegan dos campos obligatorios: **"Yape"** (`yapePart`) y **"Efectivo"** (`cashPart`).
    *   **Regla de Negocio**: La suma exacta de ambos campos debe coincidir con el monto total del pedido (`yapePart + cashPart === amount`). Ambos deben ser estrictamente mayores que 0.
*   Si se selecciona **`pending_cash`** o **`pending_mixed`**:
    *   Se despliega el campo obligatorio **"Cliente paga con"** (`paysWith`).
    *   **Regla de Negocio**: El billete ingresado por el cliente debe ser mayor o igual al monto total del pedido (o al monto efectivo si es mixto).
    *   **Cálculo Automático**: La interfaz calcula dinámicamente el vuelto:
        *   Efectivo simple: `change = paysWith - amount`
        *   Efectivo mixto: `change = paysWith - cashPart`
    *   **Feedback Visual**: Si `change > 0`, se muestra una alerta color verde esmeralda: *"🛍 Vuelto a entregar al driver: S/ [change]. Prepáralo en efectivo y mételo en la bolsa antes de que llegue el motorizado"*.

### Paso 3.4: Ubicación del Cliente
**Nota crítica de producto**: A diferencia de las apps de delivery convencionales, **el cajero no interactúa con mapas ni coordenadas geográficas**. El cajero sólo registra la indicación de dirección textual en `deliveryReference`.
El motorizado, al llegar al local físico y recoger el pedido, asocia las coordenadas geográficas reales del cliente en su PWA móvil (`saveCustomerData`) usando el mapa integrado de OpenStreetMap/Leaflet, guiándose por la dirección manuscrita en el papel del color del restaurante.

### Paso 3.5: Delivery Fee (Comisión)
No hay cobro inmediato ni cotización de envío en esta pantalla. La comisión de delivery es una tasa fija que se configura de forma individual para cada restaurante en la columna `commission_per_order` de la tabla `restaurants` (por defecto `S/ 1.00`). La base de datos guarda este valor en la columna `delivery_fee` de la tabla `orders` al crear el pedido para asegurar la inmutabilidad contable del histórico.

### Paso 3.6: Idempotencia en la Creación (Stripe Pattern)
Para evitar que problemas de red, latencia o el doble clic del usuario generen pedidos duplicados en la base de datos, el sistema implementa un robusto flujo de idempotencia:
1.  Al montar la página del formulario, el hook `useIdempotencyKey` genera un UUID v4 único y lo almacena en `sessionStorage` asociado al identificador del formulario.
2.  Al enviar el formulario, el cliente API inyecta el UUID en la cabecera HTTP `Idempotency-Key`.
3.  El servidor intercepta el request mediante el middleware `withIdempotency` y lo valida en la tabla `idempotency_keys`:
    *   **Si la clave ya existe y el cuerpo coincide**: Retorna la respuesta cacheada sin re-ejecutar lógica de negocio.
    *   **Si la clave no existe**: Procesa la transacción y guarda la respuesta en caché.
4.  Si el servidor responde exitosamente (código 2xx) o con un error del cliente (4xx), el hook del frontend consume la clave y genera una nueva para el siguiente pedido. Si responde con error de servidor (5xx), la clave se mantiene activa para permitir reintentos seguros.

### Paso 3.7: Acciones Posteriores al Envío
Al presionar el botón "Crear pedido":
1.  Se ejecuta la mutación que envía el payload a `POST /api/v1/restaurant/orders`.
2.  El backend valida la apertura de la plataforma. Si está cerrada, devuelve `403 PLATFORM_CLOSED`.
3.  Se inserta el registro en la tabla `orders` en estado `waiting_driver`.
4.  **Asignación Reactiva Inmediata**: El servidor invoca inmediatamente al caso de uso `AutoAssignOrderUseCase` de forma asíncrona usando una llave con permisos de administración (`SERVICE_ROLE_KEY`), ejecutando las reglas R1 a R5 para buscar y pre-asignar al motorizado más apto en segundos, sin esperar al ciclo periódico de 5 minutos del cron job.
5.  El frontend redirige al usuario a `/restaurante` y la lista de pedidos activos se refresca en tiempo real vía Supabase Realtime.

---

## 4. Documentación de los Demás Flujos del Restaurante

### 4.1. Cola de Aceptación de Pedidos del Cliente (`customer_pwa`)
Cuando un cliente final realiza un pedido a través de la PWA de cara al público (`apps/customer`), el pedido se inserta con `source = 'customer_pwa'` y estado inicial `pending_acceptance`.

1.  **Visualización**: Aparece una sección amarilla arriba de los pedidos activos en el inicio: **"En espera de aceptación"**.
2.  **Countdown de SLA**: Cada tarjeta muestra un temporizador regresivo de **5 minutos** calculado a partir de `pending_acceptance_at`.
    *   Si faltan más de 60 segundos, se muestra en amarillo.
    *   Si faltan menos de 60 segundos, parpadea en rojo ("Venciendo").
    *   Si llega a 0, el pedido es cancelado automáticamente por el cron job de la base de datos `auto-cancel-pending-acceptance` para no retrasar al cliente.
3.  **Aceptación**: El cajero toca la tarjeta abriendo el componente [AcceptOrderSheet](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/apps/web/src/features/restaurante/pending-acceptance/components/accept-order-sheet.tsx). Muestra el desglose de productos y la dirección de entrega del cliente.
4.  **Confirmación**: El cajero define el tiempo de preparación real seleccionando un preset de minutos y presiona "Aceptar y enviar al motorizado". Esto muta el estado a `waiting_driver`, calcula el tiempo estimado de recogida y dispara la búsqueda automática de motorizados (`AutoAssignOrderUseCase`).

### 4.2. Gestión de Tiempos de Cocina (Prórroga y Listo Antes)
Ambas acciones se gestionan desde la pantalla de detalle del pedido en estado `waiting_driver`:

*   **Necesito más tiempo (Prórroga)**:
    *   **Disponibilidad**: Solo visible en estados `waiting_driver` y `heading_to_restaurant`, y siempre que no se haya usado previamente.
    *   **Acción**: El cajero selecciona añadir **`+5 minutos`** o **`+10 minutos`**.
    *   **Efecto**: Suma los minutos al `estimated_ready_at` y `appears_in_queue_at`. Marca la columna `extension_used = true` y bloquea el botón para el resto del ciclo. El conductor asignado recibe una notificación push informando el nuevo horario de recogida.
*   **Pedido listo antes (Adelanto)**:
    *   **Disponibilidad**: Solo visible si el pedido está en `waiting_driver`, no se ha usado la opción con anterioridad, y quedan **más de 10 minutos restantes** para el tiempo estimado inicial. Si queda menos tiempo, el botón desaparece ya que el motorizado se encuentra en camino.
    *   **Acción**: Presiona "Pedido listo antes".
    *   **Efecto**: Modifica `estimated_ready_at` al instante actual más 10 minutos de tránsito para el chofer, y actualiza `appears_in_queue_at` a la hora actual. Notifica al motorizado mediante push: *"[Restaurante] ya tiene tu pedido listo. Puedes ir antes si deseas"*.

### 4.3. Estados del Pedido y Semáforo Visual
Los pedidos transicionan por los siguientes estados definidos en el dominio (`packages/core/src/modules/orders/domain/value-objects/order-status.ts`):

| Estado Físico | Identificador Técnico | Color Chip | Significado Operativo | Acciones Permitidas Restaurante |
| :--- | :--- | :--- | :--- | :--- |
| **En Espera** | `pending_acceptance` | Amarillo | Pedido de cliente aguardando confirmación. | Aceptar pedido (definir tiempo) |
| **Buscando Driver** | `waiting_driver` | Rojo | Pedido creado o aceptado. Sin motorizado asignado aún. | Editar, Cancelar, Prórroga, Listo Antes |
| **Driver en Camino** | `heading_to_restaurant`| Amarillo | Conductor asignado y en ruta hacia el local. | Editar, Cancelar, Prórroga |
| **Driver en Local** | `waiting_at_restaurant`| Naranja | Conductor llegó al local y espera la comida. | Editar (Monto/Método/Nombre) |
| **En Entrega** | `picked_up` | Amarillo Oscuro | Conductor recogió el pedido y viaja al cliente. | Ninguna (Sólo lectura) |
| **Entregado** | `delivered` | Verde | Pedido completado. El efectivo de la venta pasa a deuda del conductor. | Ninguna. Abre flujo de liquidación |
| **Cancelado** | `cancelled` | Gris | Venta anulada (por el restaurante o administración). | Ninguna (Sólo lectura) |

### 4.4. Cierre de Caja y Liquidación de Efectivo (`cash_settlements`)
Cuando un motorizado realiza entregas cobrando en efectivo (`pending_cash` o la porción de `pending_mixed`), el dinero se acumula bajo su responsabilidad. Al regresar al local, inicia el flujo de liquidación:

1.  **Fase "Pendiente del motorizado"**: En la pestaña Efectivo del restaurante, los montos en efectivo cobrados por conductores cuyas entregas no han sido liquidadas se muestran agrupados por motorizado. Permite ver el desglose de pedidos individuales con su ID corto y ofrece un botón rápido de llamada.
2.  **Entrega física**: El conductor presiona "Entregar efectivo" en su aplicación móvil. Esto inserta un registro en la tabla `cash_settlements` con estado `delivered` (Por confirmar).
3.  **Notificación al restaurante**: En la pestaña Efectivo del restaurante aparece una tarjeta de liquidación en la sección **"Por confirmar"**.
4.  **Confirmación de Caja (Caso Feliz)**: El cajero cuenta el dinero físico. Si el monto coincide con el declarado por el conductor, presiona **"Confirmar recepción"**. La API (`POST /api/v1/restaurant/cash-settlements/[id]/confirm`) actualiza el estado a `confirmed`, descuenta el saldo adeudado del motorizado con el restaurante y registra el ID del cajero para auditoría.
5.  **Diferencia de Caja (Disputa)**: Si el dinero físico no coincide, el cajero presiona **"Reportar diferencia"**.
    *   **Regla de Negocio**: Para evitar confrontaciones en el local, la interfaz muestra el aviso: *"No discutas con el motorizado. Reporta la diferencia y Tindivo resolverá el caso"*.
    *   El cajero digita el monto real recibido y escribe una nota descriptiva de al menos 3 caracteres.
    *   Al guardar, la API (`POST /api/v1/restaurant/cash-settlements/[id]/dispute`) actualiza el estado a `disputed` (En revisión), inserta un reporte de atención en `admin_alerts` para que soporte de Tindivo investigue y notifica al motorizado en su app que el saldo quedó bajo revisión.

---

## 5. Lógica Oculta y Casos Extremos en el Backend

### 5.1. Regla de Cálculo de Deuda por Pedido (`cashOwedAtDelivery`)
Al marcarse un pedido como entregado (`delivered`), el motorizado acumula una deuda de efectivo con el restaurante. El cálculo exacto implementado en el núcleo del dominio ([order.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-delivery/packages/core/src/modules/orders/domain/entities/order.ts#L1102-L1128)) es:

$$\text{Deuda Driver} = \text{Vuelto Adelantado} + \text{Monto Cobrado Cliente} - \text{Vuelto Entregado Cliente}$$

Que se simplifica matemáticamente a:

$$\text{Deuda Driver} = \text{Vuelto Adelantado por Restaurante} + \text{Porción en Efectivo del Pedido}$$

*   **Vuelto Adelantado por Restaurante** (`changeAdvance`): Dinero en efectivo que el cajero entregó al motorizado al retirar la bolsa para que tenga cambio físico (equivale a `changeToGive`).
*   **Porción en Efectivo del Pedido** (`cashPortionOfOrder`): Equivalente al total de la venta (`orderAmount`) para pago en efectivo, o a la parte cash (`cashAmount`) en pago mixto.
*   *Caso Yape / Prepago*: La deuda es de S/ 0.00 ya que la transacción monetaria es directa entre cliente y restaurante.

### 5.2. Timeouts y Procesos en Background (Cron Jobs de la Base de Datos)
El motor de base de datos ejecuta tareas programadas recurrentes vía la extensión `pg_cron`:
*   `timeout-unaccepted-assignments`: Monitorea pedidos asignados automáticamente a conductores. Si el conductor no los acepta en menos de **90 segundos** (`assigned_at` anterior a 90s), el sistema remueve su asignación, registra un rechazo automático y promueve el pedido a la **"Cola Urgente"** asignando un timestamp en `urgent_since`.
*   `auto-cancel-pending-acceptance`: Cancela de forma automática los pedidos creados por clientes que el restaurante no acepta en **5 minutos**.
*   `process-expired-transfer-requests`: Las solicitudes de transferencia de pedidos entre motorizados expiran a los **30 segundos**. Si vencen sin respuesta, el sistema interpreta el silencio como una **aceptación automática** y transfiere el pedido, notificando a ambos.
*   `expire-transfer-requests-failsafe`: Si el servicio de transferencia expira pero el solicitante ya no es elegible, anula la transferencia marcándola como expirada simple.

### 5.3. Funcionamiento de la Cola Urgente (FCFS)
Cuando un motorizado rechaza activamente un pedido o se le retira la asignación por timeout de 90 segundos, el pedido se clasifica como urgente:
1.  Se setea `urgent_since = now()` en la base de datos y se elimina el `driver_id`.
2.  El pedido entra en modalidad de "Primer llegado, primer servido" (First-Come, First-Served - FCFS).
3.  Se omiten los algoritmos R1 a R5 de asignación proactiva y el pedido se publica en la sección de pedidos libres de todos los motorizados afiliados a ese local.
4.  Cualquier conductor apto puede tomarlo presionando el botón "Reclamar". Para evitar colisiones de concurrencia, el backend ejecuta una consulta de actualización con bloqueo pesimista en base de datos (`claim_pending_orders` usando `FOR UPDATE SKIP LOCKED`).
