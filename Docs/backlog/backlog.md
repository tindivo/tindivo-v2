# Backlog Tindivo

> Organizado a partir de las notas sueltas. Agrupado por tema, con prioridad sugerida para que la discutamos juntos — ninguna prioridad aquí es definitiva, son un punto de partida para priorizar en conjunto.

## Cómo leer esto

| Marca       | Significado                                                                               |
| ----------- | ----------------------------------------------------------------------------------------- |
| 🔴 P0       | Bloqueante o de muy alto impacto para el lanzamiento/operación actual                     |
| 🟠 P1       | Importante, corto plazo (primeras semanas post-lanzamiento)                               |
| 🟡 P2       | Mejora relevante, sin urgencia                                                            |
| 🟢 P3       | Backlog de largo plazo / nice-to-have                                                     |
| 📋 DECISIÓN | No es una tarea de código — necesita que decidas algo de negocio antes de poder planearse |
| ✅ DONE     | Ya está resuelto/existe, no requiere trabajo                                              |

---

## 1 · Decisiones de negocio pendientes

Estas no se implementan hasta que decidas la regla — bloquean planeamiento, no necesariamente código.

### DEC-01 · Clientes existentes entran como "nuevos"

**📋 DECISIÓN — 🔴 P0**
Los pedidos manuales no vinculan `customer_user_id`. Una señora que pide por teléfono hace meses entra al sistema como cliente primerizo y se le exige prepago. Es probablemente el mayor freno de adopción para tu base de clientes actual, y el sistema nuevo lo va a mostrar desde la primera semana.

### DEC-02 · Recargo por distancia (far) desapareció del lado del cliente

**📋 DECISIÓN — 🟠 P1**
`commissions.far = 3.50` (igual que `near`) es correcto como modelo interino, pero significa que hoy no cobras nada extra por las entregas lejanas — las que más gasolina y tiempo le cuestan a Ernesto. Con Priamo al 76% del volumen, se estima en el orden de S/50/mes no cobrados. No hay que revertirlo: hay que construir el cobro adicional al cliente en banda `far`, que es lo que lo desbloquea.

### DEC-03 · Strikes permanentes, sin ventana de tiempo

**📋 DECISIÓN — 🟠 P1**
El conteo de strikes no vence nunca, y hay colisión de referencias confirmada (dos clientes distintos pueden compartir una referencia de dirección y acumular strikes cruzados). Define: ¿los strikes deberían expirar? ¿cómo se evita la colisión?

### DEC-04 · `awaiting_payment` sin salida para el cliente

**📋 DECISIÓN — 🟠 P1**
Un pedido en esperando pago no se puede cancelar desde el lado del cliente — solo queda esperar el timeout. Definir si debe poder cancelarse manualmente.

### DEC-05 · ¿Qué pasa si el cliente no sale a recibir?

**📋 DECISIÓN — 🟠 P1**
El motorizado llega pero el cliente no sale. Distinto del no-show clásico (que ya tiene backlog documentado en la sección 3) — aquí el cliente sí está, pero no responde a tiempo. Define el flujo.

### DEC-06 · Confirmación de "he recibido el pedido" — ventana de tiempo

**📋 DECISIÓN — 🟡 P2**
¿Cuánto tiempo tiene el cliente para confirmar que recibió el pedido? Propuesta en las notas: máximo 5 minutos o X segundos. Falta fijar el número.

---

## 2 · Alertas y notificaciones (riesgo #1 del lanzamiento)

Diagnóstico de fondo: el pedido de delivery hoy llega por teléfono, una interrupción imposible de ignorar en una cocina llena. Con B2C llega a una pantalla — es el único paso del flujo que depende de que un humano esté prestando atención, y es donde más se va a romper.

### ALE-01 · Alarma sonora repetitiva en negocios

**🔴 P0 — la más barata y más efectiva de todo este bloque**
Una notificación visual en una pantalla de PC, en una cocina con ruido, es casi inútil. Necesita sonido que no pare hasta que alguien lo apague — como un timer de horno. `requireInteraction: true` ya existe en prod para lo urgente. Se evaluó Web Speech API para alertas verbales ("Pedido nuevo de Priamo" hablado) como aún mejor que un pitido, porque no requiere mirar la pantalla. No depende de push, permisos, ni sistema operativo.

