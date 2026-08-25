# Dashboard del Restaurante — Inventario de funcionalidades

## Resumen ejecutivo
El dashboard del restaurante (`@tindivo/negocios`) es una aplicación web (PWA) diseñada para que los encargados y cajeros del restaurante gestionen el ciclo de vida completo de los pedidos en tiempo real. La interfaz les permite monitorear y avanzar pedidos (desde su validación inicial y preparación hasta la entrega al motorizado), crear pedidos manuales recibidos por llamada telefónica, administrar la carta (categorías, platos y disponibilidad de stock), configurar el perfil del local con sus respectivos turnos de atención diarios, y controlar aspectos financieros críticos como la deuda por comisiones acumuladas con Tindivo y la liquidación de dinero en efectivo recaudado por los repartidores en el día.

## Stack técnico
- **Framework:** Next.js 16.2.6 (App Router)
- **UI Library:** Componentes de `@tindivo/ui`
- **Estilos:** Tailwind CSS v4.3
- **Estado y Autenticación:** React (`useState`, `useCallback`, `useEffect`) y control de sesión de Supabase Auth (`@supabase/ssr`)
- **Comunicación con Backend:** API REST centralizada consumida a través de la librería compartida `@tindivo/api-client` (apuntando al endpoint definido en la variable de entorno `NEXT_PUBLIC_API_URL` o `http://localhost:3001/api/v1` por defecto).
- **Notificaciones y Realtime:**
  - **Web Push API:** Utiliza un Service Worker registrado en `/sw.js` y el componente `PushManager` configurado con la llave pública VAPID `NEXT_PUBLIC_VAPID_PUBLIC_KEY` para suscribir el navegador y recibir notificaciones de nuevos pedidos a través del endpoint `POST /push/subscriptions`.
  - **Supabase Realtime:** Suscrito a través de WebSockets (canal Postgres Changes) a las tablas `orders` y `cash_settlements` para refrescar los datos automáticamente ante cualquier mutación en el backend sin requerir recargar la página.
  - **Alertas Sonoras:** Generador de audio mediante Web Audio API (`AudioContext`) con un oscilador senoidal a 880Hz y duración de 0.45 segundos, programado en un ciclo infinito cada 3 segundos cuando existen pedidos pendientes de aceptación y la opción de alertas en cabecera está activada (`soundOn`).

---

## Mapa de archivos
- **[apps/negocios/app/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/page.tsx):** Vista principal de la cola de pedidos activos. Gestiona la lógica de aceptación/rechazo, validación de llamadas/comprobantes de yape, inicio de preparación, alertas auditivas y aviso de cuenta suspendida.
- **[apps/negocios/app/nuevo/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/nuevo/page.tsx):** Formulario de registro de nuevos pedidos manuales (venta directa/telefónica) con validación automática de strikes y prepago.
- **[apps/negocios/app/menu/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/menu/page.tsx):** Editor de la carta comercial. Permite añadir/eliminar categorías, añadir/eliminar platos y prender/apagar la disponibilidad (stock) de cada ítem.
- **[apps/negocios/app/configuracion/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/configuracion/page.tsx):** Editor del perfil básico del restaurante (datos, contacto, yape, ETA, delivery fee y checklist de capacidades) y llamadas al editor de horarios.
- **[apps/negocios/components/schedule-editor.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/schedule-editor.tsx):** Subcomponente embebido en Configuración que edita la programación de turnos de apertura y cierre de lunes a domingo.
- **[apps/negocios/app/deuda/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/deuda/page.tsx):** Panel administrativo de deudas con la plataforma. Muestra el balance acumulado por comisiones de reparto, listado de cobros excepcionales del fondo (adelantos de contingencia) y el historial de liquidaciones de comisiones semanales.
- **[apps/negocios/app/efectivo/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/efectivo/page.tsx):** Panel de conciliación diaria de efectivo entregado por repartidores.
- **[apps/negocios/components/push-manager.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/push-manager.tsx):** Administrador visual flotante para solicitar y registrar la suscripción a notificaciones push web.
- **[apps/negocios/lib/use-audio-alert.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/lib/use-audio-alert.ts):** Hook de efecto sonoro para pedidos pendientes.
- **[apps/negocios/public/sw.js](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/public/sw.js):** Service worker que intercepta eventos push y gestiona la apertura/foco de las pestañas en el navegador ante clicks.

---

## Funcionalidades

### 1. Autenticación y Control de Sesión
- **Archivo(s):** [apps/negocios/app/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/page.tsx)
- **Descripción:** Controla el acceso exclusivo del personal del restaurante al panel mediante un login por correo electrónico y contraseña.
- **Trigger:** Carga inicial de la aplicación o clic en el botón "Salir" del encabezado.
- **Datos:**
  - Pide: Correo electrónico (`email`) y Contraseña (`password`).
  - Muestra: Mensajes de error en color rojo si la autenticación falla en Supabase.
