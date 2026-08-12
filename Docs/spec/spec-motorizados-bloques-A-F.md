# Spec de trabajo — App Motorizados

**Repo:** `tindivo-v2` · **Rama base:** `develop` · **Commit de referencia:** `bc63c63`

---

## REGLAS DURAS — leer antes de escribir una línea

Estas reglas aplican a **todas** las partes. Violar cualquiera detiene el trabajo.

1. **Alcance de archivos.** Cada parte lista los archivos que puedes tocar. No toques ningún otro. Si crees que necesitas modificar un archivo fuera de la lista, **detente y reporta por qué**. No lo modifiques y sigas.

2. **No borres tus scripts de verificación.** Si creas un script en `scratch/` para probar algo, déjalo y reporta su ruta. Un script borrado no se puede re-ejecutar.

3. **No sustituyas la evidencia pedida.** Si la parte pide una captura de UI, una prueba de función aislada no sirve. Si no puedes producir la evidencia pedida, escribe `NO PUDE PRODUCIR ESTA EVIDENCIA` y explica por qué. No entregues una prueba más barata presentada como equivalente.

4. **Salida cruda, sin acotar.** Cuando la parte pida `git status` o `git diff`, córrelo sobre el repo completo, sin filtrar por rutas. Pega la salida tal cual.

5. **Una parte a la vez.** No empieces la Parte N+1 hasta que el humano confirme que la Parte N pasó. Si un criterio falla, detente y reporta.

6. **Migraciones aplicadas son inmutables.** Nunca edites un archivo de migración ya aplicado. Si algo cambió, es una migración nueva.

7. **`business_charges` es la única fuente de verdad para la deuda de restaurantes.** `balance_due` está deprecado; no construyas lógica nueva sobre él.

8. **Nada de SQL contra producción.** Si algo requiere SQL, produce el SQL y detente. El humano lo ejecuta.

9. **No inventes.** Si algo no lo encuentras, escribe `NO ENCONTRADO`. No completes con supuestos.

---

## PARTE 0 — Gate de estado limpio

**Esto lo hace el humano, no el agente.**

El repo tenía 9 archivos modificados sin commitear antes de empezar el trabajo de WhatsApp, incluyendo `apps/motorizados/app/pedido/[id]/page.tsx`. Eso hace que el diff del Bloque A sea imposible de separar del trabajo previo.

**Antes de soltar al agente:**

1. Correr `git status --short` sobre el repo completo.
2. Decidir: commitear los cambios preexistentes por separado, o stashear el trabajo de WhatsApp y commitear lo viejo primero.
3. Dejar el árbol con un estado conocido: o limpio, o con solo el trabajo de WhatsApp encima de un commit.

**Criterio de paso:** `git status --short` muestra únicamente archivos del Bloque A, o está vacío.

**No arrancar la Parte 1 sin esto.**

---

## PARTE 1 — Cerrar Bloque A (WhatsApp)

### Objetivo
Cerrar el trabajo ya hecho: mostrar lo que no se mostró, justificar la desviación de alcance, y hacer un refactor menor.

### Archivos permitidos
- `apps/motorizados/lib/deeplinks.ts`
- `apps/motorizados/components/order/whatsapp-sheet.tsx`
- `apps/motorizados/lib/whatsapp-templates.ts`
- `apps/motorizados/components/order/customer-card.tsx`
- `apps/motorizados/components/order/moment-picked-up.tsx`
- `apps/motorizados/app/pedido/[id]/page.tsx`

### 1.1 — Reportar lo que falta (sin modificar nada)

Pega, sin resumir:

- `git diff apps/motorizados/lib/deeplinks.ts` — **completo**, con cada línea eliminada visible. El `--stat` mostró `12 ++--`; se pidió solo agregar un export, las deleciones necesitan explicación.
- `git diff apps/motorizados/components/order/customer-card.tsx` — **completo**. Este archivo no estaba en el alcance del Bloque A y cambió 65 líneas.
- Contenido completo de `whatsapp-sheet.tsx` y `whatsapp-templates.ts`.
- Una línea explicando por qué se modificó `customer-card.tsx`.
- ¿Se implementó la sugerencia de plantilla `outside` al tocar "He llegado al domicilio"? Si sí, pega el fragmento. Si no, escribe `NO IMPLEMENTADO`.