### ALE-02 · Escalar en vez de cancelar automáticamente

**🔴 P0**
Hoy `pending_acceptance` se auto-cancela a los 5 minutos — el primer contacto de un cliente nuevo con Tindivo puede ser una cancelación automática que no fue culpa suya. Propuesta de cadena: alarma al entrar → a los 2 min suena más fuerte + WhatsApp a la cajera → a los 4 min WhatsApp a Jesús → cancelar solo si la intervención humana falló.

### ALE-03 · Subir la ventana de aceptación de 5 a 12-15 minutos

**🔴 P0 — un valor en `app_settings.timers.acceptanceMinutes`, cuesta segundos cambiarlo**
5 minutos es agresivo en las primeras semanas, cuando nadie tiene el hábito de mirar la pantalla todavía. Subir el valor ahora y bajarlo cuando el hábito exista.

### ALE-04 · Botón "listo para operar" + "cerrar por hoy" + recordatorio

**🟠 P1**
`business_schedule` es una tabla semanal estática — si Priamo no abre un martes, o se queda sin gas, el horario dice abierto y entran pedidos que nadie contesta. El botón resuelve un problema real. Necesita tres piezas:

1. El botón inverso "cerrar por hoy" (se acabó el pollo, se fue la luz, evento familiar) — sin esto la única salida es esperar al corte de horario.
2. Recordatorio automático (WhatsApp a la cajera a los 15 min) si el horario dice que deberían estar abiertos y nadie presionó "listo".
3. **Regla de precedencia entre las cuatro capas de disponibilidad**: `platform_schedule` (global) + `business_schedule` (semanal) + "operando ahora" (el botón) + `order_intake_cutoff`. Propuesta: el botón solo puede _cerrar_, nunca _abrir_ — un restaurante recibe pedidos solo si las tres capas de horario dicen sí; presionar "listo" no lo abre fuera de su horario, solo confirma que está atendiendo dentro de él. Hay que escribir esta regla ahora o en dos meses nadie sabrá por qué un restaurante no recibe pedidos.

### ALE-05 · Latido de pestaña como alerta a Jesús, nunca como cierre automático

**🟠 P1**
Detectar "nadie está viendo la pantalla" por latido/presencia de conexión realtime es frágil — la laptop se suspende, el wifi parpadea. Cerrar el negocio automáticamente por esto es peor que el problema: un falso cierre en Priamo (76% del volumen) borra la noche completa. El latido debe avisar a Jesús, nunca cerrar nada por sí solo.

### ALE-06 · Push al cliente — permiso después del primer pedido

**🟡 P2**
Pedir el permiso de notificaciones al entrar hace que la mayoría lo niegue, y una vez negado es dificilísimo recuperarlo. Pedirlo después del primer pedido, con una razón obvia ("te avisamos cuando tu pedido salga").

### ALE-07 · iOS necesita PWA instalada — video explicativo

**🟡 P2**
En iOS, Web Push en pestaña normal de Safari está deshabilitado por completo — solo funciona en PWA instalada desde "Agregar a pantalla de inicio" (iOS 16.4+). Android/Chrome sí funciona en pestaña normal sin instalar nada. Perú es ~85-90% Android, así que el video de instalación solo hace falta para la minoría de iPhone — pero ahí es obligatorio, no opcional.

### ALE-08 · Link de tracking por WhatsApp

**🟡 P2 — camino más barato, ya hay medio construido**
La columna `tracking_link_sent_at` existe en el esquema, sin escritor ni lector. Con ~11 pedidos/día el costo es trivial y llega al 100% de los clientes sin depender de permisos de push ni de sistema operativo.

### ALE-09 · Separar los dos disparadores de audio, no colapsarlos

**🟡 P2 — nota técnica para cuando se implemente**
`useOverdueFeedback` dispara por pedido **vencido**, no por pedido **nuevo** — son dos eventos distintos y ambos necesitan alerta: vencimiento (portar el hook del legacy) y evento nuevo — pedido online entrante, comprobante subido, motorizado llegó (usar `use-audio-alert.ts`, que ya existe en v2). No colapsarlos en un solo disparador.

### ALE-10 · Desbloqueo de AudioContext en el primer gesto

