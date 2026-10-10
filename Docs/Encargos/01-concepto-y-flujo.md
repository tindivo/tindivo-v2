# 01 · Tindivo Entregas: concepto y flujo

> **v1.0 · 2026-09-19.** Sustituye a la versión anterior («Encargos»), que se conserva en `historico-pre-v2/` (borrado; en git: `8f26aed`). Base: los documentos v2 de Jesús (`origen-jesus-v2/`) más las decisiones del chat. Análisis de las diferencias: `09`.
> **Nombre público: «Tindivo Entregas».** Nombre técnico interno: **`courier`** (inglés; ver `03` §1). **Nunca** se dice al usuario «recojo», «encargos» ni «mandado»: el «recojo en tienda» es otra cosa (el cliente va a buscar su comida).

---

## 1. Qué es

Tindivo **recoge algo que ya está pedido, pagado y listo** en un punto A y **lo lleva** a un punto B dentro de San Jacinto. Precio: **S/ 3** (impreso «desde S/ 3»).

**Bajada fija, siempre junto al nombre** (porque «entregas» a secas se confunde con el delivery de restaurantes):
> **Recogemos lo que ya pagaste y lo llevamos.**

**Regla central, visible desde el inicio de la pantalla:**
> **Solo recogemos y llevamos. No compramos ni pagamos por ti.**

Dos usos, un solo flujo:

- **En un negocio:** el cliente llama al negocio, pide y paga su pedido por su cuenta, y luego solicita la entrega en tindivo.com.
- **Con una persona o en otro lugar:** alguien deja listo un objeto (un papel, un detalle pequeño, algo olvidado) y Tindivo lo lleva a otro punto.

**La diferencia con «recojo en tienda»** (y la frase que lo aclara): en recojo en tienda **tú vas**; en Tindivo Entregas **nosotros vamos**.

## 2. Roles

| Rol | Quién | Notas |
|---|---|---|
| **Solicitante** | Cliente de tindivo.com, con sesión y celular verificado | Quien pide. **Un solo pedido activo por teléfono** |
| **Contacto en A** | Quien entrega (en un negocio, el del negocio) | Nombre y teléfono, **sin cuenta** |
| **Contacto en B** | Quien recibe | Nombre y teléfono, **sin cuenta**; por defecto, el solicitante |
| **Motorizado** | Flota propia de Tindivo (1 de lunes a viernes, 2 sábado y domingo) | Ve las entregas en **el mismo panel** que los pedidos de restaurante |
| **Admin** | Jesús | Activa el servicio, carga el directorio, confirma las rendiciones |

No hay negocio como parte del cobro ni cajera. **El negocio nunca paga.**

## 3. Disponibilidad

- **Horario: todos los días, de 6 pm a 11 pm** (configurable). **Zona: solo San Jacinto**, dentro del polígono de cobertura; no hay caseríos.
- **El servicio se ofrece solo si:** está encendido **y** es horario **y** hay **al menos un motorizado disponible** (`driver_availability`). Si no, el botón se ve **deshabilitado con su motivo** («Tindivo Entregas atiende todos los días de 6 pm a 11 pm» / «no está disponible ahora»). No hay solicitudes programadas.
- Interruptor manual en el admin (disponible / pausado) con texto editable.

## 4. Puntos de entrada

| Entrada | Comportamiento |
|---|---|
| **Fila, tarjeta o pin de un negocio** → «Pedir entrega · S/ 3» | Abre la hoja de pedido con el negocio ya elegido |
| **Enlace `tindivo.com/r/<slug>`** (QR o enlace del negocio) | Igual |
| **Tarjeta grande en el home** o botón en la navegación | Abre la hoja con el paso 1 vacío |
| **Aviso posterior a «Llamar»** | Abre con ese negocio elegido |

Todo enlace lleva `?src=` (`afiche_frente`, `afiche_reverso`, `qr`, `whatsapp`, `catalogo`, `popup`, `home`, `redes`). Diseño de cada superficie: `08`.

## 5. La pantalla de pedido

**Una hoja sobre el mapa, en una sola pantalla** (no un asistente de cuatro pasos). Los cuatro pasos de los documentos de Jesús son **cuatro bloques** de esa hoja, cada uno editable en su sitio. **El mapa es lo principal** (decisión de Jesús): grande, con los pines de A y B y una **línea recta punteada** entre ellos (no es una ruta; Leaflet no las traza). Todo llega relleno cuando se puede (`08` §3).

### Bloque 1 · ¿Dónde recogemos?

Dos opciones grandes:

