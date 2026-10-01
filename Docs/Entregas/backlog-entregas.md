# Tindivo Entregas · Backlog

> **2026-09-30 · Claude + Codex.** Todo lo que **no** entra en el
> [MVP v1](./mvp-entregas-v1.md). Criterio para entrar: **¿es imprescindible
> para probar el lunes?** Si no lo es, o ante la duda, viene aquí.
> Prioridad: **alta** = lo primero cuando salga la señal; **baja** = puede no
> hacerse nunca.

## Flujo del cliente

| Feature | Problema que resuelve | Problemas o costos de implementarlo | Señal que justificaría construirlo | Prioridad |
|---|---|---|---|---|
| **Mapa y pin** (flujo de inDrive, ya a medio construir en la rama) | Ubicar puntos sin referencia clara; validar la zona de forma automática | Arrastrar un mapa cuesta a los usuarios poco digitales; hay que volver a exigir coordenadas y reactivar el seguimiento con mapa | Más del 10 % de las entregas con motorizados perdidos o fuera de zona por culpa de la referencia | Media |
| **GPS en vivo** del motorizado | El cliente ve dónde viene | Batería y datos del motorizado; permisos; con recorridos de ~5 min aporta poco | Quejas repetidas de «¿dónde está?» con tiempos normales | Baja |
| **Directorio de negocios con autocompletado** | No escribir referencia ni celular de un negocio conocido | Cargar y mantener los datos; primero hay que dar permisos columna por columna (hoy el teléfono se filtra); ~2–3 h más la carga | Un mismo negocio es origen de ≥ 5 entregas por semana, o hay ≥ 10 negocios que aceptaron entregar | **Alta** |
| **Buscador de negocios** en el flujo | Encontrar negocios que el cliente no sabe describir | Depende del directorio; tiene riesgo de provocar a Zorritos si muestra sus negocios | Directorio con ≥ 15 negocios que aceptaron | Media |
| **«Mandar / Traerme»** | Llenar solo el punto que no es uno mismo | Suma una decisión antes del formulario; «Soy yo» ya lo resuelve | En el ensayo, varios confunden quién entrega y quién recibe | Baja |
| **Chips de «qué es»** | Tocar en vez de escribir | Hay que mantener la lista de categorías; poco ahorro frente a un texto corto | Muchas descripciones vacías o inútiles («cosa») | Baja |
| **Direcciones guardadas / recientes** | No reescribir la misma referencia | Hay que guardarlas por usuario y ofrecer una forma de editarlas | ≥ 30 % de los pedidos repiten origen o destino | Media |
| **Repetir entrega** | Recompra en un toque | Depende de las direcciones guardadas | ≥ 20 % de usuarios con 2 o más entregas | Media |
| **Nombres de contacto** en el formulario | El motorizado sabe por quién preguntar | Un campo más por punto | Motorizados que entregan a la persona equivocada | Baja |
| **Nota para el motorizado** | Instrucciones que no caben en la referencia | Columna nueva, más contrato y API | Referencias largas y mezcladas con instrucciones | Baja |
| **Login al final con borrador recuperable** | No perder lo escrito al volver de Google | Hay que persistir el borrador y el paso en el que iba, y evitar que `openSheet` lo reinicie | Abandono visible en el paso de login | **Alta** |
| **Entregas sin OTP / modo invitado** | Menos fricción para el primer pedido | Riesgo de abuso; sesión anónima de Supabase y luego vincularla | El OTP del onboarding es la principal causa de abandono | Media |
| **Tiempo de preparación** («listo en X min») | Pedir antes de que esté listo | Bloquea al motorizado; contradice «listo y pagado» | Muchas llamadas de «todavía no está» con tiempo claro | Baja |
| **Pedidos programados** | Pedir para más tarde | Cola futura, recordatorios, reglas de horario | Pedidos fuera de horario con intención de «para mañana» | Baja |

## Canales y avisos

| Feature | Problema que resuelve | Problemas o costos de implementarlo | Señal que justificaría construirlo | Prioridad |
|---|---|---|---|---|
| **Precio distinto por web y por WhatsApp** | Empujar a la web para ahorrar tiempo a Jesús | Confunde; el motorizado cobra dos cifras; contradice el S/ 3 único | WhatsApp pasa los ~15 min diarios de Jesús | Baja |
| **Modo operador** (campo «Cliente», solicitante real separado) | Datos limpios del cliente de WhatsApp; límite por cliente y no por Jesús | Ruta aparte, rol, UI extra | WhatsApp supera ~40 % de las entregas, o hay abuso a través de Jesús | Media |
| **Link público de seguimiento compartible** | Que quien recibe siga la entrega sin cuenta | La RPC existe; falta pantalla pública y revisar la privacidad | Llamadas de quien recibe preguntando | Media |
| **Aviso por WhatsApp a quien recibe** | Que sepa que le llega algo y quién lo lleva | Mensaje preescrito; sin WhatsApp Business API es manual | Muchos «No se pudo · No contestan» del lado de quien recibe | **Alta** |
| **Notificaciones al usuario web** (push o SMS) | Saber el estado sin abrir la web | La web no tiene push; SMS cuesta ~US$ 0.25 cada uno | Clientes que abandonan el seguimiento y llaman | Baja |
| **Push al motorizado** por entrega nueva | Enterarse con el celular bloqueado | Service worker y permisos; el polling solo funciona con la app abierta | En el ensayo o el piloto, solicitudes que vencen porque el motorizado no se enteró | **Alta** |

