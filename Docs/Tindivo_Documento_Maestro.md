# Tindivo — Documento Maestro de Reconciliación + Brief de Diseño

> **Qué es este documento.** No reemplaza los specs `00`–`14` de tu socio. Es la **capa de reconciliación** entre (a) la arquitectura técnica ya documentada y (b) las decisiones de operación del piloto que se definieron por separado. Le dice a Claude Design qué construir, con qué reglas de negocio corregidas, y con qué estilo.
>
> **Cómo leerlo.** Las secciones marcadas con 🔴 **CORRIGE EL SPEC** cambian algo que el documento original decía distinto — tu socio debe revisarlas. Las marcadas con 🟢 **NUEVO** agregan algo que el spec no tenía. Las marcadas con ✅ **YA COINCIDÍA** solo confirman.
>
> Mercado piloto: San Jacinto, Áncash · Restaurante inicial: Priamo · Español peruano.

---

## 0. Las cuatro apps a construir

Driver y motorizado **son el mismo rol** (lo llamamos **motorizado**). Son **cuatro** apps, no cinco:

| App | Quién la usa | Estado |
|-----|--------------|--------|
| `tindivo.com` — Cliente | Cliente final | Existe prototipo (lado cliente). Solo ajustes. |
| `negocios.tindivo.com` — Negocio | Dueño / cajero | Construir |
| `motorizados.tindivo.com` — Motorizado | Repartidor (contratado por Tindivo) | Construir |
| `admin.tindivo.com` — Admin | Fundador | Construir |

(El spec menciona un quinto rol "Soporte" — queda **fuera del piloto**.)

---

## 1. Modelo de dinero — la corrección central

### 🔴 CORRIGE EL SPEC · Cómo fluye y cuánto

El spec (`12-billing`) decía que el delivery que paga el cliente "no es la comisión Tindivo" y manejaba 3 bandas (S/3.00 / 3.25 / 3.50). **Esto se corrige así:**

**El cliente paga al restaurante: comida + delivery.** El restaurante luego transfiere a Tindivo un monto **conjunto** que incluye el delivery del cliente + S/1 de comisión propia. Resultado neto: el restaurante pierde S/1 por pedido, el cliente paga el delivery, Tindivo recibe el total.

### Tabla congelada (2 bandas, no 3)

| Distancia | Delivery (paga el cliente) | Comisión (pone el restaurante) | **Total a Tindivo** | Restaurante pierde |
|-----------|---------------------------|-------------------------------|---------------------|--------------------|
| **Cerca** | S/2.00 | S/1.00 | **S/3.00** | S/1.00 |
| **Lejos** | S/2.50 | S/1.00 | **S/3.50** | S/1.00 |
| **Pickup** | S/0 | — | **S/0.50** | S/0.50 |

> **Banda media eliminada.** El spec tenía cerca/media/lejos. Ahora solo **cerca / lejos**. La declara el motorizado al recoger (sigue siendo declarativa, no por coordenadas — eso del spec se mantiene).

> **Pickup:** soportado por la arquitectura pero **NO activo en el piloto**. Se deja en la tabla para no perderlo.

### Narrativa de cara al restaurante (importante para ventas)

Internamente el sistema liquida el total (S/3 / S/3.50). Pero **al dueño se le habla de "S/1 de comisión; el delivery lo paga el cliente"**, porque en un pueblo "S/1" se vende y "S/3.50 de comisión" asusta, aunque el neto sea el mismo. La UI del negocio (sección de deuda) debe reflejar esta narrativa sin mentir: mostrar el desglose (delivery del cliente vs. comisión Tindivo).

### ✅ YA COINCIDÍA
- Motorizado con **sueldo fijo** (S/30 la noche, ~5 h), no por entrega.
- **Sin mensualidad**, modelo 100% transaccional.
- Cobro **solo por pedido entregado** (cancelados no suman deuda).
- Liquidación de comisiones **semanal**; liquidación de efectivo **diaria** (driver→negocio).

