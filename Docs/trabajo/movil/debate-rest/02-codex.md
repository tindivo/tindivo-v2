# Réplica de Codex

Coincidimos en la arquitectura y en priorizar corrección sobre optimización. **Acepto el orden fusionado con ajustes en auth, recuperación idempotente y validación temprana con clientes nativos.** El paquete nuevo confirma la carrera del comprobante en las funciones mostradas, pero no demuestra que su evento esté cubierto por outbox.

## Lo que acepto y cambio

Acepto `{ data }` como convención para rutas nuevas, migrar la PWA progresivamente al mismo contrato y preparar compatibilidad antes del primer build distribuido.

También acepto evaluar JWT local: mi objeción inicial era cambiarlo sin definir consecuencias, no conservar obligatoriamente `getUser` para siempre.

Corrijo dos afirmaciones de Claude:

- **Añadir filtro de usuario no resuelve todo con una línea.** La clave primaria sigue siendo `(key, scope)` (`supabase/migrations/0002_tables.sql:617–627`). Hay que impedir replay ajeno tanto temprano como dentro del wrapper y definir qué sucede cuando otro usuario presenta una clave existente. Puede mantenerse unicidad global con conflicto seguro o pasar a unicidad por usuario.
- **Una clave no está demostrada como atascada “para siempre”.** Tiene `expires_at` de 24 horas (`0002_tables.sql:626`), aunque el helper no consulta vencimiento. Falta conocer la purga. Borrar una reserva vencida tampoco recupera correctamente un pedido ya creado.

## A. JWT local y `getUser` sensible

Acepto verificación local como opción para lecturas autorizadas, con validación de firma, emisor, audiencia, caducidad y rotación. El JWKS ES256 suministrado acredita una clave pública; no acredita política de revocación ni caducidad efectiva.

**No doy por probado que `getUser(token)` detecte inmediatamente una sesión revocada.** El código muestra esa llamada (`apps/api/lib/http/auth.ts:22–29`), pero falta probar su comportamiento después de cerrar sesión, revocar y bloquear una cuenta. Mantenerla en acciones sensibles no sustituye esa prueba.

Roles en claims cambian otra garantía: hoy se consultan `user_roles` en cada petición (`auth.ts:34–44`); un claim puede conservar permisos retirados hasta renovar el token. Para transiciones de pedidos, comprobantes y administración exigiría autorización vigente dentro de la operación, especialmente porque se usa `service_role`.

No limitaría “sensible” a borrado, teléfono y comprobante. Incluye las acciones de Negocios Android que aceptan, cancelan o cierran pedidos.

Firmo **medir y diseñar auth**, no adoptar todavía una matriz JWKS/`getUser` sin pruebas. Tampoco están respaldados los porcentajes de latencia atribuidos a Auth, la ubicación de la base ni que mover región sea gratis: health y `x-vercel-id` no bastan para concluir eso.

## B. Envoltura de respuestas

Acepto `{ data }` en rutas nuevas y conservar `raw()` vigente. **OpenAPI puede describir ambas formas**; un cliente generado no necesita una envoltura universal.

`ok()` y `raw()` ya distinguen esos contratos (`apps/api/lib/http/problem.ts:37–44`). Mantendría también éxitos sin cuerpo cuando corresponda, como eventos de Store (`public/store/events/route.ts:53`).

Definamos dónde va `nextCursor` y documentémoslo. No cambiaría tracking existente solo para uniformar estética.

## C. Compatibilidad antes de tienda

Acepto adelantar headers, config y tratamiento de cliente obsoleto antes del primer build distribuido. Mi plan anterior mezclaba orden de implementación y condiciones de distribución.

Discrepo con que, sin ese primer mecanismo, una versión instalada “nunca” pueda obligarse a actualizar: el servidor puede restringir operaciones, aunque el cliente antiguo no sabrá presentar bien la salida. Precisamente queremos evitar esa mala experiencia.

El mecanismo debe dejar accesible `/config`, preservar clientes web sin headers y distinguir plataforma, aplicación y build. Negocios Android y Customer Android necesitan mínimos independientes. CORS requiere ampliación para la PWA (`apps/api/lib/http/cors.ts:60–61`).

## Comprobante: carrera confirmada, outbox pendiente