## Servicio

| Feature | Problema que resuelve | Problemas o costos de implementarlo | Señal que justificaría construirlo | Prioridad |
|---|---|---|---|---|
| **Compras / encargos asistidos** (Jesús coordina con la tienda) | «Cómprame esto» | Tiempo de Jesús; confirmar el pago de otro; esperas | ≥ 5 pedidos de compra por semana durante 2 semanas | Media |
| **Compras con flujo propio** (lista, tienda, plan B, tope) | Encargos sin Jesús | Fondo, riesgo de rechazo, S/ por minuto bajo; choca con «no retener fondos» | Lo asistido demuestra demanda y margen | Baja |
| **Comida de no partners** vía Entregas | Pedidos de restaurantes fuera de la red | Arbitraje contra los partners (S/ 1.50); rivalidad con Zorritos | Decisión estratégica tras el piloto, con un precio que no perjudique a los partners | Baja |
| **Agrupación por zona** (varias entregas en una salida) | Más entregas por hora | Coordinar tiempos; esperas del primer cliente | Tope de 2 lleno de forma habitual, con destinos cercanos | Media |
| **Precio negociable tipo inDrive** | Ajustar el precio por distancia o volumen | Pueblo chico con recorridos de ~5 min; negociar suma fricción | Pedidos rechazados por precio en envíos voluminosos o raros | Baja |
| **Cobro contra entrega por Yape para vendedoras de Facebook** (el motorizado cobra el producto) | Vender a quien no quiere pagar por adelantado | Tindivo toca dinero ajeno; hay que cuadrarlo y hay riesgo de pérdida | ≥ 3 vendedoras lo piden y aceptan una comisión | Media |
| **Días programados en el horario** (`courier.hours` por día) | Abrir o cerrar días sin tocar el interruptor | Migración de la función de horario | El interruptor manual se olvida o genera errores | Media |
| **Capacidad según la carga de comida** | Proteger la comida de forma automática | Hay que medir la simultaneidad de comida; regla más compleja | Demoras de comida atribuibles a Entregas con el tope de 2 | Media |

## Operación, dinero y medición

| Feature | Problema que resuelve | Problemas o costos de implementarlo | Señal que justificaría construirlo | Prioridad |
|---|---|---|---|---|
| **`driver_payment_qrs`** (el QR de Yape del motorizado dentro de la app) | Que el cliente escanee sin pedirlo | Subir imágenes, permisos, pantalla | Motorizados sin QR a mano o pagos al número equivocado | Media |
| **`courier_remittances`** (rendición registrada) | Cuadre auditable, sin consulta manual | Tablas, estados, pantalla de Jesús y del motorizado | Más de 2 motorizados, o descuadres repetidos | Media |
| **Foto de entrega** | Prueba ante un reclamo | Almacenamiento, cámara, más pasos para el motorizado | Primer reclamo de «no me llegó» | Media |
| **Medición del embudo web** (abandono por campo) | Saber dónde se cae el formulario | Eventos del cliente, almacenamiento, análisis | Muchas visitas a Entregas con pocos pedidos creados | Media |
| **Tiempos intermedios por estado** (salió, llegó) | Ver dónde se va el tiempo | Hay que separar de nuevo los pasos compuestos | Tiempos totales altos sin una causa clara | Baja |
| **Panel de Entregas para Jesús** (en `admin`) | Ver las solicitudes sin abrir la app del motorizado | Una pantalla más | Jesús pasa más de 15 min diarios mirando solicitudes | Media |
| **Panel de Entregas en `apps/negocios`** | Que una tienda cree la entrega por su cliente | Nueva superficie; decidir quién paga | Tiendas que piden crear entregas ellas mismas | Baja |

## Crecimiento

| Feature | Problema que resuelve | Problemas o costos de implementarlo | Señal que justificaría construirlo | Prioridad |
|---|---|---|---|---|
| **Comunidad de WhatsApp** | Difusión barata | Moderarla le quita tiempo a Jesús; ruido | Operación estable 2 semanas y falta de demanda | Baja |
| **Gamificación de aliados** (puntos, rankings) | Que las tiendas empujen Entregas | Mantener reglas y premios | ≥ 10 tiendas activas originando entregas | Baja |
| **Captar negocios de Zorritos** como aliados de Entregas | Más orígenes frecuentes | Guerra de precios (Zorritos cobra S/ 0 al negocio y S/ 2 al cliente) | Entregas demuestra valor que Zorritos no da, y un negocio lo pide él mismo | Baja |
