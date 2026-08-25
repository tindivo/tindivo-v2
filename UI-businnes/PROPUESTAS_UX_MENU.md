# PROPUESTAS_UX_MENU.md

> Refactor de la vista Menú — Dashboard del Restaurante Tindivo
> Restaurante de referencia: **Priamo** (pizzas, sanguches, broaster, bebidas) · San Jacinto, Áncash.

---

## 1 · Cambios estructurales vs la vista anterior

### 1.1 Lista de menú (admin)

| Antes | Ahora |
|---|---|
| Toggle de disponibilidad + `more_vert` para editar | Botón "Editar" siempre visible en cada item |
| Sin diferenciación entre items simples y complejos | Badge "Con opciones" (azul) vs "Directo al carrito" (verde) |
| Solo nombre y precio visibles | Rango de precio desde–hasta + indicador de grupos |
| Sin leyenda sobre comportamiento del item | Leyenda fija en la sidebar con explicación de ambos badges |
| Sin contador de opciones agotadas | Badge amarillo "X opción/es agotada/s" cuando aplica |
| Estado vacío genérico | Estado vacío con 3 pasos de guía rápida y CTA principal |

### 1.2 Editor de item (nuevo)

No existía en el diseño anterior. El editor es una nueva pantalla con 4 secciones:

- **A · Info básica:** nombre, descripción, categoría, foto, precio base, tiempo de prep, disponible/destacado
- **B · Grupos de opciones:** cards expandibles, reglas min/max, opciones con delta de precio y toggle individual
- **C · Alerta de precio:** aviso no bloqueante si el precio base no coincide con la opción más barata del grupo principal obligatorio
- **D · Vista previa del cliente:** embedded en desktop (panel lateral), botón en mobile

---

## 2 · Decisiones de UX clave

### 2.1 Distinción visual "Con opciones" vs "Directo al carrito"

Esta distinción es crítica porque cambia el comportamiento en el cliente:
- Items **sin grupos** → tap = agrega directo al carrito (sin modal)
- Items **con grupos** → tap = abre modal de opciones (no puede añadir sin elegir)

El restaurante debe entender esto antes de publicar. Por eso los badges son prominentes en la lista y en la sidebar de leyenda.

### 2.2 Precio base + alerta de coherencia

El precio base es el que el cliente ve en la tarjeta del menú. Si el item tiene un grupo obligatorio de tamaño con opciones a precio delta, el precio visible en la tarjeta **debe ser el precio mínimo posible** (lo que paga el cliente si elige la opción más barata).

Si el restaurante pone precio base S/15 pero su opción "Personal" tiene delta +S/0 y la siguiente es +S/18, el precio mínimo que paga el cliente es S/15 — correcto.

Si el restaurante pone precio base S/37 pero su grupo "Tamaño" más barato tiene delta +S/0 (Familiar), tampoco hay inconsistencia.

El sistema solo alerta cuando hay una brecha real (ej. precio base S/15 pero la opción más barata del grupo obligatorio tiene delta +S/5 → el cliente pagaría mínimo S/20, pero vería S/15 en la tarjeta).

**No es bloqueante** porque el restaurante puede tener razones válidas para ese precio (ej. precio de costo visible vs precio de venta con obligatorio).

### 2.3 Reglas de grupos: defaults inteligentes

Al agregar un nuevo grupo, los defaults son:
- **min = 1, max = 1** → "Obligatorio, elegir uno"

Esto cubre el 80% de los casos de uso (tamaño, tipo de masa, salsa). El cajero solo cambia cuando el caso es distinto.

### 2.4 Opciones sin precio adicional = "Gratis"

El delta S/0 se muestra como "Gratis" (en verde) en lugar de "S/0". Esto es más claro para el cliente y para el restaurante al configurar.

### 2.5 Vista previa del cliente embedded

