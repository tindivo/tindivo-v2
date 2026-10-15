# PROTOCOLO DE ORQUESTACIÓN CLI: CLAUDE OPUS 5.5 (JEFE) -> GEMINI 3.8 FLASH (SUBAGENTE EN TERMINAL)

> **Ajustes a este repo (verificado en consola el 2026-10-15, `agy` 1.3.5). Mandan sobre el texto de abajo:**
>
> - El entorno es **Claude Code** (no la terminal de Antigravity); `agy` se invoca como herramienta de consola.
> - **Comando probado** (Git Bash; `agy` no está en su PATH):
>   `/c/Users/Jesus/AppData/Local/agy/bin/agy.exe -p "$(cat <ruta>/.gemini_task.tmp.md)" --model gemini-3.8-flash-high --mode plan --print-timeout 600s`
>   lanzado **desde la raíz del worktree** donde debe leer. `--mode plan` = solo lectura; para escritura controlada
>   (Plantillas 2 y 3) `--mode accept-edits`. **Nunca `--dangerously-skip-permissions`.**
> - En `-p` no puede pedir permiso para comandos de terminal: si lo intenta, termina sin salida. El encargo le dice que
>   use solo su herramienta de lectura/edición de archivos. Los gates (tsc, tests, Biome) los corro yo.
> - `.gemini_task.tmp.md` y `.gemini_output.tmp.md` van en el **scratchpad de la sesión**, nunca en el repo
>   (`AGENTS.md`: artefactos de un solo uso fuera del repo y nada nuevo en la raíz).
> - Modelo: solo `gemini-3.8-flash-high` (decisión de Jesús, 2026-10-10). Runbook: `Docs/operacion/agentes-en-esta-maquina.md`.
> - No sustituye a Codex: dinero, seguridad y producción siguen pasando por Codex (estándar §7). Gemini nunca decide
>   lógica de negocio, SQL de dinero ni RLS; lo que entrega se audita por diff (§6 de abajo y estándar §7.3).

## 1. CONTEXTO DEL ENTORNO Y ARQUITECTURA DE EJECUCIÓN

Estás operando dentro de la terminal integrada de Antigravity IDE. Tienes acceso directo a la ejecución de comandos de consola.
Tu objetivo principal es **preservar al máximo tus propios tokens (Claude Opus 5.5)** delegando el trabajo pesado de lectura masiva, refactorización repetitiva y corrección mecánica de errores a **Gemini 3.8 Flash**, ejecutándolo tú mismo como una herramienta de consola (CLI) sin pedirle al usuario que copie o pegue nada.

### Regla de Cero Fricción (Sin carpetas complejas)

No le pidas al usuario que cree estructuras de carpetas ni que ejecute comandos manualmente. Tú tienes control de la terminal:

- Para pasarle instrucciones largas o complejas a Gemini sin sufrir errores de escapado de comillas en PowerShell/Bash, escribe el prompt en un único archivo efímero (`.gemini_task.tmp.md`) y ejecuta el CLI de Antigravity apuntando a ese archivo, o pásaselo por `stdin`.
- Al terminar la tarea, borra o reutiliza `.gemini_task.tmp.md`.

---

## 2. PERFIL TÉCNICO DE TU TRABAJADOR (GEMINI 3.8 FLASH)

Debes conocer con exactitud quirúrgica cómo piensa y dónde falla Gemini 3.8 Flash para redactarle prompts a prueba de balas antes de invocarlo en la terminal:

### A. En qué es excelente (CUÁNDO DEBES INVOCARLO)

1. **Ingesta masiva de código y auditoría estática:** Puede leer 15, 30 o 50 archivos de golpe (gracias a su gran ventana de contexto y bajo costo) y devolverte un resumen comprimido en consola de dependencias, rutas, imports, esquemas de base de datos y firmas de funciones.
2. **Clonación de patrones (Codemods por imitación):** Si tú (Opus) migras **1 archivo piloto** perfecto, Gemini 3.8 Flash es extremadamente rápido y preciso replicando esa misma estructura exacta en otros 10 o 20 archivos similares.
3. **Traducción estructural y Boilerplate:** Crear DTOs, interfaces TypeScript, esquemas Zod/Pydantic, modelos de ORM, mocks o tests unitarios a partir de un contrato ya definido.
4. **Barrido de errores de compilación/tipado:** Corregir rutas de imports rotas tras mover archivos, renombrar variables en serie o ajustar firmas tras un `tsc --noEmit` / linter.

### B. En qué falla gravemente (QUÉ TIENES PROHIBIDO DELEGARLE SIN SUPERVISIÓN)

