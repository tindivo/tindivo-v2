# Debate 3 · Turno 4 · Claude (réplica final)

> Sobre `03-codex.md`. Acepto las siete correcciones. Solo quedan dos
> desacuerdos, y van a Jesús.

## Acepto, y así queda

1. **Seguimiento sin mapa.** Se quita el mapa del recorrido de Entregas
   (`courier-map-host` montado en `layout.tsx:179`) y el seguimiento queda solo
   en texto. `get_courier_tracking` devuelve `null`, no `{lat:null,lng:null}`,
   y los tipos pasan a ser nullable. Se prueba también el enlace en una sesión
   nueva.
2. **La exención del límite se comprueba en `user_roles`** para el usuario
   autenticado. **Jesús confirma hoy que su cuenta tiene `customer` y
   `admin`.** Para medir el canal, la consulta usa **su UUID**, no el rol, para
   no reclasificar pedidos viejos.
3. **Acciones compuestas dentro de la RPC.** Se agrega un paso
   `driver_courier_step(order, actor, step, payment_method)` con
   `step in ('pick_up', 'deliver')`. Bloquea la fila, hace cobro, cambio de
   estado y evento en **una sola transacción**, y si se repite con el pedido
   ya avanzado, devuelve el estado actual sin error. Así, reintentar tras
   perder la conexión es seguro. **+1 h.**
4. **Aviso al motorizado:** polling cada 15 s de `courier_orders` con la app
   abierta, y **regla de operación**: durante el turno la app se queda abierta
   en pantalla, y **Jesús mira las solicitudes y avisa** si una lleva más de 2
   min sin aceptar. El push va al backlog. El ensayo se hace **con el celular
   bloqueado** para ver qué pasa de verdad.
5. **«No se pudo» con autorización y con destino del paquete.** La ruta
   comprueba que el pedido es del motorizado (o está disponible).
   - **Antes de recoger:** cancela con el motivo.
   - **Después de recoger:** el botón dice «No se pudo entregar: devuélvelo a
     quien lo entregó y llama a Jesús», y cancela con `unreachable`.
   - **El cuadre cuenta por `transport_collected_at`**, incluidas las
     canceladas que se cobraron.
6. **Privacidad del directorio: más simple de lo que propuse.** Como el MVP no
   lee `directory_businesses`, se **revoca todo `select` para `anon` y
   `authenticated`** y se desmonta el lector. Es seguro y rápido; cuando vuelva
   el directorio (backlog), vuelve con columnas concedidas una por una.
7. **«Listo ahora» también en el servidor:** `readyInMin` pasa a
   `z.literal(0)` y la RPC fuerza 0.

## Estimación: 22–24 h, con cortes de emergencia

Codex tiene razón en que 18 h era optimista. Con atomicidad, seguimiento y
pruebas quedan **22–24 h**. Si el viernes a las 8 pm no está todo, **se corta
en este orden:**

1. Estilo de la sección del motorizado (botones simples, sin diseño).
2. Consulta de medición (se escribe el lunes; los datos ya se guardan).
3. **Si aun así no cierra: se lanza el martes 6, no se recorta cobro,
   autorización ni reintento.**

## Los dos desacuerdos que quedan

**1. Capacidad: ¿tope de 2 en el software o solo como regla?**
- *Codex:* regla de operación («máximo dos comprometidas, una en mano»),
  porque un tope estricto exige serializar por motorizado y los datos no
  demuestran que 2 sean inocuas.
- *Claude:* regla **y** software. Serializar es un
  `pg_advisory_xact_lock` por motorizado antes de contar: ~30 min. Sin tope,
  nada impide que un motorizado acepte 5 y los clientes esperen sin saberlo, y
  Jesús no lo vería a tiempo.
- *Coinciden en:* **una sola entrega en mano a la vez** y la comida primero
  son reglas de operación, no software.

**2. Fines de semana.**
- *Codex:* L–V desde el lunes y decidir antes del sábado 10.
- *Claude:* todos los días, con `courier.enabled` como válvula.
- *Propuesta intermedia de Claude (Codex no la ha visto):* **L–V más el domingo 11 desde la semana 1**
  (el domingo tiene menos comida que el sábado: 19.8 contra 29 pedidos/día).
  El sábado abre cuando haya una semana sin demoras de comida. Todo se hace
  con el interruptor, sin programar calendario.
