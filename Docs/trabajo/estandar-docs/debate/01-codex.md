## 1. Hechos verificados y corregidos

**El diagnóstico es válido; varias pruebas de §1 necesitan corrección.** Revisé el checkout actual, rama `ci/runner-y-actions`, no la rama `feat/mv2b-respuestas` indicada en la propuesta. No consulté red ni base.

| Afirmación de §1 | Resultado |
|---|---|
| «~250 archivos en Docs» | Encontré **255 archivos con extensión** bajo `Docs/`. Aproximación correcta. |
| «CLAUDE.md y AGENTS.md son idénticos» | **Casi duplicados**, no idénticos: ambos tienen 143 líneas, pero cambian el título y el agente destinatario. Véanse [AGENTS.md:1](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/AGENTS.md:1>) y [CLAUDE.md:1](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/CLAUDE.md:1>). |
| «.agents/AGENTS.md tiene 259 líneas y reglas adicionales» | Correcto. Incluye, por ejemplo, revisión humana financiera y verificaciones de sobrecargas RPC: [.agents/AGENTS.md:79](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/.agents/AGENTS.md:79>) y [:136](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/.agents/AGENTS.md:136>). |
| «/specs no existe» | Correcto. La instrucción y el mapa siguen apuntando allí: [.agents/AGENTS.md:175](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/.agents/AGENTS.md:175>) y [:188](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/.agents/AGENTS.md:188>). |
| «Swift + Kotlin solo consta en memoria» | **Falso.** Está en [customer_app_migration/README.md:1](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/customer_app_migration/README.md:1>) y [00-resumen-ejecutivo.md:4](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/customer_app_migration/00-resumen-ejecutivo.md:4>). La contradicción documental existe, pero no se explica por memoria privada. |
| «~375 archivos citan DECISIONS §N» | **No reproducido.** Véase medición abajo. |
| «DECISIONS pesa 101 KB, mezcla materias y §22 va después de §24» | Correcto: **101.086 bytes**. Cards en [DECISIONS.md:686](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/DECISIONS.md:686>), §22 en [:704](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/DECISIONS.md:704>) y `cn()` en [:1006](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/DECISIONS.md:1006>). |

Medición sobre **archivos versionados legibles como UTF-8**, buscando `DECISIONS` y `§N` en la misma línea:

- **165 archivos** mencionan `DECISIONS`.
- **102 archivos** contienen **267 menciones de secciones**.
- Dentro de `apps/`, `packages/`, `supabase/` y `scripts/`: **41 archivos, 69 menciones**.
- Este conteo incluye autorreferencias y texto de propuestas; no equivale a 267 enlaces vigentes. No expande rangos ni referencias partidas entre líneas.

Distribución de esas 267 menciones:

```text
§1:5   §2:2   §3:11  §4:25  §5:18  §6:3   §7:10  §8:64
§9:1   §10:18 §11:7  §12:6  §13:5  §14:7  §15:7  §16:9
§17:1  §18:6  §19:4  §20:3  §21:5  §22:2  §23:7  §24:2
§25:6  §26:3  §28:5  §29:14 §30:1  §31:7  §33:3
```

Faltan en el diagnóstico tres hechos que cambian la prioridad:

1. **El canon actual contiene instrucciones operativas peligrosamente obsoletas:** proyecto abandonado y migraciones por MCP en [DECISIONS.md:60](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/DECISIONS.md:60>). Las instrucciones raíz exigen otro proyecto y CLI en [AGENTS.md:117](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/AGENTS.md:117>). Esto merece corrección inmediata, antes del squash completo.
2. **Hay autoridad operativa fuera del canon:** el plan diario ordena que toda sesión siga su versión, y la cola registra aprobación de Jesús: [plan-diario.md:6](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/plan-migraciones/plan-diario.md:6>), [cola.md:16](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/plan-migraciones/cola.md:16>).
3. **OpenAPI todavía no es una referencia generada disponible.** No encontré archivos versionados llamados OpenAPI ni un generador en [packages/contracts/package.json:19](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/packages/contracts/package.json:19>); la cola lo presenta como trabajo pendiente: [cola.md:41](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/plan-migraciones/cola.md:41>).

## 2. Problemas, de más a menos grave

### 1. §4 confunde autoridad normativa, evidencia y permisos

Un test puede preservar un bug. Producción puede incumplir una decisión aprobada. Un bloqueo define qué puede ejecutar una herramienta, no la regla del negocio.

