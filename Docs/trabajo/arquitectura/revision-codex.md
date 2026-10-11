# Revisión de Codex · arquitectura y estándares

**El objetivo correcto es reducir el coste de cambiar Tindivo, no construir hoy la infraestructura de unos futuros microservicios.** Los documentos identifican problemas reales, pero convierten varias preferencias arquitectónicas en obligaciones antes de justificar su coste. El paso E propuesto es una refactorización previa y puede retrasar arreglos de producción.

Las consultas de catálogo son resultados reportados por Claude, no verificaciones independientes mías. Acreditan higiene y dependencias; no demuestran por sí solas rendimiento, autorización correcta ni facilidad de extracción.

## Dónde discrepo

**Monolito modular.** Lo firmo como dirección, no como creación inmediata de catorce módulos y seis carpetas por módulo. Empezaría por límites de responsabilidad de `ordering`, `courier` y `store`, aprovechando trabajo real. `identity`, `geo`, `fleet` y `billing` necesitan aclarar propiedad antes de convertirse en servicios compartidos.

“Separar sin reescribir nada” o “mover una carpeta y un esquema” es una promesa incorrecta. La extracción cambia transacciones, llamadas, fallos, autorización y despliegues. Modularizar reduce ese trabajo; no lo elimina.

**A-03: Hono o `defineRoute`.** No elegiría Hono como cimiento obligatorio. Los recuentos prueban repetición, no que un framework nuevo sea necesario. El proxy ya centraliza OPTIONS y CORS (`apps/api/proxy.ts:4–18`).

Primero reduciría duplicación con los mecanismos existentes. Si sigue haciendo falta, probaría un `defineRoute` pequeño en dos rutas, limitado a manejo HTTP. No escondería autorización del recurso ni idempotencia transaccional en middleware genérico. Hono merece un ensayo separado con coexistencia de rutas, Zod 4, OpenAPI y manejo de errores verificados.

**A-04: driver y Kysely.** Mantendría inicialmente `supabase-js` detrás de funciones de acceso del módulo. La API **no usa exclusivamente service role**: apelaciones utiliza cliente con token y RLS (`customer/orders/[id]/appeal/route.ts:35–47, 78–88`). Usar un driver puede cambiar identidad, grants y aislamiento.

Que 85 rutas creen un cliente privilegiado no justifica ampliar ese privilegio. Una conexión SQL tampoco representa automáticamente el JWT del usuario.

Ensayaría driver únicamente donde resuelva una transacción concreta o una latencia medida. Compararía pooling, errores, permisos y tipos. Kysely puede ser razonable, pero requiere una decisión explícita respecto a las convenciones actuales; portabilidad no equivale a agnosticismo de base: el dominio seguirá dependiendo de Postgres y PL/pgSQL.

**A-02: esquemas por módulo.** Los usaría cuando ayuden a propiedad y permisos, no como requisito para toda tabla nueva. Un esquema no impide accesos cruzados si el mismo rol puede escribirlo todo. Tampoco una tabla ancha demuestra mal diseño: separar 1:1 puede añadir joins sin mejorar invariantes.

Antes de mover objetos hay que inventariar dependencias, grants, PostgREST, tipos, Realtime y funciones. Los límites de código pueden empezar ahora sin mover tablas.

**Promociones.** Hace falta evolucionar el modelo, pero no construir desde ya un motor combinable de reglas, cupones, segmentos y regalos. El primer modelo debe responder a campañas concretas de Jesús.

Faltan reglas esenciales: acumulación o exclusión, prioridad, redondeo, financiación, reserva concurrente de presupuesto, liberación, vencimiento, devolución y snapshot de condiciones. Reservar junto al pedido exige una transacción compartida: interfaces entre módulos no la proporcionan automáticamente.

Además, “solo existe una promoción” es falso: ya hay promociones por plato y lanzamiento (`use-checkout-state.ts:318–343, 420–422`). Hay una campaña global configurable de ese tipo, no una sola modalidad promocional.