1. **Lógica de negocio compleja y casos borde:** Falla al deducir reglas implícitas, manejo de concurrencia, condiciones de carrera, transacciones complejas o diseño de arquitectura desde cero. **Eso lo haces tú (Opus).**
2. **Bucles de sobre-exploración (File-reading loops):** Si le das una orden abierta como _"Investiga cómo funciona el módulo X"_, Gemini 3.8 Flash hará `grep` y leerá todo el repositorio sin parar. **Siempre debes pasarle la lista exacta de rutas de archivos que tiene permitido leer y prohibirle explorar el resto.**
3. **Invención de abstracciones ("Alucinación creativa"):** Si no le dices explícitamente _"No inventes helpers ni cambies la lógica"_, intentará "mejorar" el código rompiendo contratos existentes.
4. **Sobreescritura perezosa:** A veces omite bloques de código poniendo comentarios tipo `// ... resto del código igual`. Debes prohibírselo explícitamente cuando edite archivos.

---

## 3. CÓMO EJECUTAR A GEMINI DESDE TU TERMINAL (PUENTE CLI)

Antes de tu primera ejecución en una sesión, verifica rápidamente en consola cómo responde el binario de Antigravity en este entorno corriendo:
`agy --help` (o el alias configurado en el sistema).

### Método de Invocación Segura (Evitando roturas de comillas en PowerShell / Bash)

Nunca pases prompts largos de múltiples líneas directamente como string suelto en el comando porque PowerShell/Bash romperá los saltos de línea o las comillas del código. Sigue siempre este patrón en 3 pasos:

1. **Genera el archivo de orden:** Escribe la instrucción ultra-específica en `.gemini_task.tmp.md`.
2. **Ejecuta el CLI de forma no interactiva:**
   - En PowerShell: `Get-Content .gemini_task.tmp.md -Raw | agy` _(o `agy -p (Get-Content .gemini_task.tmp.md -Raw)` / flag de ejecución directa según soporte de tu versión de `agy`)_.
   - Si usas el comando directo con instrucción corta: `agy "Lee y ejecuta estrictamente las instrucciones de .gemini_task.tmp.md sin hacer preguntas."`
3. **Verifica el resultado (Auditoría barata):**
   - No leas los archivos completos que Gemini modificó (eso gastaría tus tokens de Opus).
   - Ejecuta `git status` y `git diff --stat` (o `git diff` enfocado) y corre el compilador/linter para validar que el trabajo de Gemini fue limpio.

---

## 4. FLUJO DE TRABAJO OBLIGATORIO PARA MIGRACIONES PESADAS

Cada vez que el usuario te pida migrar un módulo, refactorizar una capa o hacer un cambio grande, **ESTÁ PROHIBIDO que tú (Opus) leas todos los archivos del módulo o edites archivos repetitivos uno por uno**. Sigue este ciclo:

### FASE 1: Exploración Delegada (Ahorro del 80% de tokens de lectura)

1. Lista solo los nombres de archivos del directorio a migrar (`ls` o `Get-ChildItem`).
2. Manda a Gemini 3.8 Flash por CLI a leer esos archivos y pedirle que te devuelva en texto plano (o en `.gemini_output.tmp.md`) un **Mapa Técnico Ultra-Comprimido**:
   - Qué exporta cada archivo (firmas exactas).
   - Qué dependencias internas y externas importa.
   - Qué lógica de negocio crítica o acoplamientos raros existen.
3. Tú (Opus) solo lees ese resumen de 50-100 líneas en lugar de leer 2,000 líneas de código fuente.

### FASE 2: El "Archivo Piloto" (Hecho 100% por Claude Opus 5.5)

1. Con base en el resumen, tú diseñas la arquitectura y **migras personalmente 1 solo archivo representativo** (el más complejo o el que sirve de molde).
2. Verificas que ese archivo piloto compile y cumpla todas las reglas de negocio. Este archivo será la **"Fuente de la Verdad"** para Gemini.

### FASE 3: Ejecución en Serie por Lotes (Hecho por Gemini 3.8 Flash)

1. Agrupa el resto de archivos a migrar en lotes pequeños (de 2 a 4 archivos máximo por ejecución de CLI para que Gemini no pierda foco ni trunque salidas).
2. Invoca a Gemini por CLI pasándole el **Archivo Piloto** como molde obligatorio.
3. Revisa su trabajo con `git diff` y el compilador.

---

## 5. PLANTILLAS OBLIGATORIAS DE PROMPTS PARA GEMINI 3.8 FLASH

Cuando redactes `.gemini_task.tmp.md` para invocar a Gemini por terminal, **NUNCA uses lenguaje vago**. Usa obligatoriamente una de estas 3 estructuras estrictas:

### Plantilla 1: Orden de Exploración y Resumen (Solo Lectura)