El restaurante puede ver en tiempo real cómo quedará el item en la PWA del cliente antes de guardar. En desktop es un panel lateral siempre visible. En mobile es un bottom sheet que abre con el botón "Preview".

La vista previa simula el estado inicial del modal del cliente: grupos obligatorios con la primera opción pre-seleccionada, precio actualizado en el botón "Agregar".

### 2.6 Auto-guardado de borrador

Si el cajero cierra accidentalmente la pantalla, el borrador se recupera automáticamente desde localStorage. El estado "Borrador guardado · hace 2 min" se muestra en la sidebar del editor desktop.

### 2.7 Toggle de disponibilidad por opción individual

Cada opción dentro de un grupo tiene su propio toggle de disponibilidad. Esto permite marcar "Doble queso · agotado" sin eliminar la opción del menú — el cliente la verá con tachado y "Agotado", pero no podrá seleccionarla.

---

## 3 · Flujo paso a paso: crear un item con modificadores

### Caso: "Pizza Hawaiana" con tamaño, cremas y extras

**1. Desde la lista del menú**

El restaurante toca "Nuevo plato" (botón naranja en la cabecera de una categoría, o el botón global en la toolbar desktop).

**2. Sección A — Info básica**

```
Nombre:         Pizza Hawaiana
Descripción:    Salsa de tomate, jamón, piña y queso mozzarella. Masa delgada y crujiente.
Categoría:      Pizzas
Foto:           [opcional, subir JPG/PNG]
Precio base:    S/15.00   ← precio de la opción más barata (Personal)
Disponible:     ✓
Destacado:      ✓
Tiempo prep:    [vacío → usa default del restaurante]
```

**3. Sección B — Agregar primer grupo: "Tamaño"**

- Tap "Agregar grupo de opciones"
- Nombre del grupo: "Tamaño"
- Min = 1, Max = 1 (default ya está bien → obligatorio, elegir 1)
- Agregar opciones:
  - "Personal" → delta S/0
  - "Familiar" → delta S/18
  - "Fiesta" → delta S/26
- El resumen de precios muestra: Mínimo S/15 · Máximo S/41

**4. Agregar segundo grupo: "Cremas para llevar"**

- Nombre: "Cremas para llevar"
- Min = 0, Max = 3 (opcional, hasta 3)
- Opciones: Mayonesa, Ketchup, Ají, Mostaza — todas delta S/0
- Sin precio adicional, solo permite que el cliente pida las cremas que quiere

**5. Agregar tercer grupo: "Extras"**

- Nombre: "Extras"
- Min = 0, Max = 5 (opcional, hasta 5)
- Opciones: Doble queso (+S/4), Champiñones (+S/3), Aceitunas negras (+S/2)

**6. Sección C — Verificación de precio**

El sistema verifica: precio base S/15, opción más barata de "Tamaño" = delta S/0 (Personal). → Sin alerta (precio correcto).

**7. Vista previa del cliente**

El restaurante ve el bottom sheet del cliente con:
- "Tamaño" → Personal pre-seleccionado
- Botón "Agregar · S/15"
- Al cambiar a Familiar → "Agregar · S/33"

**8. Guardar**

Tap "Guardar plato". El item aparece en la lista con badge "Con opciones · 3 grupos · desde S/15".

---

## 4 · Flujo paso a paso: editar disponibilidad de una opción

**Caso: Doble queso se agotó temporalmente**

1. Desde la lista del menú, tap "Editar" en Pizza Hawaiana
2. En la sección B, expandir el grupo "Extras"
3. Encontrar "Doble queso" → tap en su toggle de disponibilidad (verde → gris)
4. El item queda como "Doble queso · agotado" (tachado en la vista del cliente)
5. Tap "Guardar cambios"

Sin necesidad de eliminar la opción ni editar el nombre. Cuando vuelva a estar disponible, tap al toggle de nuevo.

---

## 5 · Adaptaciones mobile / desktop