---

## 2. El punto de equilibrio — el número rey del piloto

🟢 **NUEVO** (el spec no lo menciona y es la métrica más importante del negocio).

Como el motorizado es **costo fijo** (S/30/noche), la rentabilidad **no depende de evitar fraude, depende de volumen**:

- Margen aprox. por pedido (comisión + delivery − gasolina): ~S/3.
- **Punto de equilibrio ≈ 10 pedidos por noche.** Bajo eso, la noche pierde plata aunque todo salga perfecto.

**Implicancias de diseño:**
- El admin necesita un **indicador de pedidos/noche vs. equilibrio** bien visible en su dashboard (ver §7).
- Recomendación operativa (no de UI): operar las **noches de mayor demanda** del restaurante, no todas, para no quemar un motorizado un día muerto.
- Tensión real: el arranque cerrado (anti-fraude) reduce volumen. **El volumen pesa más** que el blindaje anti-fraude en esta etapa.

Esto reemplaza, para el piloto, el set de métricas de éxito del spec (`00-vision §10`, las de 90 días/1000 pedidos) como el número que se mira **cada noche**.

---

## 3. Pagos del cliente — prepago, contra entrega, umbral

### 🟢 NUEVO · Default contra entrega + umbral de prepago

El spec trata el prepago Yape como un método opcional más. Se le agregan dos reglas:

1. **Default contra entrega** para pedidos **< S/100** (efectivo o Yape al recibir). Elimina de raíz el fraude de comprobante, monto equivocado y devolución, porque el dinero no sale antes del servicio.
2. **Prepago obligatorio para pedidos ≥ S/100.** Sobre ese monto, **solo** Yape/Plin prepago. A mayor monto, mayor pérdida potencial → el cliente debe tener piel en el juego. (Techo observado hoy ~S/120, así que esto solo fuerza la franja S/100–120: muy pocos pedidos.)
3. **Prepago opcional** para cualquier cliente que lo prefiera, aun bajo S/100.

### Routing del prepago
La captura de Yape va **al número del restaurante** (ya contemplado en `09-flujo-negocios` Pantalla 4 de onboarding: Yape del negocio). **El restaurante valida su propio dinero.** Tindivo NO valida pagos mientras opere solo.

### ✅ YA COINCIDÍA
- **Confirmación humana por llamada**: el negocio/cajero llama al cliente antes de preparar (`07-flujo-cliente` regla 10, glosario). Esto **es** la validación anti-fake (ver §4).
- Timer de prepago **10:00 min** para subir comprobante (regla 11).
- Cobertura solo San Jacinto (regla 15).

---

## 4. Anti-fraude: cliente fake / no-show / strikes

🟢 **NUEVO** — el spec no tiene sistema de strikes ni manejo de cliente fake. Se inyecta completo.

El riesgo real con contra entrega no es la captura falsa (no hay captura): es el **cliente fake** que pide y no abre la puerta.

### Capas
1. **Arranque cerrado** (con cuidado del volumen, §2): clientes del propio restaurante, barrio, referidos. El contexto social del pueblo reduce el fake casi a cero.
2. **Llamada de validación** (la hace la **cajera**, no Tindivo) en: todo **cliente nuevo** (primer pedido de un número), pedidos de **monto grande**, y números con **strike** previo. El recurrente confiable fluye sin llamada.
3. **Strikes anclados a número + dirección a la vez.** Cambiar uno no limpia el otro. **2 strikes → bloqueo automático.**
4. **Pérdida del primer fake**: si un fake llega y el restaurante preparó, Tindivo le reconoce el costo (ver matices abajo).

### Por qué la cajera valida (incentivo alineado)
Como del **segundo no-show en adelante la pérdida la carga el restaurante**, la cajera tiene piel en el juego. Si se salta la llamada y entra un fake, el costo es de su negocio. Se autodisciplina sin que Tindivo vigile.