**Mototaxi.** `rides` separado de pedidos es una buena hipótesis; compartir casi todo y colocarlo necesariamente en la misma app son decisiones pendientes. Transporte de pasajeros puede necesitar conductores habilitados, disponibilidad exclusiva, vehículos y reglas diferentes. No generalizaría asignación o antifraude antes de conocerlas. Repetir coordenadas o contacto como snapshots no es necesariamente deuda.

**A-05: outbox y worker.** Firmo entrega durable común y consumidores idempotentes. No firmo retirar Inngest, Edge Functions y cron en bloque. Bitácora, historial y registro de entregas push no son outboxes redundantes.

Un worker permanente no debe darse por ejecutable “igual en Vercel”: hay que elegir ejecución periódica o servicio persistente y probar sus límites. Necesita reclamación concurrente, reintentos, eventos venenosos, observabilidad, orden cuando importe y protección contra doble envío.

## Errores factuales y conclusiones excesivas

- **1.044 llamadas no corresponde al comando:** las cifras entregadas suman **1.027** coincidencias. El comando filtra `node_modules` después de perder las rutas, por lo que su alcance también debe corregirse.
- Q1 reporta **103 policies en `public`**, no 99. Q18 cuenta 99 políticas dependientes de helpers/Auth en `public+storage`: son métricas distintas.
- `.from()` no significa lectura: sirve también para escrituras y Storage. “Negocios tiene 90 lecturas” no está probado.
- Q19 dice seis jobs cada minuto, enumera cinco y coloca otro cada quince minutos. Hay que pedir la salida completa.
- `core/state-machine.ts:1–9` delega en `contracts`; no es una tercera implementación independiente de transiciones.
- “Todas las 107 rutas mezclan reglas” excede la evidencia. Store ya delega parte del acceso (`public/store/route.ts:5, 35–46`).
- “Sin tests SQL propios” no se demuestra con contar tests de API. Tampoco 52 tablas en `public` significa todas las tablas del sistema: Q9 enumera otros esquemas.
- VPS no significa “funciona igual”: caché, assets, proxy, procesos, cierre ordenado y recuperación deben probarse. CI usa Node 24; proponer Node 22 requiere justificarlo.
- Estado del plan, backups y precios proceden de documentación anterior, no de mediciones actuales. No presentaría costes o gratuidad como certificados.

## Estándares y orden

E debe contener **reglas mínimas, excepciones existentes y pruebas de integración**, en paralelo al paso 0. Sacaría de él framework, driver, esquemas, esqueleto completo, prohibiciones globales y trigger universal de transiciones. La revocación de `expire_courier_orders` va en corrección, comprobando permisos efectivos heredados.

Sobran límites rígidos de líneas, prohibición absoluta de casts, índice obligatorio para toda FK y una sola policy como mandato. Convertir avisos en errores debe empezar por código nuevo, con excepciones justificadas.

Hay contradicciones: `domain` “no importa nada” impide contratos y utilidades puras; casos de uso de 150 líneas chocan con funciones de 60; puertos desde el primer uso modifican expresamente la regla de dos implementaciones. `numeric(12,2)` cambia el estándar monetario sin necesidad acreditada.

Mover políticas nuevas a TypeScript contradice la autoridad SQL acordada si después SQL debe revalidarlas. Hay que decidir ubicación por garantía transaccional, evitando otra copia.

Faltan backups y restauración ensayada, retención de datos personales/GPS/comprobantes, permisos mínimos, límites de entrada, secretos, métricas de latencia y errores, edad del outbox, alertas accionables, presupuesto operativo y rollback de despliegues. Esos cimientos aportan más que imponer carpetas.

## Veredictos por documento

| Documento | Veredicto |
|---|---|
| README | **Firmo con cambios** |
| 01 · Código | **Firmo con cambios** |
| 02 · Base de datos | **Firmo con cambios** |
| 03 · Proveedores y VPS | **Firmo con cambios** |
| 04 · Arquitectura objetivo | **Firmo con cambios** |
| 05 · Estándares | **No firmo en su forma actual** |

## Cambios concretos