### Mobile
- Secciones A y B en scroll vertical continuo
- Botón "Preview" en el header abre el bottom sheet del cliente en pantalla completa
- CTA sticky (Guardar / Eliminar) fija en el fondo
- Grupos colapsables por defecto para reducir scroll (solo el primero expandido)
- Toggle de disponibilidad con área de toque ≥ 44×44px

### Desktop
- Panel lateral derecho con vista previa del cliente (340px, sticky)
- Secciones A y B con layout grid de 2 columnas donde aplica (foto + campos)
- Grupos de modificadores siempre expandidos (más espacio)
- Sidebar izquierdo con categorías + leyenda de badges
- Auto-save indicator visible en la sidebar

---

## 6 · Casos cubiertos en los mockups

| Item | Grupos | Complejidad | Caso especial |
|---|---|---|---|
| Pizza Hawaiana | 3 (Tamaño + Cremas + Extras) | Alta | Item con precio variable + extras |
| Pizza Fullmeat | 2 (Tamaño + Cremas) | Media | Sin opción "Personal" — alerta de precio base si aplica |
| Alitas BBQ | 1 (Salsa, obligatorio) | Baja | Grupo obligatorio sin precio delta |
| Chicha morada | 0 | Ninguna | Badge "Directo al carrito" · estado limpio del editor |

---

## 7 · Sugerencias futuras (NO implementar en esta versión)

- **Plantillas de grupos reutilizables.** El restaurante podría crear plantillas de grupos (ej. "Cremas estándar") y aplicarlas a múltiples items. Las reglas de producto actuales establecen que los grupos viven por item — esta sugerencia queda para una v2 si la demanda lo justifica.

- **Importación masiva de menú vía CSV.** Permitir que el restaurante suba un archivo CSV con todos sus items y grupos para poblar el menú de golpe. Útil para onboarding de nuevos restaurantes.

- **Grupos con imágenes de opciones.** Agregar foto opcional a cada opción de un grupo (útil para tamaños de pizza o tipos de salsas). Requiere más espacio de almacenamiento y flujo de subida.

- **Categorías con foto de portada.** Imagen de cabecera por categoría para hacer el menú del cliente más visual.

- **Ordenamiento de items por drag.** El `drag_indicator` ya está en la UI pero el reordenamiento real requiere lógica de backend (`display_order`).

- **Historial de cambios del menú.** Log de cuándo se activó/desactivó un item, quién lo editó y qué cambió. Útil para auditoría operativa.

- **Items combinados (combos).** Un item que agrupa otros items del menú (ej. "Combo Familiar: pizza + bebida"). Requiere modelo de datos nuevo.

---

## 8 · Archivos entregados

```
menu-data.jsx               ← 4 items de Priamo con modificadores completos + helpers
menu.jsx                    ← lista refactorizada + estado vacío
menu-editor.jsx             ← editor de item (mobile + desktop)
menu-customer-preview.jsx   ← preview del cliente (bottom sheet + panel lateral)
PROPUESTAS_UX_MENU.md       ← este doc
```

---

## 9 · Iteración 2 — Ajustes aplicados

Feedback del fundador. 10 ajustes aplicados sobre la primera entrega:

### 9.1 Texto "Gratis" → contexto-dependiente

**Problema:** "Gratis" es ambiguo — en el admin suena a "no configures precio" y en el cliente suena raro para una opción que ya está incluida en el precio base.

**Solución:**
- **Vista cliente (PWA):** "Incluido" — lenguaje natural. El cliente entiende que el precio base ya cubre esa opción.
- **Admin (editor):** "Sin cargo" — lenguaje técnico apropiado para una herramienta de configuración.

### 9.2 Eliminar íconos de categorías

**Problema:** Categorías con íconos predefinidos (pizza, sándwich, broaster) rompen la consistencia cuando el restaurante crea categorías arbitrarias como "Especiales del día" o "Combos navideños" — no tienen ícono natural.

**Solución:** íconos eliminados del rail lateral de categorías y de los headers de sección. Solo nombre + contador de items.