Además, `.claude/settings.json` contiene denegaciones reales, pero **no demuestra protección para Codex o Gemini**, ni que los chequeos de GitHub sean obligatorios para fusionar. La propia cola deja pendiente la protección de rama: [cola.md:19](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/plan-migraciones/cola.md:19>).

**Sustituir §4 por:**

> Las decisiones aprobadas definen el comportamiento esperado; el código, los tests y las consultas describen evidencia del comportamiento observado. Los permisos y bloqueos limitan acciones y se documentan por herramienta.  
> Ante una discrepancia, el agente distingue bug, documentación desactualizada y decisión abierta. Puede corregir dentro de un encargo ya aprobado; consulta a Jesús cuando sea necesario elegir una regla nueva o cambiar el alcance. Registra lo pendiente y continúa el trabajo independiente.

Así, «no elige ganador» evita inventar negocio sin paralizar cada corrección.

### 2. Los planes aprobados quedan sin dueño

La propuesta coloca «planes en curso» en trabajo y declara que trabajo «no manda»: [propuesta.md:31](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/trabajo/estandar-docs/propuesta.md:31>) y [:96](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/trabajo/estandar-docs/propuesta.md:96>). Eso desautoriza los encargos que deberían guiar al ejecutor.

**Añadir:**

> Trabajo no establece reglas generales. Un plan o spec explícitamente aprobado sí gobierna su encargo, dentro del canon. Declara estado, aprobación, alcance, commit de referencia y criterios de aceptación. Estados mínimos: borrador, aprobado, en ejecución, cerrado o descartado.

Una feature que se construye mañana conserva allí su contrato aprobado. Su comportamiento pasa al canon vigente al integrarse; si ya existe una decisión estratégica aprobada, el ADR distingue **decisión** de **implantación**.

### 3. §9 mueve antes de asegurar compatibilidad

`git mv` conserva historia, **no repara enlaces ni consumidores externos**. Mover carpetas conserva muchos enlaces internos, pero rompe enlaces entrantes y referencias que atraviesan carpetas.

El caso concreto es la sesión autónoma: toma lotes de `cola.md`, según [plan-diario.md:127](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/plan-migraciones/plan-diario.md:127>). No puedo verificar aquí cómo está configurado ese consumidor externo.

**Cambiar el orden:**

1. Aprobar estándar e inventariar documentos, referencias y consumidores.
2. Corregir contradicciones operativas y publicar el mapa provisional.
3. Preparar y ejecutar comprobación de enlaces.
4. Reescribir y aprobar por área.
5. Mover cada área con referencias actualizadas.
6. Cambiar la ruta del consumidor autónomo en una ventana coordinada y verificar una ejecución.
7. Activar los chequeos como requisitos.

**Mantener `DECISIONS.md` en raíz como índice de compatibilidad**, con cada §N apuntando a su destino. Archivar su contenido histórico completo. Una tabla en otro directorio y conservar números de ADR **no hacen resolver automáticamente** comentarios como el de [state-machine.ts:18](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/packages/core/src/order/state-machine.ts:18>).

### 4. §6 necesita adaptación real por herramienta

Mi conocimiento del comportamiento de Codex CLI es:

- Construye instrucciones al iniciar, desde instrucciones globales y los directorios antecesores hasta el directorio de trabajo.
- Dentro de cada directorio, `AGENTS.override.md` puede sustituir a `AGENTS.md`; existen nombres alternativos configurables y un límite de tamaño.
- Las instrucciones más específicas complementan o prevalecen sobre las generales.
- `-C <repo>` fija ese directorio de trabajo: **no debe asumirse que carga automáticamente todos los AGENTS de sus descendientes**.
- `.agents/AGENTS.md` no entra en esa cadena por estar simplemente dentro del repo.

**No confirmé estos detalles contra documentación oficial ni mediante una prueba de lanzamiento de la versión instalada.** La §6 debe quedar condicionada a una prueba reproducible por herramienta.

Texto propuesto:

> `AGENTS.md` raíz es la entrada común. Incluye un mapa de instrucciones locales que el agente debe leer antes de editar cada ámbito, aunque su herramienta no las cargue automáticamente. Los adaptadores de Claude y Gemini se verifican con sus versiones instaladas.

También hay una fuga concreta: la regla de iconos alcanza `packages/ui`, no solo Negocios: [AGENTS.md:86](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/AGENTS.md:86>). Debe existir un puntero para ese ámbito.