### 1.2 — Refactor: extraer validador de teléfono

`waLink(phone, 'test')` aparece dos veces usado como validador (`page.tsx:163`, `whatsapp-sheet.tsx:19`). Construye una URL completa con texto basura solo para preguntar si el número sirve.

En `apps/motorizados/lib/deeplinks.ts`:

```ts
export function isValidPePhone(phone: string | null | undefined): boolean {
  if (!phone) return false
  const digits = phone.replace(/\D/g, '')
  return digits.length === 9 || (digits.length === 11 && digits.startsWith('51'))
}
```

`waLink` debe usar `isValidPePhone` internamente y devolver `null` si falla. Reemplazar los dos usos de `waLink(phone, 'test')` por `isValidPePhone(phone)`.

### Verificación

```
pnpm --filter motorizados type-check
pnpm --filter motorizados test
git grep -n "waLink(.*'test'"     # debe salir vacío
git status --short                # sin acotar
```

### Evidencia a capturar (la captura el humano, no el agente)

Con la app levantada y un pedido en estado `picked_up` con teléfono válido:

1. Captura del sheet de WhatsApp abierto, con las tres opciones visibles.
2. Al tocar cada opción: la URL real que abre (de la barra de WhatsApp Web o del inspector). Las tres.
3. Con un pedido sin teléfono: captura del estado vacío renderizado.

**No pasar a la Parte 2 sin estas tres capturas.**

---

## PARTE 2 — Investigación read-only (no modificar nada)

### Objetivo
Cerrar dos hallazgos que quedaron marcados como no verificados. **Esta parte no escribe código.**

### 2.1 — De dónde sale `cash_owed_at_delivery`

Hallazgo abierto: en una captura de producción, un pedido de S/25.50 pagado con billete de S/50 y vuelto de S/24.50 mostró **"llevas S/50.00 en efectivo para liquidar"**. El neto en mano debería ser **S/25.50**.

La auditoría previa solo miró el frontend (`delivered-screen.tsx` lee `order.cashOwedAtDelivery`) y concluyó que el valor "corresponde al neto en mano" basándose en el nombre de la variable. Eso no es verificación.

**Encontrar y pegar:**

- El código en `apps/api/app/api/v1/driver/orders/[id]/transition/` (o donde viva) que escribe `cash_owed_at_delivery`.
- La expresión exacta que calcula ese valor.
- Qué campos de entrada usa (`total`, `clientPaysWith`, `cashAmount`, etc.).
- Si existe algún trigger, función RPC o `DEFAULT` en la BD que también escriba esa columna. Buscar en `supabase/migrations/`.

**Reportar con una de estas dos conclusiones exactas:**
- `NETO CORRECTO: la expresión es <X>, que da 25.50 en el caso de ejemplo.`
- `BUG CONFIRMADO: la expresión es <X>, que da <Y> en el caso de ejemplo.`

No arreglarlo. Solo reportar.

### 2.2 — Auditoría de iconos (rehacer)

La auditoría anterior usó el regex `/<Icon[^>]*name=["']([^"']+)["']/g`, que **solo captura literales**. Hay al menos un nombre dinámico que se le escapó: `name={late ? 'priority_high' : 'schedule'}` en `preview-section.tsx`. La lista está incompleta por construcción.

**Hacer:**

1. Reescribir la extracción para capturar también nombres dentro de expresiones: `name={cond ? 'a' : 'b'}`, `name={variable}`, y cualquier constante que alimente esos nombres. Dejar el script en `scratch/` — **no borrarlo** — y reportar su ruta.
2. Pegar la lista completa resultante.
3. Para cada nombre, verificar contra la lista real de glifos de Material Symbols Rounded. No asumir. Si no puedes verificar programáticamente, dilo.

**Además, verificar el eje `FILL`:**

El componente `Icon` acepta un prop `filled`. Material Symbols es una variable font: si la hoja de estilo no carga con el eje `FILL@0..1`, el prop `filled` no hace nada, y ese es un candidato mucho más probable para los "placeholders" reportados que un nombre inválido — porque un nombre inválido en una fuente de ligaduras **renderiza el texto literal**, no un cuadrito.

Pegar:
- El `<link>` o `@import` que carga Material Symbols (buscar en `apps/motorizados/app/layout.tsx` y en `packages/ui`).
- La URL completa, mostrando qué ejes pide.
- El código de `Icon` en `packages/ui` (`icon.tsx`).