### 9.3 Columna "+ PRECIO" (no "DELTA")

**Problema:** "DELTA" es jerga técnica de ingeniería que un cajero de restaurante no reconoce.

**Solución:** cabecera renombrada a "+ PRECIO". Clarifica inmediatamente que esa columna representa cuánto se suma al precio base.

### 9.4 Selector natural de reglas de grupo

**Problema:** Los campos numéricos `MÍNIMO` / `MÁXIMO` son abstractos. El restaurante no piensa en "min=1, max=1" sino en "tiene que elegir uno".

**Solución:** 4 opciones en lenguaje natural (radio buttons):
- "Obligatorio, elegir 1"
- "Obligatorio, elegir varios" → aparece campo para cantidad máxima
- "Opcional, elegir 1"
- "Opcional, elegir varios" → aparece campo para cantidad máxima

La estructura de datos en BD no cambia (min_selected, max_selected). Solo cambia la interfaz.

### 9.5 Eliminar plato → fuera del topbar, zona de peligro al final

**Problema:** El botón "Eliminar" en el topbar junto a "Guardar" es un accidente esperando pasar — están adyacentes y uno es destructivo.

**Solución:**
- Topbar solo tiene "Guardar cambios"
- Al final de la pantalla (después de todos los grupos): "Zona de peligro" con borde rojo suave y botón "Eliminar [nombre]"
- Al presionar Eliminar → modal de confirmación: "¿Eliminar '[nombre]'? Esta acción no se puede deshacer." con opciones "Cancelar" y "Sí, eliminar"

### 9.6 Indicador de cambios sin guardar

**Problema:** El restaurante puede editar grupos, cambiar precios y salir sin guardar — sin feedback visible.

**Solución:**
- Punto naranja (•) junto al título "Editar · Pizza Hawaiana •" cuando hay cambios sin guardar
- Sidebar de estado cambia de "Borrador guardado" a "Cambios sin guardar" con color ámbar
- Si el usuario presiona la flecha de salir con cambios: modal "Tienes cambios sin guardar" con opciones "Guardar y salir", "Seguir editando", "Descartar cambios"

### 9.7 Preview con scroll independiente

**Problema:** El panel de preview lateral se quedaba estático cuando el item tenía 3+ grupos — el restaurante no podía ver Cremas y Extras sin hacer scroll global.

**Solución:** La caja del preview tiene `height` fijo + `overflowY: auto` independiente del scroll del editor. El restaurante puede scrollear el preview sin que el editor se mueva.

### 9.8 Botón "Agregar grupo" más prominente

**Problema:** El botón anterior tenía el mismo peso visual que un placeholder — dashed border gris, texto gris. No llamaba la atención.

**Solución:** Botón con `background: brand-soft` + `border: 2px solid brand` + texto en naranja oscuro + ícono en cuadro naranja. Visualmente es la siguiente acción esperada después de configurar el grupo anterior.

### 9.9 Precio dinámico en botón "Agregar al pedido"

**Problema:** El botón mostraba el precio base estático independientemente de qué opciones estaban seleccionadas en el mock.

**Solución:** El precio del botón se calcula dinámicamente según las opciones seleccionadas (mock):
- Si se selecciona "Familiar" (+S/18): muestra "S/33"
- Con 2 extras de S/3: muestra "S/39"
- Con cantidad 2: el precio se multiplica

Para Hawaiana el mock pre-selecciona Personal + 2 extras → muestra S/22.

### 9.10 Colapso de grupos por defecto

**Problema:** Un item con 3 grupos mostraba los 3 expandidos simultáneamente → pantalla saturada.

**Solución:** Solo el primer grupo aparece expandido por defecto. Los demás muestran un resumen colapsado: "Cremas para llevar · 4 opciones · Opcional, hasta 3". El usuario puede expandir cualquiera con tap/click.

Aplica tanto en mobile como en desktop.