**No convertir `.claude/skills/` en única fuente procedimental.** El runbook debe ser utilizable por Jesús y todos los agentes; las skills pueden envolverlo. La propuesta separa «runbook» de «procedimiento paso a paso» de una forma que genera duplicación.

### 5. La primera regla que se incumplirá será §3.1

«Un hecho, un lugar» choca con ADR, canon e invariantes resumidos en AGENTS. La propia propuesta exige esas tres representaciones: [propuesta.md:51](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/trabajo/estandar-docs/propuesta.md:51>), [:109](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/trabajo/estandar-docs/propuesta.md:109>) y [:149](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/trabajo/estandar-docs/propuesta.md:149>).

**Reemplazar por:**

> Cada regla tiene una fuente normativa identificada. Se permiten resúmenes enlazados; no definiciones independientes. El ADR conserva el motivo y la decisión tomada; el documento temático describe la regla vigente.

Para una persona, exigir ADR y debate formal por cada ajuste también resulta excesivo.

> ADR para decisiones duraderas, alternativas relevantes o cambios de negocio. Correcciones y ajustes dentro de decisiones aprobadas actualizan directamente el canon en el PR autorizado.

### 6. La verificación puede convertirse en sello vacío

Una fecha no prueba el archivo entero. Tampoco siempre habrá acceso a producción. La cabecera propuesta no distingue lo medido de lo inferido: [propuesta.md:70](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/trabajo/estandar-docs/propuesta.md:70>).

**Añadir a la cabecera:** alcance, entorno, commit/migración, enlace a evidencia y pendientes. No exigir producción para afirmaciones comprobables localmente.

La auditoría de Gemini debe depender del **uso**, no de la carpeta. Un inventario que decide qué archivar puede necesitar comprobación completa aunque su salida viva en trabajo. La muestra de «1 de cada 5» tampoco detecta omisiones: [propuesta.md:202](<D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/trabajo/estandar-docs/propuesta.md:202>).

> Verificar exhaustivamente decisiones, movimientos y contenido promovido. Para inventarios, comprobar también cobertura contra la lista de entradas; usar muestreo solo para resultados informativos de bajo impacto.

### 7. Hay prohibiciones demasiado absolutas y mecanismos demasiado tardíos

- Archivo puede conservar contexto para interpretar una decisión; necesita excepciones registradas para enlaces o datos sensibles.
- «Toda ruta existe» necesita distinguir rutas actuales, históricas, ejemplos y destinos que se crearán.
- El objetivo de 120 líneas conviene como advertencia, no como gate que incentive esconder reglas.
- Los chequeos de enlaces deben funcionar **antes del primer movimiento**, no al final.
- §3.2 debe presentar OpenAPI como objetivo pendiente, no como capacidad actual.

## 3. Respuestas a §10

1. **AGENTS anidados:** sí son útiles, pero con `-C <repo>` recomiendo un mapa explícito desde raíz y lectura obligatoria por ámbito. Verificar la carga real antes de apoyarse en automatismos.
2. **Carpeta como estado:** basta para la zona; **no basta para el estado de decisión o ejecución**. ADR con estado explícito; planes/specs con aprobación y avance.
3. **Actualizar canon en el PR:** sí, cuando cambia una regla documentada. Añadir una declaración breve: «impacto documental: archivos… / ninguno, porque…». La revisión periódica de deriva complementa esto.
4. **Numeración:** conservar §1–§32 como identificadores de compatibilidad. Nuevos ADR desde 0033, sin reutilizar números. Permitir que un § antiguo tenga varios destinos; mantener el índice raíz.

## 4. Veredicto

**Firmo con cambios:**

1. Corregir los hechos de §1 y declarar rama y método de medición.
2. Reescribir §4 separando norma, evidencia y permisos; permitir correcciones ya autorizadas.
3. Reconocer planes/specs aprobados como contratos de encargo dentro de trabajo.
4. Incorporar mapa de instrucciones locales, prueba por herramienta y runbooks compartidos.
5. Sustituir «un hecho, un lugar» por «una fuente normativa» y limitar cuándo hace falta ADR.
6. Precisar evidencia, alcance de verificación y auditoría según uso.
7. Inventariar consumidores y comprobar enlaces antes de mover; coordinar la sesión autónoma.
8. Conservar `DECISIONS.md` como índice compatible y corregir primero sus instrucciones operativas obsoletas.

La estructura de tres zonas merece aprobarse. La versión actual todavía puede desautorizar trabajo aprobado y convertir errores de producción en reglas.