- **Acciones:**
  - Botón "Entrar" (ejecuta el inicio de sesión).
  - Botón "Salir" en el encabezado (ejecuta el cierre de sesión).
- **Estados:**
  - `ready` / `loading` (Cargando sesión inicial).
  - `loading` (Botón "Entrando..." deshabilitado durante la petición).
  - Mensaje de error visible si fallan las credenciales.
- **Reglas:**
  - Si no existe una sesión activa, el enrutador redirige y fuerza la vista del formulario de login.
- **Notas técnicas:** Consume directamente los métodos del cliente web de Supabase `auth.getSession()`, `auth.signInWithPassword()` y `auth.signOut()`.

### 2. Monitoreo en Tiempo Real de Pedidos Activos
- **Archivo(s):** [apps/negocios/app/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/page.tsx)
- **Descripción:** Visualiza una lista ordenada de todos los pedidos del restaurante que requieren atención y se encuentran en curso.
- **Trigger:** Carga de la página o cambios en la base de datos detectados mediante realtime.
- **Datos:**
  - Muestra para cada pedido activo:
    - Código corto del pedido (`short_id`) con formato `#ABC12345`.
    - Nombre del cliente (`customer_name` o por defecto "Cliente").
    - Monto total del pedido (`order_amount`) formateado en soles.
    - Método de pago (`payment_intent` mapeado a etiquetas legibles: "Prepago Yape", "Yape al recibir", "Efectivo" o "Mixto").
    - Tipo de entrega: "Delivery" o "Recojo" (`delivery_method`).
    - Referencia de la dirección de entrega (`delivery_reference`) precedido de un icono 📍 (si existe).
    - Botones de acción contextuales según el estado actual del pedido.
- **Acciones:**
  - Navegar a las secciones administrativas (Menú, Efectivo, Deuda, + Pedido, Config, Salir) en la cabecera.
- **Estados:**
  - Vacío: Muestra la tarjeta con "Sin pedidos activos. Aquí aparecerán al instante." si no hay registros activos.
  - Error: Muestra mensaje de error en color rojo si la consulta de base de datos falla.
- **Reglas:**
  - Se filtran localmente del listado principal los pedidos terminados (estados `delivered` y `cancelled`).
  - La lista está limitada a los últimos 50 pedidos ordenados por fecha de creación descendente (`created_at` desc).
- **Notas técnicas:** Implementa una suscripción a Supabase Realtime en el canal `biz-orders` sobre cambios de Postgres en la tabla `orders` para disparar una función de refetch automático de datos.

### 3. Sistema de Alerta Auditiva y Visual de Pedidos Pendientes
- **Archivo(s):**
  - [apps/negocios/app/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/page.tsx)
  - [apps/negocios/lib/use-audio-alert.ts](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/lib/use-audio-alert.ts)
- **Descripción:** Avisa al encargado del local por medio de sonido recurrente y un mensaje destacado la existencia de nuevos pedidos web que requieren aceptación urgente.
- **Trigger:** Presencia de al menos un pedido en estado `pending_acceptance` (`pendingCount > 0`).
- **Datos:**
  - Banner en la parte superior: "[X] pedido[s] esperando que aceptes." en color amarillo.
  - Botón de control: "🔔 Alertas ON" o "🔕 Activar alertas".
- **Acciones:**
  - Clic en el botón de control: Enciende (`soundOn = true`) o apaga (`soundOn = false`) la reproducción del aviso sonoro.
- **Estados:**
  - Sonido activado o desactivado.
- **Reglas:**
  - El pitido se activa si y solo si `pendingCount > 0` y `soundOn === true`.
  - Debido a restricciones de navegadores modernos sobre la reproducción automática de sonido (Autoplay Policy), se requiere una interacción previa del usuario (clic en el botón) para habilitar el contexto de audio.
- **Notas técnicas:** Genera las alertas de sonido utilizando la API de Audio Web del navegador (`AudioContext`). Modula un oscilador senoidal a 880Hz de frecuencia, encadenando rampas de ganancia exponencial que producen un bip de 0.45 segundos de duración repetido periódicamente cada 3 segundos (3000ms).

### 4. Validación de Pedidos Dudosos (Estado 'validando')
- **Archivo(s):** [apps/negocios/app/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/page.tsx)
- **Descripción:** Interfaz para que el cajero valide los pedidos que requieren confirmación humana antes de ser procesados por la cocina (por ejemplo, clientes nuevos, strikes previos o montos grandes).
- **Trigger:** Pedido en estado `status === 'validando'`.
- **Datos:**
  - Mensaje de instrucción en la tarjeta del pedido: "Revisa el comprobante de Yape" (si es prepago) o "Llama al cliente para validar" (para contra entrega).