```text
MODO: ANALISTA ESTÁTICO DE CÓDIGO (SOLO LECTURA - PROHIBIDO MODIFICAR ARCHIVOS)

ARCHIVOS OBJETIVO A LEER:
- [Ruta exacta 1]
- [Ruta exacta 2]
- [Ruta exacta 3]

RESTRICCIONES ESTRICTAS:
1. PROHIBIDO leer o buscar archivos fuera de la lista anterior. No ejecutes búsquedas globales en el repositorio.
2. PROHIBIDO modificar, crear o borrar archivos del proyecto.
3. Sé extremadamente conciso. Sin introducciones ni explicaciones.

TAREA:
Analiza los archivos listados y devuelve únicamente un reporte técnico con este formato exacto por archivo:
- Archivo: [ruta]
- Propósito (máx 1 línea):
- Imports clave (internos y externos):
- Exports / Firmas públicas (con tipos exactos de entrada y salida):
- Estado / Efectos secundarios (llamadas a BD, APIs, mutaciones globales):
- Riesgos de migración (código acoplado o lógica delicada):
```

### Plantilla 2: Orden de Migración por Clonación de Patrón (Escritura Controlada)

```text
MODO: EJECUTOR MECÁNICO DE MIGRACIÓN (CERO CREATIVIDAD)

ARCHIVO MOLDE (REFERENCIA OBLIGATORIA YA MIGRADA):
- [Ruta del archivo piloto creado por Opus]

ARCHIVOS A MIGRAR EN ESTE LOTE:
1. Origen: [Ruta antigua 1] -> Destino: [Ruta nueva 1]
2. Origen: [Ruta antigua 2] -> Destino: [Ruta nueva 2]

REGLAS INQUEBRANTABLES PARA GEMINI 3.8 FLASH:
1. PROHIBIDO EXPLORAR EL REPOSITORIO: Lee ÚNICAMENTE el "Archivo Molde" y los "Archivos a Migrar" listados arriba. No hagas búsquedas globales.
2. IMITACIÓN ESTRICTA: Replica exactamente la estructura de capas, convención de nombres, inyección de dependencias, manejo de errores y tipado que ves en el ARCHIVO MOLDE.
3. INTACTA LA LÓGICA DE NEGOCIO: Mantén exactamente las mismas validaciones, cálculos, condicionales y llamadas a datos del archivo origen. Solo tradúcelos al nuevo formato estructural. No inventes mejoras, no optimices algoritmos y no agregues funciones extra.
4. PROHIBIDO TRUNCAR CÓDIGO: Escribe los archivos de destino completos de principio a fin. Está terminantemente prohibido usar comentarios como "// ... resto del código" o "// implementar aquí".
5. SI FALTA UN TIPO O IMPORT: Si un archivo origen usa una dependencia que aún no ha sido migrada, asume la ruta equivalente siguiendo el patrón del Archivo Molde y añade un comentario `// TODO(Opus): Verificar ruta de import` en esa línea. No te pongas a buscar el archivo por el proyecto.
6. Al finalizar, imprime únicamente la lista de archivos modificados en 3 líneas.
```

### Plantilla 3: Orden de Corrección de Errores de Compilación / Tipado

```text
MODO: CORRECTOR QUIRÚRGICO DE COMPILACIÓN

ERRORES EXACTOS A CORREGIR:
[Pegar aquí el output exacto del compilador/linter con archivo y línea]

ARCHIVOS PERMITIDOS PARA LECTURA Y EDICIÓN:
- [Ruta 1 mencionada en el error]
- [Ruta 2 mencionada en el error]

REGLAS INQUEBRANTABLES:
1. Lee y edita ÚNICAMENTE los archivos listados arriba y exactamente en las líneas afectadas por el error.
2. PROHIBIDO usar `any`, `@ts-ignore` o suprimir reglas del linter para ocultar el error.
3. PROHIBIDO cambiar la lógica de negocio o borrar funcionalidades para que el código compile.
4. Si el error requiere un cambio arquitectónico mayor que no se resuelve ajustando imports o firmas evidentes, NO edites esa línea y repórtalo en consola con el prefijo `ESCALAR_A_OPUS: [motivo]`.
```

---

## 6. REGLAS DE AUDITORÍA Y ESCALAMIENTO PARA CLAUDE OPUS

Como Jefe de Orquestación, después de cada ejecución de Gemini en la terminal debes aplicar este filtro:

1. **Revisión por Diff:** Ejecuta `git diff` sobre los archivos que tocó Gemini. Como leer un `diff` consume muchos menos tokens que abrir archivos enteros y reescribirlos tú mismo, podrás detectar al instante si Gemini alucinó algo.
2. **Intervención Quirúrgica:** Si Gemini hizo el 90% del trabajo sucio bien pero se equivocó en una condición lógica compleja de 5 líneas, **no le pidas a Gemini que lo intente de nuevo en bucle**. Entra tú (Opus), haz el edit quirúrgico de esas 5 líneas y pasa al siguiente lote.
3. **Limpieza:** Elimina `.gemini_task.tmp.md` cuando termines el bloque de trabajo para dejar el árbol de Git limpio.
