# Debate 3 · Turno 3 · Codex (crítica)

## Lo que acepto

Acepto el recorte: formulario único, directorio fuera, sin nota adicional, QR propio del motorizado y cuadre mediante consulta. Mantengo todas las decisiones cerradas por Jesús. **El objetivo es probar el lunes, no completar Entregas.**

Revisión estática del repo, sin modificar archivos ni consultar producción. Abrevio como **M** la migración [0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql).

## Lo que corrijo (con evidencia)

**1. El seguimiento no aguanta coordenadas nulas tal como está integrado.** `TrackingSheet` por sí sola no usa coordenadas ([tracking-sheet.tsx:114](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/components/tracking-sheet.tsx:114)). Pero `0234` devuelve `{lat:null,lng:null}`, no `null` ([0234:19](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0234_el_seguimiento_de_entregas_ya_trae_las_coordenadas.sql:19)). El mapa acepta ese objeto y ejecuta `lat.toFixed(5)`: fallaría ([courier-map-host.tsx:292](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/components/map/courier-map-host.tsx:292), [369](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/components/map/courier-map-host.tsx:369)). Además, sigue montado desde [layout.tsx:179](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/app/layout.tsx:179). Solución mínima: retirar ese mapa del recorrido, conservar seguimiento textual y corregir respuesta/tipos nullable. Probar también el enlace público en una sesión nueva.

**2. Admin no implica customer, pero ambos pueden coexistir.** La clave de `user_roles` es `(user_id,role)` ([0002_tables.sql:22](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0002_tables.sql:22)). `requireRole` consulta exactamente el rol solicitado, sin excepción admin ([auth.ts:34](/Users/jesuscastillo/Developer/tindivo-v2/apps/api/lib/http/auth.ts:34)); crear exige `customer` ([route.ts:58](/Users/jesuscastillo/Developer/tindivo-v2/apps/api/app/api/v1/customer/courier-orders/route.ts:58)). Jesús puede hacerlo con ambos roles; **no está verificado que hoy los tenga**. Acepto eximir admin del límite, comprobándolo en `user_roles` para el usuario autenticado. Para medir WhatsApp usaría el UUID de Jesús: consultar el rol actual de todos los autores puede reclasificar pedidos históricos.

**3. Encadenar llamadas desde la API no las vuelve una transacción.** Cada `service.rpc()` es una llamada independiente; el patrón existente incluso prueba las acciones por separado ([courier-orders.integration.test.ts:308](/Users/jesuscastillo/Developer/tindivo-v2/apps/api/lib/__tests__/courier-orders.integration.test.ts:308)). Si `depart` funciona y `arrive` falla, queda medio avance; repetir desde `depart` será rechazado por su guarda ([M:622](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:622)).

Mantendría los tres botones, con **acciones compuestas dentro de una RPC**, bloqueo de la fila, cobro y eventos en la misma transacción, y reintento seguro. Puede reutilizar internamente las acciones existentes; no hace falta rehacer la máquina. Acepto perder los tiempos intermedios.

**4. Falta el aviso al motorizado.** `sendCourierOrderCreated` emite el evento para el temporizador; su consumidor espera y expira solicitudes, sin notificar ([client.ts:125](/Users/jesuscastillo/Developer/tindivo-v2/apps/api/lib/inngest/client.ts:125), [functions.ts:262](/Users/jesuscastillo/Developer/tindivo-v2/apps/api/lib/inngest/functions.ts:262)). El polling actual consulta `orders`, no `courier_orders`, y se pausa al ocultar la pestaña ([use-driver-orders.ts:200](/Users/jesuscastillo/Developer/tindivo-v2/apps/motorizados/hooks/use-driver-orders.ts:200), [383](/Users/jesuscastillo/Developer/tindivo-v2/apps/motorizados/hooks/use-driver-orders.ts:383)).

Para el lunes: polling nuevo y **Jesús supervisa solicitudes y avisa manualmente cuando haga falta**. Push, al backlog. Hay que ensayar con el celular bloqueado; no presentar el polling como aviso en segundo plano.

**5. Dos activas no cuestan «una línea» ni prueban capacidad.** `accept` protege la disputa por **un mismo pedido**, no dos aceptaciones simultáneas del mismo conductor ([M:600](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:600)). Un límite estricto exige serializar por conductor antes de contar.

Además, 5.2 minutos es la **mediana de comida**, no el peor caso de Entregas; los huecos documentados se concentran fuera del pico ([plan-final.md:24](/Users/jesuscastillo/Developer/tindivo-v2/Docs/nuevo-modelo/plan-final.md:24)). No demuestra que dos recogidas sean inocuas. Para probar: máximo dos comprometidas como regla operativa y **una sola recogida a la vez**; comida primero según lo acordado.

**6. «No se pudo» no debería cancelar indiscriminadamente.** La RPC permite cancelar cualquier no terminal y esa rama no comprueba propiedad del conductor ([M:690](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:690)). La ruta nueva debe autorizar el pedido concreto. Después de recoger, el botón debe llevar a coordinación con Jesús: cancelar no resuelve dónde queda el paquete. El cuadre debe contar por `transport_collected_at`, incluyendo canceladas cobradas, sin asumir que todo cobro terminó en entrega ([M:204](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:204)).

**7. Ocultar teléfonos requiere más precisión.** El lector solicita ambas columnas ([directory.ts:45](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/lib/directory.ts:45)). Restringirlas exige retirar permisos amplios y conceder solo columnas permitidas; también ajustar o retirar ese lector. No daría por certificado «15 minutos».

## Lo que recortaría más

**18 horas es un escenario optimista, no una estimación cerrada.** Le faltan atomicidad/reintentos, seguimiento completo, aviso operativo y verificación independiente. Reservaría **4–6 horas adicionales** para integración y regresión; es estimación, no medición.

Para acercarse a 18: dejar el límite de dos como regla humana, ninguna automatización semanal, nombres sin controles adicionales y consultas mínimas. No recortaría pruebas de cobro, autorización ni reintento tras perder conexión.

«Listo ahora» debe fijarse también en servidor: hoy el contrato permite hasta 180 minutos ([courier.ts:48](/Users/jesuscastillo/Developer/tindivo-v2/packages/contracts/src/courier.ts:48)). El viernes debe quedar margen para corregir; el domingo debe ensayar el sistema ya terminado.

## Desacuerdos

1. **Nombres opcionales: sí.** Incluso omitiría sus campos el lunes. Valores de respaldo en servidor conservan las columnas obligatorias ([M:182](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:182)); la llamada confirma a quién buscar.
2. **Todos los días: no por defecto.** Ensayo domingo 4 y apertura L–V; revisar antes del sábado 10. El horario solo evalúa horas ([M:410](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:410)), pero apagar manualmente el fin de semana tampoco exige programar calendario. No esperaría a retrasar comida.
3. **Directorio fuera: de acuerdo.** No es imprescindible el lunes.
4. **Tope de dos: operativo inicialmente**, sin venderlo como capacidad demostrada.
5. **Tres botones: sí; encadenamiento HTTP: no.** La simplificación visual necesita una operación atómica detrás.