- **Acciones:**
  - Botón "Ver comprobante" (solo prepago): Abre en una pestaña nueva la imagen del comprobante de transferencia Yape/Plin enviada por el cliente.
  - Botón "Aprobar" / "Validar": Llama al endpoint de validación con `pass: true`. Esto avanza el pedido al estado `pending_acceptance`.
  - Botón "Rechazar" / "No contesta": Llama al endpoint de validación con `pass: false`. Esto cancela inmediatamente el pedido.
- **Estados:**
  - Ocupado (`busy`): Deshabilita los botones de validación mientras se realiza la consulta HTTP.
- **Reglas:**
  - Los pedidos prepago tienen una ventana de validación de comprobante de **10 minutos** en el servidor antes de expirar.
  - Los pedidos contra entrega que requieren llamada telefónica tienen una ventana de expiración de **5 minutos** antes de auto-cancelarse por `validation_timeout`.
- **Notas técnicas:** Llama a `POST /business/orders/${id}/validate` con el parámetro `{ pass: boolean }`. El comprobante se consulta a través de `GET /business/orders/${id}/prepay-proof` que retorna una URL firmada del Storage de Supabase.

### 5. Aceptación y Cancelación de Pedidos en Cola
- **Archivo(s):** [apps/negocios/app/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/page.tsx)
- **Descripción:** Permite al restaurante decidir la aceptación o rechazo de un pedido web pendiente.
- **Trigger:** Pedidos en estado `status === 'pending_acceptance'`.
- **Datos:** Tarjeta del pedido con los datos comerciales del cliente e ítems comprados.
- **Acciones:**
  - Botón "Aceptar": Avanza el pedido al estado `confirmed`.
  - Botón "Rechazar": Cancela el pedido en el backend enviando la razón `business_cancelled`.
- **Estados:**
  - Ocupado (`busy`).
- **Reglas:**
  - Ventana de aceptación máxima en base de datos: **5 minutos**. Si transcurre ese tiempo sin acción, el backend auto-cancela por inactividad (`pending_acceptance_timeout`).
- **Notas técnicas:** Llama a `POST /business/orders/${id}/transition` con la propiedad `{ action: 'accept' }` o `{ action: 'cancel', reason: 'business_cancelled' }`.

### 6. Configuración de Tiempo de Preparación y Despacho a Cocina
- **Archivo(s):** [apps/negocios/app/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/page.tsx)
- **Descripción:** Permite al encargado del restaurante registrar el tiempo estimado de preparación en minutos y mandar el pedido a la cocina del local.
- **Trigger:** Pedidos en estado `status === 'confirmed'`.
- **Datos:**
  - Entrada numérica de minutos editable en la tarjeta del pedido (`prep`, por defecto 25).
- **Acciones:**
  - Botón "Empezar a preparar": Envía la acción de inicio de cocina con los minutos seleccionados. Cambia el estado del pedido a `preparing`.
- **Estados:**
  - Ocupado (`busy`).
- **Reglas:**
  - El valor numérico del tiempo de preparación debe ser un entero entre 1 y 120 minutos en la interfaz.
  - Al procesar la transición, el backend calcula automáticamente dos marcas temporales:
    - `estimated_ready_at` = `now() + prep_time_minutes`
    - `appears_in_queue_at` = `now() + (prep_time_minutes - 10) minutos`. Esto define cuándo se mostrará el pedido disponible en el panel de los motorizados (10 minutos antes de estar listo).
- **Notas técnicas:** Llama a `POST /business/orders/${id}/transition` con `{ action: 'preparing', prepTimeMinutes: prep }`.

### 7. Extensión de Tiempo de Cocina
- **Archivo(s):** [apps/negocios/app/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/page.tsx)
- **Descripción:** Agrega minutos adicionales de preparación a un pedido que experimenta retrasos en la cocina.
- **Trigger:** Pedidos en estado `status === 'preparing'`.
- **Datos:** Tarjeta del pedido en preparación.
- **Acciones:**
  - Botón "+10 min": Solicita una extensión de tiempo.
- **Estados:**
  - Ocupado (`busy`).
- **Reglas:**
  - Cada clic añade exactamente 10 minutos (configurable en settings de la plataforma) al estimado de entrega.
  - Límite máximo de extensiones: **2 veces** (máximo acumulado de +20 minutos). Al intentar una tercera extensión, el backend rechaza la operación lanzando una excepción.
  - Al realizarse la extensión, se actualizan los campos en base de datos (`prep_extension_count`, `prep_extended_at`, `estimated_ready_at`, `prep_time_minutes`) y se notifica al motorizado asignado.
- **Notas técnicas:** Envía una solicitud `POST` al endpoint `/business/orders/${id}/extend-prep`.

