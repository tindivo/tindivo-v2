# 01 · Requerimientos funcionales

> PRD operativo. Épicas + Historias de Usuario verificables por rol. Numerados `EPIC-X-N` y `HU-X-NNN` (X = letra del rol). Prioridades P0/P1/P2.

---

## Tabla de contenidos

- [Parte 0 · Cómo leer este documento](#parte-0--cómo-leer-este-documento)
- [Parte 1 · Cliente final (tindivo.com)](#parte-1--cliente-final-tindivocom)
- [Parte 2 · Negocio (negocios.tindivo.com)](#parte-2--negocio-negociostindivocom)
- [Parte 3 · Motorizado (motorizados.tindivo.com)](#parte-3--motorizado-motorizadostindivocom)
- [Parte 4 · Admin (admin.tindivo.com)](#parte-4--admin-admintindivocom)
- [Parte 5 · Cross-rol](#parte-5--cross-rol)

---

## Parte 0 · Cómo leer este documento

- **Épicas**: `EPIC-X-N` donde X es la letra del rol (C cliente, N negocio, D driver, A admin, X cross-rol).
- **HUs**: `HU-X-NNN` (3 dígitos para holgura).
- **Prioridad**:
  - `P0` — sin esto no opera el primer día.
  - `P1` — importante para buena experiencia, primera semana.
  - `P2` — deseable, puede esperar.
- **Formato HU**: "Como [rol], quiero [acción] para [valor]" + criterios de aceptación verificables.
- Las HUs **NO** contienen nombres de tablas, endpoints o código. Solo comportamiento observable.
- Para detalles técnicos: ver `04-base-de-datos.md`, `05-api-rest.md`, `07-flujo-cliente.md` (a 10).

---

## Parte 1 · Cliente final (tindivo.com)

Cliente final que pide comida via PWA pública en `tindivo.com`. Fuente canónica: `REQUIREMENTS.md` del demo en `C:\Users\mauri\Downloads\jesus\`.

### EPIC-C-1 · Exploración sin cuenta

**HU-C-001 · Ver el marketplace sin login · P0**
Como visitante,
quiero ver la lista de negocios sin necesidad de cuenta,
para saber qué hay disponible.
**CA**:
- Acceso a `tindivo.com` sin sesión muestra landing con saludo genérico "¿Qué pedimos hoy en la noche?".
- Lista de negocios activos con catálogo visible (`publishes_catalog = true`).
- Negocios desactivados o sin catálogo NO aparecen.
- Sin requerir login.

**HU-C-002 · Ver el menú de un negocio · P0**
Como visitante,
quiero ver el menú completo de un negocio,
para decidir qué pedir.
**CA**:
- Tap en un negocio activo abre su menú agrupado en categorías.
- Cada item muestra nombre, descripción, precio base, imagen.
- Productos en categoría "Bebidas" usan layout compacto.
- Search bar visible pero no funcional en MVP.

**HU-C-003 · Armar carrito sin login · P0**
Como visitante,
quiero agregar items al carrito sin estar logueado,
para no perder fricción al explorar.
**CA**:
- Selección de modifiers y nota persisten en `sessionStorage`.
- FAB "Ver mi pedido · N · S/ XX" siempre visible cuando hay items.
- Reload del browser preserva el carrito.

**HU-C-004 · Configurar producto con modifiers · P0**
Como cliente,
quiero personalizar un producto eligiendo tamaño / extras / nota,
para ajustar el pedido a mi gusto.
**CA**:
- Modal con grupos `single` (radio) o `multi` (checkbox).
- Grupos `required` marcados con badge "Obligatorio".
- Grupos `multi` muestran counter `n/max` y enforce `max`.
- Stepper de cantidad (1, +, -). Mínimo 1.
- CTA muestra precio total en vivo `(base + Σ modifiers) × qty`.
- Si faltan grupos requeridos: CTA disabled con "Completa N opciones".
- Nota especial opcional, max 140 chars con contador.

### EPIC-C-2 · Auth y onboarding

**HU-C-005 · Iniciar sesión con Google · P0**
Como cliente nuevo,
quiero crear cuenta con un toque usando Google,
para no escribir formularios.
**CA**:
- Botón "Continuar con Google" en sheet de auth.
- Tras autorización, completa nombre + correo automáticamente.
- Pide teléfono + dirección en paso 2.

**HU-C-006 · Iniciar sesión con correo y contraseña · P0**
Como cliente que no quiere usar Google,
quiero crear cuenta con email/password,
para preservar mi privacidad.
**CA**:
- Form con Nombre *, Correo *, Contraseña * (mín 6 chars).
- Sin verificación de email en MVP.
- Email único en el sistema (409 si ya existe).

**HU-C-007 · Capturar teléfono peruano · P0**
Como nuevo cliente,
quiero ingresar mi teléfono con formato peruano,
para que el motorizado me llame.
**CA**:
- Prefijo +51 fijo, no editable.
- Validación regex `^9\d{8}$`.
- Mensaje de error "Debe empezar con 9 y tener 9 dígitos."
- Disclaimer "Nunca compartimos tu número. Solo lo usa el motorizado del pedido en curso."

**HU-C-008 · Capturar dirección con referencia · P0**
Como nuevo cliente,
quiero guardar mi dirección con referencia visual,
para que el motorizado me encuentre.
**CA**:
- Mapa con pin draggable (Leaflet + OSM).
- Botón "Centrar en mi ubicación" (geolocation API).
- Etiqueta: Casa / Trabajo / Otro.
- Calle/Jirón opcional.
- Referencia obligatoria max 140 con contador.

**HU-C-009 · Auth gate suave en carrito · P0**
Como visitante sin sesión,
quiero ver el carrito al abrirlo aunque no esté logueado,
para no perder el contexto de mi compra.
**CA**:
- Al abrir carrito sin sesión, abre sheet auth.
- Sheet se puede dismissar y ver carrito igual.
- No bloquea el carrito.

**HU-C-010 · Auth gate duro en checkout · P0**
Como cliente,
quiero que el checkout exija mi perfil completo,
para que el pedido tenga teléfono y dirección.
**CA**:
- Al pulsar "Continuar" con `signedIn && phone && addresses.length > 0` falso, sheet se reabre y bloquea avance.
- Sheet NO se puede dismissar mientras falten datos.
- Una vez completos, avanza a checkout.

### EPIC-C-3 · Carrito y checkout

**HU-C-011 · Modificar cantidades en carrito · P0**
Como cliente,
quiero ajustar cantidades de items en el carrito,
para corregir mi pedido sin volver al menú.
**CA**:
- Stepper +/- por línea.
- Borrar línea con X (sin confirmación).
- Subtotal y total se recalculan en vivo.

**HU-C-012 · Elegir delivery o pickup · P0**
Como cliente,
quiero elegir entre entrega a domicilio o recoger en el local,
para acomodar a mi disponibilidad.
**CA**:
- Toggle Delivery / Pick-up en checkout.
- Delivery → muestra dirección + delivery_fee.
- Pick-up → muestra info del local + delivery_fee = 0.
- ETA cambia: Delivery 25-35 min, Pickup 20-25 min.

**HU-C-013 · Elegir dirección existente o crear nueva · P0**
Como cliente,
quiero seleccionar entre mis direcciones guardadas o crear una nueva,
para variar destino sin re-escribir cada vez.
**CA**:
- Card de dirección default seleccionada por default.
- Botón "+ Añadir nueva" abre editor.
- Otras direcciones tap para seleccionar.

**HU-C-014 · Editar teléfono y nota del pedido · P1**
Como cliente,
quiero ajustar el teléfono y agregar nota específica de este pedido,
para casos puntuales.
**CA**:
- Teléfono pre-relleno del perfil, editable.
- Nota opcional max 200 chars con contador.

**HU-C-015 · Confirmar entrega antes de pagar · P1**
Como cliente,
quiero ver un resumen final antes de ir a pagar,
para validar todo.
**CA**:
- Modal "Confirma tu entrega" con preview map + dirección + contacto + items + total.
- Botones "Volver" / "Sí, ir al pago".
- Permite editar dirección desde el modal.

### EPIC-C-4 · Métodos de pago

**HU-C-016 · Elegir Yape al recibir · P0**
Como cliente,
quiero pagar Yape cuando llegue el motorizado,
para no transferir antes del pedido.
**CA**:
- Card "Yape al recibir · MÁS USADO" seleccionada por default.
- Descripción inline: "El motorizado lleva su QR y número Yape. Le pagas al recibir tu pedido."
- CTA "Enviar pedido" → confirmed directo.

**HU-C-017 · Elegir efectivo al recibir · P0**
Como cliente,
quiero pagar en efectivo,
para casos sin Yape disponible.
**CA**:
- Selección expande pregunta "¿Con cuánto vas a pagar?" (opcional).
- CTA "Enviar pedido" → confirmed directo.

**HU-C-018 · Prepagar por Yape · P0**
Como cliente,
quiero pagar por adelantado vía Yape,
para que el negocio empiece a preparar sin esperar al motorizado.
**CA**:
- Selección expande: número Yape del negocio + monto exacto, cada uno copiable.
- Texto: "Sin subir captura. El restaurante valida y te llama."
- CTA cambia a "Continuar al pago" → screen prepay con timer 10:00.
- Al expirar timer sin "Ya yapeé", pedido se cancela automático.

### EPIC-C-5 · Tracking del pedido

**HU-C-019 · Recibir confirmación del pedido · P0**
Como cliente,
quiero ver una pantalla de confirmación con ID y siguiente paso,
para sentir control.
**CA**:
- Pantalla full-screen con icono check, ID #TND-XXXXX, mensaje "Tu pedido fue enviado".
- Subtítulo "El restaurante te llamará en breve para confirmarlo."
- Cards: teléfono del negocio + método de pago + total.
- CTA primaria "Ver seguimiento del pedido" → tracking.

**HU-C-020 · Seguir el pedido en vivo · P0**
Como cliente,
quiero ver el estado del pedido actualizado en vivo,
para saber cuándo llega.
**CA**:
- Stepper vertical 5 estados: enviado → confirmado → preparando → en camino → entregado.
- Realtime via Supabase (postgres_changes).
- ETA dinámico.
- Card de detalle con items y total.

**HU-C-021 · Cancelar pedido antes de confirmación · P0**
Como cliente,
quiero poder cancelar si me arrepiento,
mientras el negocio no haya confirmado.
**CA**:
- Botón "Cancelar pedido" visible si `currentState !== 'confirmed'` y estados posteriores.
- Texto guía: "Puedes cancelar mientras el restaurante aún no confirma."
- Razón opcional.

**HU-C-022 · Acceso público al tracking · P0**
Como cliente,
quiero compartir el link de tracking,
para que un familiar vea el estado.
**CA**:
- URL `tindivo.com/pedidos/{shortId}` accesible sin login.
- Muestra info pública: estado, ETA, items resumen, total.
- NO expone teléfono ni IDs internos.

### EPIC-C-6 · Mi cuenta

**HU-C-023 · Ver mi perfil · P0**
Como cliente registrado,
quiero ver mis datos,
para verificar lo guardado.
**CA**:
- Profile card con avatar (inicial sobre brand background), nombre, email, teléfono.

**HU-C-024 · Gestionar direcciones · P0**
Como cliente,
quiero añadir, editar, eliminar direcciones,
para tener varios destinos guardados.
**CA**:
- Lista con icon según label (🏠💼📍), badge "Por defecto" en activa.
- "+ Añadir" abre editor vacío.
- "Editar" en cada una.
- "Marcar como predeterminada" en las que no lo son.
- Al eliminar la default, promueve primera restante.

**HU-C-025 · Ver pedidos anteriores · P1**
Como cliente,
quiero ver lo que pedí antes,
para repetir si me gustó.
**CA**:
- Lista con descripción, ID, fecha relativa, monto.
- Tap detalle (sin reorder en MVP).

**HU-C-026 · Cerrar sesión · P0**
Como cliente,
quiero cerrar sesión,
para proteger mi cuenta.
**CA**:
- "Cerrar sesión" en menú de cuenta.
- Usa `signOutLocal()` (solo este dispositivo).
- Redirige a landing.

### EPIC-C-7 · Soporte

**HU-C-027 · Contactar soporte por WhatsApp · P0**
Como cliente con un problema,
quiero contactar a Tindivo rápido,
para resolver.
**CA**:
- Link "¿Algún problema? Escríbenos" en cancelled, tracking, confirmed.
- Abre `wa.me/51987654321?text=Hola Tindivo 👋, tengo un problema con mi pedido #TND-XXXXX.`
- shortId incluido en el mensaje.

---

## Parte 2 · Negocio (negocios.tindivo.com)

PWA con UI condicional según capacidades. Detalle en `09-flujo-negocios.md`.

### EPIC-N-1 · Onboarding por capacidades

**HU-N-001 · Definir qué quiero hacer con Tindivo · P0**
Como dueño de negocio,
quiero declarar mis capacidades al primer login,
para que la app se adapte a mí.
**CA**:
- Wizard tras primer login con 4 capacidades agrupadas:
  - Publicar mi menú online (`publishes_catalog`)
  - Cliente recoge en mi local — pickup web (`accepts_web_pickup`)
  - Tindivo entrega a domicilio — delivery web (`accepts_web_delivery`)
  - Usar motorizados Tindivo para pedidos manuales (`uses_tindivo_drivers`)
- Validaciones inline:
  - `accepts_web_pickup` requiere `publishes_catalog`
  - `accepts_web_delivery` requiere `publishes_catalog` + `uses_tindivo_drivers` (activa el segundo automático)
  - Si activa `publishes_catalog`, debe marcar al menos una modalidad web (pickup o delivery)
- Sistema deriva `primary_capability` automático vía trigger BD (`drivers_only` / `catalog_pickup` / `catalog_delivery` / `catalog_full` / `pickup_local`).
- Resumen final con explicación del modo.

**HU-N-002 · Completar datos del negocio · P0**
Como dueño nuevo,
quiero ingresar/verificar datos básicos del local,
para operar.
**CA**:
- Nombre, teléfono, dirección.
- Color de acento (validación de unicidad activa).
- Logo opcional.
- Yape (número + QR opcional) si activé motorizados Tindivo.

### EPIC-N-2 · Recibir pedidos web

**HU-N-003 · Ver pedidos pendientes de aceptación · P0** (solo si `accepts_web_pickup=true` o `accepts_web_delivery=true`)
Como cajero/dueño,
quiero ver pedidos nuevos del cliente final,
para aceptarlos o rechazarlos.
**CA**:
- Sección "Pendientes" con cada pedido + timer countdown 5:00 hasta auto-cancel.
- Datos del cliente + items + total + método pago.
- Push notification al recibir pedido nuevo.

**HU-N-004 · Aceptar pedido del cliente final · P0**
Como cajero,
quiero aceptar un pedido eligiendo el tiempo de preparación,
para iniciar la operación.
**CA**:
- Selector horizontal de prep_time: 10 a 50 en pasos de 5.
- Tap "Aceptar" → estado pasa a `waiting_driver` (si usa drivers) o `waiting_for_pickup` (catálogo solo).
- Push al cliente "Pedido confirmado".

**HU-N-005 · Rechazar pedido del cliente · P0**
Como cajero,
quiero rechazar pedidos con razón,
para casos sin stock o fuera de capacidad.
**CA**:
- Modal con razón obligatoria.
- Estado pasa a `cancelled`.
- Push al cliente con razón.

### EPIC-N-3 · Pedidos activos

**HU-N-006 · Ver pedidos en curso · P0**
Como negocio,
quiero ver todos los pedidos activos,
para no perder ninguno.
**CA**:
- Lista con dot color del negocio, shortId, estado, ETA, driver asignado.
- Estados visuales (verde/amarillo/rojo).
- Realtime updates.

**HU-N-007 · Adelantar pedido (listo antes) · P0**
Como cajero,
quiero avisar que el pedido ya está listo antes de tiempo,
para liberar al driver más rápido.
**CA**:
- Botón "Listo antes de tiempo" disponible solo si quedan >10 min al `estimated_ready_at`.
- Una sola vez por pedido.
- Recalcula `appears_in_queue_at = now()`.
- Push al driver asignado.

**HU-N-008 · Pedir extensión de tiempo · P0**
Como cajero,
quiero pedir +5 o +10 min de prep,
para casos de demora real.
**CA**:
- Botones "+5 min" y "+10 min".
- Una sola vez por pedido (no se acumula).
- Push al driver "El restaurante pidió +X min para #ABC".

**HU-N-009 · Cancelar pedido · P0**
Como cajero,
quiero cancelar un pedido con razón,
para casos extremos.
**CA**:
- Disponible solo si estado en {waiting_driver, heading_to_restaurant, waiting_at_restaurant}.
- Modal con razón obligatoria.
- Push al driver si estaba asignado, al cliente.

### EPIC-N-4 · Crear pedido manual

**HU-N-010 · Crear pedido por teléfono · P0**
Como cajero,
quiero registrar un pedido que llegó por teléfono,
para que aparezca un motorizado.
**CA**:
- Form con datos del cliente, monto, método pago, prep_time.
- Recordatorio "¿Ya anotaste en tu papelito [COLOR]?".
- Idempotency-Key requerido.
- Crea con `source='business_manual'`.

**HU-N-011 · Pedido drivers_only con CTA grande "Pedir moto" · P0**
Como negocio drivers_only,
quiero que el botón "Pedir moto" sea lo principal en mi home,
para crear pedidos en 2 taps.
**CA**:
- Si `primary_capability='drivers_only'`, home muestra hero card con CTA enorme.
- Tap abre form rápido (idéntico a HU-N-010).
- Sin tabs de menú/cobros.

### EPIC-N-5 · Editor de menú

**HU-N-012 · Crear categorías de menú · P0** (solo si `publishes_catalog=true`)
Como negocio con catálogo,
quiero organizar mi menú por categorías,
para que el cliente encuentre rápido.
**CA**:
- CRUD de categorías con nombre + blurb.
- Reordenar drag-and-drop.
- Eliminar con confirmación si tiene items.

**HU-N-013 · Crear items del menú · P0**
Como negocio,
quiero agregar platos a una categoría,
para que aparezcan en tindivo.com.
**CA**:
- Form: nombre, descripción, precio base, imagen, disponibilidad, badges.
- Upload de imagen a Supabase Storage.
- Toggle disponibilidad oculta el item del público sin borrarlo.

**HU-N-014 · Crear grupos de modificadores · P1**
Como negocio,
quiero ofrecer opciones (tamaño, extras) en mis items,
para personalizar el pedido del cliente.
**CA**:
- CRUD de grupos: nombre, single/multi, required, min/max.
- Asociar a items vía M:N.
- CRUD de opciones dentro del grupo: nombre, precio adicional, disponibilidad.

**HU-N-015 · Cambios en menú visibles instantáneos · P0**
Como negocio,
quiero que mis cambios al menú aparezcan inmediatamente en tindivo.com,
para no esperar.
**CA**:
- Tras editar/crear/borrar, `tindivo.com` se actualiza vía Realtime o revalidación.
- Sin caché agresivo del menú.

### EPIC-N-6 · Efectivo recibido

**HU-N-016 · Ver efectivo entregado por driver · P0** (solo si `uses_tindivo_drivers=true`)
Como cajero,
quiero ver lo que un motorizado dice haberme entregado,
para confirmar.
**CA**:
- Push "Carlos R. dice S/ 87.00 (3 pedidos)".
- Card en sección Efectivo con detalle.

**HU-N-017 · Confirmar monto recibido · P0**
Como cajero,
quiero confirmar el efectivo,
para cerrar el ciclo.
**CA**:
- Tap "Confirmar" → ingresar `received_amount`.
- Si coincide → `status=confirmed`.

**HU-N-018 · Reportar diferencia de efectivo · P0**
Como cajero,
quiero reportar si recibí menos de lo que dijo el driver,
para que admin resuelva.
**CA**:
- "Reportar diferencia" → ingresar monto real + nota obligatoria.
- Texto guía: "Tindivo resolverá la disputa. No discutas con el motorizado."
- `status=disputed`. Push al admin y al driver.

### EPIC-N-7 · Deuda con Tindivo

**HU-N-019 · Ver mi deuda con Tindivo · P0**
Como negocio,
quiero saber cuánto debo a Tindivo,
para presupuestar el pago.
**CA**:
- Deuda actual + pedidos de la semana en curso.
- Próximo vencimiento.
- Cómo pagar (Yape, transferencia).

**HU-N-020 · Ver historial de liquidaciones · P1**
Como negocio,
quiero ver liquidaciones pasadas con estado,
para confirmar pagos.
**CA**:
- Lista: período, monto, estado (pending/paid/overdue), fecha de pago si aplica.

### EPIC-N-8 · Configuración y capacidades

**HU-N-021 · Cambiar capacidades en vivo · P0**
Como dueño,
quiero cambiar mis capacidades cuando mi modelo de negocio evolucione,
para no quedar limitado.
**CA**:
- Toggles independientes en Configuración → Capacidades (4 flags: publishes_catalog, accepts_web_pickup, accepts_web_delivery, uses_tindivo_drivers).
- Validación de dependencias en cliente, endpoint Y constraint BD:
  - `accepts_web_pickup` requiere `publishes_catalog`
  - `accepts_web_delivery` requiere `publishes_catalog` + `uses_tindivo_drivers`
  - Si `publishes_catalog=true`, al menos uno de pickup o delivery web activo
- Avisos contextuales antes de guardar:
  - Desactivar `publishes_catalog` → "Tu menú dejará de aparecer en tindivo.com inmediatamente. Tus items NO se borran."
  - Desactivar `accepts_web_delivery` → "El cliente ya no podrá pedir delivery web. Pedidos activos siguen normal."
  - Desactivar `uses_tindivo_drivers` → cascade desactiva `accepts_web_delivery` (con confirmación).
- UI se actualiza en vivo (BottomNav y dashboard) vía Zustand reactivo al guardar.

**HU-N-022 · Editar perfil del negocio · P0**
Como dueño,
quiero actualizar mis datos,
para mantener info correcta.
**CA**:
- Edición de nombre, teléfono, dirección, ETA, delivery fee al cliente, Yape, QR.
- Cambio de color de acento con validación de unicidad.

**HU-N-023 · Activar push notifications · P0**
Como cajero,
quiero recibir push al instante cuando llega un pedido,
para no perder ventas.
**CA**:
- Prompt al primer login.
- Banner persistente si denegado: "Activa notificaciones para no perder pedidos".

---

## Parte 3 · Motorizado (motorizados.tindivo.com)

PWA del driver. Detalle en `10-flujo-motorizados.md`.

### EPIC-D-1 · Acceso y disponibilidad

**HU-D-001 · Iniciar sesión · P0**
Como motorizado,
quiero acceder a mi panel con credenciales que me dio el admin,
para empezar a recibir pedidos.
**CA**:
- Email + password.
- Si está desactivado (`is_active=false`), mensaje: "Perfil desactivado. Contacta a Tindivo".

**HU-D-002 · Activar disponibilidad · P0**
Como driver,
quiero ponerme disponible para recibir pedidos,
al empezar mi turno.
**CA**:
- Toggle en header.
- Solo se activa dentro de horario operativo + dentro de turno.
- Si fuera de horario: mensaje "El servicio opera {días} de {hora} a {hora}".

**HU-D-003 · Cierre automático al fin de turno · P0**
Como driver,
quiero que el sistema me cierre automáticamente al fin del turno,
para no quedar disponible por error.
**CA**:
- Inngest `closeDriversAtShiftEnd` ejecuta a `shift_end`.
- Si tengo pedidos activos, sigo con ellos pero no recibo nuevos.

### EPIC-D-2 · Recibir asignaciones

**HU-D-004 · Recibir pedido asignado automático · P0**
Como driver disponible,
quiero ser asignado a pedidos por R1-R5,
para distribuir carga eficientemente.
**CA**:
- Sistema aplica R1 (grouping) → R2 (capacidad restaurantes) → R3 (capacidad mochila) → R4 (least loaded) → R5 (cola).
- Push notification "Te asignaron un pedido".
- Aparece en tab Activos.

**HU-D-005 · Aceptar/rechazar asignación · P0**
Como driver,
quiero decidir si tomo o rechazo,
para gestionar mi carga.
**CA**:
- Tab Disponibles muestra pedidos en ventana.
- Acciones: Aceptar / Rechazar (con razón opcional).
- Rechazar → pedido pasa a cola urgente.
- Mi rechazo cuenta en R4 (penaliza mi posición).

**HU-D-006 · Reclamar pedido urgente · P0**
Como driver,
quiero tomar pedidos urgentes con un toque,
para ganar prioridad sobre otros.
**CA**:
- Cards rojas con "URGENTE" en Disponibles.
- Tap "Reclamar" → RPC atómico. Primer driver gana.
- Si pierdo race condition, toast "Ya fue tomado".

### EPIC-D-3 · Ejecutar pedido

**HU-D-007 · Marcar llegada al local · P0**
Como driver,
quiero confirmar que llegué al restaurante,
para que el cajero sepa.
**CA**:
- Tap "He llegado" desde detail.
- Estado pasa a `waiting_at_restaurant`.
- Push al negocio.

**HU-D-008 · Recoger pedido declarando slots y banda · P0**
Como driver,
quiero declarar cuántos slots ocupa y la distancia al cliente,
para que el sistema sepa mi capacidad y cobre comisión correcta.
**CA**:
- Sheet de recogida con OccupancySelector (1/2/3) y DistanceBandSelector (cerca/media/lejos).
- Verificar datos del cliente (teléfono, dirección).
- Estado pasa a `picked_up`. Push al cliente "Tu pedido salió".

**HU-D-009 · Cambiar método de pago real · P0**
Como driver,
quiero cambiar el método si el cliente decidió pagar distinto,
para evitar discrepancias.
**CA**:
- Modal con opciones: yape al recibir / efectivo / mixto / ya pagó.
- Si efectivo: ingresar "cliente paga con" y mostrar vuelto.
- Si mixto: monto Yape + monto efectivo (validar suma = total).
- Snapshot del método original preservado.

**HU-D-010 · Marcar entregado · P0**
Como driver,
quiero confirmar la entrega,
para cerrar el pedido.
**CA**:
- Modal con confirmación + nota opcional.
- Estado pasa a `delivered`.
- Calcula `cash_owed_at_delivery` y `tindivo_commission`.
- Push al cliente y negocio.

### EPIC-D-4 · Transferencias entre drivers

**HU-D-011 · Ver pedidos del equipo · P0**
Como driver,
quiero ver pedidos activos de compañeros,
para considerar tomarlos si tengo capacidad.
**CA**:
- Tab Equipo con pedidos de drivers autorizados a los mismos negocios.
- Filtrado a los que están en mi lista de `driver_restaurants`.

**HU-D-012 · Solicitar transferencia · P0**
Como driver con capacidad,
quiero pedir un pedido del equipo,
cuando estoy cerca del local.
**CA**:
- Botón "Pedir pedido" en card.
- Validación inmediata: no soy dueño, tengo capacidad, estoy autorizado.
- Idempotency-Key.
- Push al dueño actual: "{Yo} quiere tu #ABC123 · 30s".

**HU-D-013 · Aceptar/rechazar solicitud recibida · P0**
Como driver propietario,
quiero decidir si transfiero,
en 30s.
**CA**:
- Push + sección "Recibidas" con timer countdown.
- Acciones: Aceptar / Rechazar.
- Si no respondo en 30s: timeout-as-accept (transfer automático si solicitante sigue elegible, o expired si no).

### EPIC-D-5 · Efectivo del turno

**HU-D-014 · Ver mi efectivo del día · P0**
Como driver,
quiero ver cuánto debo entregar a cada negocio,
para preparar el viaje de cierre.
**CA**:
- Sección Efectivo con resumen total + breakdown por negocio.
- Pedidos asociados a cada monto.

**HU-D-015 · Entregar efectivo al negocio · P0**
Como driver,
quiero registrar la entrega de efectivo,
para que el negocio confirme.
**CA**:
- Modal con monto pre-calculado.
- Monto editable si difiere de la realidad.
- Texto guía: "El cajero contará. Si hay diferencia, NO discutas. Tindivo resolverá."
- POST genera `cash_settlements` con `status=pending_confirmation`.

### EPIC-D-6 · Notificaciones y configuración

**HU-D-016 · Activar push críticos · P0**
Como driver,
quiero recibir push fiables para no perder pedidos,
para responder rápido.
**CA**:
- Onboarding obligatorio de push al primer login.
- Banner persistente si denegado.
- Detección Android battery optimization → tutorial.

**HU-D-017 · Editar mi perfil · P1**
Como driver,
quiero actualizar mi teléfono/vehículo,
para mantener info correcta.
**CA**:
- Edición de teléfono, vehicle_type, license_plate (no shift_start/end ni operating_days — eso lo cambia admin).

---

## Parte 4 · Admin (admin.tindivo.com)

### EPIC-A-1 · Acceso y monitor

**HU-A-001 · Iniciar sesión admin · P0**
**CA**:
- Email + password del admin.
- Configurado fuera del panel (no hay autoregistro).
- 5 intentos fallidos → bloqueo 60s.

**HU-A-002 · Ver KPIs del día al entrar · P0**
**CA**:
- 8 cards en dashboard: pedidos · cancelados · GMV · comisión · ticket promedio · tiempo promedio · % a tiempo · efectivo en circulación.
- Realtime updates.

**HU-A-003 · Monitor en vivo de pedidos por estado · P0**
**CA**:
- 4 contadores grandes: esperando driver · en camino local · en entrega · por enviar tracking.
- Actualizados en < 2s ante cualquier cambio.

**HU-A-004 · Lista de pedidos activos · P0**
**CA**:
- Cards ordenadas por urgencia (urgentes primero).
- Tap → detalle del pedido.

### EPIC-A-2 · Gestión de pedidos

**HU-A-005 · Buscar pedido por shortId o teléfono · P0**
**CA**:
- Filtros: estado, negocio, driver, rango fechas, método pago, texto libre.
- Paginación.

**HU-A-006 · Ver detalle inmutable de pedido · P0**
**CA**:
- Datos completos del pedido.
- Línea de tiempo con timestamps y autor de cada transición.
- Nada editable. Solo acciones de admin.

**HU-A-007 · Cancelar cualquier pedido · P0**
**CA**:
- Disponible en cualquier estado activo.
- Modal con advertencia extra si `picked_up`.
- Razón obligatoria.
- Push al driver y/o negocio.

**HU-A-008 · Reasignar a otro driver · P0**
**CA**:
- Disponible si hay otro driver disponible y autorizado.
- Push al driver original ("reasignado") y al nuevo ("te asignaron").

**HU-A-009 · Corregir teléfono cliente · P1**
**CA**:
- Solo en `waiting_driver` o `heading_to_restaurant`.
- Razón obligatoria.
- Queda en línea de tiempo.

### EPIC-A-3 · Envío de tracking

**HU-A-010 · Gestionar envío de tracking · P0**
**CA**:
- Sección dedicada con pedidos `picked_up` sin `tracking_link_sent_at`.
- Copiar link al portapapeles.
- Marcar como enviado.

### EPIC-A-4 · Gestión de negocios

**HU-A-011 · CRUD negocios · P0**
**CA**:
- Crear con nombre, teléfono, dirección, email + password, Yape, color, capacidades iniciales.
- Validar color único entre activos.
- Editar todos los campos excepto ID.
- Bloquear/desbloquear con razón.

**HU-A-012 · Override de capacidades · P1**
**CA**:
- Admin puede forzar capacidades para casos edge (ej. negocio nuevo en prueba).

### EPIC-A-5 · Gestión de drivers

**HU-A-013 · CRUD drivers · P0**
**CA**:
- Crear con nombre, teléfono, vehículo, días, turno, email + password, negocios autorizados.
- Editar.
- Desactivar con confirmación si tiene pedidos activos.

**HU-A-014 · Asignar negocios autorizados por driver · P0**
**CA**:
- Multi-select de negocios activos.
- Cambios reflejan inmediato en R1-R5 y en Equipo.

### EPIC-A-6 · Cobros

**HU-A-015 · Generar liquidaciones semanales · P0**
**CA**:
- Botón "Generar de la semana".
- Preview por negocio con totales.
- Admin excluye, edita vencimientos.
- Confirma → settlements `pending`.

**HU-A-016 · Marcar liquidación como pagada · P0**
**CA**:
- Por settlement: método pago + nota.
- Trigger BD descuenta `balance_due`.
- Desbloqueo automático si estaba bloqueado por mora.

**HU-A-017 · Ver historial de pagos · P1**
**CA**:
- Lista de `restaurant_payments`. CSV export.

### EPIC-A-7 · Disputas

**HU-A-018 · Resolver disputas de efectivo · P0**
**CA**:
- Lista de `cash_settlements` con `status=disputed`.
- Modal con info: pedidos del día, snapshot driver, snapshot negocio.
- Decisión: aceptar driver / aceptar negocio / custom.
- Nota obligatoria.
- Push a ambas partes.

### EPIC-A-8 · Métricas

**HU-A-019 · Ver métricas avanzadas · P1**
**CA**:
- Selector de rango temporal.
- 6 sub-tabs: ventas · demanda · drivers · negocios · funnel · cancelaciones.
- CSV export.

### EPIC-A-9 · Auditoría

**HU-A-020 · Auditar eventos del sistema · P1**
**CA**:
- Stream filtrable de `domain_events`.
- Útil para investigar issues post-mortem.

### EPIC-A-10 · Configuración

**HU-A-021 · Configurar horario operativo · P0**
**CA**:
- Días activos + start/end HHMM.
- Soporte cross-medianoche.
- Timezone Lima.

**HU-A-022 · Configurar reglas R1-R5 · P1**
**CA**:
- maxOrdersPerDriver, maxRestaurantsPerDriver, maxOccupancySlotsPerOrder, groupingWindowMinutes.

**HU-A-023 · Configurar teléfono de soporte · P0**
**CA**:
- Aparece en todas las apps como link WhatsApp.

**HU-A-024 · Configurar comisiones · P1**
**CA**:
- Pickup, near, medium, far.
- Override del default global. Negocios pueden tener su propio override.

---

## Parte 5 · Cross-rol

Reglas y comportamientos que aplican a más de un rol.

### EPIC-X-1 · Eventos y notificaciones

**HU-X-001 · Outbox de eventos de dominio · P0**
**CA**:
- Cada cambio de estado importante emite evento en `domain_events`.
- Trigger Postgres dispatcha a Edge Function send-push y/o Inngest.

**HU-X-002 · Push críticos con requireInteraction · P0**
**CA**:
- Eventos críticos (asignación, urgencia, transferencia, llegada) usan `requireInteraction: true + vibrate`.
- Tag dedup `${event_type}-${shortId}`.

**HU-X-003 · Scheduling event-driven · P0**
**CA**:
- Deadlines individuales (overdue +5min, transfer +30s, pending_acceptance +5min) usan Inngest con `step.sleepUntil()`.
- Failsafe crons cada 5 min.

### EPIC-X-2 · Idempotencia

**HU-X-004 · Idempotency-Key en POSTs de creación · P0**
**CA**:
- Cliente genera UUID v4 persistido en sessionStorage por formId.
- Servidor cachea respuesta 24h.
- Misma key + body distinto → 409.

### EPIC-X-3 · Sesiones multi-dispositivo

**HU-X-005 · Logout local por dispositivo · P0**
**CA**:
- `signOutLocal()` cierra solo el dispositivo actual.
- Otras sesiones del usuario siguen activas.

**HU-X-006 · Multi-rol con selector · P1**
**CA**:
- Usuario con N roles ve selector al login.
- Cada opción redirige al subdominio del rol.

### EPIC-X-4 · Horario y bloqueos

**HU-X-007 · Bloqueo de operación fuera de horario · P0**
**CA**:
- Negocios no pueden crear pedidos fuera del horario.
- Drivers no pueden activarse.
- Endpoint retorna 403 `OUT_OF_OPERATING_HOURS`.

**HU-X-008 · Negocio bloqueado por mora · P0**
**CA**:
- Si `is_blocked=true`, endpoints de creación devuelven 403.
- Catálogo se oculta de tindivo.com (pero datos se preservan).
- Push al negocio.

### EPIC-X-5 · Realtime

**HU-X-009 · Actualizaciones en vivo via Supabase Realtime · P0**
**CA**:
- Apps se suscriben a `postgres_changes` filtrados por sus IDs relevantes.
- Reconexión automática con exponential backoff.
- Banner si conexión perdida >5s.

### EPIC-X-6 · Soporte WhatsApp

**HU-X-010 · Link a WhatsApp con contexto · P0**
**CA**:
- Cada pantalla crítica tiene link `wa.me/<phone>?text=...`.
- `phone` configurable desde admin/settings.
- Mensaje pre-relleno incluye contexto (shortId, pantalla, error).

---

**Resumen**: 4 roles × ~20 HUs cada uno + cross-rol. Total ~80 HUs. P0 cubren MVP funcional, P1/P2 son enhancements post-MVP. Detalles de UX en docs 07-10. Detalles técnicos en docs 03-05.

**Última actualización**: 2026-05-23. Versión MVP v2.
