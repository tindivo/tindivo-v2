# FASE 1 · Tindivo — Documento de Orquestación

> **Qué es este documento.** Es el **punto de entrada obligatorio** para cualquier agente que vaya a construir Tindivo en su primera fase. No reemplaza ni reproduce los specs técnicos (`00`–`14`), el Documento Maestro, el Design Spec ni la documentación de paneles. Los **orquesta**: define el alcance real de la Fase 1, fija las decisiones que se tomaron por fuera de los specs, corrige lo que cambió, y le dice a cada agente **qué construir y con qué documentos apoyarse**.
>
> **Orden de precedencia (si hay conflicto entre fuentes):**
> 1. **Este documento (`FASE-1-TINDIVO.md`)** — manda en todo lo relativo al alcance de la Fase 1.
> 2. **`Tindivo_Documento_Maestro.md`** — reconciliación de reglas de negocio y dinero.
> 3. **Specs técnicos `00`–`14`** — el detalle de cómo construir.
> 4. **`Tindivo_Design_Spec.html` + `FLUJO_TINDIVO.md`** — verdad visual y de comportamiento del cliente.
> 5. **`DOCUMENTACION_PANELES_TINDIVO.md`** — referencia de UX validada en producción anterior (NO es el target; es inspiración).
>
> Si un spec dice algo que este documento contradice, **gana este documento** para la Fase 1.
>
> **Mercado piloto:** San Jacinto, Áncash · **Restaurante inicial:** La Florencia · **Idioma:** español peruano · **Modo de color:** light mode siempre, sin dark mode.

---

## Tabla de contenidos