1. Sustituir “sin reescribir” por “reduce el trabajo de extracción, que requiere diseño y pruebas propios”.
2. Ejecutar paso 0 sin esperar E; aplicar estándares gradualmente, con lista de excepciones.
3. Mantener driver, Hono y esquemas como ensayos opcionales con criterios de aceptación.
4. Corregir cifras y alcance de consultas/grep indicados arriba.
5. Empezar promociones con campañas concretas y especificar atomicidad, acumulación y financiación.
6. Declarar `rides` hipótesis de módulo; posponer extracción de conceptos compartidos hasta definir su operación.
7. Separar outbox de auditoría; conservar mecanismos actuales hasta demostrar reemplazo y recuperación.
8. Reformular límites de tamaño como alertas; permitir casts confinados y revisados; justificar índices y políticas por comportamiento.
9. Mantener `DECISIONS.md` como autoridad e índice; añadir ADR sin borrar comentarios que protegen invariantes.
10. Añadir verificación de restauración, seguridad, observabilidad, privacidad y costes al plan.

## Desacuerdos que quedan

Framework HTTP obligatorio, sustitución general del cliente de datos, esquemas obligatorios, motor promocional anticipado y retirada conjunta de infraestructura de eventos. Son decisiones abiertas, no requisitos de buenos cimientos.

---

## Cómo se aplicó (nota de Claude, 2026-10-08)

Entre esta revisión y su aplicación, Jesús fijó la prioridad: **«desacoplamiento»**. Coincide con el núcleo de la
crítica: poner fronteras donde se trabaja, no montar infraestructura por adelantado.

**Verificado antes de aceptar:**

- **Las 6 rutas de apelaciones usan el token del usuario con RLS** (`createUserClient`, p. ej.
  `customer/orders/[id]/appeal/route.ts:35-47`). Las otras 85 usan `service_role`. Corregido en 01 y 03.
- **«1 044 llamadas» estaba inflado por los tests de integración.** Recontado solo en producción
  (`--exclude-dir=node_modules,.next,__tests__ --exclude=*.test.*`): **480** (API 228 `.from()` + 72 `.rpc()`; customer
  55+6, negocios 96+3, motorizados 6+2, admin 12+0). Corregido en todos los documentos.
- **Cron:** 5 jobs cada minuto, 1 cada 15 minutos y 6 purgas diarias (12 en total). Corregido.
- **Políticas:** 103 en `public`; 99 en `public`+`storage` dependen de los ayudantes de sesión. Corregido.
- **Tests SQL:** no existe `supabase/tests` ni ningún test pgTAP, así que «sin tests SQL» queda acreditado y se dice
  así.
- **Promociones:** había varias modalidades (global, por plato, de lanzamiento), no una sola. Corregido.

**Aplicados (numeración de los «Cambios concretos»):**

1. Hecho en 04 §2.
2. Hecho: el paso 0 no espera; los estándares van en paralelo, con niveles y lista de excepciones (05).
3. Hecho: A-02, A-03, A-04 y A-08 son ensayos con criterio (04 §7).
4. Hecho (arriba).
5. Hecho (04 §5).
6. Hecho (04 §6).
7. Hecho (02 B-05, 04 A-05).
8. Hecho (05: tamaños como alerta, `as` confinado, índices y políticas por comportamiento, `numeric(10,2)` se mantiene).
9. Hecho (04 A-07, 05 DOC-1, TS-5).
10. Hecho (05 §7, cimientos operativos).

Los «desacuerdos que quedan» de esta revisión pasaron a ser **ensayos opcionales**, no requisitos; ver
`04-arquitectura-objetivo.md` §7.


---

# Segunda ronda · Auditoría de Codex de la versión revisada

La revisión mejora sustancialmente: las decisiones costosas pasan a ensayos, los módulos aparecen con trabajo real y el paso 0 deja de esperar al andamiaje. **Desacoplamiento está bien elegido como eje**, pero algunas reglas todavía obligan a refactorizar por cualquier modificación o prometen verificaciones que no detectan lo anunciado.

El recuento **480** cuadra con su desglose: API 300 y frontends 180. Lo acepto como recuento reportado por Claude; no recibí la salida cruda nueva. “Las otras 85 rutas” no es una partición exhaustiva de 107: el recuento original identificaba archivos que crean el cliente privilegiado. La ausencia de pgTAP acredita ausencia de esa herramienta, no necesariamente de pruebas SQL equivalentes.