- **En un negocio:** buscador en vivo (nombre, etiquetas y descripción). Al elegir se completan pin, nombre, teléfono, referencia y tiempo típico de preparación. Los negocios con perfil en Tindivo muestran además **«Ver carta en Tindivo»** (`08` §4).
- **Con una persona o en otro lugar:** se marca el punto en el mapa y se piden **referencia escrita** (obligatoria) y **nombre y teléfono de quien entrega**. Para el caso «lo mando yo», un atajo **«Es mío: usar mi ubicación y mis datos»**.

### Bloque 2 · ¿Dónde entregamos?

- Punto en el mapa, con **«usar mi ubicación»** que coloca el pin en el GPS y rellena la dirección. **Referencia escrita obligatoria.**
- **Nombre y teléfono de quien recibe** (obligatorios; se rellenan con los del cliente).
- Fuera del polígono: **«Por ahora solo llegamos dentro de San Jacinto.»**
- **Indicaciones para el motorizado** (opcional, hasta 140 caracteres): «toca el timbre dos veces». Las ve al aceptar.

### Bloque 3 · ¿Qué llevamos? y ¿cuándo estará listo?

- **¿Qué llevamos?** Una línea (máx. ~120 caracteres). **Sin foto.**
- **A nombre de:** el nombre bajo el cual está el pedido en el negocio (obligatorio si A es un negocio). Es lo que el motorizado dice al llegar.
- **Recuadro opcional:** *«Es frágil o difícil de llevar (algo que se pueda voltear o romper)»*. Si se marca, el motorizado recibe una advertencia y el cliente ve: **«El motorizado confirmará si puede llevarlo.»**
- **¿Cuándo estará listo?** Chips: `Ya está listo` · `En 10 min` · `En 20 min` · `En 30 min`. Con `prep_tipico_min` del negocio se preselecciona el más cercano; con una persona, `Ya está listo`.
- **«Máximo 5 kg.»**

### Bloque 4 · Confirmar y quién paga

- Resumen A → B, qué se lleva, cuándo estará listo, y **precio: S/ 3**, visible **antes de iniciar sesión**.
- **Quién paga el transporte:**
  - A es un **negocio:** sin opciones. *«Pagas S/ 3 al recibir tu pedido.»*
  - A es una **persona:** el cliente **elige, sin opción marcada**: *«Paga quien entrega (se cobra al recoger)»* o *«Paga quien recibe (se cobra al entregar)»*.
- **Casillas obligatorias:** negocio → *«Ya pagué mi pedido en el negocio»*; persona → *«Lo que envío está permitido»* (enlace a `05`).
- Línea fija: **«Tindivo solo transporta. El contenido y la calidad del producto son responsabilidad del negocio.»**
- Botón: **Pedir entrega · S/ 3**. Si no hay sesión, se pide el celular **aquí** y **el pedido se envía solo** al terminar (`08` §6).

## 6. Después de pedir

- El pedido queda **«solicitado»** (aún **no confirmado**). Queda **confirmado cuando un motorizado lo acepta** y el cliente lo ve en pantalla.
- **Si nadie acepta en 15 minutos** (configurable), se cancela solo: **«No hubo motorizado disponible. Puedes intentarlo de nuevo.»** con botón **Reintentar**. No quedan solicitudes abiertas.
- **Seguimiento por estados** en pantalla, con el mapa fijo A–B y una moto como identidad. **No hay GPS en vivo** (no prometerlo).
- Cuando A es un negocio: **«Avísale al negocio que pasará un motorizado de Tindivo a nombre de [nombre].»** y el botón **«Avisar por WhatsApp»** (`wa.me`, solo si el negocio tiene WhatsApp) con el mensaje escrito: *«Hola, soy [nombre]. Pasará un motorizado de Tindivo a recoger mi pedido. Estará listo a las [hora]. Gracias.»*
- **WhatsApp de Tindivo: solo para consultas.** No se hacen pedidos por WhatsApp.

## 7. Estados

| Estado | Lo cambia | Nota |
|---|---|---|
| `requested` (solicitado) | Cliente | Espera que un motorizado acepte |
| `accepted` (aceptado) | Motorizado | **Aquí queda confirmado** |
| `heading_to_pickup` | Motorizado | «Salgo»: sale para llegar a la hora de listo |
| `at_pickup` | Motorizado | «Llegué»: **empieza la espera de 5 min** |
| `picked_up` | Motorizado | «Recogí» |
| `heading_to_dropoff` | Motorizado | |
| `delivered` | Motorizado | Cierra el pedido |
| `cancelled` | Cliente / motorizado / sistema | Guarda `cancel_reason` |

**Motivos de cancelación:** `no_driver`, `driver_rejected`, `not_ready`, `transport_unpaid`, `customer_cancelled`, `unreachable`, `other`.
`delivered` y `cancelled` son **terminales**. Las transiciones solo por RPC (`03` §4).

## 8. Lado del motorizado

