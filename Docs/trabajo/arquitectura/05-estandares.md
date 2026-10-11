# 05 · Estándares de Tindivo (propuesta v2)

> v2.1, revisada tras dos rondas de Codex ([`revision-codex.md`](revision-codex.md)): no firmó la v1 por convertir
> preferencias en obligaciones, y firmó la v2 con los cambios ya aplicados aquí. **Es una propuesta: nada de esto está
> aprobado** hasta que Jesús lo diga. Entonces el resumen pasa a `CLAUDE.md` y lo verificable, a la CI.

## Cómo funcionan estas reglas

**Tres niveles, para no convertir los estándares en una refactorización:**

| Nivel | Qué significa | A qué código aplica |
|---|---|---|
| **OBLIGATORIA** | Bloquea la aprobación, por la CI o con evidencia en la revisión (no todas son automatizables) | **El comportamiento añadido o modificado**, no el fichero entero: tocar una línea no obliga a sanear todo el archivo. Lo existente que la incumple va a una **lista de excepciones** (`Docs/arquitectura/excepciones.md`) |
| **ALERTA** | La CI avisa y el revisor decide | Todo |
| **GUÍA** | Criterio para la revisión | Todo |

**Excepciones:** se permiten, también nuevas, si van confinadas, justificadas en una línea y revisadas (por ejemplo,
un `as` en un adaptador porque el tipo generado no expresa `null`). Una excepción sin justificación es un
incumplimiento. La lista se revisa para que tienda a encoger, no se congela.

## 1. Desacoplamiento (la prioridad)

| ID | Regla | Nivel | Cómo se verifica |
|---|---|---|---|
| DES-1 | **Los clientes (web y nativos) solo hablan con la API REST** para datos y acciones del negocio. Supabase en un cliente: Auth, Realtime como aviso y **cargas directas a Storage autorizadas por el servidor** (contrato acordado) | OBLIGATORIA para pantallas nuevas | Análisis de imports y llamadas por AST (no por cadenas) en `apps/{customer,negocios,motorizados,admin}` |
| DES-2 | **El SDK de un proveedor** (`@supabase/*`, Twilio, FCM, Inngest…) **solo se importa en `infra/`** de un módulo o en `lib/` de infraestructura | OBLIGATORIA para código nuevo | Lint (`noRestrictedImports` por carpeta) |
| DES-3 | **Las rutas no consultan tablas ni llaman RPC, ni directamente ni a través de un ayudante genérico**: validan, llaman a un caso de uso y responden | OBLIGATORIA para rutas nuevas o modificadas | Grafo de dependencias (AST): la ruta solo importa `http`, `contracts` y el caso de uso; un `grep` de `.from(` no basta |
| DES-4 | **Un módulo solo importa el `index.ts` de otro módulo** | OBLIGATORIA donde existan módulos | `dependency-cruiser` en CI |
| DES-5 | **Una regla de negocio vive en un solo sitio**, elegido por la garantía que necesita (`04` §4). Si un cliente necesita anticiparla, la pide (`quote`, `config`) | GUÍA | Revisión |
| DES-6 | **El contrato es versionado y compatible hacia atrás** (`API-3`) | OBLIGATORIA | Diff de OpenAPI en CI |
| DES-7 | Un módulo no escribe tablas de otro; para leer, prefiere su interfaz | GUÍA hasta que exista el módulo dueño; OBLIGATORIA después | Registro de **propiedad de tablas** (qué módulo es dueño de cada una) + revisión |

## 2. API REST

| ID | Regla | Nivel | Verificación |
|---|---|---|---|
| API-1 | Recursos en plural, en inglés, `kebab-case`; acciones como subrecurso (`/cancel`, `/quote`) | OBLIGATORIA para rutas nuevas | Revisión |
| API-2 | Entrada **y salida** con esquema Zod en `packages/contracts`; OpenAPI generado de ellos | OBLIGATORIA para rutas nuevas | CI (ruta sin documentar = fallo) |
| API-3 | Solo cambios compatibles en `v1`: añadir campos **opcionales** y rutas sí; quitar, renombrar, cambiar tipos, volver obligatorio un campo o **añadir valores a un enum de respuesta** puede romper una app instalada y necesita revisión | OBLIGATORIA | Diff de OpenAPI **más revisión semántica** |
| API-4 | Éxito `{ data }` (listas `{ data, nextCursor }` con límite) o `204` sin cuerpo cuando no hay nada que devolver, documentado; las rutas heredadas se documentan como están | OBLIGATORIA para rutas nuevas | OpenAPI |
| API-5 | Errores RFC 9457 con `code` estable; el texto va en `detail` y no se usa para decidir | OBLIGATORIA para rutas nuevas | Test |
| API-6 | `Idempotency-Key` en los `POST` que crean algo con **efecto durable relevante** (pedidos, pagos, canjes, comprobantes), aislada por usuario y ligada al recurso creado | OBLIGATORIA para esas rutas | Test de integración |
| API-7 | La autorización del recurso se comprueba en el caso de uso o en la RPC; un *claim* orienta, no autoriza; las lecturas privadas también verifican permisos | OBLIGATORIA | Test de acceso ajeno |
| API-8 | Dinero en campos **nuevos**: cadena decimal + moneda (decisión `D-39`); fechas ISO 8601 UTC; enums en inglés | OBLIGATORIA para campos nuevos | Revisión |
| API-9 | Límites de entrada: tamaño de cuerpo **antes de leerlo entero**, longitud de textos, tamaño y tipo de archivos **antes de cargarlos** (en el bucket y en la URL firmada); Zod valida la forma, no basta para el tamaño | OBLIGATORIA para rutas nuevas | Test |