### Verificación
`git status --short` debe mostrar **solo** el script nuevo en `scratch/`. Cero archivos de la app modificados.

---

## PARTE 3 — Fix de stacking: Leaflet sobre el bottom sheet

### Objetivo
Arreglar la causa raíz de que el mapa se renderice encima de los bottom sheets.

### Diagnóstico confirmado
- `BottomSheet` (`packages/ui`) usa `z-80`.
- Los panes de Leaflet usan `z-index: 400` por defecto.
- `MapReadonly` se monta en `moment-picked-up.tsx` (estado `picked_up`), en el mismo contexto de apilamiento que el sheet.

El mapa gana siempre. No es un problema de scroll.

### Archivos permitidos
- `apps/motorizados/components/order/map-readonly.tsx`

### Fix

En el `<div>` contenedor de `MapReadonly`, crear un contexto de apilamiento propio para que los `z-index` internos de Leaflet queden contenidos:

```tsx
<div
  className="relative isolate overflow-hidden"
  style={{ height: heightPx, zIndex: 0 }}
>
```

`isolation: isolate` (la clase `isolate` de Tailwind) crea un stacking context nuevo. Los panes de Leaflet siguen en z-400, pero **relativos a ese contenedor**, que a su vez está en el flujo normal. El sheet en z-80 pasa por encima.

**No subir el z-index de `BottomSheet`.** Vive en `packages/ui` y lo consumen las cuatro apps; subirlo arregla este síntoma y puede romper otros.

### Verificación

1. Levantar la app con un pedido en `picked_up` **con coordenadas** (`delivery_coordinates_lat/lng` no nulos).
2. Confirmar que el mapa se ve.
3. Abrir el sheet de entrega (botón "He llegado al domicilio").
4. **El sheet debe estar completamente por encima. Ninguna parte del mapa visible sobre él.**

### Evidencia
- Captura antes del fix (mapa tapando el sheet).
- Captura después.
- `git diff` del archivo.
- En DevTools, captura del panel Computed del contenedor del mapa mostrando `isolation: isolate`.

---

## PARTE 4 — Eliminar los slots de mochila

### Objetivo
Quitar la pregunta de espacio en mochila. Decisión de producto: el motorizado siempre marca 1 bajo presión, así que el dato es basura alimentando lógica de capacidad. Cada pedido pasa a valer 1 slot fijo.

### Archivos permitidos
- `apps/motorizados/components/order/pickup-sheet.tsx`
- `apps/motorizados/app/pedido/[id]/page.tsx` (solo si el call site necesita ajuste)

### Hacer

1. Eliminar la constante `SLOT_OPTIONS`.
2. Eliminar el `useState(slots)` y los tres botones.
3. Eliminar el texto "¿Cuánto espacio ocupa en la mochila?".
4. `onConfirm` sigue recibiendo `{ slots: 1 }` — **no cambiar el contrato con el backend en esta parte**.
5. El sheet conserva: el aviso de recogida prematura, el bloque de "Cobras al entregar", y el botón "Confirmar recogida".

### Explícitamente NO hacer
- No tocar `capacity-indicator.tsx`.
- No tocar la columna `occupancy_slots` ni ninguna migración.
- No cambiar el endpoint.

### Verificación

```
pnpm --filter motorizados type-check
pnpm --filter motorizados test
git grep -n "SLOT_OPTIONS\|occupancy_slots" apps/motorizados
```

El último comando debe mostrar solo lecturas (tipos, view models), ninguna escritura desde el sheet.

### Evidencia
- Captura del sheet "Confirmar recogida" sin la pregunta de slots.
- Payload de red del `POST .../transition` al confirmar, mostrando `slots: 1`.
- `git diff`.

---

## PARTE 5 — Contraste

### Objetivo
Corregir los dos únicos usos de color que fallan contraste medido. **El resto de la paleta pasa AA o AAA — no la toques.**

### Medido contra `packages/ui/src/theme.css`

| Combinación | Ratio | Estado |
|---|---|---|
| `ink-muted` #57534e sobre `card` #ffffff | 7.6:1 | Pasa AAA |
| `amber-900` sobre `warning-soft` #fef3c7 | 8.2:1 | Pasa AAA |
| `amber-900/80` sobre `warning-soft` | 4.95:1 | Pasa AA, marginal |
| **`ink-subtle` #a8a29e sobre `card`** | **2.52:1** | **Falla** |
| `white/45` sobre hero `ink` #1a1614 | ~4.5:1 | Marginal |

