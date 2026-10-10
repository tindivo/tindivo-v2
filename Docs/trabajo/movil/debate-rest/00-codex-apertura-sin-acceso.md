> Primera versión, escrita sin acceso al repositorio: en esta máquina la sandbox de Windows de Codex rechazó todos los comandos, incluso de lectura. Se conserva como registro. La apertura válida es [`01-codex.md`](01-codex.md), hecha con el paquete de evidencia cruda.

# Apertura de Codex

Mi postura es **REST para todo acceso al dominio; Supabase directo únicamente para capacidades de infraestructura expresamente acordadas**, como autenticación y, si conviene, suscripciones de Realtime o cargas firmadas a Storage. No expondría tablas ni RPC de negocio como contrato de las nuevas apps.

**Límite de esta apertura:** intenté leer el repositorio, pero la política del entorno rechazó incluso comandos de lectura de `DECISIONS.md`. No pude investigar los archivos solicitados ni obtener referencias `ruta:línea`. No he leído la postura de Claude ni modificado nada. Lo siguiente es una propuesta independiente basada en el contexto proporcionado, no una auditoría del código. No atribuiré al REST actual defectos que no he comprobado.

## 1. La superficie que consumirían las apps

Para Jesús, mantener Swift, Kotlin, la PWA y el backend ya supone cuatro frentes. Si cada cliente conoce tablas, joins, funciones SQL y reglas de RLS, cada cambio de dominio exige coordinar varias implementaciones y versiones instaladas que pueden permanecer meses sin actualizarse.

La API debe ofrecer operaciones y respuestas estables: consultar catálogo, cotizar, crear pedido, cancelar cuando corresponde y consultar seguimiento. Puede seguir ejecutando funciones PL/pgSQL; **preparar el backend para móviles no exige trasladar el dominio de Postgres a TypeScript**.

Mantendría Supabase Auth si el flujo actual sirve para nativo. La API aceptaría su token y validaría identidad, rol y autorización. Realtime podría avisar que cambió un pedido; el cliente recuperaría su estado mediante REST. Así, perder una notificación no pierde información y el evento no obliga a publicar toda la estructura de una tabla.

Storage puede admitir carga directa mediante autorización temporal emitida por el servidor. El servidor debe comprobar propiedad, tipo, tamaño y asociación del archivo al pedido.

Esto es técnicamente mixto, pero con una frontera precisa: **el contrato de negocio pertenece a REST**. La palabra «mixto» del análisis previo no basta para decidir: habría que distinguir infraestructura directa de consultas y escrituras directas al dominio.

## 2. Qué exigiría al REST

El contexto confirma una base favorable: `/api/v1`, contratos Zod compartidos y dominio transaccional en Postgres. Eso no demuestra todavía que el contrato sea suficiente para Swift y Kotlin.

Priorizaría:

- **Contrato y compatibilidad.** Inventariar rutas y documentar solicitudes, respuestas, estados HTTP, nulabilidad, fechas y enums en OpenAPI. Zod compartido ayuda al cliente TypeScript, pero no entrega por sí solo un contrato consumible por nativos. Probaría primero una pequeña generación de modelos antes de imponer SDK completos.
- **Idempotencia.** Crear pedidos debe soportar el caso «el servidor confirmó, pero el celular perdió la respuesta». La clave debe quedar ligada al usuario y al contenido, con persistencia atómica, recuperación del resultado y rechazo si se reutiliza con otro contenido. No basta desactivar el botón.
- **Autorización y errores.** Verificar Bearer tokens, permisos por recurso y uso de RLS. Un código estable de error debe permitir decidir entre renovar sesión, corregir datos, reintentar o mostrar conflicto. El mensaje en español puede cambiar; el código no debería hacerlo.
- **Dinero.** Definir una representación exacta para nuevos contratos: decimal como cadena o unidades menores enteras, con moneda explícita. No cambiaría silenciosamente respuestas existentes ni dejaría que cada plataforma calcule totales con coma flotante.
- **Listados y caché.** Límites máximos, orden determinista y paginación donde el volumen lo requiera. Catálogo público puede tener caché y validación condicional; datos privados necesitan políticas explícitas para evitar filtraciones y estados viejos.
- **Operación.** Rate limiting compartido entre instancias para operaciones sensibles, respuesta `429` utilizable, identificador de solicitud y métricas. Los límites no deberían bloquear indiscriminadamente a clientes que comparten conexión.

No declararía faltantes estas capacidades sin revisar su implementación. Tampoco confundiría REST sólido con prohibir operaciones como «cancelar» o «cotizar»: pueden representar correctamente el dominio.

## 3. Qué encarece portar el customer

Buscar `.from(`, `.rpc(`, `.channel(` y `.storage` debe terminar en un mapa de dependencias, no en una prohibición automática.

Los accesos a tablas y RPC merecen especial atención porque pueden convertir el esquema interno en contrato público. Las suscripciones y cargas pueden mantenerse si sus permisos, recuperación y alcance están definidos.