## 3. Código TypeScript

| ID | Regla | Nivel | Verificación |
|---|---|---|---|
| TS-1 | Identificadores en inglés; textos de interfaz en español peruano | OBLIGATORIA para código nuevo | Lint de nombres + revisión |
| TS-2 | Sin `any` ni `@ts-ignore`. Prohibidos los *casts* inseguros (`as unknown as`, `as never`) salvo confinados en adaptadores con una línea de porqué; `as const` y el estrechamiento justificado están permitidos | OBLIGATORIA para código nuevo | Lint |
| TS-3 | Tamaño: fichero > 300 líneas o función > 80, **alerta**; complejidad cognitiva > 15, **alerta** | ALERTA | Script + lint |
| TS-4 | `domain/` sin I/O: puede importar `contracts` y utilidades puras; el reloj y los ids se reciben, no se crean | OBLIGATORIA donde existan módulos | Lint |
| TS-5 | Comentarios: el porqué vigente, corto. **Los que protegen una invariante se quedan**; la crónica (incidentes, fechas, «antes pasaba…») va al commit o al ADR | GUÍA | Revisión |
| TS-6 | Abstracciones: no extraer con menos de 3 usos. **Cambio explícito a la regla de `CLAUDE.md`:** los puertos hacia proveedores externos (DES-2) se aíslan desde el primer uso, aunque haya una sola implementación | GUÍA | Revisión |
| TS-7 | Logs estructurados con `requestId`, módulo y caso de uso; sin datos personales | OBLIGATORIA para código nuevo | Revisión |

## 4. Base de datos

| ID | Regla | Nivel | Verificación |
|---|---|---|---|
| DB-1 | Nombres en inglés y `snake_case`; tablas en plural; `<entidad>_id`; `<evento>_at` (`timestamptz`); `is_`/`has_`; enums en inglés | OBLIGATORIA para objetos nuevos | SQL de catálogo |
| DB-2 | RLS en toda tabla; si es solo de servidor, se declara (`COMMENT ON TABLE … 'server-only'`) | OBLIGATORIA | SQL |
| DB-3 | `SECURITY DEFINER` solo si hace falta, con `SET search_path = ''`, `REVOKE EXECUTE` de `PUBLIC`, `anon` y `authenticated`, y `GRANT` explícito. **Comprobar los permisos efectivos** (`proacl`), no solo el `REVOKE`. Los procesos internos (cron, consumidores) nunca son ejecutables por `anon` | OBLIGATORIA | SQL + advisor |
| DB-4 | Autorización en funciones: las que llama el usuario usan la sesión; las que llama el servidor reciben el actor y **verifican rol y propiedad dentro** | OBLIGATORIA para funciones nuevas | Test |
| DB-5 | Las máquinas de estado se protegen en la base (transiciones permitidas + trigger), empezando por `orders` | OBLIGATORIA para máquinas nuevas | Test SQL |
| DB-6 | Toda función nueva o modificada trae **pruebas** (pgTAP, o una prueba de integración que la ejercite directamente); una función por acción de negocio | OBLIGATORIA para funciones nuevas/modificadas | CI |
| DB-7 | Dinero `numeric(10,2)` (el estándar actual); coordenadas `numeric(10,7)`; nunca `float` para dinero | OBLIGATORIA | SQL |
| DB-8 | `created_at` en toda tabla; `updated_at` con trigger en las que se actualizan; las bitácoras no admiten `UPDATE` y solo se borran por **purga controlada** de retención (OPS-2) | OBLIGATORIA para tablas nuevas | SQL |
| DB-9 | Índices **por consulta real**: FK sin índice y índices sin uso aparecen como alerta y se decide caso a caso | ALERTA | Advisor |
| DB-10 | Varias políticas permisivas en la misma tabla y acción: alerta; se funden cuando el rendimiento lo pida | ALERTA | Advisor |
| DB-11 | `app_settings` guarda parámetros; lo que tiene ciclo de vida, historial o varias instancias (campañas) es una tabla | GUÍA | Revisión |
| DB-12 | Tabla de más de ~40 columnas: revisar si mezcla temas antes de añadir otra columna | ALERTA | SQL |