### Archivos permitidos
- `apps/motorizados/components/order/preview-section.tsx`
- `apps/motorizados/components/order/status-hero.tsx`
- Cualquier archivo de `apps/motorizados` donde `text-ink-subtle` se use en **texto** (identificar primero, ver abajo)

### Hacer

**5.1** — Correr `git grep -n "text-ink-subtle" apps/motorizados` y pegar la salida. Para cada resultado, indicar si es texto legible o decoración (borde, separador, icono decorativo).

**5.2** — Reemplazar `text-ink-subtle` por `text-ink-muted` **solo** donde sea texto que el usuario deba leer. Dejarlo donde sea decorativo.

**5.3** — En `preview-section.tsx`, la línea `"Paga con {X} · llévalo encima"` usa `text-amber-900/80`. Cambiar a `text-amber-900` sólido. Es la línea que decide si el motorizado lleva vuelto encima; no puede estar al borde del umbral bajo sol.

**5.4** — En `status-hero.tsx`, los labels inactivos del stepper usan `text-white/45`. Subir a `text-white/60`.

### Explícitamente NO hacer
- No cambiar ningún valor en `packages/ui/src/theme.css`.
- No cambiar `--color-ink-muted`, `--color-brand` ni ningún token.
- No "mejorar" colores que no están en esta lista.

### Verificación
Para cada cambio, medir el ratio resultante con una herramienta de contraste y pegar el número. No estimar.

### Evidencia
- Salida de `git grep -n "text-ink-subtle" apps/motorizados`.
- Tabla de ratios antes/después de cada cambio.
- `git diff`.

---

## PARTE 6 — Botón "Soltar pedido"

### Objetivo
El botón secundario destructivo está a ancho completo, con el mismo peso visual que el CTA primario, inmediatamente debajo. Es la app de un motorizado que la usa con una mano sobre una moto: un pulgar 40px abajo suelta el pedido.

### 6.1 — Verificar primero (read-only)

Existe `apps/motorizados/components/order/release-sheet.tsx`. **Antes de cambiar nada**, reportar:

- ¿"Soltar pedido" abre ese sheet de confirmación, o suelta directo?
- Pegar el fragmento del call site.

Si ya confirma, el trabajo es solo visual. Si suelta directo, es un defecto y hay que reportarlo antes de tocarlo.

### 6.2 — Cambio visual

**Archivos permitidos:** el componente que renderiza el par de botones (identificar en 6.1; probablemente `app/pedido/[id]/page.tsx`).

- Separación vertical mínima entre CTA primario y "Soltar pedido": **24px**.
- "Soltar pedido" deja de ser ancho completo. `variant="ghost"`, ancho automático, centrado.
- Tamaño de texto reducido respecto al CTA primario.
- Altura de toque mínima 44px — reducir el peso visual, no el área táctil.

### Verificación
- Medir en DevTools la distancia real en px entre el borde inferior del CTA y el borde superior de "Soltar pedido". Debe ser ≥24px.
- Medir la altura del área táctil de "Soltar pedido". Debe ser ≥44px.

### Evidencia
- Captura antes y después, en viewport de móvil (390px de ancho).
- Las dos medidas de DevTools.
- `git diff`.

---

## Orden y puntos de parada

```
Parte 0  →  humano, gate de repo limpio
Parte 1  →  cerrar Bloque A          →  PARAR, revisar evidencia
Parte 2  →  investigación read-only  →  PARAR, revisar hallazgos
Parte 3  →  z-index Leaflet          →  PARAR
Parte 4  →  slots fuera              →  PARAR
Parte 5  →  contraste                →  PARAR
Parte 6  →  soltar pedido            →  PARAR
```

Después de cada parte: commit propio, con mensaje que nombre la parte.

**Fuera de alcance de este spec** (no empezar, ni siquiera parcialmente):
- Rediseño de la tarjeta de cobro
- Mapa en popup
- Toast al entregar
- Rediseño del componente Yape
- Cambios en `theme.css` o en la paleta
- Cualquier cosa en `apps/customer`, `apps/negocios` o `apps/admin`