### 8. Declaración de Pedido Listo para Despacho
- **Archivo(s):** [apps/negocios/app/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/page.tsx)
- **Descripción:** Permite indicar que los platos han sido empacados y están listos para ser retirados por el motorizado.
- **Trigger:** Pedido en estado `status === 'preparing'`.
- **Datos:** Tarjeta del pedido en cocina.
- **Acciones:**
  - Botón "Listo para recoger": Avanza el pedido al estado `waiting_driver`.
- **Estados:**
  - Ocupado (`busy`).
- **Reglas:**
  - Una vez avanzado a `waiting_driver`, el pedido se vuelve inmediatamente visible en el panel plano de los motorizados para que cualquiera de ellos lo tome.
- **Notas técnicas:** Llama a la transición `/business/orders/${id}/transition` con `{ action: 'ready' }`.

### 9. Creación de Pedidos Manuales (Venta Directa/Telefónica)
- **Archivo(s):** [apps/negocios/app/nuevo/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/nuevo/page.tsx)
- **Descripción:** Registra pedidos tomados fuera de la web cliente (por ejemplo, llamadas telefónicas) en el flujo operativo de los repartidores de Tindivo.
- **Trigger:** Clic en "+ Pedido" en el encabezado.
- **Datos:**
  - Formulario del cliente:
    - Nombre del cliente (`customerName`) - requerido.
    - Teléfono del cliente (`customerPhone`) - requerido.
    - Tipo de entrega (`deliveryMethod`): "Delivery" o "Recojo".
    - Medio de pago (`paymentIntent`): "Efectivo", "Yape al recibir" o "Prepago".
    - Dirección (`deliveryAddress`) - visible y obligatorio solo si es "Delivery".
    - Referencia (`deliveryReference`) - visible y obligatorio solo si es "Delivery".
    - Notas especiales del restaurante (`notes`) - opcional.
  - Selección de ítems: Listado interactivo de platos con controles de cantidad `+` y `−`.
  - Muestra: Suma acumulada de la compra ("Total ítems").
- **Acciones:**
  - Botón "Crear pedido" (envía el formulario).
  - Botón "← Pedidos" (retorna al panel).
- **Estados:**
  - Guardando (`saving`): Deshabilita controles durante la creación del pedido.
  - Mensaje de Éxito o Error: Feedback visual directo en verde o rojo debajo del botón.
- **Reglas:**
  - Obligatorio incluir al menos un ítem en cantidad mayor a 0.
  - **Filtro Antifraude (Strikes):** Si el número o la dirección ingresados poseen bloqueos activos de contra entrega debido a strikes por no-show en la base de datos, el sistema rechaza la creación a menos que el método de pago seleccionado sea "Prepago".
  - **Filtro por Monto Alto:** Si el total acumulado de los platos es igual o superior al umbral de prepago obligatorio fijado por la plataforma (por defecto S/100, parametrizado en `app_settings.prepay_threshold`) y el pago no es prepago, se rechaza la creación del pedido.
  - Los pedidos manuales creados nacen de forma automática en estado `confirmed` (se asume que el restaurante ya los validó y aceptó al tomarlos por teléfono).
- **Notas técnicas:** Envía la información al endpoint `POST /business/orders`. Carga dinámicamente la carta consumiendo de `menu_items` donde `is_available = true` ordenados por `display_order`.

### 10. Editor del Menú y la Carta Comercial
- **Archivo(s):** [apps/negocios/app/menu/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/menu/page.tsx)
- **Descripción:** Permite configurar las categorías de platos, crear nuevos ítems de comida con sus precios, y prender/apagar la disponibilidad de cada plato según stock real de la cocina.
- **Trigger:** Clic en "Menú" en la cabecera.
- **Datos:**
  - Listado de categorías existentes con sus correspondientes ítems de menú.
  - Formulario inferior de categoría: Campo de texto para agregar una sección (ej. "Hamburguesas").
  - Formulario de plato dentro de cada categoría: Nombre del plato y Precio unitario en soles.
- **Acciones:**
  - Botón "Agregar categoría": Agrega la sección.
  - Botón "Eliminar categoría": Elimina físicamente la categoría y todos los ítems contenidos en ella en cascada.
  - Botón "Activar" / "Agotar" en platos: Cambia el estado de disponibilidad del plato en la plataforma.
  - Botón "✕" en platos: Elimina permanentemente el plato de la base de datos.
  - Botón "+ Ítem" en formulario de platos: Registra el nuevo plato en esa categoría.
- **Estados:**
  - Cargando menú.
  - Visualización del plato inactivo: Si `is_available` es falso, el nombre del plato se muestra tachado y en gris claro en la carta del cliente y en el listado de creación manual.
- **Reglas:**
  - Los precios de los platos deben ser números positivos mayores a cero.
  - El índice de visualización (`display_order`) de las categorías toma por defecto el total de categorías creadas al momento de insertarla.