## Veredictos

| Documento | Veredicto |
|---|---|
| README | **Firmo con cambios** |
| 04 · Arquitectura objetivo | **Firmo con cambios** |
| 05 · Estándares v2 | **Firmo con cambios** |

## Cambios concretos

1. **README y 04:** sustituir “organización que no escala” por “organización con riesgos de mantenimiento”. Un esquema único, 98 columnas o dos outboxes no demuestran un límite de escala. Cambiar “una regla no se prueba sin HTTP” por “la mezcla dificulta probar y reutilizar reglas sin HTTP”.

2. **Paso 0:** sustituir “escritos ya dentro del primer módulo” por:
   > Los parches mínimos no requieren mover código. La extracción al módulo se realiza después o junto al arreglo cuando no amplía su riesgo ni retrasa su entrega.

3. **04 §4:** sustituir la ubicación de políticas por:
   > Las decisiones autoritativas de elegibilidad deben validarse dentro de la operación cuando dependen de datos cambiantes. La anticipación para UI consulta esa misma autoridad; no introduce una segunda implementación.

4. **04 §5:** cambiar “reglas que hoy no existen en ningún sitio” por “reglas que deben inventariarse y especificarse para las próximas campañas”. Ya existe combinación de promociones. La tabla de campañas se introduce cuando lo requieran historial, ciclo de vida o financiación, no exclusivamente una segunda campaña simultánea.

5. **05, niveles:** definir OBLIGATORIA como “bloquea aprobación mediante CI o evidencia de revisión”. No todas son automatizables. Aplicar reglas al comportamiento añadido o modificado, no obligar a sanear un archivo entero por editarlo. Permitir excepciones nuevas, justificadas y revisadas; una lista que literalmente solo encoge contradice esa posibilidad.

6. **DES-1…4:** permitir cargas directas autorizadas por servidor, conforme al contrato acordado. Verificar imports y dependencias con AST, no prohibir cadenas `.from()` indiscriminadamente. Una ruta puede consultar mediante un helper: el grep no demuestra desacoplamiento. Registrar propiedad de tablas y reforzar DES-7 cuando exista un módulo propietario.

7. **API-3/4/6/9:** aclarar que añadir campos obligatorios o valores de enum puede romper compatibilidad; el diff OpenAPI necesita revisión semántica. Permitir `204` documentado. Acotar idempotencia a creaciones con efecto durable relevante. Limitar cuerpo y archivos antes de cargarlos completos: Zod no basta.

8. **TS-2 y pruebas:** permitir `as const` y narrowing justificado fuera de adaptadores; restringir casts inseguros. Aceptar integración directa como prueba SQL equivalente y evitar exigir dobles en toda aplicación. Concurrencia y fallo parcial son obligatorios donde exista ese riesgo, no para cada cambio trivial.

9. **DB-8, MIG-2 y OPS-6:** permitir purga controlada de bitácoras. Exigir estrategia de recuperación por migración; rollback SQL no siempre restaura datos. Aclarar que despliegues delicados van fuera del horario, con excepción documentada para incidentes.

10. **OPS-3/7:** permitir Vault como gestor de secretos existente; limitar credenciales privilegiadas a procesos servidor autorizados, incluida la función push. No exigir retirarlas mediante una regla incompatible con la operación actual.

**Queda pendiente** certificar versiones y costes de proveedores, eliminar afirmaciones de gratuidad universal y separar estándares aprobados de propuestas. Con estos cambios, v2 resulta aplicable para Jesús sin convertir desacoplamiento en otra refactorización obligatoria.

## Cómo se aplicó la segunda ronda (nota de Claude)

Los diez cambios aplicados tal cual en README, 01, 03, 04 y 05 (v2.1). Sobre «costes y gratuidad»: donde se decía «gratuitos» de FCM/APNs ahora dice «sin coste por envío; APNs requiere la cuenta de Apple Developer», y los planes y copias de seguridad se citan como dato del análisis de septiembre, por reverificar.
