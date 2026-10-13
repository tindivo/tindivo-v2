# Docs: cómo se documenta Tindivo y cómo se trabaja con agentes

> Verificado: 2026-10-12 · entorno: `develop@591ec569` · Estándar vigente, aprobado por Jesús el 2026-10-10; enmienda aprobada por Jesús el 2026-10-12 (conversación con Claude Code) · Resumen operativo: `AGENTS.md` raíz
> La transición que lo implantó (el squash de ~255 documentos a este canon) terminó el 2026-10-10; su plan y el debate
> con Codex, que firmó con cambios en dos rondas, están en la etiqueta `archive/estandar-docs` (commit `8dcf6ba`).

## 1. Qué resuelve

Antes de este estándar, `Docs/` mezclaba reglas vigentes, brainstorms, propuestas descartadas, debates y relatos de
sesiones, todos con la misma apariencia de documento oficial, y ningún agente podía distinguirlos. **La causa era que no
había frontera entre trabajar y decidir**: cada sesión dejaba su análisis en `Docs/` y nada lo separaba de una regla
aprobada. Este estándar pone esa frontera.

### Mapa

| Dónde | Qué |
|---|---|
| `Docs/glosario.md` | El nombre de cada cosa |
| `Docs/negocio/` | Plataforma, dinero, antifraude, apps, diseño y un archivo por servicio en `servicios/` |
| `Docs/arquitectura/README.md` | Cómo está construido; los estándares de código, en `arquitectura/estandares/` |
| `Docs/operacion/` | Runbooks: deploy, publicación de apps nativas, trampas conocidas, graphify, cómo llamar a cada agente |
| `Docs/decisiones/` y `DECISIONS.md` | Las decisiones (ADR desde la 0034; §1–§32 e índice en `DECISIONS.md`) |
| `Docs/planes/` | Lo aprobado y en ejecución: migraciones y migración móvil |
| `Docs/trabajo/` | Borradores, análisis, debates, el backlog y la cola de decisiones abiertas (`decisiones-abiertas.md`): **no manda** |

## 2. Tres zonas, y git como archivo

El estado de un documento lo dice **la carpeta donde está**: una etiqueta se olvida actualizar, una ubicación no se
puede ignorar. Dentro de cada zona, la cabecera solo dice el avance, nunca si el documento manda. Lo que ya no manda
ni está abierto **no está en el repo**: está en git (§2.3).

| Zona | Dónde | Qué contiene | Quién escribe | ¿Manda? |
|---|---|---|---|---|
| **Canon** | `Docs/negocio/`, `arquitectura/`, `decisiones/`, `operacion/`, `glosario.md`, `README.md` | Lo que es verdad hoy y por qué | Por promoción (§5) o corrección dentro de lo aprobado (§4) | **Sí**, como regla general |
| **Planes** | `Docs/planes/<tema>/` | Planes y specs **aprobados por Jesús**, en ejecución o por ejecutar | Se crean al aprobarse; se actualiza su avance | **Sí**, solo dentro de su alcance |
| **Trabajo** | `Docs/trabajo/<tema>/` | Análisis, debates, propuestas, inventarios, bitácoras | Cualquier agente, libremente | **No** |

### 2.1 Qué va en cada parte del canon

| Carpeta | Contiene | **No** contiene |
|---|---|---|
| `negocio/` | Reglas del negocio y su porqué, sin tecnología: roles, dinero, antifraude, tiempos; un archivo por servicio en `negocio/servicios/` (pedidos de restaurante, Entregas, Store…) | Tablas, endpoints, componentes |
| `arquitectura/` | Cómo está construido y por qué: módulos, fronteras, flujo de datos, estándares de código (`estandares/`), excepciones y propiedad de los objetos de la base | Listas de columnas o endpoints (§3.2) |
| `decisiones/` | ADR de decisiones duraderas (§5.1) | Discusión: mientras está abierta vive en `trabajo/`; después, en git, enlazada por etiqueta |
| `operacion/` | Runbooks (deploy, base local, seed, migraciones, publicación de apps) y trampas conocidas con su síntoma. **Son la fuente** de cada procedimiento; las skills los envuelven (§6.3) | — |
| `glosario.md` | Nombre oficial, nombre en código y nombres retirados | — |

### 2.2 Cabecera de un plan