**🟡 P2 — nota técnica, NO copiar el bug del legacy**
El sistema viejo hace `try/catch` silencioso al desbloquear el `AudioContext`, lo que significa que su primer aviso del turno no suena. Es un bug del legacy, no un patrón a replicar — la implementación nueva debe manejarlo explícitamente.

### ALE-11 · Notificaciones al cliente desde la PWA por cada acción

**🟡 P2**
Confirmar recepción, pedido en camino, etc. — notificaciones push por cada cambio de estado relevante.

---

## 3 · No-show del cliente — backlog documentado, **NO implementar todavía**

Investigación de mercado (8 plataformas: PedidosYa, Rappi, DiDi Food, Uber Eats, DoorDash, Deliveroo, Glovo, LlamaFood) — todas dan 0% de reembolso al cliente en prepago cuando no aparece, con tiempo de espera mínimo y evidencia exigidos antes de cancelar.

**Diferencia estructural de Tindivo:** esas plataformas custodian el dinero; en Tindivo el cliente yapea directo al QR del restaurante. "No devolver" no significa que Tindivo se queda el dinero — significa que el restaurante se queda el dinero, recupera la comida, y no paga comisión ni envío. Es el único de los actores que sale _mejor_ que en una entrega normal (S/47 + comida, frente a S/43.50 sin comida).

### NOSHOW-01 · Tiempo de espera mínimo antes de marcar no-show

**🟢 P3 (documentado, no implementar)**
Hoy el motorizado puede marcar no-show en el segundo cero. Propuesta: 5 minutos desde que llega al destino, con escalamiento a los 3 minutos (aviso a central para segundo intento de contacto). Falta el equivalente en destino de `waiting_at_restaurant` — o un timestamp de llegada al cliente.

### NOSHOW-02 · Evidencia fotográfica, no GPS

**🟢 P3 (documentado, no implementar)**
Decisión ya tomada: foto, no GPS. En San Jacinto las direcciones son referencias verbales; el GPS solo prueba cercanía, no significa nada para el cliente. La foto sirve para la conversación real — el cliente reconoce su propia puerta. Con un motorizado asalariado y de confianza, la evidencia es para hablar con el cliente, no para vigilar al motorizado. Evaluar si se reutiliza el bucket de comprobantes de pago o se crea uno nuevo.

### NOSHOW-03 · Cobro al restaurante, solo en prepago

**🟢 P3 (documentado, no implementar)**
Prepago: cobrar envío + comisión (S/3.50) — el restaurante recibió el dinero y recuperó la comida. Contraentrega: NO cobrar — el restaurante no recibió nada y perdió los insumos. Implementación futura: un `refund_charge` al ledger condicionado a `payment_intent='prepaid'` y `cancel_reason='no_show'`. Hoy `handle_prepaid_refund_on_cancel` excluye explícitamente `no_show` de su lista de motivos, así que no genera ningún cargo.

### NOSHOW-04 · Pantalla de explicación al cliente

**🟢 P3 (documentado, no implementar)**
Popup cuando el cliente abre la app tras un no-show: qué pasó en lenguaje claro, evidencia del intento (hora de recojo, llegada, marca de no-show — estos datos ya existen: `picked_up_at`, `cancelled_at`, `order_status_history`, no hay que capturar nada nuevo), la foto de NOSHOW-02, y botón de WhatsApp para coordinar reenvío.

### NOSHOW-05 · Reenvío del pedido

**🟢 P3 (documentado, no implementar) — decisión de alcance ya tomada: por WhatsApp para el lanzamiento**
El pedido queda `cancelled` (terminal, no reactivable — verificado). Un reenvío sería siempre un pedido nuevo de solo-envío, y la cajera ya puede crearlo hoy con `create_business_manual_order`. Automatizarlo no es trivial: solo el restaurante sabe si la comida todavía sirve. Feature completa (si los datos la justifican): cliente pulsa "solicitar reenvío" → se crea una solicitud, no un pedido → el restaurante confirma si aún tiene la comida → se habilita pagar el envío nuevo → se crea el pedido de solo-envío. Depende de que `create_business_manual_order` acepte `order_amount = 0`.
**Dato que falta para decidir si vale la pena construirla:** ¿cada cuánto ocurre un no-show hoy en `delivery.tindivo.com`? Si es una vez al mes, el WhatsApp manual es la respuesta definitiva y esto no se construye nunca.

