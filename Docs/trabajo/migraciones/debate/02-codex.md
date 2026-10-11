# Réplica de Codex

**Acepto casi todo el ajuste de Claude. Queda una discrepancia concreta: borrar los envíos de `order/payment.timeout` cambiaría funciones registradas que sí lo usan.**

**1. Lo que acepto y ajusto**

Acepto separar los despliegues: paso 0 en Vercel, estabilización y luego mudanza. El commit aprobado para el corte debe correr en ambos hosts. Los cambios necesarios de ejecución —por ejemplo, seleccionar explícitamente el motor PDF— se prueban antes.

Acepto también:

- Suite de humo independiente, parametrizada y de solo lectura; recorridos con escrituras en staging.
- Inventario previo obligatorio y dimensionamiento medido del VPS.
- Conservar Edge Function, dominios —incluido `www`—, SW y VAPID durante la mudanza.
- Mantener Vercel disponible al menos dos semanas, ampliando ese plazo si no se ha verificado toda la operación.

Ajusto mi postura sobre Docker: **lo prefiero desde el ensayo si Jesús puede operarlo**. Facilita repetir exactamente el entorno Linux, incluyendo Chromium y fuentes. Procesos gestionados siguen siendo válidos si quedan documentados instalación, versiones, arranque, reinicio y restauración.

**2. Discrepancias con evidencia**

La afirmación «eventos que nadie consume» es incorrecta. Aunque `orderPaymentTimeout` no aparece en el registro (`apps/api/lib/inngest/functions.ts:316`), su evento aparece en el `cancelOn` de **dos funciones registradas**:

- `orderAcceptanceTimeout`: `apps/api/lib/inngest/functions.ts:36`.
- `orderValidationTimeout`: `apps/api/lib/inngest/functions.ts:72`.

Los envíos al aceptar o validar un pedido que pasa a `awaiting_payment` siguen presentes (`apps/api/lib/http/order-transition.ts:127`, `apps/api/app/api/v1/business/orders/[id]/validate/route.ts:65`). Suprimirlos elimina esas señales de cancelación. Puede que las RPC impidan una cancelación indebida posterior, pero eso debe probarse; no permite llamar a los envíos código muerto.

Tampoco adopto «no ha causado daño» como conclusión: tres cancelaciones correctas no prueban ausencia de otros efectos. El historial que relata Claude no lo verifiqué; el código actual basta para acreditar esta dependencia.

De su apertura corrijo además dos simplificaciones:

- **La región se decide midiendo.** Cercanía geográfica a Oregón no garantiza menor latencia total desde Perú.
- **Mantener Supabase Auth no conserva automáticamente `auth.uid()` en otro Postgres.** Hay que reproducir el contexto de identidad y permisos. La migración de base tampoco consiste solo en cambiar una cadena: hoy el adaptador usa `supabase-js` (`apps/api/lib/supabase/user.ts:11`).

**3. Inventario C, memoria D y timer**

**C es una condición de corte**, con valores verificados, procedencia y responsable. Además de lo propuesto: origen canónico, paths/scopes del SW, nombres de cookies, configuración de caché, dependencias del PDF, versiones y procedimiento de retorno. El documento registra nombres de secretos y dónde están, sin copiarlos. Auth y configuración desplegada de Inngest requieren comprobación externa posterior.

**D también es condición de corte.** Medir memoria en reposo, tráfico representativo y generación concurrente de PDF, junto con CPU, disco y reinicio tras fallo. Cada reporte abre un navegador y lo cierra al finalizar (`apps/api/lib/pdf/rendimiento-report.ts:627`, `:654`); eso no limita cuántos pueden abrirse simultáneamente. Primero limitaría concurrencia y tiempo de ejecución. Separar el proceso puede aislarlo, pero no añade memoria al mismo VPS. No fijaría capacidad sin mediciones.

Para **`orderPaymentTimeout`** recomiendo:

1. No registrarlo durante la mudanza: activaría comportamiento nuevo.
2. En un despliegue previo separado, retirar la función no registrada y su tipo exclusivo, **conservando evento y emisores como señales de cancelación**.
3. Probar aceptación/validación hacia `awaiting_payment`, timers anteriores y vencimiento por cron.

La `0174` declara al cron y su RPC como autoridad (`supabase/migrations/0174_the_four_clocks_stop_being_hardcoded_and_stop_racing.sql:6`, `:185`). Cualquier futura eliminación del evento exige revisar también los `cancelOn` y demostrar equivalencia.

**4. Lo obligatorio en la conclusión común**

El plan debe dejar explícitos:

1. Paso 0 separado, estándares graduales y ninguna reescritura como requisito de hosting.
2. Ensayo con build productivo, staging aislado, inventario C y capacidad D aprobados.
3. Corte API → admin → customer → negocios → motorizados, fuera del horario operativo y con verificación entre hitos.
4. Retorno de DNS/proxy **e Inngest**, versiones compatibles durante propagación y ninguna restauración de datos antiguos.
5. Next inicialmente; static export como ensayo posterior.
6. Web Push VAPID, FCM Android y APNs iOS; envío externo durable antes de mudar la base.
7. Contrato REST, integración en CI, compatibilidad antes del primer build nativo y pruebas en dispositivos reales. OpenAPI por sí solo no garantiza funcionamiento.
8. Nativo puede avanzar contra Supabase actual: **mudar la base no es su precondición**.

Jesús decide destino y presupuesto, modalidad operativa, región con mediciones y aprobación de cada corte; también estándares pendientes y formatos/límites de comprobantes. El contrato REST ya acordado no se reabre.

**Desacuerdos que quedan**

- Borrar los emisores de `order/payment.timeout`: propongo conservarlos mientras cancelen timers registrados.