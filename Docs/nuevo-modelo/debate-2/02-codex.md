# Debate 2 · Ronda 2 · Codex

**Coincido en reducir fricción, pero Claude confunde menos pantallas con mayor facilidad y traslada parte del trabajo al motorizado.** El criterio debe ser completar una entrega sin ayuda y sin coordinación adicional de Jesús.

## Verificaciones

Revisión estática de `tindivo-courier`, sin modificar archivos ni consultar bases. No doy por confirmado qué migraciones están aplicadas en producción.

- **Acceso y OTP:** Google y correo+contraseña existen; el onboarding incorpora verificación telefónica. Sin embargo, **Entregas no exige OTP en su API**: pide rol `customer`, Idempotency-Key y cuerpo válido ([courier-orders/route.ts:45](/Users/jesuscastillo/Developer/tindivo-v2/apps/api/app/api/v1/customer/courier-orders/route.ts:45)). Comida sí comprueba `phone_verified_at` ([orders/route.ts:45](/Users/jesuscastillo/Developer/tindivo-v2/apps/api/app/api/v1/customer/orders/route.ts:45)). Además, enviar Entregas sin sesión solo muestra «Ingresa con tu celular»; no abre el login ([use-courier-request.ts:126](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/hooks/use-courier-request.ts:126)).

