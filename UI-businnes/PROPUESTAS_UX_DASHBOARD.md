# PROPUESTAS_UX_DASHBOARD.md

> Rediseño del panel de restaurante `@tindivo/negocios`.
> Documento para Mauricio (dev) — qué cambia, por qué cambia, y qué falta validar antes de programar.
>
> **Resumen en una línea:** la única acción urgente del momento siempre es la más visible. Todo lo demás se hace más chico.

---

## 0 · Lo que no cambia

100% de las funcionalidades del inventario (`FUNCIONALIDADES_DASHBOARD_RESTAURANTE.md`) siguen existiendo. Nada se elimina; algunas cosas cambian de lugar para alinearse con el orden de urgencia real.

| Funcionalidad | Antes | Ahora |
|---|---|---|
| Login / logout | Header | Logout vive en sidebar (desktop) y sección "Cuenta" en Config (mobile). El login no se diseña aquí. |
| Monitoreo realtime de pedidos | Lista plana sin agrupar | Vista "Pedidos" con tabs por estado (mobile) y kanban (desktop). |
| Alerta auditiva + visual | Banner amarillo + botón "Activar alertas" | Toggle persistente en topbar con halo pulsante cuando hay pendientes. |
| Validación dudosos (yape / call) | Card mezclada con el resto | Card amarilla con banner propio + acciones específicas por modo (yape: "Ver comprobante" / call: "Llamar al cliente"). |
| Aceptar / rechazar | Botones genéricos | Card roja con countdown 5m y CTA grande "Aceptar pedido". |
| Tiempo de cocina + despacho | Input numérico libre | Chips 15 / 20 / 25 / 30 / 45 min (tap rápido) + CTA "Empezar a preparar". |
| Extensión +10 min | Botón al lado | Chip dentro del bloque de tiempo restante, deshabilitado tras 2 usos. |
| Listo para recoger | Botón con texto ambiguo | CTA "Listo · llamar moto" + ícono `inventory_2`. |
| Crear pedido manual | Pantalla larga lineal | Mobile: 3 secciones + CTA sticky. Desktop: split layout con carrito sticky a la derecha. |
| Editor de menú | Lista plana | Categorías navegables (sidebar desktop / chips mobile) + toggle de disponibilidad inline. |
| Config + horarios | Formulario gigante | Secciones agrupadas (datos, yape, tiempos, capacidades, horario) con sidebar de navegación. |
| Conciliación efectivo | Lista plana | KPIs arriba + bloque "Por confirmar ahora" prominente + historial debajo. |
| Deuda + disputas | Lista mezclada | Hero negro con balance + barra de progreso hasta suspensión + tabs (adelantos / liquidaciones). |
| Cuenta suspendida | Banner rojo | Banner rojo persistente + barra de progreso de deuda. |

---

## 1 · Cambios estructurales por vista

### 1.1 Pedidos

**Antes:** una sola lista cronológica mezclando todos los estados; el cajero scrollea para encontrar el que necesita atender; acciones globales (Menú, Efectivo, etc.) compiten visualmente con el pedido nuevo entrante.

**Ahora:**

- **Mobile** — Tabs por estado: *Por aceptar · En cocina · Listos · En camino · Hoy* con contadores. El tab activo siempre arranca en el más urgente con pedidos.
- **Desktop** — Kanban de 4 columnas: *Por aceptar · En cocina · Listos · En reparto*. El cajero ve el flujo completo de una mirada.
- **Banner crítico** arriba (rojo si hay pedidos pendientes, amarillo si hay validaciones). Incluye contador y CTA directa a "Ir a 'Por aceptar'".
- **Cards específicas por estado:**
  - `pending_acceptance`: borde rojo, pulse animado, countdown grande, CTA "Aceptar pedido" (2/3 ancho) + "Rechazar" pequeño.
  - `validando`: borde amarillo, banner con instrucción según modo (yape o call), CTAs específicas.
  - `confirmed`: chips de prep time + CTA "Empezar a preparar".
  - `preparing`: bloque con tiempo restante, chip "+10 min" (deshabilitado tras 2 usos), CTA "Listo · llamar moto".
  - `waiting_driver`: banner verde tranquilizador, sin CTA — solo informa.
  - `heading_to_restaurant` / `picked_up`: card morada con info del motorizado y ETA.

