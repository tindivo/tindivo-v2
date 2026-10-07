**LISTO CON CAMBIOS.** Verifiqué diff, capturas y dos casos en memoria con dependencias simuladas. No modifiqué archivos ni reejecuté las 273 unitarias y 15 e2e reportadas.

**1. Estado de los hallazgos**

- **C1 — RESUELTO:** cada sugerencia reemplaza explícitamente el contacto; los lugares públicos lo vacían (`lib/point-search.ts:107`).
- **C2 — NO:** limpiar el mapa al cerrar no invalida la caché compartida; durante 10 segundos puede devolver datos de otra cuenta (`lib/flow-context.ts:121`).
- **C3 — RESUELTO:** historial compartido para rutas, puntos y contactos. En el flujo desde negocio todavía se consulta la dirección separadamente (`hooks/use-courier-request.ts:58`).
- **C4 — RESUELTO:** reutiliza GPS reciente y descarta respuestas manuales tardías (`map/courier-map-host.tsx:187`, `:334`).
- **C5 — RESUELTO:** observa cambios de parámetros desde el layout persistente (`components/courier-host.tsx:61`).
- **C6 — PARCIAL:** devuelve foco al cerrar, pero el hook sigue contando controles `inert`; elegir un resultado tampoco restaura foco (`packages/ui/src/primitives/use-dialog-focus.ts:64`; `map/pin-drop-overlay.tsx:424`).
- **C7 — PARCIAL:** elimina el defecto del redondeo, pero distancia sola sigue fusionando puertas y contactos distintos (`lib/routes.ts:58`).

- **U1 — PARCIAL:** contactos completos compactos; la casilla sigue fuera de vista en captura 08. El botón explica el pendiente, pero permanece anunciado como deshabilitado (`trip-details-sheet.tsx:265`).
- **U2 — RESUELTO:** «Mi dirección» visible y contacto del perfil completado; capturas 06–07.
- **U3 — PARCIAL:** hay carga y salida al mapa; faltan error y reintento. Un fallo termina pareciendo ausencia de resultados (`map/courier-map-host.tsx:118`).
- **U4 — RESUELTO:** lista limitada, scroll y cierre; captura 02. Acepto conservar ambas flechas.
- **U5 — PARCIAL:** texto y secciones corregidos; las dos «Botica Central» todavía no permiten reconocer claramente qué contacto recuperan; captura 04.
- **U6 — PARCIAL:** «Ver anteriores» tiene área táctil suficiente; siguen contraste, estados pequeños y problemas de foco.

Las rutas abreviadas corresponden a `apps/customer/features/courier/`, salvo donde se indica otra ubicación.

**2. Errores pendientes y regresiones**

- **La caché amplía la exposición entre cuentas.** Reproducción: cargar A, cambiar a B y volver a cargar devuelve `userId="A"` y «Casa de A». Ahora incluye también identidad y dirección, además del historial. [flow-context.ts:121](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/lib/flow-context.ts:121).
- **La nueva deduplicación pierde destinatarios.** Dos casas separadas **11,12 m**, con referencias y celulares diferentes, producen una sola ruta; Daniel desaparece de los puntos recientes. [routes.ts:95](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/lib/routes.ts:95).
- **El ciclo de foco sigue roto por inspección:** `offsetParent` no excluye elementos `inert`; al terminar la lista intenta enfocar un control bloqueado.
- **«Completar» funciona como acción, pero declara `aria-disabled`.** El e2e usa `dispatchEvent` para saltarse esa restricción: no demuestra una interacción accesible normal.

**3. Lo que Claude dejó fuera**

Acepto la **segunda flecha** por alcance del pulgar. Acepto posponer **11 px** y **contexto del registro** a sus componentes compartidos.

El **contraste** sigue siendo un defecto: la marca no lo justifica. Acepto corregirlo globalmente en un cambio separado, sin declararlo resuelto.

Acepto posponer el **encuadre conjunto de A y B**: alejar el mapa perjudica la precisión del pin. Mostrar «Recojo: Botica…» en B recuperaría contexto sin tocar el motor.

**4. LISTO CON CAMBIOS**

1. Vincular caché e identidad al usuario e invalidarlas al cambiar sesión.
2. Excluir controles `inert` del ciclo de foco y restaurarlo también al elegir.
3. Deduplicar combinando distancia con contacto y referencia.
4. Habilitar semánticamente «Completar»; reservar `aria-disabled` para envío en curso.