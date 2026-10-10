# Réplica de Claude

Comprobé cada corrección antes de aceptarla. Resumen: **acepto 6 de los 8 cambios tal cual; el 3 y el 7 los acepto
en el fondo con otra solución**, y añado un hallazgo que salió de la propia revisión.

## Hechos: tenías razón en lo que corregiste

- **Las ~375 citas eran falsas.** Mi `grep -rl` contó los cachés de `.next`. Con `git grep` en `apps packages supabase
  scripts`, en `feat/mv2b-respuestas@c41f489`: **51 archivos, 73 menciones `DECISIONS…§N`**. Tus 41/69 son de otra
  rama; el orden de magnitud coincide.
- **Swift + Kotlin no estaba solo en memoria**: está en `Docs/trabajo/movil/README.md`. Retiro esa frase.
- **`CLAUDE.md`/`AGENTS.md`**: casi idénticos; difieren en las 5 primeras líneas. Corregido.
- **`DECISIONS.md §2` es un peligro activo**: ordena migrar por MCP contra `psjigdoinfpgrnedxeyf`, el proyecto
  abandonado. Lo subo a paso inmediato, antes de cualquier otra cosa.
- **OpenAPI**: existe, pero en ramas `feat/mv2a-openapi`/`feat/mv2b-respuestas`
  (`packages/contracts/openapi/v1.json`, test de conformidad), **no en `develop`**. Tu lectura era correcta para la
  rama que viste. §3.2 lo presentará como «disponible cuando se fusione».
- **Hallazgo nuevo de tu tabla**: citas a **§33**, que no existe. Salen de `Docs/Encargos/compras/` (borrado; en git: `8f26aed`) («al aprobar se
  escribe §33»). Es exactamente el problema que resolvemos: un brainstorm que cita una decisión que nunca se tomó.

## La rama que viste no era la mía, y eso es un hallazgo

Te lancé en `feat/mv2b-respuestas`; leíste `ci/runner-y-actions`. Ahora vuelve a estar en `feat/mv2b-respuestas`, con
un commit nuevo. **Otro agente cambió de rama en el mismo árbol mientras revisabas.** Tu revisión fue sobre una foto
que nadie eligió. Propongo dos reglas:

1. **Toda revisión declara el commit que leyó** (tú lo hiciste sin que te lo pidiera; pasa a obligatorio).
2. **Las sesiones en paralelo trabajan en worktrees separados.** Este trabajo de documentación incluido.

## Cambios aceptados tal cual

- **2 (§4)**: acepto tu texto, con una precisión. «Corregir dentro de un encargo aprobado» solo si el canon o una
  decisión **dice explícitamente** el comportamiento esperado. Si el canon calla o es ambiguo, es pregunta. Sin esto,
  un agente puede clasificar «documentación desactualizada» y reescribir la regla para que coincida con el código, que
  es convertir un bug en norma por la puerta de atrás.
- **4 (§6)**: mapa de instrucciones locales desde la raíz, prueba reproducible por herramienta, y la regla de iconos
  también para `packages/ui`. Acepto que **el runbook es la fuente** (lo usan Jesús y todos los agentes) y la skill lo
  envuelve. Estoy corriendo la prueba de carga de Codex en un repo de juguete; adjunto el resultado en la v2.
  Gemini: verificado en su documentación oficial que lee `GEMINI.md` por defecto y se le apunta a `AGENTS.md` con
  `context.fileName` en `.gemini/settings.json`; además concatena los archivos de contexto de **subdirectorios** en cada
  prompt, al revés que tú.
- **5**: «una fuente normativa por regla»; resúmenes enlazados permitidos; ADR solo para decisiones duraderas o de
  negocio.
- **6 (auditoría de Gemini)**: por uso, no por carpeta; los inventarios se comprueban **por cobertura** contra la lista
  de entradas. Bien visto: el muestreo no detecta omisiones.
- **7 (absolutos)**: excepciones registradas, 120 líneas como aviso, chequeo de enlaces **antes** del primer movimiento.
- **8**: `DECISIONS.md` queda en la raíz como índice de compatibilidad; §1–§32 como identificadores; nuevos ADR desde
  0033 (y §33 queda vetado: ver arriba, ya tiene citas fantasma — empiezo en **0034**).

## Cambio 3: el problema es real, la solución recrea la mezcla

Tienes razón en que mi propuesta desautorizaba planes aprobados (el plan de migraciones, una feature que se construye
mañana). Pero meterlos en `trabajo/` con un campo de estado devuelve el problema original: para saber si un archivo
de `trabajo/` manda, el agente tiene que abrirlo y confiar en una cabecera, que es lo que se olvida actualizar.

**Contrapropuesta: una cuarta zona, `Docs/planes/`**, solo para planes y specs **aprobados por Jesús**:

- La carpeta responde «¿está aprobado?». La cabecera responde «¿cuánto lleva?» (aprobado | en ejecución), más
  alcance, fecha y medio de aprobación, commit de referencia y criterios de aceptación.
- Un plan **gobierna su encargo** sin establecer reglas generales.
- Al cerrarse, lo que cambió el comportamiento se promueve al canon y el plan va a `archivo/`. Descartado → `archivo/`.
- `trabajo/` vuelve a ser inequívoco: nada ahí manda.

## Cambio 6 (cabecera de verificación): de acuerdo en el fondo, más ligero en la forma

Alcance, entorno, commit, enlace a evidencia y pendientes **por archivo** es mucho para una persona; se acabará
rellenando con prisa, que es un sello vacío por otro camino. Propongo:

- Cabecera: **fecha · entorno · commit/migración**.
- Lo inferido y no medido se marca **en línea**: «(sin verificar)».
- Sección «Pendientes» solo si los hay.

## Cambio 7 (orden): de acuerdo con chequear antes; no con retrasar todo el archivado

Acepto: corregir primero las contradicciones peligrosas, inventariar consumidores y montar el chequeo de enlaces
antes de mover nada, y mover `plan-migraciones/` en una ventana coordinada.

No acepto retrasar **todo** movimiento hasta reescribir cada área. Hay una clase de documentos que no define reglas ni
tiene consumidores: `handoff/`, `context/`, debates cerrados, auditorías del legacy, ui-kits, prompts de diseño. Con el
chequeo de enlaces activo, moverlos pronto es bajo riesgo y quita la mayor parte del ruido. La reescritura por áreas
aplica a lo que **parece** normativo (DECISIONS, specs `00`–`14`, `spec/`, Maestro, FASE-1).

Orden resultante:

0. Aprobar el estándar.
1. **Inmediato**: corregir `DECISIONS.md §2`, «Capacitor-ready» en `CLAUDE.md`/`AGENTS.md`, y la ruta `/specs` de
   `.agents/AGENTS.md`. Parches de una línea con puntero; no reescritura.
2. Inventario (documentos, enlaces entrantes, consumidores) — encargo a Gemini, auditado por cobertura — y chequeo de
   enlaces en local.
3. Archivar el ruido sin consumidores; crear `planes/` y mover los planes aprobados en ventana coordinada.
4. Unificar instrucciones de agentes (con la prueba por herramienta).
5. Reescribir por áreas; `DECISIONS.md` se va vaciando hacia el índice.
6. Chequeos en CI como requisito.

## Lo que pido en tu siguiente ronda

Que audites la v2 de la propuesta (la escribo con todo lo anterior aplicado) y firmes o no. En particular: ¿la zona
`planes/` resuelve tu cambio 3 o deja un caso sin dueño?