**Por qué:** el cajero principalmente quiere saber *¿qué tengo que hacer ahora mismo?*. Segmentar por estado responde esa pregunta sin esfuerzo cognitivo; la lista plana obliga a evaluar cada pedido uno por uno.

### 1.2 Menú

**Antes:** lista plana con formularios inline mezclados con los datos.

**Ahora:**

- **Mobile:** chips de categoría para filtrar + lista de cards con toggle de disponibilidad visible. El menú secundario (eliminar / editar) vive bajo un `more_vert`.
- **Desktop:** sidebar izquierda de categorías (drag-handle para reordenar) + grid de 2 columnas de items.
- **Estado de disponibilidad** comunica con tres señales redundantes: tachado del nombre, opacidad 0.6, dot rojo + label "Agotado".
- **Destacado** marcado con star naranja inline (no badge separado).

**Por qué:** los dueños de restaurante editan el menú muy rápido (especialmente al inicio del turno: "esto se acabó, marca agotado"). El toggle visible directamente en la card evita 2 taps.

### 1.3 Efectivo

**Antes:** lista de cierres con cantidad reportada y esperada, sin jerarquía clara.

**Ahora:**

- Hero con monto total recibido hoy (negro, grande, mono).
- **KPI strip** en desktop: Recibido hoy, Por confirmar, En disputa, Esta semana.
- **Bloque "Por confirmar ahora"** separado y primero, con borde amarillo y banner "Cuenta el efectivo físicamente antes de confirmar".
- Cada card de settlement muestra **dos cifras lado a lado** (Sistema espera vs. Moto reporta) — si hay diferencia, la del lado derecho se pone roja.
- CTA "Confirmo S/160" es **explícita con el monto**, no "Confirmar" genérico.

**Por qué:** la diferencia entre lo esperado y lo reportado debe ser obvia a 2m de distancia. La carga cognitiva de comparar dos números en columnas separadas era alta.

### 1.4 Deuda

**Antes:** balance con texto plano y lista mezclada de adelantos y settlements.

**Ahora:**

- **Hero negro** con balance grande mono + **barra de progreso hacia los S/300 de suspensión** (señal visual del riesgo).
- CTA "Pagar por WhatsApp a Tindivo" naranja prominente — el principal flujo de pago.
- **Adelantos del fondo** y **Liquidaciones semanales** en dos columnas en desktop, secciones consecutivas en mobile.
- Cada adelanto muestra explícitamente la **ventana de disputa restante** ("33 h restantes") o el bloqueo ("Ventana de 48 h vencida").

**Por qué:** la deuda y el riesgo de suspensión son información ansiógena pero crítica. Tratarla con jerarquía (hero + progress) en lugar de esconderla en una tabla hace que el cajero entienda *cuánto debe* y *qué tan cerca está del límite* en 2 segundos.

### 1.5 + Pedido (manual)

**Antes:** formulario lineal largo en una columna.

**Ahora:**

- **Mobile:** 3 bloques verticales (Cliente → Entrega/Pago → Platos) + CTA sticky abajo con total visible permanente.
- **Desktop:** split de 2 columnas — formulario + catálogo a la izquierda, **carrito sticky** a la derecha con resumen + CTA.
- **Choice cards** para tipo de entrega y método de pago (icono + label + descripción inline), no select boxes.
- Validación de cliente recurrente / strikes muestra **inline bajo el teléfono**, no como error tardío al enviar.
- Helper sobre el límite de S/100 → prepago aparece **antes** de que el usuario lo descubra al fallar.

**Por qué:** la mayoría de pedidos manuales son llamadas. El cajero apunta mientras escucha. Hacerle visible el carrito y total permanentemente (incluso mientras agrega platos) reduce errores y devoluciones al cliente.