- **Notas técnicas:** Modifica directamente las tablas `menu_categories` y `menu_items` en Supabase a través del cliente del navegador.

### 11. Perfil e Información Operativa del Negocio
- **Archivo(s):** [apps/negocios/app/configuracion/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/configuracion/page.tsx)
- **Descripción:** Configura la información pública del negocio en el catálogo de clientes y las capacidades operativas del local.
- **Trigger:** Clic en "Config" en el encabezado.
- **Datos:**
  - Formulario con campos:
    - Nombre del restaurante (`name`).
    - Eslogan / Lema (`tagline`).
    - Teléfono del restaurante (`phone`).
    - Número celular de Yape del local (`yapeNumber`).
    - ETA estimado mínimo en minutos (`estimatedEtaMin`).
    - ETA estimado máximo en minutos (`estimatedEtaMax`).
    - Tarifa del servicio de entrega (`deliveryFee`).
    - Color de acento de marca en código hexadecimal (`accentColor`).
  - Checklist de capacidades:
    - Publicar catálogo (`publishesCatalog`).
    - Habilitar recojo en local (`acceptsWebPickup`).
    - Habilitar delivery web (`acceptsWebDelivery`).
    - Utilizar motorizados de Tindivo (`usesTindivoDrivers`).
  - Muestra: Modo actual / Capacidad primaria calculada (`primary_capability`).
- **Acciones:**
  - Botón "Guardar cambios".
- **Estados:**
  - Cargando / Guardando (`saving`).
  - Éxito o error inline.
- **Reglas:**
  - El color hexadecimal debe tener 6 caracteres y cumplir el formato `[0-9a-f]{6}`.
  - El ETA de preparación debe estar en el rango de 1 a 180 minutos.
- **Notas técnicas:** Envía los datos a `PATCH /business/profile`. El backend calcula automáticamente el campo `primary_capability` del negocio de la tabla `businesses` basándose en las 4 opciones booleanas del checklist.

### 12. Programador de Horarios de Atención Semanal
- **Archivo(s):** [apps/negocios/components/schedule-editor.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/components/schedule-editor.tsx)
- **Descripción:** Define las horas de apertura y cierre del negocio para cada uno de los 7 días de la semana, permitiendo dividir el día en dos turnos independientes.
- **Trigger:** Se renderiza al final de la página de Configuración de forma automática.
- **Datos:**
  - Lista de lunes a domingo.
  - Casilla de verificación para marcar el día como abierto.
  - Turno 1: Hora de apertura y Hora de cierre (campos de hora `HH:MM`).
  - Turno 2 (Opcional): Hora de apertura y Hora de cierre.
- **Acciones:**
  - Casilla de día Abierto/Cerrado.
  - Botón "+ 2º turno": Habilita los campos de selección de hora para el Turno 2.
  - Botón "quitar": Elimina el Turno 2.
  - Botón "Guardar horario": Guarda la configuración semanal en base de datos.
- **Estados:**
  - Cargando / Guardando (`saving`).
  - Etiqueta "cruza medianoche" visible en el Turno 1 si el cierre es menor o igual a la apertura.
- **Reglas:**
  - Si la hora de cierre es menor o igual a la hora de apertura (`shift1_end <= shift1_start`), el sistema marca el campo booleano `crosses_midnight` como verdadero en la base de datos para manejar turnos que se extienden al día siguiente.
  - El segundo turno de atención es opcional (puede registrarse nulo).
  - Los días de la semana se guardan mapeados numéricamente del 0 al 6 (donde 0 = Lunes, 1 = Martes, ..., 6 = Domingo).
- **Notas técnicas:** Realiza una inserción masiva (`upsert`) en la tabla `business_schedule` resolviendo conflictos mediante la clave única compuesta `(business_id, day_of_week)`.

### 13. Monitoreo Financiero, Liquidaciones y Disputas de Deuda
- **Archivo(s):** [apps/negocios/app/deuda/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/deuda/page.tsx)
- **Descripción:** Permite ver el saldo de comisiones adeudadas a Tindivo, revisar el historial de liquidaciones de comisiones semanales y disputar cargos excepcionales del fondo de contingencia.
- **Trigger:** Clic en "Deuda" en la cabecera.
- **Datos:**
  - Muestra la "Deuda actual" acumulada (`balance_due`).
  - Datos de contacto y cobranza de la plataforma (leídos de `app_settings.support_whatsapp`).
  - Historial de liquidaciones semanales (`settlements`), mostrando fechas, conteo de pedidos, monto y estado.
  - Lista de "Adelantos del fondo" (`contingency_advances`), detallando monto cobrado, código corto del pedido asociado, descripción del motivo, estado del cargo y fecha.
- **Acciones:**
  - Botón "Disputar": Abre un formulario para ingresar un texto de queja para cargos de contingencia.
  - Botón "Enviar disputa": Registra la disputa con una descripción escrita obligatoria.
  - Botón "Cancelar": Oculta la caja de texto de disputa.