### NOSHOW-06 · Distinguir "cliente no apareció" de "no encontraron la dirección"

**🟢 P3 (documentado, no implementar)**
El sistema no diferencia hoy "cliente no apareció / pedido falso" de "Ernesto no encontró la casa" — en un pueblo con direcciones por referencia, lo segundo va a pasar. Ambas producen strike y pérdida total hoy. Evaluar un motivo de cancelación distinto para "dirección no encontrada" que no genere strike.

### NOSHOW-07 · Fondo de incidencias — descartado

**✅ Descartado, no aplica**
Un informe de mercado propone un "fondo de incidencias" para pagar al motorizado el viaje perdido. No aplica: ese modelo asume pago por viaje, y Ernesto tiene sueldo fijo sin límite de entregas — el viaje perdido ya lo absorbe Tindivo vía costo fijo.

---

## 4 · Pedidos — flujo operativo

### PED-01 · Manejo de stock agotado

**🟠 P1**
Qué pasa si un producto se queda sin stock — cómo se maneja del lado del restaurante y del cliente.

### PED-02 · Desactivar productos sin generar errores

**🔴 P0 — problema operativo activo**
Mejorar la desactivación de productos o evitar que un cliente elija algo que ya no está disponible.

### PED-03 · Prepago con evidencia mientras el motorizado llega

**🟡 P2**
Que el cliente pueda subir la captura del comprobante mientras el motorizado va en camino, para no tener que mostrar el QR y demorar la entrega — se entrega de frente.

### PED-04 · Manejo de cancelaciones desde ambos lados

**🟠 P1**
Mejorar el flujo de cancelación tanto desde negocio como desde cliente.

### PED-05 · Flujo de baneo

**🟡 P2**
Definir e implementar el flujo de banear a un cliente o negocio.

### PED-06 · Contador visible de pedidos por timeout antes del bloqueo

**🟠 P1**
El restaurante se bloquea si no recibe X pedidos por timeout — ese contador tiene que ser visible para el restaurante, no un límite oculto.

### PED-07 · ¿Permitir múltiples pedidos simultáneos?

**🟡 P2**
Definir si un mismo cliente puede tener más de un pedido activo a la vez.

### PED-08 · Nombre y teléfono del pedido: solo lectura

**🟡 P2**
Eliminar la edición de nombre y teléfono en el flujo de pedido — debe ser solo lectura. Además, unificar las pantallas de método de pago y confirmación de datos en una sola.

### PED-09 · Bug: vuelve al inicio tras completar un pedido

**🟠 P1 — bug reportado**
Revisar el comportamiento de "volver al inicio" después de hacer un pedido.

### PED-10 · Mostrar el QR del negocio en la pantalla de pagos

**🟡 P2**

### PED-11 · Reordenar los audios de alerta según el estado del pedido

**🟡 P2**
Si llega un pedido y no se ha atendido, debe sonar. Cuando está esperando comprobante, debería silenciarse, y sonar de nuevo cuando se sube el comprobante. Alternativa: una columna Kanban más. Relacionado con ALE-09.

### PED-12 · Bug de copy: "cocinando, 0m restantes"

**🟠 P1 — bug visual**
El texto se ve raro cuando quedan 0 minutos. (Nota: puede estar relacionado con el trabajo de count-up de retraso ya implementado esta sesión — revisar si sigue reproduciéndose.)

### PED-13 · "Cancelar" aparece en un momento indebido

**🟠 P1 — bug**
El botón cancelar aparece luego de haber aceptado el comprobante, cuando ya no debería estar disponible.

### PED-14 · Mostrar imágenes de productos también del lado del restaurante

**🟡 P2**

### PED-15 · Refactorizar `pedido-detail`

**🟡 P2 — deuda técnica de UI**
(Nota: este archivo ya viene siendo tocado por el otro frente de trabajo en paralelo esta sesión — coordinar antes de tomarlo.)

### PED-16 · Solo se puede auditar una captura de comprobante

**🟠 P1 — limitación reportada**
Revisar por qué no se puede auditar más de una captura por pedido.

### PED-17 · Revisar la sección "Mi cuenta"

**🟡 P2**

### PED-18 · Razón obligatoria al rechazar una captura de comprobante

**🟠 P1 — 📋 decisión menor de UX**
Evaluar si conviene pedir una razón explícita al rechazar un comprobante.