```
> Estado: aprobado | en ejecución · Aprobado por Jesús el AAAA-MM-DD (medio) · Commit de referencia: abc1234
> Alcance: … · Criterios de aceptación: …
```

- A `planes/` pasan **únicamente el plan o spec aprobado y sus anexos normativos**. Análisis, debates, bitácoras y
  propuestas se quedan en `trabajo/` y se borran al cerrarse. La aprobación es por documento, no por carpeta.
- Cambiar alcance o criterios requiere nueva aprobación; actualizar el avance, no.
- Una entrega parcial actualiza el canon en su PR, sin esperar al cierre del plan.
- Al cerrarse o descartarse, el plan se borra; el canon o un ADR dicen qué se hizo (o por qué no) y enlazan su etiqueta.

### 2.3 Git es el archivo

No hay carpeta de historia: acumularía la misma basura que hoy hay en `Docs/`, y agentes y grafo seguirían
tropezando con ella.

- **Al cerrarse un tema, se borra.** Antes, lo que vale se rescata al canon: la decisión, el porqué y las
  alternativas descartadas (en el ADR, si es duradera). El resto —rondas de debate, borradores, auditorías— no se
  conserva en el árbol.
- **La discusión se enlaza por etiqueta, no por ruta.** Al cerrar un tema se crea la etiqueta `archive/<tema>` en el
  último commit que lo contiene y se sube (`git push origin archive/<tema>`). Se cita así:
  `Discusión: archive/estandar-docs:Docs/trabajo/estandar-docs/`, y `git show` la recupera siempre. Motivo: el repo
  integra con *merge commits*, así que los SHA de la rama sobreviven en `develop`; pero un SHA de una rama que se
  borra, se reescribe o se integra de otra forma deja de ser alcanzable, y una etiqueta es un ancla que no depende de
  cómo se integró el PR. Citar un SHA solo vale si es ancestro de `develop`. Lo comprueba
  `scripts/check-archive-refs.sh` (§8).
- **Lo que no es documento no entra al repo**: salidas de modelos, muestras, listas intermedias y scripts de un solo
  uso viven en la carpeta temporal del agente. Al repo llega solo su conclusión.
- **Antes de borrar, enlaces entrantes** (§8.1): lo que se borra no puede quedar citado como fuente.

## 3. Reglas de escritura del canon

### 3.1 Una fuente normativa por regla

Cada regla tiene **un** archivo que la define. Se permiten resúmenes que enlazan a esa fuente (en `AGENTS.md`, en otro
documento); no definiciones independientes. El ADR conserva el porqué de la decisión; el documento temático describe
la regla vigente.

### 3.2 La referencia se genera; la explicación se escribe