### El número que cambia NO es un hueco
Si un fake cambia de número para escapar de un strike, reaparece como **cliente nuevo → dispara llamada obligatoria otra vez.** No escapa del filtro, se vuelve a meter en él. Y si pide a la misma dirección, el strike de dirección lo delata.

### Protocolo de no-show (para mostrar al restaurante)
1. Motorizado espera **5 min** en la puerta, intenta contactar.
2. Si no responde → reporta no-show en su panel (1 tap).
3. Sistema registra **strike** contra número + dirección.
4. Comida vuelve al restaurante (se reutiliza/consume).
5. **2 strikes → número bloqueado.**

### No-show: quién pierde
- **Pierden ambos** (restaurante: comida; Tindivo: gasolina + S/1). Pero **nadie paga extra**: el motorizado es fijo, la comida ya está hecha. **Consecuencia ejecutable = strike.** Sin transferencia de dinero.

### Fake de restaurante (dueño inventa pedido fantasma)
Riesgo distinto y grave. **Tindivo NO absorbe nada, nunca.** Ninguna compensación es automática: **toda compensación pasa por revisión del admin** en la bandeja de reportes (§5). Frecuencia sospechosa de "fakes" reportados por un negocio = señal de fraude interno. Compensación con **tope** (~S/30–40, un ticket normal); un "pedido fantasma" de S/150 es, por su rareza, la alerta misma.

### Salir de un strike
- Bloqueo por 2 strikes es el **default**, no hay botón automático de "paga y vuelve" (volvería el fraude un peaje con tarifa).
- **Excepción**: el cliente deja un reporte alegando error genuino (emergencia, celular muerto) → el admin lo revisa y, si lo cree real, ofrece reactivación pagando el costo generado (resarcimiento, no castigo).

---

## 5. Bandeja de reportes del admin

🟢 **NUEVO** — pieza central de la operación tranquila del fundador.

**Principio:** el trabajo del fundador NO es resolver en tiempo real desde la calle. Es **revisar una bandeja con calma**. Todo el anti-fraude y las disputas desembocan aquí.

Vista simple en `admin.tindivo.com`:
- **Pedidos de hoy** — lista con estado de cada uno.
- **Cuáles tienen reporte** — y qué dice cada uno (no-show, captura rechazada disputada, diferencia de efectivo, fake de restaurante, solicitud de reactivación de strike).
- **Decisión caso por caso, con calma.** Nada automático, sin apelaciones complejas.

Esto se **suma** a las pantallas de admin del spec (`08-flujo-admin`: vigilancia operativa, cobros, disputas de efectivo, métricas), no las reemplaza. La bandeja de reportes es el hub humano; el resto del admin del spec sigue vigente.

### Registro contable de adelantos
Si Tindivo adelanta una devolución del **fondo de contingencia** (caso: prepago, restaurante falló, dueño no disponible), se **registra en el pedido específico, en el momento, con captura y monto.** No se espera al reporte del usuario. Es lo que permite cobrarle al restaurante exactamente lo adelantado.

### Fondo de contingencia
🟢 NUEVO. Reserva inicial **S/200–300**. Único uso: devolución inmediata al cliente cuando un restaurante falla y el dueño no está. El restaurante repone; si no, sale de la plataforma. Convierte "devolución en 1 día" (inviable) en "devolución inmediata".

---

## 6. Reglas de tiempo (consolidadas)