### PED-19 · Validación de fecha/hora del pedido vs. fecha/hora del comprobante

**🟠 P1 — cuestión operativa**
Los restaurantes tienen que poder validar que la fecha y hora de creación del pedido coincide con la del comprobante.

### PED-20 · Términos y condiciones

**🔴 P0 — requisito legal antes de lanzamiento**

---

## 5 · Cuenta / Auth / Perfil

### CTA-01 · Saltar validación de SMS para clientes ya guardados

**🟠 P1**
Clientes que ya están en la base de datos no deberían tener que pasar por verificación de número otra vez — incluso comunicárselo explícitamente ("ya no es necesario que me mandes SMS, puedes pedir ahora por tindivo.com").

### CTA-02 · Persistencia del carrito de compras

**🟠 P1**
Definir si el carrito debe persistir (ej. en local storage) y qué pasa si algo cambió (precio, disponibilidad) al recuperarlo.

### CTA-03 · Ocultar el campo de correo electrónico

**🟡 P2**
Aparece mencionado dos veces en las notas — evaluar ocultar correo (y contraseña) donde no sea estrictamente necesario.

### CTA-04 · Resolver el reset de contraseña

**🔴 P0 — con fecha límite (antes del 31)**

### CTA-05 · Google Maps del lado del cliente

**🟡 P2**
Evaluar integrar selección de ubicación vía Google Maps para el cliente.

### CTA-06 · Mostrar `app_settings` para poder configurar desde admin

**🟡 P2**
Exponer configuración editable de `app_settings` en el panel de admin en vez de requerir SQL directo.

---

## 6 · Mapas y cobro por distancia

### MAPA-01 · Editar el mapa desde el admin

**🟡 P2**

### MAPA-02 · Pensar cómo cobrar por distancia

**🟠 P1 — relacionado con DEC-02**
El diseño de cobro cerca/lejos para el flujo manual ya está resuelto esta sesión (Parte D/E del ledger). Esto es la versión más amplia: cómo se determina y cobra la distancia en el flujo B2C / mapa, no solo en el manual.

### MAPA-03 · Mejorar la precisión de la ubicación

**🟠 P1**

### MAPA-04 · Mapa visual de far/near del lado del usuario

**🟡 P2**
Que el cliente vea en el mapa qué zonas son cerca/lejos, no solo que el sistema lo calcule internamente.

---

## 7 · Motorizado

### MOTO-01 · Liberar un pedido en caso de demoras

**✅ DONE**
Ya existe: la acción `release` en `advance_order` permite al motorizado soltar un pedido con un motivo (`averia`, `emergencia`, `muy_lejos`, `otro`), devolviéndolo a la cola sin perder el trabajo de cocina ya hecho si aplica. No requiere trabajo adicional salvo que se identifique un caso concreto sin cubrir.

### MOTO-02 · Mejorar la UI general

**🟡 P2**

### MOTO-03 · Mejorar el flujo general

**🟡 P2**

### MOTO-04 · "Mejorar todo" (sin especificar)

**🟢 P3 — necesita desglosarse**
Marcado en las notas sin detalle — conviene una sesión aparte para desglosarlo en ítems concretos.

### MOTO-05 · El motorizado se demora en cobrar al restaurante

**🟠 P1**
Simplificar a que solo indique un monto entre valores fijos (S/2, S/2.50, S/3) en vez del flujo actual. Hoy la pantalla muestra la ganancia general en vez de esto.

### MOTO-06 · Auditar el cobro y permitir cambiarlo desde admin

**🟠 P1**

### MOTO-07 · Ubicación en tiempo real del motorizado

**🟡 P2**
Qué pasa con el tracking de ubicación en vivo — estado actual sin confirmar.

### MOTO-08 · Comunicar que el GPS está activo

**🟡 P2**
Debería mencionarse al inicio que el sistema usa GPS, y que el motorizado lo vea explícitamente.

---

## 8 · Admin

### ADM-01 · Reportes numéricos

**🟡 P2 — sin detalle aún, desglosar**

### ADM-02 · `payment_real` no se ve en ninguna pantalla

**🟠 P1 — hallazgo de auditoría previa**
El dato ya se captura correctamente en el backend, pero solo es consultable por SQL directo. Se necesita para poder responder si la regla de prepago obligatorio está costando clientes. Va a métricas de admin.