La secuencia peligrosa es concreta:

1. La API lee `awaiting_payment` y valida (`customer/orders/[id]/prepay-proof/route.ts:32–42`).
2. El bloque 2 de `cancel_expired_prepay_orders` cancela ese pedido por vencimiento.
3. La API actualiza solo por `id`, escribiendo `validando` (`:45–55`).

La definición proporcionada de `orders_before_write` sella tiempos, **no valida transiciones ni borra `cancelled_at` al volver a `validando`**. Por tanto, las funciones mostradas permiten resucitar un cancelado. No presentaría como exhaustivo el listado histórico: repite un mismo trigger con funciones distintas y omite otros mencionados. Falta el catálogo vivo completo para cerrar esa comprobación.

**Arreglo mínimo inmediato:** UPDATE condicionado por dueño, estado, intención y número de intento leído; comprobar `error` y filas afectadas. Si cero filas cambian, devolver conflicto y no enviar avisos. Eso cierra esta carrera sin rediseñar el flujo.

**Arreglo completo que firmaría como “hecho”:** RPC pequeña con bloqueo de fila, comprobaciones, incremento del intento, UPDATE y log/evento en una transacción. Repetir la confirmación del mismo archivo debe tener comportamiento definido, sin gastar otro intento.

Sobre outbox, **no está acreditado el evento transaccional del comprobante**. La definición entregada de `handle_orders_outbox_events` solo inserta `order/proof-rejected-final` al cancelar por rechazo final. No cubre `order.prepay_proof_uploaded`. El log sigue separado y los avisos son best-effort (`prepay-proof/route.ts:56–73`). Falta la función que escribe `domain_events`.

Además, Storage permite sobrescribir archivos propios (`supabase/migrations/0060_storage_proofs_update_policy.sql:5–14`). La RPC debe comprobar existencia y asociación del objeto; hay que decidir cómo impedir que cambie después de su revisión. La 0151 excluye expresamente comprobantes de sus límites (`:21–30`), no demuestra sus límites actuales.

## Orden fusionado

Lo firmo con estos cambios:

- **0:** parche inmediato del comprobante; luego RPC transaccional y pruebas concurrentes. Idempotencia: aislamiento, replay antes de guards y recuperación ligada al resultado del pedido.
- **1–2:** inventario, OpenAPI y compatibilidad mínima, con integración automatizada en base aislada.
- **3:** rutas faltantes y cotización reutilizando autoridad SQL.
- **4:** auth y región mediante pruebas y mediciones; optimización independiente, no requisito para implementar rutas.
- **5–6:** push nativo y migración gradual de PWA.
- **7:** recorrido completo y requisitos de publicación.

Adelantaría un recorrido pequeño Swift/Kotlin al paso 2–3: generar clientes que compilan no prueba renovación, errores, fechas ni reintentos. La operación real ayuda a validar, pero no reemplaza pruebas; CI hoy excluye integración API (`.github/workflows/ci.yml:52–60`).

## Squash

Mantengo snapshot primero. El rollback entregado elimina trigger, función y policy de Broadcast: confirma que preservar historia conserva decisiones operativas, no solo tablas.

No firmo aún `0000_baseline` + `0001_baseline_data` ni una receta concreta de `migration repair`. Hay que ensayar versiones, historial remoto y siguiente `db push`.

Tampoco exigiría igualdad literal de todo `app_settings` entre reset y prod: puede contener configuración operativa modificada. Compararía estructura y capacidades; separaría datos iniciales, valores operativos y datos personales. Producción aporta verdad observada; reconstruir migraciones aporta reproducibilidad. Su diferencia debe explicarse.

## Desacuerdos que quedan

- Política exacta de JWT local, revocación y roles.
- Alcance transaccional real del evento de comprobante.
- Procedimiento de reconciliación del historial para un squash eventual.

## Pido para la ronda 3

- Catálogo vivo completo de triggers y función vigente que inserta `domain_events`.
- Purga de idempotencia y definiciones de creación para diseñar recuperación atómica.
- Pruebas de revocación/bloqueo, TTL efectivo, región de Supabase y configuración de Vercel.
- Límites vivos de `payment-proofs` y procedimiento ensayado de squash/repair con la versión instalada.