**Un solo panel, no dos.** Las entregas aparecen en las pestañas **Disponibles** y **Míos**, junto a los pedidos de restaurante, con una insignia **«ENTREGA» en azul vibrante** (los restaurantes, naranja), **sin** la franja de «papelito» de los negocios, y con la pista de cómo llevarlo. Los pedidos de restaurante van **antes** que las entregas (*partners primero*). Técnicamente son dos tablas unidas en una lista con `kind: 'order' | 'courier'`.

**Antes de aceptar** ve lo necesario para decidir: zona de A y B, qué se lleva, cuándo estará listo, quién paga y dónde, frágil, precio. **Al aceptar** ve todo: direcciones y teléfonos exactos, «a nombre de», hora estimada de listo y **hora sugerida de salida** (listo − traslado; traslado fijo configurable), indicaciones del cliente. La solicitud **desaparece en tiempo real** de las listas de los demás; quien toque un instante tarde ve *«Ya lo tomó otro motorizado»*.

**Acciones:** `Aceptar` / `Rechazar` → `Salgo` → `Llegué` → `Cobré el transporte` (cuando toque) → `Recogí` → `Entregué`. Además: **Llamar**, **Reportar problema**, y **Soltar**.

**Recordatorio fijo:** *«El pedido ya está pagado. Cobra solo los S/ 3 del transporte.»*

**Soltar** (antes de recoger): el motorizado lo suelta para que lo tome un compañero, como en restaurantes (`release-sheet`). El caso real: *«me voy a un restaurante, te lo suelto»*, algo que se acuerda **hablando entre el equipo**. Vuelve a `requested` y **el reloj de 15 minutos NO se reinicia**.

**Puede rechazar** cualquier entrega que no pueda llevar con seguridad, **sin costo**. Puede tener **varias activas**; la app avisa si ya lleva comida.

## 9. Cobro del transporte

- El motorizado cobra **solo los S/ 3** (efectivo exacto o Yape **a su cuenta**) y marca **«Cobré el transporte»**. **Nunca paga ni cobra nada del producto.**
- **Efectivo exacto, sí o sí:** el motorizado no lleva vuelto. Si quien paga solo tiene un billete grande, paga por Yape.
- **Paga quien entrega:** se cobra en A **antes de llevarse el artículo**. **Paga quien recibe** (siempre en negocios): se cobra en B **antes de entregar**.
- Si quien debe pagar **no paga**: se cancela (`transport_unpaid`) y **el artículo vuelve a quien lo entregó**, o lo decide el admin si volver no tiene sentido (p. ej. comida ya entregada por un negocio).
- **Riesgo asumido:** con «paga quien recibe», si el receptor se niega, se pierde el viaje.
- Cómo se lleva la cuenta de ese dinero (deuda del motorizado, rendición diaria): `02`.

## 10. Cancelación y esperas — **sin recargos en ningún caso**

- **No está listo:** desde `Llegué`, el motorizado **espera hasta 5 minutos** y llama. Si sigue sin estar, cancela con `not_ready`. **No se cobra a nadie.**
- **Nadie en A o B:** llama dos veces, espera 5 minutos, cancela con `unreachable`. No se cobra.
- **Rechazo del motorizado:** antes de aceptar, o al llegar si no puede llevarlo con seguridad (`driver_rejected`). Sin costo.
- **Cancelación del cliente:** sin costo **hasta que el motorizado llega a A**; se guarda el motivo. Un contador por teléfono de cancelaciones del cliente en 14 días es visible en el admin (sin bloqueo automático).

## 11. Casos borde

| Caso | Manejo |
|---|---|
| El negocio no responde o está cerrado | Aplica «no está listo» |
| El pedido no está pagado | El motorizado no paga; se cancela con motivo y se avisa |
| Reclamo por el producto | Se redirige al negocio |
| Punto A o B mal marcado | El motorizado llama y corrige por teléfono |
| Receptor distinto del cliente en un pedido de negocio | Paga quien recibe; se dice claro en el bloque 4 |
| Fuera de horario o sin motorizado | Botón deshabilitado con su motivo |
| Doble toque al pedir | Idempotencia: se devuelve el mismo pedido |
| Un cliente con un pedido activo intenta otro | *«Ya tienes una entrega en curso.»* Un pedido a un restaurante **no** cuenta: son independientes |

## 12. Reglas de validación

- Negocio: exigir `place`, `on_behalf_of`, `prepaid_confirmed = true` y `payer = receiver`. Persona: exigir `payer` elegido.
- Teléfonos de 9 dígitos. A y B dentro del polígono. Rechazar fuera de horario, pausado o sin motorizado.
- **Un solo pedido activo por teléfono** (`courier.maxActivePerPhone = 1`).