- [1. Norte de la Fase 1](#1-norte-de-la-fase-1)
- [2. Modelo de configuración por restaurante](#2-modelo-de-configuración-por-restaurante)
- [3. Las 4 apps — alcance por actor](#3-las-4-apps--alcance-por-actor)
- [4. Responsive — todos los actores](#4-responsive--todos-los-actores)
- [5. Notificaciones de audio (crítico para restaurante)](#5-notificaciones-de-audio-crítico-para-restaurante)
- [6. Gestión de horarios](#6-gestión-de-horarios)
- [7. Categorías de negocio](#7-categorías-de-negocio)
- [8. Métodos de pago — Yape/Plin, configurables](#8-métodos-de-pago--yapeplin-configurables)
- [9. Anti-fraude y validación humana en contraentrega](#9-anti-fraude-y-validación-humana-en-contraentrega)
- [10. Fondo de contingencia y adelantos](#10-fondo-de-contingencia-y-adelantos)
- [11. Gestión de deuda del restaurante](#11-gestión-de-deuda-del-restaurante)
- [12. Bandeja de reportes — los 6 tipos](#12-bandeja-de-reportes--los-6-tipos)
- [13. Términos, privacidad y consentimiento](#13-términos-privacidad-y-consentimiento)
- [14. Reglas de tiempo y cancelación](#14-reglas-de-tiempo-y-cancelación)
- [15. Pedidos manuales vs. pedidos web](#15-pedidos-manuales-vs-pedidos-web)
- [16. Logs de eventos de pedido](#16-logs-de-eventos-de-pedido)
- [17. Lo que NO entra en la Fase 1](#17-lo-que-no-entra-en-la-fase-1)
- [18. Design system aplicado](#18-design-system-aplicado)
- [19. Matriz de documentos por agente](#19-matriz-de-documentos-por-agente)
- [20. Checklist de lanzamiento](#20-checklist-de-lanzamiento)

---

## 1. Norte de la Fase 1

**El objetivo de la Fase 1 es simple:** que un pedido real entre, se prepare y se entregue, repetidamente, sin quejas, con **un restaurante (La Florencia)** operando de noche (~6 PM a 11 PM), y un motorizado (que puede ser el propio fundador al inicio o como respaldo).

Durante la primera semana se aprende del comportamiento real, se corrigen bugs, y se va migrando lo que haga falta a la aplicación nueva sobre el stack v2. **No se busca completitud, se busca que el ciclo funcione de punta a punta.**

### Principios de la fase

1. **Construir para escalar, lanzar para aprender.** El código y el modelo de datos deben estar preparados para N restaurantes, N motorizados y todas las capacidades; pero la Fase 1 activa solo lo mínimo para operar una noche con La Florencia.
2. **El admin configura, no el código.** Qué servicios y métodos de pago usa cada restaurante se decide desde el panel admin, no se hardcodea. La Florencia es solo la primera configuración.
3. **Sin automatizaciones prematuras.** Nada de asignación automática de motorizados (R1-R5, FCFS) en esta fase. Todo pedido cae en un único panel de motorizado y él lo toma. Ver [§3.3](#33-motorizado).
4. **El humano es el filtro.** La validación anti-fraude del piloto es la **llamada de confirmación** del restaurante/admin, no un sistema técnico. Ver [§9](#9-anti-fraude-y-validación-humana-en-contraentrega).
5. **Trazabilidad sobre velocidad.** Todo evento queda registrado con captura, monto, timestamp y actor. Reconstruir un pedido el martes a las 9 AM no debe requerir adivinar nada. Ver [§16](#16-logs-de-eventos-de-pedido).

### El número que se mira cada noche

El motorizado es **costo fijo** (~S/30 la noche). La rentabilidad depende de **volumen**, no de evitar fraude. **Punto de equilibrio ≈ 10 pedidos/noche.** Por debajo de eso, la noche pierde plata aunque todo salga perfecto. (Detalle en `Tindivo_Documento_Maestro.md` §2.)

---

## 2. Modelo de configuración por restaurante

Cada restaurante en Tindivo se configura desde el admin combinando **capacidades** y **métodos de pago**. Esto es lo que permite escalar: cada restaurante nuevo es una nueva configuración, no código nuevo.

### Capacidades (qué puede hacer un restaurante)

El sistema usa booleanos granulares combinables (definidos en `00-vision.md` §8 y `04-base-de-datos.md`). Para la Fase 1 importan estos modos derivados:

| Modo | Qué significa | ¿En Fase 1? |
|------|---------------|-------------|
| `drivers_only` | Restaurante registra pedidos que llegaron por teléfono y solicita un motorizado manualmente. Sin catálogo web. | Sí, soportado |
| `catalog_full` | Catálogo web + pedidos web + motorizados Tindivo + puede registrar pedidos manuales. | **Sí — modo de La Florencia** |
| `pickup` (activo) | Cliente recoge en local. | **No** (arquitectura lista, desactivado) |

> **`solicitar motorizado manual`** = el comportamiento del modo `drivers_only` aplicado dentro de cualquier restaurante: el restaurante tiene un pedido que entró por teléfono y pide un motorizado para él. La Florencia debe poder hacer esto **además** de recibir pedidos web. Ver [§15](#15-pedidos-manuales-vs-pedidos-web) sobre diferenciación de pedidos manuales.

### Configuración de La Florencia (la primera)

| Atributo | Valor en Fase 1 |
|----------|-----------------|
| Modo | `catalog_full` (catálogo web + delivery + solicitud manual de moto) |
| Categoría | Pizzería (ver [§7](#7-categorías-de-negocio)) |
| Horario | Noche, ~18:00–23:00, último pedido ~22:45 (ver [§6](#6-gestión-de-horarios)) |
| Editor de menú | **Habilitado** — el restaurante edita su propia carta |
| Pickup | Desactivado |
| Métodos de pago | Ver [§8](#8-métodos-de-pago--yapeplin-configurables) |
| Carga inicial del menú | **El admin la hace vía impersonación el domingo** previo al lanzamiento |

### Alta de un restaurante

El **admin crea la cuenta del restaurante con correo + contraseña** que él mismo genera y entrega al dueño. No hay autoregistro de restaurantes. Lo mismo aplica para motorizados. (Esto es **crítico** y reemplaza cualquier flujo de registro autónomo que mencionen los specs.)

---

## 3. Las 4 apps — alcance por actor

Cuatro apps, cuatro subdominios. Driver y motorizado son el **mismo rol**. (El quinto rol "Soporte" de los specs queda **fuera** de la Fase 1.)

| App | Subdominio | Quién la usa | Estado |
|-----|-----------|--------------|--------|
| Cliente | `tindivo.com` | Cliente final | Existe demo, reescribir sobre stack v2 |
| Negocio | `negocios.tindivo.com` | Dueño / cajero | Construir |
| Motorizado | `motorizados.tindivo.com` | Repartidor (contratado por Tindivo) | Construir |
| Admin | `admin.tindivo.com` | Fundador | Construir |

### 3.1 Admin

**Referencia canónica:** `08-flujo-admin.md` + `Tindivo_Documento_Maestro.md` §5 y §7.4.

Alcance Fase 1:

- **Gestión de restaurantes:** crear cuenta con correo + contraseña, configurar **qué servicios/capacidades** usa y **qué métodos de pago** habilita. Editar, bloquear/desbloquear.
- **Gestión de motorizados:** crear cuenta con correo + contraseña, editar, desactivar.
- **Impersonación ("Modo Dios"):** el admin puede entrar a la cuenta de un restaurante para ayudarlo. **En el lanzamiento, el admin carga el menú inicial de La Florencia por esta vía.** Patrón validado en la doc de paneles anterior — replicar con cookies seguras de corta duración. Ver `DOCUMENTACION_PANELES_TINDIVO.md` §1.2.
- **Filtro de validación de identidad:** para pedidos de contraentrega con **cliente nuevo o con strike previo**, el admin (o cajera designada) **llama para validar** antes de que se prepare. Ver [§9](#9-anti-fraude-y-validación-humana-en-contraentrega) para el protocolo completo.
- **Monitor en vivo:** ver los pedidos de la noche en tiempo real, su estado, cuáles tienen reporte.
- **Intervención:** cancelar o reasignar un pedido si algo se rompe.
- **Bandeja de reportes e incidencias:** hub humano de los 6 tipos de reporte. Ver [§12](#12-bandeja-de-reportes--los-6-tipos).
- **Registro de adelantos del fondo de contingencia:** cada vez que Tindivo devuelve plata a un cliente, queda registrado en el pedido con captura, monto y motivo. Ver [§10](#10-fondo-de-contingencia-y-adelantos).
- **Gestión de deuda del restaurante:** ver estado de cada restaurante (normal / atrasado / suspendido / fuera). Ver [§11](#11-gestión-de-deuda-del-restaurante).

Fuera de la Fase 1 para el admin: liquidaciones semanales automáticas, métricas avanzadas multi-tab, auditoría de eventos completa, gestión de múltiples negocios simultáneos. (Se construye el espacio, no se activa el flujo.)

### 3.2 Restaurante — La Florencia

**Referencia canónica:** `09-flujo-negocios.md` + `Tindivo_Documento_Maestro.md` §7.2 + `DOCUMENTACION_PANELES_TINDIVO.md` (panel de restaurante).

Alcance Fase 1:

- **Login con correo + contraseña** entregados por el admin.
- **Toggle on/off rápido** para abrir/cerrar el restaurante en segundos (ej. si se satura la cocina o se queda sin insumos). Patrón validado en producción anterior — optimistic UI. Ver doc de paneles §5.4.
- **Recepción de pedidos entrantes** con **notificación de audio** (ver [§5](#5-notificaciones-de-audio-crítico-para-restaurante)) — el restaurante opera en PC/laptop con parlante bluetooth.
- **Aceptar o rechazar** un pedido. Ventana de aceptación: **5 min** (no acepta → auto-cancela y avisa al cliente). Ver [§14](#14-reglas-de-tiempo-y-cancelación).
- **Validación de captura prepago** (Yape/Plin) con su propio número. Reloj de **10 min** (separado de los 5 de aceptación). El restaurante valida su propio dinero; Tindivo no valida pagos.
- **Actualizar estados:** confirmado → preparando. (En camino / entregado los marca el motorizado.)
- **Extensión de tiempo de preparación:** máx 2 veces, +10 min c/u. Cada extensión notifica al motorizado.
- **Crear pedidos manuales** (que entraron por teléfono) y solicitar motorizado para ellos. Estos pedidos llevan flag `is_manual = true` y campos extendidos (ver [§15](#15-pedidos-manuales-vs-pedidos-web)).
- **Editor de menú propio:** el restaurante edita su carta (productos, categorías, modifiers, precios, disponibilidad on/off por plato con optimistic UI). El admin solo ayuda con la carga inicial vía impersonación.
- **Reportar no-show / incidencia** que alimenta la bandeja del admin.
- **Disputar adelantos del fondo de contingencia** que el admin haya cargado contra él (48h de ventana). Ver [§10](#10-fondo-de-contingencia-y-adelantos).
- **Sección de deuda** con el desglose narrativo (delivery del cliente vs. S/1 de comisión Tindivo + adelantos del fondo). Ver Documento Maestro §1 y [§11](#11-gestión-de-deuda-del-restaurante) de este doc.

Patrón a rescatar del panel anterior: **pre-compresión de imágenes en cliente** antes de subir al storage (optimiza datos móviles del comerciante). Ver doc de paneles §5.5.

### 3.3 Motorizado

**Referencia canónica:** `10-flujo-motorizados.md` + `Tindivo_Documento_Maestro.md` §7.3.

Alcance Fase 1 — **simplificado deliberadamente:**

- **Login con correo + contraseña** entregados por el admin.
- **Un solo panel con todos los pedidos.** **SIN asignación automática. SIN R1-R5. SIN cola FCFS.** Aunque `10-flujo-motorizados.md` los detalle, en la Fase 1 **NO se implementan.** Todos los pedidos disponibles caen en un único listado y el motorizado los toma manualmente.
- **Actualizar estados:** recogido → en camino → entregado.
- **Declarar banda** (cerca / lejos — solo 2 bandas, no 3) al recoger. Afecta la comisión.
- **Reportar no-show** con un tap tras esperar 5 min en la puerta → genera strike + entra a la bandeja del admin.
- **Liquidación de efectivo diaria** con el restaurante (cuadre del cash recolectado).
- **Cancelar/saldar deudas** cuando devuelve dinero (ej. diferencias de efectivo). Debe poder registrar que saldó una deuda pendiente.
- **Plan B:** si el motorizado titular no está disponible, el fundador asume el rol con su propio acceso de motorizado. Operación, no técnica.

> **SOP de entrega (operativo, no UI):** entrega en **puerta exterior** que da a vía pública. No entrar a pasadizos, escaleras de edificios, zonas comunes oscuras. **No liberar el producto antes de recibir y verificar el pago.** Verificación rápida de billetes de S/100 y S/200. El sencillo lo provee el restaurante; sin tope técnico desde Tindivo.

> **Nota para el agente:** todo lo que `10-flujo-motorizados.md` diga sobre transferencias entre drivers, slots de ocupación, timeout-as-accept y agrupación automática **queda fuera de la Fase 1.** Construir el modelo de datos que lo permita en el futuro, pero la UI de esta fase es un panel plano de pedidos.

### 3.4 Cliente — `tindivo.com`

**Referencia canónica:** `FLUJO_TINDIVO.md` (comportamiento + puntos de conexión a backend) + `Tindivo_Design_Spec.html` (visual) + `07-flujo-cliente.md` + `05-api-rest.md`.

Alcance Fase 1:

- **Reescribir el demo sobre el stack v2** (App Router, Tailwind, Zustand, Supabase). El demo actual es Next.js Pages Router con inline styles y useState — **es referencia de comportamiento y diseño, NO código a parchear.** Ver advertencia abajo.
- **Conectar al backend real** todos los puntos que el demo simula. La tabla A–J de `FLUJO_TINDIVO.md` (sección "Modo Demo") lista exactamente qué reemplazar: auth real (Supabase), número de pedido atómico, tracking por Realtime/push, storage de comprobantes, historial real, etc.
- **Los 3 métodos de pago** (configurables por restaurante — ver [§8](#8-métodos-de-pago--yapeplin-configurables)).
- **Tracking en vivo** vía Supabase Realtime: `sent → confirmed → preparing → ontheway → delivered`.
- **Umbral de prepago:** pedidos ≥ S/100 fuerzan prepago Yape/Plin (oculta contraentrega). Ver Documento Maestro §3.
- **Ventana de cancelación cliente:** "hasta aceptación del restaurante O 2 minutos, lo que ocurra primero". Ver [§14](#14-reglas-de-tiempo-y-cancelación).
- **Mensajes de strike visibles:** cuando un cliente recibe un strike, debe ver un mensaje claro al respecto. Ver [§9](#9-anti-fraude-y-validación-humana-en-contraentrega).
- **Checkbox de aceptación de Términos y Privacidad** al crear cuenta (una vez, no en cada pedido). Ver [§13](#13-términos-privacidad-y-consentimiento).
- Mantener 1:1 el resto del demo: onboarding diferido, auth gate dual, gestión de direcciones, animaciones, cobertura geográfica.

> ⚠️ **Advertencia de stack para el agente del cliente:** el demo documentado en `FLUJO_TINDIVO.md` §8 usa Next.js Pages Router + inline styles + useState. **La arquitectura objetivo es la v2** (`03-arquitectura.md`): App Router, Tailwind, Zustand, REST + Supabase. El agente **reescribe la lógica y el diseño del demo sobre el stack v2**, no migra el demo tal cual. El `FLUJO_TINDIVO.md` documenta el *qué hace*, no el *cómo está hecho hoy*.

---

## 4. Responsive — todos los actores

**Las 4 apps deben ser totalmente responsive.** Al ser web, no se acepta una app que solo funcione en un tamaño. Cada actor tiene un **dispositivo primario** pero todas deben verse y funcionar bien en cualquier pantalla.

| App | Dispositivo primario | Debe funcionar también en | Notas |
|-----|---------------------|---------------------------|-------|
| Cliente | Móvil | Desktop/tablet | Mobile-first 1:1 con el Design Spec. Contenedor máx ~768px centrado. |
| Restaurante | **Desktop / laptop** | Móvil/tablet | **El restaurante opera en PC/laptop con parlante bluetooth** para escuchar las notificaciones de pedidos. El layout de escritorio es el caso principal y debe estar bien resuelto. Escala a ~1280px. |
| Motorizado | Móvil | Desktop/tablet | El motorizado está en la calle con el teléfono. Mobile-first, touch targets ≥ 44px. |
| Admin | **Desktop** | Móvil/tablet | El fundador monitorea desde escritorio. Tablas y monitor en vivo pensados para pantalla amplia, pero accesibles desde el móvil para intervenir en emergencias. |

Reglas transversales: touch targets ≥ 44×44px, respetar `prefers-reduced-motion`, márgenes de seguridad inferiores (`pb-safe`) en vistas móviles.

---

## 5. Notificaciones de audio (crítico para restaurante)

**Mega importante.** El restaurante opera en una PC o laptop con un parlante bluetooth, y necesita **enterarse de un pedido nuevo sin estar mirando la pantalla.** Si esto falla, el pedido se pierde y el sistema entero pierde credibilidad la primera noche.

Requisitos para `negocios.tindivo.com`:

- **Sonido audible y repetitivo** al entrar un pedido nuevo, que **no se detenga hasta que el cajero lo reconozca** (acepte/vea el pedido). No un beep único que se pierda. Repetición cada ~5 segundos.
- **Sonido distintivo y agradable** — el agente elige o genera el archivo. Debe volverse parte de la cultura operativa ("suena el ding de Tindivo, hay pedido"). Corto, no estridente, no fatigante.
- **Funciona con la pestaña en segundo plano** (el cajero puede estar en otra ventana). Considerar Web Audio API + título de pestaña parpadeante + notificación del navegador.
- **Resiliente al autoplay policy del navegador:** el audio se "desbloquea" con la primera interacción del usuario al abrir el panel (un gesto inicial que habilita el contexto de audio). Documentar este paso en el onboarding del panel.
- **Sonido escalado de urgencia:** distinto sonido (o variante) para **"pedido sin aceptar pasados 3 minutos"** vs. pedido normal. Diferenciable de oído.
- **Control de volumen / silenciar** visible, pero con confirmación si se silencia (para que no se quede mudo por error toda la noche).

Referencia técnica complementaria: `11-notificaciones-push.md` (push web). El audio en el panel es **adicional** al push, no lo reemplaza — el push cubre cuando el panel está cerrado; el audio cubre cuando está abierto pero desatendido.

---

## 6. Gestión de horarios

Módulo importante y pensado para escalar. La referencia de UX validada está en `DOCUMENTACION_PANELES_TINDIVO.md` §4 (Pestaña de Operación) — **replicar ese diseño**, que funcionó en producción.

### Requisitos del módulo (por restaurante)

- **Los 7 días de la semana**, cada uno con switch de día activo (`isOpen`). Día apagado → bloque gris al 40%, deshabilitado.
- **Hasta 2 turnos por día** (botón "+ 2 Turnos" / "− 1 Turno"). Útil para negocios que cierran en la tarde y reabren de noche. La Florencia en Fase 1 usa 1 turno nocturno, pero el módulo soporta 2 desde ya.
- **Inputs de hora tipo `time`** (ej. 18:00 / 23:00).
- **Soporte cross-medianoche:** si la hora de cierre es menor que la de apertura (ej. abre 19:00, cierra 02:00), mostrar etiqueta sutil **"(Cierra al día siguiente)"**. Esto resolvió todas las confusiones de negocios nocturnos en producción.
- **Detección de colisiones de turnos:** si el cierre del turno 1 choca con la apertura del turno 2, pintar inputs en rojo, deshabilitar "Guardar" y mostrar advertencia.
- **"Copiar horario de [día] a todos los días"** para configuración rápida en bloque.

### Relación con la operación

- El **cierre de aceptación de pedidos** se calcula como `cierre − prep mínima − buffer de entrega`. El botón de pedir se deshabilita solo cuando ya no da tiempo de entregar antes del cierre. (Coincide con la regla de cobertura horaria de los specs.)
- Fuera de horario: el restaurante no puede crear pedidos, el motorizado no puede activarse, y el cliente ve el restaurante cerrado. (Ver `01-requerimientos-funcionales.md` HU-X-007.)
- **Timezone: Lima** siempre.

### Diferencia con el horario operativo global (admin)

El admin tiene un **horario operativo del sistema** (cuándo opera Tindivo en el pueblo, `08-flujo-admin.md` HU-A-021). El horario del restaurante es **independiente y más restrictivo**: un restaurante puede cerrar antes que el sistema. El pedido solo procede si **ambos** lo permiten.

---

## 7. Categorías de negocio

El sistema almacena la categoría de cada restaurante desde el inicio (campo en el perfil del negocio). En Fase 1 **no bloquean nada** y su efecto en la UI es mínimo, pero se capturan para escalar (futuro: filtros, secciones del marketplace, modifiers sugeridos por categoría).

Categorías identificadas (un negocio puede tener hasta 2):

1. Menú del día
2. Comida rápida
3. Postres
4. Pollería
5. Cevichería
6. Chifa
7. Pizzería
8. Parrillas
9. Juguería / Cafetería
10. Desayunos

**La Florencia = Pizzería.** El menú se organiza en secciones (Pizzas, Hamburguesas, Bebidas) con modifiers por categoría de producto (no por categoría de negocio). Ver `FLUJO_TINDIVO.md` §7.

---

## 8. Métodos de pago — Yape/Plin, configurables

**Decisión central:** los métodos de pago son **configurables por restaurante desde el admin**, no hardcodeados. El sistema soporta todos; cada restaurante habilita los que quiere.

**Yape y Plin son equivalentes** en el flujo: misma lógica de transferencia/comprobante, solo cambia el número/QR. Donde el demo y los specs dicen solo "Yape", debe leerse **"Yape o Plin"**.

### Métodos soportados por el sistema

| Método | Cuándo paga el cliente | Comprobante en app | Notas |
|--------|------------------------|--------------------|-------|
| Prepago Yape/Plin | Antes (transferencia) | Sí, con timer 10 min | El restaurante valida con su propio número. Obligatorio para pedidos ≥ S/100. |
| Efectivo contraentrega | Al recibir | No | Campo opcional de "pago con S/X" para calcular vuelto. |
| Yape/Plin contraentrega | Al recibir | No | El motorizado lleva el QR/número. |

### Configuración de La Florencia (Fase 1)

| Método | ¿Habilitado en La Florencia? |
|--------|------------------------------|
| Prepago Yape/Plin | ✅ Sí |
| Efectivo contraentrega | ✅ Sí |
| Yape/Plin contraentrega | ❌ **Deshabilitado** (existe en el sistema, La Florencia lo apaga) |

> El método "Yape/Plin contraentrega" **debe existir en la UI y el modelo**, aunque La Florencia lo tenga apagado. Otro restaurante podría activarlo. La app del cliente solo muestra los métodos que el restaurante tiene habilitados.

### Flujo de dinero (no cambia)

Tindivo **no retiene fondos**. El cliente paga directo al restaurante (Yape/Plin/efectivo). Tindivo cobra su comisión al restaurante de forma separada (liquidación semanal). Esto evita el riesgo regulatorio de intermediación financiera. Detalle del modelo de dinero y las 2 bandas (S/3 cerca / S/3.50 lejos) en `Tindivo_Documento_Maestro.md` §1.

**Única excepción:** el **fondo de contingencia** (ver [§10](#10-fondo-de-contingencia-y-adelantos)), donde Tindivo adelanta plata al cliente en casos puntuales y la recupera del restaurante. No es retención de fondos; es resarcimiento contable trazable.

---

## 9. Anti-fraude y validación humana en contraentrega

**Referencia canónica:** `Tindivo_Documento_Maestro.md` §4. Esta sección la aterriza a Fase 1 sin reescribirla.

### Principio

El filtro anti-fraude del piloto es **humano, no técnico**. La llamada de validación es el mecanismo, no el DNI ni la firma digital.

### Datos capturados al pedir (contraentrega)

- Nombre completo
- Número de celular con WhatsApp activo (validado por OTP en el primer pedido)
- Dirección con referencia detallada (mínimo 20 caracteres)
- **NO se pide DNI** en el checkout. Agregaría fricción sin agregar seguridad real para el piloto.

### Cuándo se gatilla llamada de validación

| Situación | ¿Llamada? |
|-----------|-----------|
| Cliente nuevo (primer pedido del número) + contraentrega | **Sí** |
| Cliente con 1 strike + contraentrega | **Sí** |
| Cliente con 2+ entregas exitosas + contraentrega | No (whitelist implícita) |
| Cualquier pedido prepago | No (ya pagó) |

**Quién llama:** admin o cajera del restaurante. La cajera tiene incentivo alineado (su pedido, su dinero); del segundo no-show en adelante la pérdida la carga el restaurante, así que la cajera tiene piel en el juego (Documento Maestro §4). Default: cajera llama, admin escala si hay sospecha.

### Flujo de aceptación con validación

1. Cliente envía pedido contraentrega → estado **`validando`** (no `confirmed` todavía).
2. Cajera/admin **llama al cliente** dentro de los primeros 5 minutos. La llamada confirma identidad, dirección y disponibilidad real.
3. Si responde y valida → estado pasa a **`pending`** (aceptación del restaurante, timer 5 min según [§14](#14-reglas-de-tiempo-y-cancelación)).
4. Si NO responde o no valida en 5 minutos → **auto-cancelar** con notificación al cliente.

> El estado `validando` es un paso **previo** al timer de aceptación, no en paralelo. Antes no existía; en Fase 1 sí. El cliente ve "Validando tu pedido…" con expectativa de 1-2 minutos.

### Sistema de strikes

- **Anclados a número Y dirección.** Cambiar uno no limpia el otro.
- **1 strike** → llamada obligatoria en el siguiente pedido contraentrega.
- **2 strikes** → contraentrega bloqueada para ese cliente. Puede seguir pidiendo solo con prepago.
- **Reactivación** → solicitud por reporte del cliente (alegando error genuino: emergencia, celular muerto), evaluada por el admin caso por caso. No hay botón automático de "paga y vuelve".

### Visibilidad de strikes al cliente

El cliente **debe enterarse** cuando recibe un strike. Inmediatamente tras el evento, recibe notificación clara:

> "Tu pedido se canceló porque no estuviste disponible para recibirlo. Esta es tu primera advertencia. Si vuelve a pasar, solo podrás pagar adelantado en futuros pedidos."

(Y en el segundo strike, mensaje equivalente: "se canceló contraentrega para tu cuenta, solo prepago disponible".)

**No hay pantalla de "mis strikes" en perfil** en Fase 1. La notificación al ocurrir es suficiente.

### Clientes NO generan deuda

El modelo financiero de Tindivo solo reconoce deudas entre actores con relación contractual: **restaurantes** (deben comisiones y adelantos del fondo a Tindivo) y **motorizados** (pueden deber diferencias de efectivo en liquidación). **Los clientes nunca generan deuda contable.** El mecanismo de consecuencia hacia clientes que fallan es **strikes y bloqueo**, no cobro.

> La reactivación post-2-strikes "pagando el costo generado" del Documento Maestro **no es deuda contable** — es una condición de readmisión opcional, no un saldo que el sistema persigue. El cliente puede simplemente no volver y nunca pagar.

---

## 10. Fondo de contingencia y adelantos

**Referencia canónica:** `Tindivo_Documento_Maestro.md` §5 ("Registro contable de adelantos" + "Fondo de contingencia").

### Qué es

Reserva de **S/200–300** que Tindivo mantiene para hacer devoluciones inmediatas a clientes cuando el sistema falla. Convierte "devolución en 1 día" (inviable) en "devolución inmediata".

### Matriz de decisión — cuándo se gatilla un adelanto

| Escenario | ¿Adelanto del fondo? | Carga la pérdida |
|-----------|---------------------|------------------|
| Prepago + restaurante no acepta en 5 min | **Sí** | Restaurante (se suma a su deuda) |
| Prepago + restaurante rechaza captura sin razón válida | **Sí** | Restaurante |
| Prepago + restaurante acepta pero no prepara en tiempo máximo | **Sí** | Restaurante |
| Prepago + motorizado no recoge / abandona el pedido | **Sí** | Tindivo absorbe (es su contratado) |
| Prepago + cliente cancela en ventana libre (hasta aceptación o 2 min) | **Sí** | Tindivo absorbe (no hubo falla, es goodwill) |
| Prepago + cliente cancela tras aceptación / preparación | **No automático** | Va a bandeja de reportes, admin decide |
| Prepago + no-show del cliente | **No** | Cliente pierde su plata, restaurante se queda con el dinero y la comida, strike contra cliente |
| Contraentrega + cualquier falla | **No aplica** | No hubo dinero adelantado |

### Registro contable obligatorio

Cada adelanto del fondo **debe quedar registrado en el pedido específico** con:

- Pedido asociado, cliente
- Motivo (de la matriz de arriba)
- Monto adelantado
- **Captura del Yape/Plin** que Tindivo envió al cliente
- Timestamp y operador (qué admin lo hizo)
- A qué actor se carga la pérdida (restaurante / Tindivo)

Sin este registro, no hay cómo recuperar la plata del restaurante después. Esto es **no negociable** desde el día 1.

### Reposición del fondo

El fondo se repone automáticamente cuando el restaurante paga su deuda en la liquidación (incluyendo los adelantos cargados a él). El fondo no requiere reinyección manual constante, salvo eventos extraordinarios.

### Cuando el adelanto lo carga Tindivo (no el restaurante)

En los casos de "cancelación libre del cliente" o "falla del motorizado", el adelanto sale del fondo sin generar deuda al restaurante. Tindivo absorbe esa pérdida. Es marketing y goodwill, no fraude. Mientras el volumen de estos casos sea bajo, no compromete el negocio.

---

## 11. Gestión de deuda del restaurante

### Estados de la deuda

| Estado | Condición | Trato |
|--------|-----------|-------|
| **Normal** | Deuda acumulada dentro del periodo en curso | Sin acción. Visible en panel del restaurante. Se paga en liquidación. |
| **Atrasado** | No pagó al cierre del periodo. 1 a 5 días | Notificación diaria. Sigue operando. Alerta visible en su panel. |
| **Suspendido** | 6+ días sin pagar la liquidación pendiente | **App del restaurante bloqueada**: no recibe pedidos nuevos. Recupera acceso solo pagando. |
| **Fuera** | 21+ días suspendido sin pagar | Salida definitiva de la plataforma. |

**Plazos del piloto: 5 días de gracia, 21 días totales.** Ajustar con datos reales tras 3 meses.

### Aceleración por monto

Si la deuda del restaurante supera **S/200** (independientemente del tiempo), saltarse niveles: pasa directamente a **suspendido**. Esto protege a Tindivo cuando un restaurante empieza a acumular adelantos del fondo de contingencia rápidamente.

### Disputa de adelantos por parte del restaurante

Cualquier adelanto del fondo cargado contra el restaurante puede ser disputado:

- **Ventana:** 48 horas desde el registro del adelanto.
- **Mecanismo:** botón "Disputar este adelanto" en su panel de deuda, con motivo escrito + evidencia opcional.
- **Efecto inmediato:** la deuda se congela en ese monto (no genera atraso ni suspensión por esa parte) hasta que el admin resuelva.
- **Resolución por admin:** entra a bandeja de reportes como tipo **"6. Disputa de adelanto"** (ver [§12](#12-bandeja-de-reportes--los-6-tipos)).
  - A favor del restaurante → adelanto cancelado, Tindivo absorbe.
  - A favor de Tindivo → adelanto mantenido, deuda descongelada.
  - Acuerdo intermedio → monto reducido.
- Pasadas las 48h sin disputa, el adelanto se considera aceptado.

---

## 12. Bandeja de reportes — los 6 tipos

**Referencia canónica:** `Tindivo_Documento_Maestro.md` §5 (5 tipos originales) + esta fase añade el 6º.

Los 6 tipos canónicos de reporte que pueblan la bandeja del admin:

1. **No-show** — motorizado llegó, cliente no estuvo o no respondió.
2. **Captura rechazada disputada** — restaurante rechazó comprobante prepago; cliente disputa.
3. **Diferencia de efectivo** — al cuadrar liquidación con motorizado, hay desfase.
4. **Fake de restaurante** — restaurante reporta cliente fraudulento.
5. **Solicitud de reactivación de strike** — cliente bloqueado pide volver, alegando error genuino.
6. **Disputa de adelanto** — restaurante disputa un adelanto del fondo de contingencia cargado contra él. **Nuevo en Fase 1** (ver [§11](#11-gestión-de-deuda-del-restaurante)).

**Principio operativo (del Maestro §5):** "El trabajo del fundador NO es resolver en tiempo real desde la calle. Es **revisar una bandeja con calma**." Decisión caso por caso, con calma, nada automático.

---

## 13. Términos, privacidad y consentimiento

### Por qué importa para Fase 1

Sin Términos y Condiciones aceptados, Tindivo no tiene base legal para bloquear a un cliente fraudulento ni para cobrar al restaurante adelantos del fondo. **Es defensa legal mínima viable.** No es feature, es protección.

### Documentos

- **`tindivo.com/terminos`** — Términos y Condiciones del servicio.
- **`tindivo.com/privacidad`** — Política de Privacidad (obligatoria por Ley 29733 de Protección de Datos Personales del Perú).

### Mecanismo de aceptación

- **Checkbox obligatorio una sola vez** al crear cuenta (cliente) o al activar cuenta (restaurante, motorizado).
- Texto: "He leído y acepto los Términos y la Política de Privacidad" con enlaces directos.
- Sin checkbox, no se puede continuar.
- **Se registra en BD:** `accepted_at` (timestamp), `version` (versión del documento aceptada). Si los términos cambian, se requiere nueva aceptación.

### Cláusulas mínimas en Términos (no exhaustivo)

- Tindivo es **intermediario**: no vende, prepara, ni procesa pagos.
- **No cancelación** una vez iniciada la preparación (alimentos perecibles).
- **Responsabilidad del cliente** por datos correctos (dirección, celular). Pedido no entregable por error del cliente → cliente asume la pérdida.
- **Derecho de Tindivo y restaurantes** a rechazar pedidos o bloquear cuentas por fraude, perfiles falsos, cancelaciones reiteradas o conducta inapropiada hacia el motorizado.
- **Cláusula de adelanto del fondo de contingencia** para restaurantes: el restaurante acepta que Tindivo puede adelantar plata al cliente en su nombre cuando aplique, y que esa plata se suma a su deuda.
- **Ley aplicable y jurisdicción:** Perú.
- **Contacto de soporte:** WhatsApp / correo real.

### Cláusulas mínimas en Privacidad

- Qué datos se recogen (nombre, celular, dirección, historial de pedidos, comprobantes).
- Para qué se usan (procesar pedidos, contactar para validación, prevención de fraude).
- Con quién se comparten (restaurante y motorizado del pedido específico, nadie más).
- Tiempo de retención.
- Derechos ARCO del titular (acceso, rectificación, cancelación, oposición).
- Contacto del responsable de protección de datos.

> **Para Fase 1 no se requiere abogado.** Documentos sólidos en lenguaje claro cumplen. Cuando se escale más allá de San Jacinto, revisar con abogado especializado.

---

## 14. Reglas de tiempo y cancelación

### Timers durante el ciclo de pedido

| Timer | Duración | Aplica a | Si vence |
|-------|----------|----------|----------|
| **Validación** | 5 min | Pedido contraentrega de cliente nuevo o con strike | Auto-cancelar (sin adelanto, no hay plata) |
| **Aceptación restaurante** | 5 min | Todos los pedidos tras validación | Auto-cancelar + adelanto del fondo si prepago |
| **Validación captura prepago** | 10 min | Pedidos prepago tras aceptación | Auto-cancelar + adelanto del fondo |
| **Extensión preparación** | +10 min, máx 2 veces | Iniciativa del restaurante | Notifica al motorizado |
| **Espera del motorizado en puerta** | 5 min | Tras llegar al domicilio | Reporta no-show + strike |

### Ventana de cancelación del cliente

**"Hasta aceptación del restaurante O 2 minutos desde la creación, lo que ocurra primero."**

- Antes de aceptación → cancelación libre, devolución desde fondo de contingencia (si prepago). Tindivo absorbe.
- Tras aceptación (o pasados los 2 min sin aceptación) → cancelación va a bandeja de reportes, admin decide.

> **Coherencia operativa:** si el restaurante acepta en 30 segundos, la ventana del cliente se cierra a los 30 segundos. Si el restaurante no acepta a los 2 minutos, la ventana se cierra a los 2 minutos. Pasados los 2 minutos sin aceptación, el restaurante está en "atrasado de aceptación" — si finalmente no acepta a los 5 minutos, se auto-cancela y carga al restaurante (no al cliente).

---

## 15. Pedidos manuales vs. pedidos web

Tindivo distingue dos orígenes de pedido:

| Atributo | Pedido web (`is_manual = false`) | Pedido manual (`is_manual = true`) |
|----------|----------------------------------|------------------------------------|
| Origen | Cliente desde `tindivo.com` | Restaurante ingresa por teléfono/WhatsApp |
| Cliente registrado | Sí, con cuenta y historial | No necesariamente (puede ser captura simple de datos) |
| Validación humana | Según [§9](#9-anti-fraude-y-validación-humana-en-contraentrega) | El restaurante ya habló con el cliente al tomar el pedido |
| Detalle del pedido | Estructurado (items del catálogo, modifiers) | Texto libre permitido (porque el restaurante anota lo que el cliente le dictó), con campos opcionales más extensos para que el restaurante detalle bien |
| Método de pago | Configurable cliente | Configurable restaurante al crear |
| Aplica a strikes | Sí | Sí, si el restaurante reporta no-show |
| Aplica a fondo de contingencia | Sí | **No** (no hubo prepago digital validable en el flujo) |

> **El pedido manual debe permitir más detalle textual** que el pedido web. El restaurante a veces toma pedidos complejos por teléfono ("la pizza familiar mitad hawaiana mitad pepperoni sin cebolla, una gaseosa 1.5L y dos postres surtidos a elección"). La UI del editor manual debe acomodar esto: items estructurados cuando se pueda + un campo de **notas extendidas** abundante.

> **Trazabilidad:** ambos tipos de pedido aparecen en monitor del admin y panel del motorizado por igual, pero marcados visualmente como manual o web (ícono pequeño + filtro).

---

## 16. Logs de eventos de pedido

**Requisito no negociable desde el día 1.**

Cada cambio de estado de un pedido debe quedar registrado en una tabla de log (no es feature de usuario, es deuda técnica que si no se construye al inicio rompe la depuración).

### Eventos mínimos a loguear

- `order.created` — cliente envía pedido / restaurante crea manual
- `order.validation_started` — entra a estado `validando`
- `order.validation_passed` — admin/cajera valida y aprueba
- `order.validation_failed` — auto-cancelado por no responder
- `order.accepted_by_business` — restaurante aceptó
- `order.rejected_by_business` — restaurante rechazó
- `order.payment_proof_uploaded` — cliente subió comprobante prepago
- `order.payment_proof_approved` — restaurante valida captura
- `order.payment_proof_rejected` — restaurante rechaza captura
- `order.preparing` — restaurante marcó "preparando"
- `order.prep_time_extended` — restaurante pidió +10 min
- `order.picked_up` — motorizado recogió + declaró banda
- `order.on_the_way` — motorizado salió
- `order.delivered` — motorizado marcó entregado
- `order.no_show_reported` — motorizado reportó no-show
- `order.cancelled` — cancelado (con motivo y actor)
- `order.contingency_advance` — Tindivo adelantó del fondo (con monto + captura)
- `order.report_opened` — se abrió reporte (con tipo)
- `order.dispute_filed` — restaurante disputó un adelanto

### Estructura mínima de cada log

- `order_id`
- `event_type`
- `actor` (cliente/restaurante/motorizado/admin/sistema, con user_id si aplica)
- `timestamp` (UTC, mostrar en Lima)
- `data` (JSON con detalle específico del evento: motivo, monto, ID de captura, etc.)

### Por qué importa

El martes en la mañana vas a tener un cliente que dice "mi pedido nunca llegó pero me cobraron". Sin el log de eventos, **no hay cómo reconstruir qué pasó**. Con el log, en 30 segundos sabes que el motorizado marcó entregado a las 21:47 con foto y banda lejos, y puedes decidir bien.

---

## 17. Lo que NO entra en la Fase 1

Se construye el **espacio** en el modelo de datos para que estas features no requieran migración mayor después, pero **no se activan** ni se construye su UI ahora:

- Pickup activo (arquitectura lista, desactivado).
- Asignación automática de motorizados (R1-R5, FCFS, transferencias, slots).
- Liquidaciones semanales **automáticas** (el corte y el cobro se hace a mano por admin en Fase 1).
- Métricas avanzadas multi-tab del admin.
- Pasarela de pago digital (Niubiz/Culqi).
- GPS real-time del motorizado en mapa.
- Multi-tenant para otros pueblos.
- App de soporte (5º rol).
- Apps nativas (Capacitor) — todo es PWA.
- Pantalla de "mis strikes" en perfil del cliente.
- Cupones, propinas digitales, calificaciones, fidelización, heatmap, i18n.

(Lista completa y razones en `14-roadmap-y-fuera-de-mvp.md`.)

---

## 18. Design system aplicado

**Fuente canónica:** `Tindivo_Design_Spec.html` + `06-ui-design-system.md` + `Tindivo_Documento_Maestro.md` §8.

- **Light mode siempre. Sin dark mode**, en las 4 apps. (El panel antiguo era dark; **no se replica esa estética**, solo sus patrones de UX.)
- **Filosofía:** cercano, no corporativo. Servicio de barrio peruano. Bordes muy redondeados, naranja protagonista.
- **Tokens de color:** Brand `#F97316` · Brand Dark `#C2410C` · Brand Light `#FED7AA` · Ink `#1A1614` · Surface `#FAF6F1` · Card `#FFFFFF` · Border `#EAE7E2` · Success `#16A34A` · Warning `#F59E0B` · Danger `#DC2626` · Info `#0EA5E9`.
- **Tipografía:** Bricolage Grotesque (displays) · Geist (body, números) · JetBrains Mono (microlabels, IDs, precios, horas). Máx 3 tamaños por vista.
- **Iconos:** Material Symbols Rounded. Nunca emojis como iconos.
- **Color de papelito por negocio:** franja/dot vertical a la izquierda del nombre en todas las cards de pedido (admin, motorizado, negocio). Único por negocio activo.
- **Estados:** skeletons (no spinner), empty states con icono+copy+CTA, errores inline (no toast), success en toast 3s o modal. Glassmorphism solo en topbars.
- **Optimistic UI** en switches (toggle on/off del restaurante, disponibilidad de platos), con reversión + alerta si falla la red.

---

## 19. Matriz de documentos por agente

Este documento (`FASE-1-TINDIVO.md`) va **a todos los agentes** como entrada. Además, según lo que construya cada uno:

### Agente de Backend / Arquitectura / BD

- `FASE-1-TINDIVO.md` (este)
- `Tindivo_Documento_Maestro.md`
- `02-requerimientos-no-funcionales.md`
- `03-arquitectura.md`
- `04-base-de-datos.md`
- `05-api-rest.md`
- `12-billing-y-liquidaciones.md`
- `13-deploy-y-devops.md`

### Agente de Frontend — Restaurante + Admin

- `FASE-1-TINDIVO.md` (este)
- `Tindivo_Documento_Maestro.md`
- `08-flujo-admin.md`
- `09-flujo-negocios.md`
- `06-ui-design-system.md`
- `Tindivo_Design_Spec.html`
- `DOCUMENTACION_PANELES_TINDIVO.md` (referencia de UX validada: toggle on/off, gestión de horarios, métricas básicas, gestión de productos, impersonación)
- `11-notificaciones-push.md` (para el audio del restaurante)
- `05-api-rest.md`

### Agente de Frontend — Motorizado

- `FASE-1-TINDIVO.md` (este)
- `Tindivo_Documento_Maestro.md`
- `10-flujo-motorizados.md` (⚠️ ignorar R1-R5/FCFS/transferencias — ver §3.3 de este doc)
- `06-ui-design-system.md`
- `11-notificaciones-push.md`
- `05-api-rest.md`

### Agente de Frontend — Cliente

- `FASE-1-TINDIVO.md` (este)
- `Tindivo_Documento_Maestro.md`
- `FLUJO_TINDIVO.md` (comportamiento + tabla A–J de conexión a backend)
- `Tindivo_Design_Spec.html` (visual)
- `07-flujo-cliente.md`
- `06-ui-design-system.md`
- `05-api-rest.md`

> **Regla para todos los agentes:** si un spec contradice este documento, gana este documento para la Fase 1 (ver orden de precedencia al inicio).

---

## 20. Checklist de lanzamiento

Lo mínimo para que la noche del lunes funcione de punta a punta:

**Backend / infra**
- [ ] BD desplegada con el esquema v2 (con espacio para features futuras, sin activarlas).
- [ ] Tabla de **logs de eventos de pedido** funcionando (§16).
- [ ] Auth (Supabase) funcionando con correo + contraseña para staff y Google/email para clientes.
- [ ] Supabase Realtime emitiendo cambios de estado de pedido.
- [ ] Storage para comprobantes de prepago y capturas de adelantos del fondo.
- [ ] Número de pedido atómico (no `Date.now()`).
- [ ] Tabla de **aceptación de términos** con `accepted_at` y `version`.

**Admin**
- [ ] Crear cuenta de La Florencia (correo + contraseña) y configurar capacidades + métodos de pago.
- [ ] Crear cuenta del motorizado (correo + contraseña).
- [ ] Impersonación funcionando.
- [ ] **Carga del menú de La Florencia vía impersonación** (admin lo hace el domingo).
- [ ] Monitor en vivo de pedidos de la noche.
- [ ] Poder cancelar / reasignar un pedido.
- [ ] Bandeja de reportes con los 6 tipos.
- [ ] Registro de adelantos del fondo de contingencia (con captura).
- [ ] Vista de estado de deuda del restaurante (normal / atrasado / suspendido / fuera).

**Restaurante (La Florencia)**
- [ ] Login con sus credenciales.
- [ ] Aceptación de términos en primera entrada.
- [ ] Toggle on/off.
- [ ] **Notificación de audio funcionando en PC/laptop con parlante bluetooth** (probado con pestaña en segundo plano, sonido escalado a 3 min).
- [ ] Recibir pedido → aceptar/rechazar (timer 5 min).
- [ ] Validar captura prepago (timer 10 min).
- [ ] Actualizar estados (confirmado → preparando, +10 min máx 2 veces).
- [ ] **Crear pedido manual** con campos extendidos (§15).
- [ ] Editor de menú operativo (carta de La Florencia ya cargada por admin).
- [ ] Panel de deuda con disputa de adelantos (botón 48h).

**Motorizado**
- [ ] Login con sus credenciales.
- [ ] Aceptación de términos en primera entrada.
- [ ] Panel único con todos los pedidos (sin asignación automática).
- [ ] Distinción visual entre pedidos web y manuales.
- [ ] Actualizar estados (recogido → en camino → entregado).
- [ ] Declarar banda (cerca/lejos).
- [ ] Reportar no-show.
- [ ] Liquidación de efectivo + saldo de deudas.

**Cliente (`tindivo.com`)**
- [ ] Demo reescrito sobre stack v2 y conectado al backend real.
- [ ] Checkbox de aceptación de Términos y Privacidad al crear cuenta.
- [ ] Los 3 métodos de pago, respetando la configuración de La Florencia (Yape/Plin contraentrega oculto).
- [ ] Tracking en vivo por Realtime.
- [ ] Umbral de prepago ≥ S/100.
- [ ] Estado `validando` visible mientras admin/cajera llama.
- [ ] Ventana de cancelación libre hasta aceptación o 2 min.
- [ ] Notificación de strike al cliente cuando ocurre.

**Documentos legales**
- [ ] `tindivo.com/terminos` publicado.
- [ ] `tindivo.com/privacidad` publicado.

**Operación**
- [ ] Validación humana lista: quién llama a los clientes con número nuevo (admin o cajera, default cajera).
- [ ] Número de WhatsApp de soporte real configurado (no placeholder).
- [ ] Horario de La Florencia configurado (noche, cross-medianoche si aplica).
- [ ] Fondo de contingencia inicial sembrado (S/200–300 disponibles en Yape del admin).
- [ ] Motorizado titular confirmado para el lunes + plan B (fundador) listo.

---

*Norte de la Fase 1: que un pedido real entre, se prepare y se entregue, repetidamente, sin quejas, y que las noches pasen de ~10 pedidos. Todo lo demás es ajuste y es reversible.*