No se mantiene a mano lo que produce una fuente: el esquema (`database.types.ts`, `supabase/migrations/`), la máquina
de estados (`packages/contracts`) y el OpenAPI (`packages/contracts/openapi/v1.json`, en `develop` desde el PR #12).
El canon enlaza esas fuentes y escribe lo que no pueden decir: el porqué y las reglas.

### 3.3 Citar símbolos, no líneas

`advance_order`, `orders.status`, `0124_…`, `apps/negocios/lib/x.ts#formatMoney`; no `archivo.ts:123`. Los números de
línea valen en `trabajo/`, que es una foto de un momento.

### 3.4 Si una regla se puede probar, se prueba

Una regla que puede romperse en silencio y se comprueba con un test barato (SQL o TS) se convierte en test; el canon
la enuncia en una línea y enlaza el test. Durante la transición no bloquea la reescritura.

### 3.5 Verificación

```
> Verificado: 2026-10-10 · entorno: tindivo-prod (solo lectura) + develop@abc1234
```

- Lo afirmado sin medir se marca en línea: **(sin verificar)**.
- Una sección «Pendientes» solo si los hay.
- No se exige producción para lo que se comprueba en local; se declara el entorno.

### 3.6 Renombrar es reescribir

Prohibido «donde diga X, léase Y». Si un nombre cambia, se cambia en todo el canon y el viejo pasa al glosario como
retirado.

### 3.7 Sin narrativa de sesión

El canon dice qué es verdad y por qué. «El día que…», «se descubrió que…» van a `trabajo/`. La lección se conserva;
la historia, no.

## 4. Norma, evidencia y permisos

Son tres cosas distintas y no se ordenan en una sola escala:

- **Norma** — qué debe pasar: `decisiones/` y el canon; dentro de su alcance, `planes/`.
- **Evidencia** — qué pasa de verdad: el código, los tests, las consultas a la base. Un test puede preservar un bug;
  producción puede incumplir una decisión.
- **Permisos** — qué puede ejecutar cada herramienta: `.claude/settings.json`, el perfil `revisor` de Codex, la
  protección de ramas. Limitan acciones; no definen reglas. Se documentan por herramienta en `operacion/`.

**Ante una discrepancia entre norma y evidencia**, el agente distingue:

1. **Bug** — la norma dice explícitamente el comportamiento esperado y el código no lo cumple. Puede corregirlo si está
   dentro de un encargo aprobado.
2. **Documentación desactualizada** — el comportamiento cambió por una decisión aprobada que no se reflejó. Puede
   corregir el canon citando esa decisión.
3. **Decisión abierta** — la norma calla, es ambigua, o no hay decisión que explique el cambio. **Pregunta a Jesús.**

En caso de duda entre 2 y 3, es 3: reescribir una regla para que coincida con el código, sin una decisión que lo
respalde, es convertir un bug en norma. El agente registra lo pendiente en `Docs/trabajo/decisiones-abiertas.md`
(fecha, fase que bloquea, contexto, alternativas, recomendación y quién lo detectó) y sigue con el trabajo
independiente. Jesús revisa esa cola cada semana.

Antes de preguntar, el agente busca la aprobación en el canon y en el encargo vigente. Si no la encuentra, presenta la
discrepancia, las alternativas y su recomendación. La falta de una instrucción sobre un detalle técnico no es, por sí
sola, una decisión abierta de negocio.

## 5. Ciclo de vida

```
trabajo/<tema>/ ──(propuesta + revisión)──▶ Jesús aprueba ──┬─▶ decisiones/NNNN + canon      (regla duradera)
                                                            └─▶ planes/<tema>/               (plan o spec a ejecutar)
planes/<tema>/ ──(se cierra)──▶ lo que cambió el comportamiento → canon · el plan se borra (queda en git)
```

- **Ningún agente cambia una regla del canon por iniciativa propia.** Erratas, enlaces y correcciones del caso 2 (§4),
  sí.
- **Un PR que cambia comportamiento declara su impacto documental**: «canon: archivos …» o «ninguno, porque …». Si
  contradice el canon, lo actualiza en el mismo PR. La plantilla de PR trae la línea `Impacto documental:` y la CI
  falla si queda vacía.
- **Una revisión periódica de deriva** (canon vs código y base) complementa lo anterior.
- `trabajo/<tema>/` se borra al cerrarse su tema (§2.3). Uno sin actividad en 30 días se revisa: se cierra o se
  justifica. Los lista `scripts/check-trabajo-age.sh` cada semana; `decisiones-abiertas.md` está exento.

### 5.1 ADR

Solo para decisiones duraderas, con alternativas relevantes o que cambian el negocio. Los ajustes dentro de una
decisión aprobada actualizan el canon directamente.

`decisiones/NNNN-titulo-corto.md`:

```
# NNNN. Título en una frase
Estado: Vigente | Superada por NNNN · Fecha · Aprobada por Jesús (medio)
## Contexto · ## Decisión · ## Alternativas · ## Consecuencias · ## Verificación (test o consulta, si existe)
Discusión: archive/<tema>:Docs/trabajo/<tema>/  (o la ruta, mientras siga abierta)
```

**Numeración:** §1–§32 de `DECISIONS.md` se conservan como identificadores de compatibilidad (`0001`…`0032`); un §
antiguo puede repartirse en varios destinos. **§33 queda vetado** (tiene citas fantasma). Los ADR nuevos empiezan en
**0034** y no se reutilizan números.

**`DECISIONS.md` queda en la raíz como índice de compatibilidad**: cada §N con su destino («→ `decisiones/0008-…`»,
«→ `negocio/dinero.md`», «superada», «nunca se hizo») y el commit donde está su texto original. Así las 73 citas
del código siguen resolviendo y se corrigen cuando se toca ese código.

## 6. Instrucciones para agentes

### 6.1 Cómo carga cada herramienta (comprobado)

| Herramienta | Qué carga | Comprobado |
|---|---|---|
| **Codex CLI 0.162** | Los `AGENTS.md` desde la raíz del repo hasta el directorio de lanzamiento. Lanzado con `-C <repo>`: **solo el raíz**. Lanzado en `apps/negocios`: raíz + local. En ninguno de los dos lanzamientos cargó `.agents/AGENTS.md` | Prueba en repo de juguete (evidencia en `archive/estandar-docs:Docs/trabajo/estandar-docs/evidencia/`) |
| **Claude Code 2.1.296** | `CLAUDE.md`, no `AGENTS.md`; `CLAUDE.md` con `@AGENTS.md` importa el contenido. Los `CLAUDE.md` anidados se cargan al leer o editar en su carpeta. **Lanzado desde una subcarpeta, los imports de fuera de ella son externos**: piden aprobación, y con `-p` se ignoran en silencio | Prueba en el worktree real: misma evidencia; **con tokens el 2026-10-12** (§6.1.1): confirmado |
| **Antigravity CLI** (`agy` 1.3.3) | `AGENTS.md` y `GEMINI.md` de la raíz, **y también `.agents/AGENTS.md`** (`.agents/` es su convención); los locales hasta el directorio de lanzamiento. Gemini CLI quedó descartado: Google rechaza su login individual y remite a Antigravity (2026-10-10) | Prueba en el mismo repo de juguete, según la respuesta del modelo; **con tokens el 2026-10-12** (§6.1.1): confirmado lo que carga del repo, pero `.agents/AGENTS.md` y `GEMINI.md` no existen hoy y no se probaron |

**Consecuencia medida:** las 259 líneas de `.agents/AGENTS.md` solo las veía Antigravity; ni Claude ni Codex. Cada
herramienta trabajaba con reglas distintas.

### 6.1.1 Cómo se comprueba

- **Con tokens, no con lo que el modelo dice haber cargado.** `scripts/canary.sh` añade, en un worktree temporal, un
  token aleatorio a cada archivo de instrucciones; cada herramienta se lanza como se usa de verdad y se le pide que
  copie los tokens que tiene cargados. Un token aleatorio no se adivina. Procedimiento:
  `operacion/verificar-carga-de-instrucciones.md`.
- **Se repite en cada actualización** de Codex, Claude Code o Antigravity, y la tabla de §6.1 anota la versión probada.
- **Claude Code se lanza desde la raíz del repo o del worktree**: desde una subcarpeta, los imports de fuera son
  externos y, con `-p`, se ignoran en silencio. La prueba con tokens incluye un lanzamiento desde `apps/negocios`.

**Prueba con tokens, 2026-10-12** (`scripts/canary.sh`, sobre `develop@591ec569`; el repo tiene `AGENTS.md` y `CLAUDE.md`
en la raíz y en `apps/negocios`, `e2e` y `supabase`; no hay `GEMINI.md` ni `.agents/AGENTS.md`). Encargo literal:
«Sin leer archivos ni ejecutar comandos: copia literalmente todas las líneas que empiezan por "Token de carga:"…».

| Herramienta y lanzamiento | Archivos cuyo token devolvió | Resultado |
|---|---|---|
| **Claude Code 2.1.296** (`claude -p --model haiku`, sin `Read`, `Bash`, `Grep`, `Glob`, `Edit` ni `Write`), desde la raíz | `AGENTS.md`, `CLAUDE.md` | Coincide con la tabla |
| **Claude Code 2.1.296**, desde `apps/negocios` | `CLAUDE.md` raíz, `apps/negocios/AGENTS.md`, `apps/negocios/CLAUDE.md`; **no** el `AGENTS.md` raíz | Confirma que el `@AGENTS.md` raíz no se importa desde una subcarpeta (el `CLAUDE.md` raíz sí llega, el contenido que importa no) |
| **Antigravity 1.3.3** (`agy -p --model gemini-3.8-flash-high --mode plan`), desde la raíz | `AGENTS.md` | No carga `CLAUDE.md` |
| **Antigravity 1.3.3**, desde `apps/negocios` | `AGENTS.md` raíz, `apps/negocios/AGENTS.md` | Raíz y local; no `CLAUDE.md` |
| **Codex CLI 0.162** | — | **Pendiente**: no se lanzó para reservar su cuota. Se repite en la próxima actualización de Codex o cuando haya cuota |

Ningún `AGENTS.md` o `CLAUDE.md` de `e2e/` ni de `supabase/` se cargó al lanzar desde la raíz o desde `apps/negocios`,
como se esperaba: son de otras carpetas. Validez: Claude Code corrió con las herramientas de lectura y ejecución
prohibidas; `agy -p` no permite prohibirlas, así que su resultado no excluye que haya leído un archivo con su herramienta; no se
inspeccionó su registro de sesión.

### 6.2 Un archivo canónico y un mapa

- **`AGENTS.md` raíz es la entrada común**, y la leen las tres herramientas. `CLAUDE.md` = `@AGENTS.md` + lo exclusivo
  de Claude. No hay `GEMINI.md` ni `.agents/AGENTS.md` con reglas propias. Sin copias de texto.
- **El `AGENTS.md` raíz incluye un mapa de instrucciones locales** («antes de editar en `apps/negocios/` o
  `packages/ui/`, lee `apps/negocios/AGENTS.md`»; «antes de editar en `apps/customer-ios/`, lee
  `apps/customer-ios/AGENTS.md`»). El mapa es obligatorio porque Codex, lanzado desde la raíz, no carga los locales.
- `.agents/AGENTS.md` desaparece: su contenido se reparte entre `AGENTS.md`, el canon y los mecanismos (§6.4).

Entra en `AGENTS.md` solo lo que, si se borra, haría equivocarse a un agente:

1. Qué es Tindivo, en cinco líneas.
2. Las tres zonas, qué manda, y que la historia está en git.
3. El mapa de instrucciones locales.
4. Los invariantes, en una o dos líneas cada uno, con enlace a su fuente normativa o test.
5. Cómo se trabaja (§7) y los comandos esenciales.

**Aviso** (no bloqueo) por encima de 120 líneas: lo que no cabe va al canon y se enlaza.

### 6.3 Runbooks y skills

El runbook en `operacion/` es la fuente: lo usan Jesús y todos los agentes. Una skill (`.claude/skills/`) puede
envolverlo para Claude, sin redefinir los pasos.

### 6.4 Mecanismo antes que instrucción

Cada regla de los archivos de agentes se clasifica:

- **Se puede forzar** (permiso denegado, hook, lint, test, CI): se fuerza **en cada herramienta que pueda violarla**, y
  el texto queda en una línea. `.claude/settings.json` protege solo a Claude Code; el perfil `revisor` de Codex es de
  solo lectura. Antigravity, mientras no tenga un perfil de permisos comprobado y documentado en `operacion/`, corre en
  `--mode plan`, escribe solo en su carpeta temporal y en `Docs/trabajo/`, y no ejecuta comandos con efectos
  (migraciones, deploy, `git push`).
- **Requiere juicio** (causa raíz, evidencia antes de afirmar): se escribe.

### 6.5 Graphify antes que búsquedas masivas

Condición de Jesús al aprobar: **ahorrar tokens con graphify**, usado a su máximo potencial.

- **Antes de una búsqueda amplia** (más de un puñado de archivos, o «¿dónde/cómo se conecta X?»), el agente consulta
  el grafo: `graphify query "<pregunta>" --budget N`, `graphify explain "<símbolo>"`, `graphify path "<A>" "<B>"`.
  Lee archivos solo después, y solo los que el grafo señala.
- **El grafo indexa solo lo que manda**: código, canon y planes. `Docs/trabajo/` va en `.graphifyignore`. Motivo
  medido: una consulta sobre el modelo de dinero devolvía brainstorms y specs viejos con el mismo peso que el código.
- **`Docs/trabajo/` tampoco aparece en las búsquedas amplias**: va en `.rgignore` (Claude Code busca con ripgrep, que
  respeta ese archivo); para buscar dentro de un tema, `rg --no-ignore`. En Codex y Antigravity, comprobar si lo
  respetan.
- **El grafo se mantiene fresco**: `graphify update .` (AST, sin coste) tras cada commit, con el hook versionado
  `.githooks/post-commit` (`git config core.hooksPath .githooks`, una vez por clon); la reextracción semántica de
  documentos (DeepSeek, céntimos), tras cada PR que cambie el canon.
- Graphify reduce lectura; **no es evidencia**. Lo que el grafo sugiere se confirma en el archivo antes de afirmarlo.

### 6.6 La memoria de un agente no es documentación

La memoria local de un agente no la ve nadie más. Es para lo personal y lo pasajero. Las reglas encontradas en
memoria se contrastan con evidencia y con aprobaciones existentes: si están aprobadas, se incorporan al canon; si
falta aprobación, pasan a propuesta en `trabajo/`. Después, la nota se borra o queda como puntero.

## 7. Cómo se trabaja

### 7.1 Roles

Los roles son funciones; abajo, quién la cumple por defecto. **Nadie revisa su propio trabajo.** Mientras todos los
agentes firmen con la misma identidad de GitHub, esta regla es instrucción, no mecanismo (DA-10 en
`trabajo/decisiones-abiertas.md`).

| Función | Por defecto | Puede | No puede |
|---|---|---|---|
| **Decide** | Jesús | Aprobar promociones y planes; resolver decisiones abiertas | — |
| **Dirige la operación** | Claude | Planificar; repartir encargos; escribir en `trabajo/`; escribir canon y planes tras aprobación; auditar a Antigravity; elegir modelo por tarea (§7.6) | Promover sin aprobación |
| **Revisor crítico** | Codex (`revisor`, solo lectura) | Atacar decisiones importantes (§7.4); firmar, firmar con cambios o no firmar | Escribir; dar por buena una cifra que no vio en crudo |
| **Ejecutor rápido** | Antigravity (modelos Gemini) | Volumen: inventarios, clasificaciones, búsquedas, borradores mecánicos | Escribir en canon o planes; decidir; que su salida se use sin auditoría |

El presupuesto manda en el reparto: **Codex es el recurso escaso** (su cuota se agota rápido), Antigravity y Claude
tienen holgura. Codex no revisa lo rutinario.

### 7.2 Encargo a Antigravity

1. **Objetivo** en una frase.
2. **Entradas exactas** (rutas, comandos) y **qué no tocar**.
3. **Formato de salida cerrado** (tabla con columnas fijas o JSON con esquema).
4. **Criterio de aceptación verificable** («cada fila cita la ruta de donde sale»).
5. **Ante la duda**: marcarla, no inventar.

### 7.3 Auditoría de lo que entrega Antigravity

Según **para qué se usa**, no dónde se guarda:

- **Si decide algo** (qué se mueve, qué se borra, qué se promueve): verificación completa.
- **Si es un inventario**: comprobar **cobertura** contra la lista de entradas (el muestreo no detecta omisiones),
  además del contenido.
- **Si es una clasificación de muchas filas**: dos pasadas independientes (Antigravity y un subagente Haiku, sin ver
  la otra); se revisan todos los desacuerdos y una muestra de 1 de cada 10 acuerdos; un error de fondo en la muestra
  obliga a revisar entero.
- **Si es informativo y de bajo impacto**: muestra de al menos 1 de cada 5 filas y todas las marcadas como dudosas; un
  error de fondo obliga a revisar entero.
- La auditoría queda escrita en `trabajo/<tema>/`: qué se revisó y qué se corrigió.

### 7.4 Debate Claude ↔ Codex

**Cuándo entra Codex:** lo irreversible (migraciones que borran o transforman datos, borrados, cambios de permisos),
el dinero (cargos, precios, pagos, promociones con efecto en el cobro) y la seguridad (autenticación, RLS,
`SECURITY DEFINER`, secretos, datos personales). Las fronteras arquitectónicas y las reglas de negocio sin esos riesgos
las revisa un subagente de Claude en contexto limpio y las aprueba Jesús. Lo rutinario lo verifica Claude cuando no lo
escribió Claude; si lo escribió Claude, lo verifica un subagente en contexto limpio o la CI. Una tarea mecánica o un
refactor acotado no queda exento si tiene uno de esos impactos.

Para ahorrar su cuota: encargo cerrado (qué atacar y qué no). En rondas posteriores, solo los puntos pendientes y los
cambios, con el contexto mínimo necesario. La revisión identifica commit base y diff; si incluye archivos sin
commitear, se conserva una copia o un hash de su contenido.

- Cada ronda es un archivo en `trabajo/<tema>/debate/NN-<autor>.md`; las aperturas se escriben sin leer la otra.
- **Toda revisión declara el commit que leyó.**
- Codex cierra con veredicto: **firmo**, **firmo con cambios** (lista numerada) o **no firmo** (motivos).
- Los cambios aceptados se aplican; los rechazados se anotan con su motivo. El resultado va a Jesús.

### 7.5 Sesiones en paralelo

**Dos sesiones no trabajan en el mismo árbol.** Cada una usa su worktree (`git worktree add`). Motivo medido: durante
la primera revisión de este estándar, otra sesión cambió de rama y Codex leyó un commit que nadie eligió.

### 7.6 Modelos por tarea

La complejidad de la tarea elige el modelo, no la costumbre. Claude elige y lo declara en el encargo.

| Tarea | Quién y con qué |
|---|---|
| Localizar código o relaciones | Graphify primero (§6.5), sin coste de modelo |
| Lectura masiva, búsquedas, inventarios, conteos | Antigravity, **siempre en su modelo más avanzado** (decisión de Jesús, 2026-10-10); o un subagente de Claude en Haiku |
| Redacción, refactor acotado, tarea con criterio mecánico | Subagente de Claude en Sonnet |
| Diseño, decisiones de negocio, integración, auditoría | Claude en su modelo principal |
| Atacar una decisión importante (§7.4) | Codex con razonamiento alto |
| Compilar o probar la app iOS | Solo en macOS: la Mac de Jesús o CI con runner macOS. Un agente en Linux o en la nube no toca Swift |

Mecanismos:

- **Claude**: el modelo de la sesión principal lo elige Jesús (`/model`); Claude no puede bajarse a sí mismo. Lo que
  sí hace es **delegar en subagentes** con modelo fijo, definidos en `.claude/agents/*.md`. El encargo aporta
  entradas, restricciones y salida esperada, sin depender de que el subagente herede toda la conversación.
- **Codex**: `codex exec -p revisor -m <modelo> -c model_reasoning_effort=<low|medium|high>`. Los modelos que admite la
  cuenta de Jesús se anotan en `operacion/` al comprobarlos.
- **Antigravity**: `agy -p "<encargo>" --model <id> --mode plan` (sin `--dangerously-skip-permissions`). Siempre el
  Gemini más avanzado: **`gemini-3.8-flash-high`**. Jesús fijó el 2026-10-10 usar solo Gemini 3.8 Flash (Antigravity
  marca los demás como «Leaving Soon»). En la muestra del inventario (25 archivos) acertó la zona en 22 y citó literal
  las 25 (88 %; con 25 casos, el intervalo de confianza al 95 % va de ~70 % a ~96 %: no justifica auditar menos). Se
  revisa con `agy models` cuando salga uno nuevo.
- **Sin orquestador adicional por ahora**: no hay una necesidad demostrada. Se reevalúa si la coordinación manual
  limita el trabajo.

## 8. Mecanismos que lo sostienen

Corren en CI y bloquean el merge, salvo los avisos. Los puntos 1 a 5 están en el job `docs` de
`.github/workflows/ci.yml`; el 6 y el 7, en `.github/workflows/docs-guard.yml` (el 6 lee el cuerpo del PR y el 7 corre
por calendario, y ninguno de los dos encaja en el disparador de `ci.yml`):

1. **Enlaces y rutas** (`pnpm check:docs`): todo enlace del canon y de `planes/`, y toda ruta mencionada en `AGENTS.md`/`CLAUDE.md`,
   existe. Las rutas históricas, de ejemplo o futuras se marcan como tales y quedan fuera.
2. **Cabecera de verificación** (§3.5; `pnpm check:docs`) en cada archivo del canon; **cabecera de plan** (§2.2) en cada plan.
3. **Ninguna regla del canon tiene como fuente un archivo de `trabajo/`** (`pnpm check:docs`). Excepciones registradas.
4. **Aviso** si `AGENTS.md` pasa de 120 líneas (`pnpm check:docs`).
5. **Referencias a git**: todo `<ref>:<ruta>` citado en el canon, en `planes/` o en los archivos de agentes resuelve en
   un clon limpio, y su ref es una etiqueta `archive/*` o un ancestro de `develop` (`scripts/check-archive-refs.sh`).
6. **Impacto documental**: el PR trae la línea `Impacto documental:` completa (§5).
7. **Aviso semanal**: temas de `trabajo/` sin actividad en 30 días (`scripts/check-trabajo-age.sh`).
8. **Carga de instrucciones**: la prueba con tokens (§6.1.1) se repite tras cada actualización de una herramienta; es
   manual y queda registrada en §6.1.

Los puntos 1 a 4 son las cuatro reglas de `scripts/check-docs.mjs` (`pnpm check:docs`, paso «Documentación que
manda» del CI). Los scripts de shell se revisan con `shellcheck`, y los workflows con `actionlint`, en el mismo job.