- **Estados:**
  - Alerta por deuda/suspensión: Muestra un banner rojo indicando la suspensión si `is_blocked === true`.
  - Estados del cargo del fondo: `activo` ("Activo"), `disputado` ("En disputa"), `cancelado` ("Anulado").
  - Estados de liquidación: `pending` ("Por pagar"), `paid` ("Pagado"), `overdue` ("Vencido"), `cancelled` ("Cancelado").
- **Reglas:**
  - Solo se pueden disputar adelantos donde el restaurante sea el actor cobrado (`actor_charged === 'restaurante'`), el estado actual sea `activo`, y la fecha de creación sea menor a 48 horas (`DISPUTE_WINDOW_MS = 48 * 3600 * 1000`).
  - Si expira el plazo de 48 horas, se deshabilita la opción de disputa y se muestra el mensaje: "Ventana de disputa (48 h) vencida".
  - Las disputas deben justificar obligatoriamente el reclamo con un mínimo de 5 caracteres.
- **Notas técnicas:** Registra la disputa en el backend llamando a `POST /business/contingency/${id}/dispute` con el JSON `{ note }`.

### 14. Conciliación y Liquidación Diaria de Efectivo del Motorizado
- **Archivo(s):** [apps/negocios/app/efectivo/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/efectivo/page.tsx)
- **Descripción:** Permite conciliar el dinero recaudado en la calle por el repartidor y entregado físicamente en la caja del restaurante.
- **Trigger:** Clic en "Efectivo" en el encabezado.
- **Datos:**
  - Lista de entregas diarias (`cash_settlements`).
  - Cada tarjeta muestra: fecha del cierre, monto reportado por el motorizado (`delivered_amount`), monto esperado en caja según el sistema (`total_cash`), y monto registrado por el restaurante si existió disputa.
- **Acciones:**
  - Botón "Confirmar [Monto]": Indica que el dinero recibido cuadra perfectamente.
  - Botón "Reportar diferencia": Despliega campos para ingresar la cantidad exacta contada en caja y un motivo obligatorio de la diferencia.
  - Botón "Enviar diferencia": Envía la disputa del efectivo.
- **Estados:**
  - Ocupado (`busy`).
  - Estados de liquidación de efectivo: `pending_confirmation` ("Por confirmar"), `confirmed` ("Confirmado"), `auto_assumed_confirmed` ("Confirmado (auto)"), `disputed` ("En disputa"), `resolved` ("Resuelto").
  - Banner amarillo de advertencia "Cuenta el dinero físicamente antes de confirmar" si hay entregas pendientes.
- **Reglas:**
  - El botón de Confirmar y Reportar diferencia solo están activos en registros con estado `pending_confirmation`.
  - **Auto-confirmación:** Si transcurren **24 horas** sin que el negocio confirme o dispute un cierre de efectivo, el backend lo marca automáticamente como confirmado bajo el estado `auto_assumed_confirmed`.
- **Notas técnicas:** Envía la confirmación a `POST /business/cash-settlements/${id}/confirm` y la disputa a `POST /business/cash-settlements/${id}/dispute` con `{ reportedAmount, note }`. Recibe actualizaciones automáticas de la tabla `cash_settlements` a través de realtime (canal `biz-cash`).