## 5. Migraciones

| ID | Regla | Nivel |
|---|---|---|
| MIG-1 | Solo por la CLI (`db push`); nunca por el panel ni por MCP | OBLIGATORIA |
| MIG-2 | Idempotentes y con **estrategia de recuperación** escrita: un *rollback* SQL en `supabase/rollbacks/` cuando sirve, y cómo recuperar los datos cuando un *rollback* no los devuelve | OBLIGATORIA |
| MIG-3 | **Expandir y después contraer**: lo viejo se quita en otra migración, cuando ningún cliente (incluidas apps instaladas) lo usa | OBLIGATORIA |
| MIG-4 | `supabase migration list` antes de numerar | OBLIGATORIA |
| MIG-5 | La CI reconstruye la base desde cero y corre la integración | OBLIGATORIA (cuando exista, paso 1) |

## 6. Pruebas

| ID | Regla | Nivel |
|---|---|---|
| TST-1 | `domain/`: unitarias; rutas y RPC: integración contra base aislada; dobles en `application/` solo donde aporten (no en cada caso de uso) | OBLIGATORIA para código nuevo |
| TST-2 | Donde exista riesgo de carrera o de fallo parcial (dinero, estado, cupos), se prueba con concurrencia y con fallo a mitad; no se exige para cambios triviales | OBLIGATORIA donde aplica |
| TST-3 | La integración corre en CI y no se cachea por error | OBLIGATORIA |
| TST-4 | Un *bug* arreglado deja un test que lo reproduce | OBLIGATORIA |

## 7. Cimientos operativos (lo que faltaba en la v1)

| ID | Regla | Nivel |
|---|---|---|
| OPS-1 | **Copias de seguridad y restauración ensayada**: no basta con tenerlas; se restaura en una base aparte al menos una vez por trimestre y se anota cuánto tardó | OBLIGATORIA |
| OPS-2 | **Retención de datos personales**: plazos para GPS, comprobantes, teléfonos y bitácoras, con purga automática (Ley 29733; lo legal lo revisa Jesús) | OBLIGATORIA |
| OPS-3 | **Secretos** en variables de entorno o en un gestor (incluido el Vault de Supabase que ya existe); nunca en el repo ni en texto plano en tablas; rotación documentada | OBLIGATORIA |
| OPS-4 | **Observabilidad**: errores con rastreador, latencia y tasa de errores por ruta, antigüedad del outbox, envíos push fallidos | OBLIGATORIA antes del lanzamiento nativo |
| OPS-5 | **Alertas accionables**: pocas y con qué hacer (por ejemplo, «el outbox tiene eventos de más de 5 minutos») | OBLIGATORIA antes del lanzamiento nativo |
| OPS-6 | **Despliegue con vuelta atrás**: saber cómo volver a la versión anterior de cada app y de una migración. Los despliegues delicados, fuera de 18:00-23:00, salvo un incidente, que se documenta | OBLIGATORIA |
| OPS-7 | **Permisos mínimos**: cada proceso con el rol justo; las credenciales privilegiadas (`service_role`) solo en procesos de servidor autorizados (la API y la función de push hoy), inventariados | OBLIGATORIA |
| OPS-8 | **Presupuesto operativo**: coste mensual por proveedor revisado y con aviso de consumo | GUÍA |

## 8. Decisiones y documentación

| ID | Regla | Nivel |
|---|---|---|
| DOC-1 | `DECISIONS.md` sigue siendo la autoridad y el índice; cada decisión nueva va en un ADR (`Docs/adr/NNNN-titulo.md`: contexto, decisión, alternativas, consecuencias) | OBLIGATORIA |
| DOC-2 | Los documentos de estado llevan fecha y procedencia de cada número; manda la base | GUÍA |

## Lista de revisión (cada cambio)

1. ¿Añade o quita acoplamiento? (DES-1…7)
2. ¿La regla está en un solo sitio, el que da la garantía que necesita?
3. ¿El contrato está en Zod, en OpenAPI y es compatible?
4. ¿La base protege la invariante, o solo el código que hoy la llama?
5. ¿Hay tests del caso feliz, del acceso ajeno y del fallo a mitad?
6. ¿Se puede volver atrás si sale mal?