### 1.6 Config

**Antes:** un formulario gigante con todos los campos.

**Ahora:**

- **Sidebar de secciones** (desktop) — datos / Yape / tiempos / capacidades / horario / cuenta. Cada sección tiene su propia card con icono.
- **Mobile** mantiene el orden pero usa títulos de sección (`SectionTitle`) para crear ritmo visual.
- **Capacidades** como toggles grandes con descripción inline, no checkboxes pelados.
- **Horario semanal** con checkbox para abrir/cerrar el día + chips mono con las horas + botón "+ 2º turno" inline. Label "cruza 00:00" visible cuando el cierre es menor que la apertura.
- **QR de Yape** como nuevo campo (resuelve la duda #4 del MD original — los dueños sí necesitan subir su QR, no solo el número).

---

## 2 · Decisiones de UX clave

### 2.1 Jerarquía por urgencia, no por tipo

La pregunta más frecuente del cajero es *"¿qué pedido necesita atención ahora?"*, no *"¿qué clase de cosa quiero hacer?"*. Por eso:

- La acción más urgente del momento siempre es la **CTA más grande** (≥ 60px de alto) y la única con color naranja en pantalla.
- Las acciones globales (Menú, Efectivo, Deuda, Config) viven en bottom nav (mobile) o sidebar (desktop), **siempre visibles pero nunca compitiendo**.
- Los estados pasivos (`waiting_driver`, `picked_up`) usan colores tranquilizadores (verde, morado suave) y **no tienen CTAs** — solo informan.

### 2.2 Color naranja como protagonista, único

Naranja `#F97316` se reserva para:

- CTAs primarias (`Aceptar`, `Empezar a preparar`, `Listo`, `Guardar`)
- El halo de "Alertas ON" cuando hay pendientes
- La barra de deuda en el hero negro
- El check marker en filtros y selects activos

No se usa naranja para badges, decoración, o backgrounds. Esto preserva su función como señal de "esto es la acción".

### 2.3 Rojo / amarillo / verde como semáforo emocional

- **Rojo (`#DC2626`):** pedido nuevo sin aceptar, cuenta suspendida, monto en diferencia.
- **Amarillo (`#F59E0B`):** validación pendiente, efectivo por confirmar, diferencia leve.
- **Verde (`#16A34A`):** todo bien, confirmado, listo.

El cajero aprende el código en 1 turno y ya no tiene que leer texto para entender el estado.

### 2.4 Información escaneable a 2 metros

Cards de pedido en cocina muestran:
- ID corto (mono)
- Nombre cliente
- Total (mono, grande)
- Estado (chip de color)

Todo lo demás (referencia, items, teléfono) está disponible pero secundario. El dueño puede monitorear desde la cocina sin acercarse.

### 2.5 Acciones explícitas, no genéricas

| Antes | Ahora |
|---|---|
| "Confirmar" | "Confirmo S/160" |
| "+10 min" suelto | "+10m" dentro del bloque de tiempo restante |
| "Listo para recoger" | "Listo · llamar moto" |
| "Validar" | "Aprobar pago" o "Confirmado" según contexto |
| "Rechazar" (sin contexto) | "No contesta" para call, "Rechazar" para yape |

El cajero no tiene que recordar qué hace cada botón; la consecuencia está en el label.

### 2.6 Countdown visible, no oculto

Los pedidos `pending_acceptance` y `validando` muestran su **countdown mm:ss explícitamente en la cabecera de la card**. El sistema cancela auto a los 5 / 10 min — esta cuenta regresiva visible evita sorpresas.

### 2.7 Bottom nav con FAB central para "+ Pedido"

El pedido manual es una **acción de creación** que merece prominencia (cajero recibe llamada → necesita registrar rápido). FAB central naranja siempre visible cumple eso. Las 4 secciones restantes están a los lados.

---

## 3 · Componentes nuevos introducidos

| Componente | Dónde se usa | Función |
|---|---|---|
| `MobileTopBar` | Todas las vistas mobile | Logo + título + toggle de alertas con halo pulsante. |
| `MobileBottomNav` | Todas las vistas mobile | Nav fija con 4 tabs + FAB central de "+ Pedido". |
| `DesktopSidebar` | Todas las vistas desktop | Nav lateral con badges por sección, status "Abierto", logout. |
| `DesktopTopBar` | Todas las vistas desktop | Título + subtítulo + acciones + toggle de alertas a la derecha. |
| `StateTabs` | Pedidos mobile | Tabs pildora por estado con contadores. Sticky bajo el topbar. |
| `KanbanColumn` | Pedidos desktop | Columna del kanban con header coloreado y contador. |
| `OrderCardMobile` / `OrderCardDesktop` | Pedidos | Card de pedido que cambia totalmente según estado. |
| `PapelitoStripe` | Cards de pedido | Franja vertical izquierda con color del negocio (consistente con el resto del sistema Tindivo). |
| `StateChip` | Listas e historiales | Chip de estado coloreado con dot. |
| `PayChip` | Cards de pedido | Chip de método de pago con ícono. |
| `ChoiceCard` | + Pedido | Tarjeta de selección grande para entrega y pago. |
| `Stepper` | + Pedido, carritos | Stepper de cantidad redondo con tabular-nums. |
| `KPI` | Efectivo desktop | Tarjeta de KPI coloreada por tono (brand / warning / danger / neutral). |
| `SettlementCard` | Efectivo | Card de cierre con cifra dual (sistema / moto) y disclosure de pedidos. |
| `AdvanceCard` | Deuda | Card de adelanto del fondo con ventana de disputa y CTA contextual. |
| `CapToggle` | Config | Toggle grande con icono + label + descripción + switch. |
| `ScheduleRow` | Config | Día de la semana con checkbox + chips de turnos + botón "+ 2º turno". |
| `ConfigSectionDesktop` | Config desktop | Card de sección con icono + título + slot de acciones. |

---

## 4 · Flujos rediseñados paso a paso

### 4.1 Flujo principal — Recibir y despachar un pedido web

> Optimizado para que el cajero pueda hacerlo en 4 taps + 1 elección numérica + 2 taps, sin scroll.

1. **Llega un pedido** → el sistema emite el bip cada 3s; la topbar muestra el halo naranja pulsante en "Alertas"; aparece banner crítico rojo encima del primer tab.
2. **El cajero ve la card pulsante roja** con countdown 5:00 en cabecera.
3. **Tap "Aceptar pedido"** (botón naranja grande, 60px+). → estado pasa a `confirmed`.
4. **La misma card** ahora muestra chips de prep time (15 / 20 / 25 / 30 / 45 min, default 25). **Tap en el chip que corresponde.**
5. **Tap "Empezar a preparar"** → estado pasa a `preparing`.
6. **La card muestra** "18m restantes · de 28m totales" + chip "+10m" + CTA "Listo · llamar moto".
7. *(si hay retraso)* **Tap "+10m"** → el countdown se ajusta, contador de extensiones sube.
8. **Cuando está listo, tap "Listo · llamar moto"** → estado `waiting_driver`, card se vuelve verde tranquila.

Comparado con el flujo anterior:
- 0 scrolls (la card se queda en el mismo lugar del kanban; en mobile, en el tab "Por aceptar" → "En cocina").
- 0 inputs numéricos manuales (chips reemplazan el `input[type=number]`).
- 0 ambigüedad sobre qué hace cada botón (label explícita).

### 4.2 Flujo de validación de yape

1. **Pedido nuevo con prepay_yape** → entra como `validando` con borde amarillo y banner "Revisa comprobante Yape".
2. **Tap "Ver comprobante Yape"** → abre la imagen en pestaña nueva.
3. **El cajero compara** con su app de Yape.
4. **Tap "Aprobar pago"** (verde, principal) o "Rechazar" (rojo, secundario, requiere confirmación).
5. → Pasa al flujo 4.1 desde el paso 3.

### 4.3 Flujo de validación por llamada

1. **Pedido con strikes/teléfono nuevo** → `validando` con borde amarillo y banner "Llama al cliente".
2. **CTA grande con el número visible**: "Llamar al 987 234 561" → tap llama directo desde el dispositivo (`tel:` link).
3. **Tras la llamada, tap "Confirmado"** o **"No contesta"**.
4. → Pasa al flujo 4.1.

Resuelve la duda #1 del MD: el teléfono **sí se muestra**, y de hecho es la CTA. Es operativamente necesario.

### 4.4 Flujo de conciliación de efectivo

1. **Llega notificación push** (en el futuro) o el motorizado se presenta.
2. **El cajero abre Efectivo** desde bottom nav / sidebar (badge rojo con cuenta de pendientes).
3. **Bloque "Por confirmar ahora"** primero, con borde amarillo.
4. **Compara las dos cifras** (Sistema espera S/160 vs. Moto reporta S/160).
5. **Cuenta el efectivo físico.**
6. - **Si cuadra: tap "Confirmo S/160"** (botón naranja). → `confirmed`.
   - **Si no cuadra: tap "Reportar diferencia"** → form con monto real + motivo + envío. → `disputed`.

### 4.5 Flujo de creación de pedido manual

(Optimizado para mientras el cajero está al teléfono con el cliente.)

1. **Tap FAB "+"** en bottom nav (mobile) o "Nuevo pedido" en sidebar (desktop).
2. **Nombre** → tipear mientras pregunta al cliente.
3. **Teléfono** → tipear; si es recurrente, mensaje verde "Cliente recurrente · 8 pedidos · sin strikes" aparece de inmediato.
4. **Entrega + pago** → 2 choice cards + 3 choice cards. Si elige "Efectivo" y el total proyectado pasa S/100, helper amarillo aparece de inmediato.
5. **Dirección + referencia** → 2 inputs.
6. **Catálogo** (chips de categoría) → tap en plato lo agrega al carrito.
7. **Carrito sticky a la derecha** (desktop) o **resumen abajo** (mobile) muestra subtotal + delivery + total siempre visible.
8. **CTA "Crear pedido y enviar a cocina"** → estado nace en `confirmed`.

---

## 5 · Adaptaciones mobile / desktop

### Mobile (375–402px)

- **Primer pixel:** lo más importante del momento. El topbar mide 56px y la barra crítica 36px más; los pedidos pendientes están visibles sin scroll en la primera pantalla.
- **CTA grande:** todas las CTAs principales son ≥ 56px de alto (cumple touch target).
- **Bottom nav fijo** con FAB central para crear pedido — la operación inversa más frecuente del día.
- **Tabs sticky** justo bajo el topbar (no se pierden al scrollear).
- **Hit targets** mínimos 44×44px para toggles, steppers, botones de iconos.
- **Información secundaria** colapsada en disclosures (`details`/`summary`) o detrás de `more_vert`.

### Desktop (1280px+)

- **Sidebar persistente** de 240px con badges, status de tienda, sesión.
- **Kanban** para Pedidos — aprovecha el ancho útil.
- **KPIs** y splits 2-col en vistas administrativas (Efectivo, Deuda).
- **Hover states** explícitos (aumento de elevación) — el desktop sí los tiene.

### Tablet (768px)

No se diseñó separadamente porque la transición funciona en breakpoint sm: kanban de Pedidos colapsa a 2 columnas, otros se vuelven 1-col. **Recomendación para Mauricio:** usar `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))` en las grids del kanban y settlements para que escale sin breakpoints intermedios.

---

## 6 · Decisiones que resuelven dudas del MD original

| Duda original | Resolución en este rediseño |
|---|---|
| **1. Teléfono del cliente** — ¿se muestra? | **Sí.** En la card de pedido aparece bajo el nombre, en mono pequeño con ícono `call`. En el flujo de validación por call, es **la CTA misma** (tel: link). |
| **2. Cancelación de pedidos avanzados** | El rediseño expone un menú `more_vert` en cada card de cocina/listos (no implementado visualmente en este pass, pero el espacio está reservado). Mauricio puede agregar "Cancelar pedido" como destructiva ahí. |
| **3. Historial de hoy** | Nuevo tab "Hoy" en Pedidos mobile y botón "Historial de hoy" en topbar desktop. Muestra delivered/cancelled con monto y razón. |
| **4. QR de Yape** | Nueva sección en Config con upload de imagen al lado del número de Yape. |
| **5. Propinas y vuelto/cambio** | Sugerencia futura (ver §7). |

---

## 7 · Sugerencias futuras (NO implementar todavía)

- **Vuelto a entregar.** Si el cliente pagará con S/100 en efectivo por un pedido de S/58, mostrar "Vuelto: S/42" en la card. Útil para el cajero al armar la entrega del motorizado.
- **Propina visible.** Si el cliente dejó propina al motorizado, mostrarla en la card como chip pequeño "+S/3 propina moto".
- **Acción de cancelar en cocina.** Botón discreto en `more_vert` para cancelar un pedido en `preparing` (caso quema). Requiere confirm modal de 2 pasos para evitar accidentes.
- **Quick-reorder de favoritos.** En "+ Pedido", para clientes recurrentes mostrar "Repetir pedido anterior" en la pantalla de teléfono.
- **Modo "manos sucias".** Toggle en topbar que aumenta todos los hit targets a 64px+ y oscurece el resto. Útil cuando el cajero está cocinando.
- **Print pedido.** Botón de imprimir comanda en cada card de cocina (para restaurantes con impresora térmica). Sería un add-on futuro.
- **Drag-reorder de categorías y platos.** El sidebar de Menú desktop ya muestra el `drag_indicator`, pero la lógica de reorder no está en el inventario.
- **Push web nativa para el cierre de efectivo del motorizado.** Cuando el driver presiona "Entregar efectivo", una push notification debería llegar al panel del negocio.
- **Tablet vertical (768×1024).** Si los clientes empiezan a usarlo en tablet pegado a la pared de la cocina, vale la pena un layout dedicado: kanban más ancho, tipografía más grande, sin sidebar.
- **Dark mode forzado en cocina.** Si la cocina tiene poca luz nocturna y el blanco brilla mucho, una variante "modo cocina" oscura podría ayudar. Choca con el principio del design system (sin dark mode), pero vale validar con un negocio antes de descartar.

---

## 8 · Para el equipo de producto

Si tuviera que recomendar **una sola métrica para validar el rediseño**, sería:

> **Tiempo desde "pedido entra a `pending_acceptance`" hasta "cajero hace tap en Aceptar".**

Si baja de los actuales ~30-60s a ~10-15s, el rediseño cumplió su trabajo principal: hacer obvio qué hay que hacer.

Métricas secundarias:
- % de pedidos auto-cancelados por timeout (debería bajar significativamente).
- % de cierres de efectivo confirmados antes de las 24h (la auto-confirmación es una salida de emergencia, no la norma).
- Errores en pedidos manuales (montos, direcciones equivocadas) — el carrito sticky debería reducirlos.

---

## 9 · Archivos entregados

```
Tindivo Dashboard Restaurante.html   ← entrada
tokens.css                            ← tokens del design system
data.jsx                              ← mock data realista
shared.jsx                            ← componentes compartidos
pedidos-mobile.jsx / pedidos-desktop.jsx
menu.jsx
efectivo.jsx
deuda.jsx
nuevo.jsx
config.jsx
app.jsx                               ← composición de DesignCanvas
PROPUESTAS_UX_DASHBOARD.md            ← este doc
```

Cada vista vive en su propio archivo. Si Mauricio quiere portar al codebase real (Next.js + Tailwind + shadcn), el mapeo es directo: cada función exportada a `window` es un componente React; los estilos `tv-*` son utilidades CSS que se traducen a clases Tailwind del preset compartido.

— Fin del documento.