### ADM-03 · Mostrar cantidad en la sección de apelaciones

**🟡 P2**
Al costado de "apelaciones" debería verse el número de casos.

### ADM-04 · Rediseñar la tarjeta "Por resolver"

**🟡 P2**
Se ve confuso hoy — propuesta: un botón "Ver detalle" que muestre el historial con imágenes. Además, tras presionar "revisión" se salta directo al tab de "Resueltas", lo cual también hay que revisar.

---

## 9 · Mejoras generales

### MEJ-01 · Compresión de imágenes

**🟡 P2**

### MEJ-02 · Notificaciones de confirmación a los usuarios

**🟡 P2**
(Relacionado con ALE-11.)

---

## 10 · Contenido / Marketing

### CONT-01 · Análisis de competencia

**🟢 P3**
Nota: "la competencia es buena" — sin desarrollar, revisar en una sesión de estrategia.

### CONT-02 · Subir el video de 9 minutos

**🟡 P2**

### CONT-03 · El contexto se pierde entre sesiones

**🟢 P3 — meta-nota, no es una feature**
"El contexto no te ayuda, me he estado perdiendo últimamente" — vale la pena revisar si conviene apoyarse más en documentos como este backlog y en `PENDIENTES.md` para no depender de que una sola conversación cargue con todo el historial.

---

## 11 · Deuda técnica (de auditorías previas, ya identificada)

### DEUDA-01 · Seed no espera a que Auth esté listo tras un reset

**🟠 P1 — media hora de arreglo, va a seguir mordiendo**
Falla con `{}` como mensaje, sin información útil, y obliga a esperar ~110 segundos a ciegas cada vez que se reconstruye la base local.

### DEUDA-02 · `supabase_vector` reiniciándose en bucle

**🟡 P2**
El colector de logs del stack local de Supabase lleva toda la sesión en `Restarting`. No afecta Postgres/PostgREST/Auth ni los tests, pero no está sano.

### DEUDA-03 · Rotar la secret key del legacy

**🟠 P1**
Pendiente desde el trabajo de ETL/reconocimiento del sistema legacy.

### DEUDA-04 · `p_notes` — nota para el motorizado, a futuro

**🟢 P3 — evaluar más adelante**
`p_notes` se eliminó de `create_business_manual_order` por estar muerto desde hace varias migraciones. La idea de reactivarlo como nota dirigida al motorizado (no al negocio) quedó documentada como posibilidad futura. Existen ya en el esquema `customer_notes`, `business_notes` y `driver_notes` (las tres `text` nullable, sin usar por este flujo) — habría dónde guardarla sin migración nueva; falta el camino de escritura y la UI.

### DEUDA-05 · Tests de integración intermitentes con los dev servers levantados

**🟡 P2 — causa no confirmada, solo hipótesis**
Una corrida de la suite dio 5 fallos mientras los servidores de desarrollo seguían arriba contra la misma base local; al bajarlos, la suite pasó limpia dos veces. No se capturó el mensaje de error de la corrida fallida, así que la causa es una hipótesis, no un hecho confirmado.

### DEUDA-06 · Autocompletado de direcciones — decisión de diseño pendiente

**🟡 P2**
Diseño de dos caminos (lectura: autocompletar desde el directorio legacy importado; escritura: captura GPS del motorizado + edición manual) sin cerrar. La decisión debía guiarse por una consulta de tasa de clientes repetidos en los últimos 60 días — pendiente de correr o de confirmar el resultado.

### DEUDA-07 · Suite E2E completa (Playwright) sin correr recientemente

**🟡 P2**
El setup existe con seed idempotente, pero no hay registro de una corrida completa reciente que incluya todos los cambios de esta sesión (Parte C/D/E del ledger, count-up, selector de zona).

---

## Notas finales

- Los ítems marcados **✅ DONE** no necesitan discusión de prioridad — son solo para que quede registrado que ya existen.
- Los ítems **📋 DECISIÓN** conviene discutirlos primero, aparte de la lista de código: cambian el diseño de lo que se construye después.
- Este documento no reemplaza `PENDIENTES.md` ni `Docs/RIESGOS-LEDGER.md` — es un nivel de zoom distinto (producto/roadmap, no estado técnico de migraciones).