- **SMS:** usa Twilio Verify, canal `sms` ([send-code/route.ts:109](/Users/jesuscastillo/Developer/tindivo-v2/apps/api/app/api/v1/customer/phone/send-code/route.ts:109)); el simulacro requiere ausencia de cliente Twilio y entorno no productivo ([client.ts:104](/Users/jesuscastillo/Developer/tindivo-v2/apps/api/lib/twilio/client.ts:104)). Tarifa pública consultada hoy: **US$0.2476 por segmento a Perú**, más **US$0.05 por verificación exitosa**: referencia de US$0.2976 con un segmento y sin reintentos ni extras; no es la factura verificada de Tindivo. [SMS Perú](https://www.twilio.com/en-us/sms/pricing/pe), [Verify](https://www.twilio.com/en-us/verify/pricing).

- **Borrador/OAuth:** **no sobrevive a una recarga**. El store está en memoria y `openSheet` lo reinicia ([store.ts:75](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/lib/store.ts:75)); la persistencia del onboarding guarda únicamente destino y fecha ([onboarding-store.ts:22](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/lib/onboarding-store.ts:22)). Google fuerza selector de cuenta: tampoco cabe prometer «un toque» ([persistence.ts:87](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/components/auth-onboarding/persistence.ts:87)).

- **Datos exigidos:** el flujo actual pide nombres y celulares de ambos extremos ([trip-details-sheet.tsx:33](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/components/trip-details-sheet.tsx:33)). El contrato exige coordenadas, referencias, solicitante, descripción, pagador y ambas confirmaciones; **los teléfonos de A/B son opcionales en API**, aunque obligatorios visualmente ([courier.ts:17](/Users/jesuscastillo/Developer/tindivo-v2/packages/contracts/src/courier.ts:17)).

- **Límite y operador:** cuenta `requester_phone`, no A/B ni directamente la cuenta ([0232:525](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:525)). La web toma ese teléfono del perfil, pero la API acepta el enviado sin contrastarlo. El conteo tampoco tiene bloqueo que impida creaciones concurrentes. **Sí existe `admin`** ([enums.ts:14](/Users/jesuscastillo/Developer/tindivo-v2/packages/contracts/src/enums.ts:14)); no hace falta inventar otro rol.

- **Horario y migraciones:** `app_settings.courier.hours` contiene horas; la función **no evalúa días** ([0232:401](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:401)). «Todos los días» está además escrito en la API ([route.ts:26](/Users/jesuscastillo/Developer/tindivo-v2/apps/api/app/api/v1/customer/courier-orders/route.ts:26)). `0233` revoca acceso directo a las RPC de escritura ([0233:30](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0233_the_courier_rpcs_stop_taking_anyones_word_for_it.sql:30)); `0234` añade coordenadas al seguimiento público, no controles de identidad ([0234:19](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0234_el_seguimiento_de_entregas_ya_trae_las_coordenadas.sql:19)).

## Respuestas

**1. Tres pantallas: sí, con otra distribución.** Pondría «Dónde recogemos + quién entrega», «Dónde llevamos + quién recibe» y «Qué llevamos + precio + quién paga». Así cada contacto queda junto a su lugar y la última pantalla no concentra toda la escritura.

No descartaría «Mandar/Traerme» únicamente por sumar una decisión: puede ahorrar llenar un extremo. Lo probaría como atajo, sin pantalla obligatoria. La referencia, dirección guardada y negocio conocido deben preceder al mapa. Hacer el pin opcional exige cambiar contrato y cobertura; no basta esconderlo.

**2. Google sin OTP: aceptable para un piloto acotado, con condiciones.** Mantendría Google principal, correo secundario y acceso al final con borrador recuperable. No trasladaría automáticamente todo el onboarding de comida a Entregas.

OTP sí acredita control del número: dificulta pedir usando el celular de un vecino y consumirle su límite. No acredita que A tenga una bolsa ni que B vaya a pagar. «Una llamada evita el viaje» tampoco cubre a quien contesta y miente.

Antes de quitarlo, limitaría por cuenta desde servidor y registraría incidentes atribuibles. No bloquearía automáticamente al solicitante por fallas de terceros.

**Invitado:** mejor candidato si Google resulta una barrera real, pero no es un interruptor gratuito. Supabase crea un usuario autenticado anónimo; pierde acceso al cerrar sesión o borrar datos y requiere revisar permisos y vinculación posterior. Lo probaría después de medir el acceso existente. [Supabase](https://supabase.com/docs/guides/auth/auth-anonymous).

**3. Zorritos:** coincido con A/B/C como alcance inicial, no con sus certezas. «No hay contrato que romper» no está demostrado. Directorio solo con negocios que acepten entregar bolsas a Tindivo; para puntos libres, el solicitante debe haber coordinado el recojo. No obligaría a Jesús a confirmarlo pedido por pedido.

Tampoco S/3.50 garantiza eliminar el incentivo de un restaurante a salir: puede trasladar el costo al cliente. La protección depende del valor para el negocio y de quién paga, no solo del ingreso total de Tindivo.

**4. Pagador:** no sabemos cuál es el más común. «Recibe» falla con regalos, menores, adultos mayores o envíos encargados por terceros. Usaría dos botones visibles: **«Paga quien entrega / Paga quien recibe»**, con nombre y monto. Preseleccionar cuando haya contexto claro; no esconder una obligación económica en un desplegable.

**5. Verificaciones:** arriba. La distinción decisiva es **OTP en onboarding ≠ OTP exigido por Entregas**.

**6. Camino corto:** cerrar primero operación y recuperación del flujo; después ajustar pantallas. Detallo abajo.

## Lo que Claude no ve

- **La UI contradice el piloto:** ofrece «Comida», permite estar listo después y marca `prepaidConfirmed` con una casilla que solo habla de contenido permitido y peso ([trip-items-sheet.tsx:19](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/components/trip-items-sheet.tsx:19), [línea 126](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/components/trip-items-sheet.tsx:126)). Esto genera esperas reales.
- **Ocultar teléfonos no los vuelve privados:** el navegador recibe `phone` y `whatsapp` del directorio ([directory.ts:40](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/lib/directory.ts:40)).
- **Disponibilidad no significa capacidad:** solo comprueba motorizado activo/disponible, sin carga ([0232:425](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:425)). Y el timeout configurado inicialmente es **15 minutos**, no cinco ([0232:338](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:338)).
- **WhatsApp ya figura como decisión de Jesús en la propuesta base.** Claude lo posterga unilateralmente. Mantendría asistencia acotada, sin prometer respuesta en dos minutos. Mismo formulario, ruta protegida por `admin`, solicitante real y operador registrados por separado; conservar límite por cliente, sin exención indiscriminada.

## Orden de trabajo

1. Cerrar reglas: S/3 único, L–V, listo y pagado cuando corresponda, pagador, devolución y cobro fallido.
2. Completar circuito del motorizado, capacidad atómica, cobro, retorno y rendición diaria.
3. Reparar acceso, borrador, reintentos e identidad; alinear contratos, privacidad y mensajes.
4. Simplificar pantallas y habilitar creación asistida mínima.
5. Probar con cinco vecinos desde enlace de WhatsApp, incluyendo volver de Google y recuperar el seguimiento. Medir ayuda requerida, errores de cobro y minutos de Jesús; lanzar solo cuando el circuito completo funcione.