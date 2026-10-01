# Auditoría Entregas · Codex

**Dictamen:** no encender todavía para público general. Un piloto acompañado por Jesús es viable tras resolver los bloqueos siguientes. Revisé exclusivamente los dos archivos pedidos; las funciones delegadas, restricciones y permisos anteriores quedan fuera de esta auditoría.

**A. Auditoría funcional**

**Bloquea**

- **Despliegue incompleto:** según el inventario, faltan `0234`, `0235` y las apps en producción. Verificar versiones compatibles antes de activar.
- **Aviso al motorizado:** consultar cada 15 segundos con pantalla abierta no cubre el trabajo real. Hace falta push para entregas nuevas y sonido con la app visible, evitando duplicados. Para un piloto acompañado, Jesús puede sustituirlo con llamada y confirmación explícita; sin esa cobertura, habrá solicitudes abandonadas.
- **Prioridad de comida:** colocar Entregas encima de comida contradice la prioridad operativa. El tope de dos entregas no demuestra que se reserve capacidad para partners. Definir cuándo no aceptar Entregas y comprobarlo con pedidos simultáneos.
- **Incidencias y dinero:** «devuélvelo y llama» deja sin resolver custodia, confirmación de devolución y destino de los S/3 cobrados. Antes de operar, definir quién conserva o devuelve el cobro, quién recibe cada Yape y cómo Jesús concilia efectivo/Yape. Registrar un método no acredita el pago.

**Importante**

- **Admin mínimo:** no hace falta un panel completo, pero Jesús necesita ver pendientes, antigüedad, contactos, motorizado, cobros e incidencias; además, apagar el servicio. Supabase/SQL puede servir temporalmente con un procedimiento preparado. Sin vigilancia operativa, esta carencia pasa a bloqueo.
- **«Pedido a nombre de»:** el creador identifica quién registró la solicitud; en WhatsApp será Jesús y no ayudará a retirar el paquete. Tampoco debe sustituirse automáticamente por quien recibe: el pedido puede estar preparado a nombre de otra persona. Mostrar «Recoger de» y «Entregar a»; si el comercio requiere identificar una compra, añadir «Nombre para recoger». Conservar al creador para trazabilidad.
- **Horario sin días:** suficiente únicamente si realmente atienden diariamente. Si descansan algún día, configurar días o imponer apagado manual antes del lanzamiento. Probar límites horarios y hora de Perú.
- **Cliente:** comprobar hasta cuándo puede cancelar, qué ocurre después del cobro/recojo y cómo contacta a Jesús. El inventario no define estas condiciones.

**Después**

- QR integrado, panel avanzado y automatizaciones adicionales; el QR físico y una conciliación manual permiten arrancar.

**B. Auditoría de código · 0235**

1. **Carrera al crear:** [líneas 111–120 y 131](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0235_el_motorizado_atiende_entregas_con_tres_botones.sql:111). Dos solicitudes del mismo teléfono pueden contar cero e insertar ambas: no hay serialización entre comprobación e inserción. Una restricción externa podría impedirlo, pero aquí no se demuestra. Bloquear por teléfono antes de contar.

2. **«Soltar» no garantiza idempotencia:** [líneas 218–220 y 274–280](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0235_el_motorizado_atiende_entregas_con_tres_botones.sql:218). Si `release` desasigna al motorizado, repetir tras perder la respuesta devuelve `courier_not_found`. Contradice la garantía general del inventario. Reconocer el reintento mediante una identidad de operación.

3. **Confirmaciones eludibles con `NULL`:** [líneas 78–83](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0235_el_motorizado_atiende_entregas_con_tres_botones.sql:78). `IF NOT NULL` no entra al rechazo. Usar `IS NOT TRUE`. La persistencia efectiva depende de restricciones no examinadas.

El bloqueo por motorizado y los permisos exclusivos de `service_role` están presentes. No hay evidencia suficiente aquí para afirmar suplantación o fallos dentro de `advance_courier_order`.

**C. Pruebas manuales antes de encender**

- Celular bloqueado, app visible y reconexión: aviso y aceptación.
- Comida y Entregas simultáneas: comida primero.
- Cobro en origen/destino × efectivo/Yape; cotejar dinero real.
- Doble toque y respuesta perdida, especialmente «Soltar».
- No contestan, devolución, cancelación y vencimiento sin aceptar.
- Pedido WhatsApp: nombres correctos; horario, descanso y apagado efectivo.