Movería al servidor cualquier **decisión autoritativa** sobre tarifas, descuentos, cobertura, disponibilidad, stock, modalidades de pago, horarios y transiciones del pedido. El cliente puede anticipar una respuesta para mejorar la experiencia, pero el servidor debe recalcular al confirmar.

Dejaría en cada cliente presentación, carrito provisional, validación orientativa y estado de navegación. Extraer hooks de React no produce código reutilizable en Swift o Kotlin. Lo reutilizable serán contratos, ejemplos y casos de comportamiento.

Además, el inventario debe cubrir **restaurantes, Entregas y Store**. Una auditoría anterior a esos productos sirve como pista, pero no permite declarar preparado el customer actual.

## 4. Primeros pasos

| Orden | Trabajo y criterio de hecho | Riesgo para producción |
|---|---|---|
| 1 | Inventariar rutas, accesos directos y flujos de los tres productos; cada flujo queda asociado a su contrato y autoridad de negocio. | Nulo: lectura. |
| 2 | Publicar el contrato actual con ejemplos y pruebas de compatibilidad; distinguir comportamiento existente de mejoras propuestas. | Bajo: documentación y pruebas. |
| 3 | Cerrar auth, autorización y errores en los flujos críticos; probar sesión vencida y acceso a pedidos ajenos. | Medio: evitar rechazar clientes vigentes. |
| 4 | Certificar o implementar idempotencia de creación; probar concurrencia y pérdida de respuesta sin duplicar pedidos ni eventos. | Medio: cambios transaccionales aditivos. |
| 5 | Cubrir mediante REST los accesos directos necesarios y reglas autoritativas; verificar equivalencia antes de cambiar la PWA. | Medio: despliegue gradual. |
| 6 | Completar dinero, paginación, caché y límites sin alterar contratos vigentes; añadir campos o rutas cuando corresponda. | Bajo a medio. |
| 7 | Ejecutar un recorrido real desde Swift y Kotlin: autenticación, catálogo, pedido, comprobante y recuperación al volver a la app. | Bajo en entorno aislado. |

Negocios Android debe participar desde el inventario: no conviene diseñar una infraestructura móvil exclusivamente para customer y descubrir después incompatibilidades con el producto urgente.

No reescribiría el backend, introduciría otro ORM, retiraría accesos existentes de golpe ni exigiría `/api/v2` para cambios aditivos. Separaría entregables revisables y evitaría cambios delicados durante 18:00–23:00.

## 5. Qué podría fallar en mi propuesta

REST añade una dependencia operativa y puede aumentar latencia si transforma cada pantalla en numerosas solicitudes. Hay que medir y ofrecer respuestas suficientes para cada operación.

También podemos construir una fachada que simplemente publique las tablas: conservaríamos el acoplamiento con más código. O implementar idempotencia incompleta, aceptar cotizaciones vencidas y asumir que Realtime garantiza entrega.

La principal amenaza es sobredimensionar el trabajo para un desarrollador solo. Empezaría por los recorridos que las primeras apps necesitan y por garantías verificables, evitando construir una plataforma móvil genérica.

## 6. Sobre hacer squash de migraciones

**No haría squash ahora para facilitar la lectura de los agentes.** Ese objetivo pide una representación del estado actual; reducir el historial no garantiza obtenerla y agrega riesgo operativo.

No pude inspeccionar `supabase/migrations/`, `rollbacks/`, `config.toml`, CI ni el apartado Supabase de `CLAUDE.md`. Por ello no puedo afirmar qué objetos contienen ni prescribir comandos concretos de reconciliación.

Una línea base debe distinguir **estructura actual, datos necesarios y configuración operativa**. Puede quedar aparentemente completa y perder:

- Filas de configuración o catálogos insertadas por migraciones.
- Trabajos de `cron.schedule`.
- Buckets y políticas de Storage.
- Membresía de tablas en publicaciones de Realtime.
- Triggers sobre `auth.users`.
- Grants, propietarios y permisos de ejecución.

También se pierde trazabilidad entre cambios y rollbacks. Reproducir una base vacía no demuestra que una actualización sobre producción sea segura.

Mi alternativa inmediata sería versionar un **snapshot legible del esquema**, con procedencia y fecha, más un índice por dominio: tablas, funciones, políticas, triggers y dependencias. Añadiría inventarios separados de configuración y datos indispensables, y comprobaría diferencias contra el historial en CI. Los agentes leerían esa referencia y consultarían migraciones puntuales para entender decisiones.

Si después necesitamos una línea base para acelerar instalaciones, la prepararía en una rama, conservando el historial. Compararía una base reconstruida desde las migraciones con otra construida desde la línea base, incluyendo todos los elementos anteriores y pruebas de auth, pedidos y permisos.

La adopción tendría que validar por separado bases nuevas y bases existentes. **No se ejecutaría la línea base sobre producción ni se borraría o reescribiría su historial aplicado por conveniencia.** Cualquier reconciliación de metadatos requeriría ensayo y un procedimiento específico verificado.

Menos archivos puede ser un beneficio posterior. Para Jesús, la prioridad es entender y reproducir la base actual sin poner en riesgo los pedidos reales.