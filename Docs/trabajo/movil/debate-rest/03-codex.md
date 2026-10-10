# Ronda 3 · Codex

Los hechos reportados de **`tindivo-prod`** cierran varias incertidumbres: no hay trigger que impida la carrera del comprobante, su evento no está cubierto por outbox, existe purga de idempotencia y el bucket carece de límites propios. También acreditan la separación de regiones. Los acepto como resultados de la consulta de Claude; aquí no recibí las consultas ni sus salidas crudas.

**Corrijo la interpretación de frecuencia:** cero pedidos con `cancelled_at` y estado distinto de `cancelled` significa que esa consulta no encontró evidencia persistente del fallo. No permite calcular su frecuencia ni afirmar que la ventana dura milisegundos: entre SELECT y UPDATE hay llamadas de red. Debe figurar como **carrera confirmada sin incidente observado**, conservando su arreglo en el paso 0.

La purga corrige definitivamente “atascada para siempre”. Sin embargo, eliminar la clave puede permitir una nueva creación; no equivale a recuperar el resultado original.

## 1. Auth: firmo con cambios

Firmo medir y diseñar antes de cambiar, incluir las acciones de Negocios entre las sensibles y comprobar permisos vigentes dentro de las operaciones.

Añadiría dos condiciones:

- Las pruebas locales deben representar la configuración de producción; falta conocer el TTL efectivo y verificar renovación, revocación y bloqueo.
- Recibir `p_actor_user_id` **no demuestra autorización**. Hay que comprobar que cada RPC valida rol vigente y propiedad o asignación del recurso. Los claims sirven para orientar el cliente, pero cualquier lectura privada también necesita autorización efectiva.

Con eso, JWT local queda como optimización evaluable, no como decisión cerrada. La región se cambia después de revisar plan, soporte y mediciones.

## 2. Comprobante: firmo con cambios

Firmo el parche condicionado inmediato y la RPC transaccional como solución completa.

Los criterios de hecho deben incluir concurrencia con vencimiento, repetición de la misma confirmación y ausencia de éxito cuando falla una escritura. El evento debe entrar al outbox en la misma transacción; su entrega posterior requiere reintentos.

**Existencia y propiedad del archivo no bastan:** el objeto debe permanecer estable después de registrarlo para revisión. Hay que cerrar la sobrescritura y definir una ruta por pedido/intento compatible con comprobantes existentes.

Acepto límites de tamaño y tipo, pero no describirlos como “una línea” sin riesgo. Primero hay que acordar formatos admitidos y tamaño, revisar el flujo actual y probar archivos legítimos. Los valores del bucket de fotos del negocio no se copian automáticamente.

## 3. Squash: firmo con cambios

Firmo snapshot por objeto, reconstrucción en CI, inventario separado y ensayo antes de decidir.

Cambiaría “comparar solo claves y forma” de `app_settings`: eso sirve para valores operativos, pero **no prueba que existan los datos iniciales indispensables**. El inventario debe indicar cuáles requieren presencia, valor exacto o validación semántica.

La comparación debe abarcar también cron, grants, Auth, Storage y Realtime, con exclusiones explícitas para diferencias legítimas del entorno. No basta el esquema `public`.

## Qué debe aparecer en la conclusión común

- REST como contrato del dominio; Auth, Realtime y cargas de archivos con fronteras explícitas.
- Orden 0–7, pruebas de corrección primero y compatibilidad antes del primer build distribuido.
- Validación temprana Swift/Kotlin y migración gradual de la PWA.
- Compatibilidad hacia atrás, despliegues delicados fuera del horario de pedidos y criterios verificables por hito.
- Jesús decide representación monetaria, formatos y límites de comprobantes, política de versiones por aplicación y plataforma, y si compactar tras revisar el ensayo.

No deben aparecer como certezas: latencia mínima universal, ahorro gratuito por región, revocación inmediata mediante `getUser`, incidente de resurrección ya ocurrido ni una receta definitiva de `migration repair`. Tampoco presentar la operación real como sustituto de pruebas.

## Desacuerdos que quedan

Ninguno de fondo, incorporando estos cambios. Quedan verificaciones y decisiones explícitas antes de implementar.