### 15. Control de Cuenta Suspendida
- **Archivo(s):** [apps/negocios/app/page.tsx](file:///d:/Tinkuy%20Creativo/Proyectos/Tindivo/Code/tindivo-v2/apps/negocios/app/page.tsx)
- **Descripción:** Bloquea de forma visual el uso del panel si la administración suspende la cuenta del restaurante por deudas pendientes u otros motivos operativos.
- **Trigger:** Detección de la propiedad `is_blocked = true` en el perfil del negocio al cargar la página o por realtime.
- **Datos:** Muestra un banner rojo destacado: "⛔ Tu cuenta está suspendida ([Razón del bloqueo]). Ve a Deuda o contacta a soporte."
- **Notas técnicas:** Lee las propiedades `is_blocked` y `block_reason` directamente de la tabla `businesses`.

---

## Flujos completos

### Flujo 1: Recepción y Aceptación de un Pedido Web en Contraentrega (Validación por Llamada)
1. El cliente crea un pedido contra entrega (Efectivo o Yape al recibir). El sistema detecta que el número telefónico es nuevo o posee strikes de no-show y lo sitúa en estado `validando` (no avanza automáticamente).
2. En el dashboard del negocio, el pedido aparece en la lista con un aviso instructivo destacado: "Llama al cliente para validar" e inhabilita las acciones de cocina.
3. El cajero copia el número de teléfono del cliente (almacenado en la base de datos del pedido) y lo llama para corroborar los datos de entrega y evitar pedidos fraudulentos.
4. **Si el cliente responde y confirma el pedido:** El cajero hace clic en el botón "Validar" (envía `pass: true` al endpoint de validación). El estado del pedido se actualiza a `pending_acceptance`.
5. **Si el cliente no contesta tras varios intentos:** El cajero hace clic en "No contesta" (envía `pass: false` al endpoint). El pedido se cancela automáticamente en el backend y cambia a estado `cancelled`.
6. Con el pedido en `pending_acceptance`, el cajero visualiza los botones de "Aceptar" y "Rechazar".
7. El cajero hace clic en "Aceptar" (envía acción `accept` al endpoint de transición). El pedido cambia al estado `confirmed`.

### Flujo 2: Recepción y Aceptación de un Pedido Web Prepago (Validación de Yape)
1. El cliente realiza su pedido y sube una foto de su comprobante de pago de Yape/Plin. El pedido ingresa a la cola del restaurante en estado `validando`.
2. En el dashboard, la tarjeta del pedido destaca el aviso: "Revisa el comprobante de Yape".
3. El cajero hace clic en el botón "Ver comprobante". Se abre una pestaña del navegador con la imagen del comprobante almacenado en el Storage de Supabase.
4. El cajero compara el comprobante contra los movimientos reales de la cuenta bancaria / Yape del local.
5. **Si el pago es verídico y correcto:** El cajero hace clic en "Aprobar" (envía `pass: true`). El pedido avanza a `pending_acceptance`.
6. **Si el comprobante es falso o no se visualiza el dinero en cuenta:** El cajero hace clic en "Rechazar" (envía `pass: false`). El pedido se cancela automáticamente.
7. En el estado `pending_acceptance`, el cajero hace clic en "Aceptar". El pedido avanza a `confirmed` para iniciar la preparación.

### Flujo 3: Preparación, Extensión de Tiempo y Despacho del Pedido
1. El pedido confirmado en cola muestra un control numérico con el tiempo de cocina asignado (por defecto 25 minutos) junto al botón "Empezar a preparar".
2. El cajero ajusta la duración estimada de cocina en minutos y hace clic en "Empezar a preparar" (envía la transición `preparing` con `prepTimeMinutes`).
3. El estado del pedido cambia a `preparing`. La base de datos calcula de manera atómica la hora límite de preparación y la hora estimada de visibilidad del motorizado (`appears_in_queue_at`).
4. **En caso de retrasos en la cocina:** El cajero hace clic en el botón "+10 min" de la tarjeta del pedido. El sistema suma 10 minutos al tiempo estimado de entrega y notifica al motorizado si ya está asignado (máximo 2 extensiones por pedido).
5. Cuando los platos están listos y empaquetados, el cajero hace clic en el botón "Listo para recoger" (envía la transición `ready`).
6. El pedido cambia a estado `waiting_driver`, haciéndose visible en los paneles de los motorizados para que sea recogido. El negocio puede monitorear las transiciones del repartidor ("Motorizado en camino", "Motorizado en el local", "En reparto") directamente en su tarjeta informativa de forma automática.

### Flujo 4: Liquidación de Efectivo Diario con el Repartidor
1. Al final del turno, el motorizado se presenta en caja para entregar el dinero en efectivo cobrado. Se genera en el sistema un registro de cierre diario en estado `pending_confirmation`.
2. El cajero abre la sección "Efectivo del motorizado" en el panel.
3. Visualiza la tarjeta correspondiente al repartidor indicando la cantidad de dinero reportada y el dinero esperado por el sistema.
4. El cajero recibe el dinero físico del motorizado y realiza el conteo manual.
5. **Si las cuentas cuadran:** El cajero hace clic en "Confirmar [Monto]". El estado del registro cambia a `confirmed`.
6. **Si las cuentas no cuadran:** El cajero hace clic en "Reportar diferencia".
7. Introduce los soles que contó realmente en caja y una justificación textual obligatoria de la diferencia. Hace clic en "Enviar diferencia". El registro pasa a estado `disputed` ("En disputa") y se deriva al panel del administrador para su resolución.

---

## Estados globales y transiciones

El dashboard interactúa con la máquina de estados del backend de Tindivo. El flujo de estados de un pedido y sus transiciones asociadas se resume en el siguiente diagrama de texto:

```
Flujo de Aprobación Inicial (Validación del Restaurante):
[validando]
   │
   ├── (Llamada validada / Pago aprobado en Yape) ──────────> [pending_acceptance]
   │
   └── (Cliente no contesta / Comprobante falso) ───────────> [cancelled] (Razón: validation_timeout / prepay_timeout)

Aceptación y Cocina (Controlado por el Restaurante):
[pending_acceptance]
   │
   ├── (Clic en "Aceptar") ──────────────────────────────────> [confirmed]
   │
   └── (Clic en "Rechazar") ─────────────────────────────────> [cancelled] (Razón: business_cancelled)

[confirmed]
   │
   ├── (Clic en "Empezar a preparar" + minutos) ────────────> [preparing]
   │
   └── (Cancelación del negocio) ────────────────────────────> [cancelled] (Razón: business_cancelled)

[preparing]
   │
   ├── (Clic en "+10 min" - máximo 2 veces) ─────────────────> [preparing] (Ajusta estimated_ready_at)
   │
   ├── (Clic en "Listo para recoger") ───────────────────────> [waiting_driver]
   │
   └── (Cancelación del negocio) ────────────────────────────> [cancelled] (Razón: business_cancelled)

Flujo de Transporte y Cierre (Controlado por el Repartidor o el Admin):
[waiting_driver]
   │
   └── (Motorizado toma el pedido) ──────────────────────────> [heading_to_restaurant]
                                                                     │
                                    (Motorizado llega al local) ─────┘
                                     ▼
                               [waiting_at_restaurant]
                                     │
                                    (Repartidor retira la comida) ────┘
                                     ▼
                               [picked_up]
                                     │
                                     ├── (Repartidor entrega con éxito) ─────> [delivered] (Terminal)
                                     │
                                     └── (Repartidor reporta no-show) ───────> [cancelled] (Razón: no_show; genera strike)
```

> [!NOTE]
> **Cancelaciones:** El backend permite al restaurante cancelar un pedido desde cualquier estado no terminal. Sin embargo, en la interfaz gráfica del dashboard actual, la opción de cancelar/rechazar por parte del restaurante solo se expone de forma visual en la tarjeta durante el estado `pending_acceptance`. Para pedidos en cocina o listos, no hay controles visuales de cancelación en este panel.

---

## Integraciones externas
- **Web Push (Suscripción y Recepción):** Utiliza la API nativa de notificaciones Web Push del navegador, sincronizada con la llave VAPID configurada en `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Registra las credenciales de los navegadores de los cajeros en `POST /push/subscriptions`.
- **Supabase Storage (Comprobantes):** Consumo de URLs firmadas temporales para la visualización segura de los comprobantes de pago de Yape subidos por los clientes a las carpetas del bucket de almacenamiento.
- **Enlace a WhatsApp de Soporte:** Redirección dinámica desde la pestaña de deudas a la aplicación de WhatsApp mediante el número parametrizado en la tabla `app_settings` bajo la clave `support_whatsapp`.
- **Supabase Realtime (WebSockets):** Integración directa en el cliente web para refrescar la lista de pedidos activos y las conciliaciones diarias de efectivo en cuanto ocurran inserciones o actualizaciones en las tablas `orders` y `cash_settlements` de Postgres.

---

## Dudas o ambigüedades para Jesús

Durante la revisión del código fuente del dashboard, se han detectado las siguientes discrepancias o puntos a validar operativamente:

1. **Número telefónico del cliente en OrderCard:** Aunque el campo `customer_phone` se solicita en la consulta de pedidos y se necesita operativamente para que el cajero "llame al cliente" en pedidos en estado `validando`, este número no se visualiza en ningún lugar de la tarjeta del pedido del listado principal. ¿Es intencional por privacidad, o se requiere mostrar el teléfono en la tarjeta?
2. **Imposibilidad de cancelar pedidos avanzados:** La base de datos permite que el restaurante cancele pedidos en estados como `confirmed`, `preparing` o `waiting_driver`. Sin embargo, el dashboard web solo despliega el botón "Rechazar" en `pending_acceptance`. Si un plato se quema o el local sufre un percance a mitad de preparación, el cajero no puede cancelar el pedido desde su panel y requiere contactar a soporte o al administrador. ¿Debe añadirse un botón de cancelación en la interfaz para estados avanzados?
3. **Ausencia de Historial de Ventas:** El listado principal de la página filtra los pedidos cerrados (`delivered` y `cancelled`). Al no existir un menú o pestaña de "Historial", el local pierde de vista todos los pedidos que finalizó o canceló en la jornada. ¿Es correcto que solo se operen pedidos activos, o se requiere una sección para auditar el historial de la noche?
4. **Subida de imagen QR para Yape en Configuración:** En el formulario de configuración se solicita el "Número de Yape" en una caja de texto, pero no hay un campo para subir la imagen del código QR del restaurante, a pesar de que el checkout del cliente suele requerir mostrar un QR de pago. ¿El QR de pago del local se sube de forma manual a la base de datos por administración?
5. **Visibilidad de propinas y vuelto/cambio:** La tarjeta de pedido en el dashboard no muestra si el pedido incluye propina para el motorizado, ni detalla el vuelto a entregar en pagos en efectivo (vuelto/cambio a entregar). ¿Es correcto que el cajero no visualice estos datos, o son necesarios para la entrega y empaquetado?