| Regla | Valor | Notas |
|-------|-------|-------|
| Cierre de aceptación de pedidos | `cierre − prep mínima − buffer entrega` | Botón se deshabilita solo. (Coincide con spec, regla de cobertura horaria.) |
| Ventana de aceptación del restaurante | **5 min** | No acepta → auto-cancela + avisa. Razón de cancelación `pending_acceptance_timeout` ya existe en `07-flujo-cliente §15`. ✅ |
| Verificación de captura (prepago) | **10 min** | 🔴 separado de los 5 de aceptación. Revisar Yape requiere abrir la app; el cliente ya pagó, no abandona. |
| Despacho del motorizado | Inmediato, con hora estimada de listo | 🟢 En piloto con 1–2 motorizados, despacho inmediato es más robusto que un trigger por minutos. (No contradice R1-R5 del spec; los complementa para bajo volumen.) |
| Extensión de tiempo del restaurante | Máx 2 veces, +10 min c/u (tope +20) | 🟢 Cada extensión notifica al motorizado en tiempo real. |
| Timer de prepago (cliente sube comprobante) | 10 min | ✅ Coincide con regla 11 del spec. |

---

## 7. Brief por app — qué construir y con qué foco

> Todo lo visual respeta el **Design System** (§8). Las pantallas detalladas viven en los specs `07`–`10`; aquí va el **delta** que Claude Design debe aplicar encima.

### 7.1 Cliente — `tindivo.com` (ajustes sobre el prototipo)
- Insertar **lógica de umbral**: si el carrito ≥ S/100, el checkout fuerza método **prepago** (oculta contra entrega) con copy claro: *"Los pedidos de S/100 a más se pagan por adelantado con Yape."*
- Estado de confirmación honesto: *"Esperando que el restaurante confirme tu pedido"* con reloj, antes de pasar a preparación. (El spec ya tiene `pending_acceptance_timeout`; exponerlo en UI.)
- Delivery fee por banda: mostrar **S/2 (cerca) / S/2.50 (lejos)** según dirección.
- Mantener 1:1 el resto del demo (paleta, animaciones, onboarding diferido, auth gate dual). Corregir bug `onPrepayUpload` (`07 §18`).

### 7.2 Negocio — `negocios.tindivo.com`
- Construir según `09-flujo-negocios` (UI condicional por capacidades, onboarding, editor de menú, pedidos, efectivo, deuda).
- **Delta de reconciliación:**
  - Pantalla de **validación de captura prepago** (aceptar/rechazar) con el Yape propio. Reloj de 10 min.
  - En la sección **Deuda**: mostrar desglose narrativo (delivery del cliente vs. S/1 comisión) — §1.
  - **PapelitoReminder** se mantiene (pieza única del modelo, `00 §7`).
  - Botón de **reportar no-show**/incidencia que alimenta la bandeja admin (§5).
- Para el piloto, el negocio inicial (Priamo) arranca en `catalog_full` o `drivers_only` según cómo opere hoy — confirmar con el negocio.

### 7.3 Motorizado — `motorizados.tindivo.com`
- Construir según `10-flujo-motorizados` (tabs Disponibles/Activos/Equipo, R1-R5, FCFS, transferencias, slots, banda, efectivo).
- **Delta de reconciliación:**
  - **Banda con 2 valores** (cerca/lejos), no 3. Ajustar el control de declaración en `picked_up`.
  - Botón **reportar no-show** (1 tap, tras esperar 5 min) → strike + bandeja admin.
  - Liquidación de efectivo diaria se mantiene tal cual (es coherente con el modelo de dinero).

### 7.4 Admin — `admin.tindivo.com`
- Construir según `08-flujo-admin` (vigilancia, cobros, disputas, métricas).
- **Delta de reconciliación:**
  - **Bandeja de reportes** (§5) como hub principal.
  - **Indicador pedidos/noche vs. equilibrio (~10)** visible en dashboard (§2).
  - Gestión de **strikes** y solicitudes de reactivación.
  - Registro de **adelantos del fondo de contingencia**.

---

## 8. Brief de diseño (para Claude Design)

> Fuente canónica: `06-ui-design-system.md` + `Tindivo_Design_Spec.html`. Resumen operativo:

**Filosofía:** cercano, no corporativo. Servicio de barrio peruano. Mobile-first 1:1 (base 402×874). **Sin dark mode** (fondo claro siempre). Bordes muy redondeados. Naranja protagonista, sin secundarios genéricos.

**Tokens de color:**
- Brand `#F97316` · Brand Dark `#C2410C` · Brand Light `#FED7AA`
- Ink `#1A1614` · Ink Muted `#57534E` · Ink Subtle `#A8A29E`
- Surface `#FAF6F1` (fondo) · Card `#FFFFFF` · Border `#EAE7E2`
- Success `#16A34A` · Warning `#F59E0B` · Danger `#DC2626` · Info `#0EA5E9`

**Tipografía:**
- **Bricolage Grotesque** → displays (saludos, hero, títulos grandes). Nunca en body.
- **Geist** → body, labels, números. El caballito de batalla.
- **JetBrains Mono** → microlabels UPPERCASE, IDs (#TND-12345), times, precios.
- Escala: display-lg 36px / display-sm 24px / heading-md 18px / body 15px / label 11px / mono-md 14px. Máx 3 tamaños por vista.

**Iconos:** Material Symbols Rounded, set único. Nunca emojis como iconos (sí en copy literal tipo "Buenas noches 🍕"). Clave: `two_wheeler` (motorizado), `restaurant`/`storefront` (negocio), `receipt_long`/`shopping_bag` (pedido), `payments` (cobros), `report_problem` (reportes), `near_me` (cerca).

**Radius:** sm 8 / md 12 / lg 16 / xl 24 / 2xl 32 / 3xl 48 px.

**Sombras:** elev-1 a elev-4 (sutiles, son elevación no decoración) + glow-brand y glow-danger (solo para URGENTE y CTAs de marca).

**Glassmorphism:** solo en topbars (`GlassTopBar`), no en todo.

**Color de papelito por negocio:** franja/dot vertical a la izquierda del nombre en TODAS las cards de pedido (admin, motorizado, negocio). Único por negocio activo. Paleta predefinida (rosado, azul cielo, verde menta, etc. — ver `06 §2`).

**Estados:** skeletons por tipo (no spinner), empty states con icono+copy+CTA opcional, errores de validación inline (no toast), success en toast 3s o modal con next step. Touch targets ≥ 44px. Respetar `prefers-reduced-motion`.

**Layout estándar:** `GlassTopBar` sticky + `main` con padding (pt-20 pb-24) + `BottomNav` sticky en cliente/motorizado. Cliente máx 768px; apps de staff escalan a desktop (máx 1280px).

---

## 9. Checklist de lo que tu socio debe revisar (los 🔴)

Antes de construir, validar con tu socio que acepta estas correcciones al spec:

1. **Modelo de dinero**: restaurante transfiere total (delivery cliente + S/1), 2 bandas (S/3 / S/3.50), no 3. ¿Su sistema actual de liquidación soporta esto sin reescritura grande?
2. **Banda media eliminada**: cerca/lejos solamente. Afecta el control de `picked_up` y la tabla de comisiones en `12-billing`.
3. **Separar reloj de verificación de captura (10 min)** del reloj de aceptación (5 min).
4. **Despacho inmediato del motorizado en piloto** (vs. la maquinaria R1-R5 pensada para más volumen) — confirmar que conviven.

Y aceptar estos 🟢 nuevos que no estaban: umbral prepago ≥S/100, sistema de strikes (número+dirección), bandeja de reportes admin, fondo de contingencia, métrica de equilibrio por noche.

---

## 10. Lo que queda fuera del piloto

Pickup activo, pasarela de pago, GPS real-time, encomiendas, app de soporte, cupones, propinas digitales, multi-tenant, i18n. (Coincide con `00-vision §11` y `14-roadmap`.)

---

*Norte del piloto: que un pedido real entre, se prepare y se entregue, repetidamente, sin quejas, y que las noches pasen de ~10 pedidos. Todo lo demás es ajuste y es reversible.*
