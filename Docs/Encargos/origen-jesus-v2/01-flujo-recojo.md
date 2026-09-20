# 01. Flujo de Tindivo Recoge y Lleva

> Lee primero `00-maestro.md`. Adapta este flujo a lo que ya existe en el código (flujo de encargos actual, entidad de pedidos, app del motorizado). Si ya hay tablas o pantallas equivalentes, extiéndelas en vez de crear paralelas. Nombre visible al usuario: **"Recoge y Lleva"**. El nombre técnico interno sigue siendo `recojo`.

## 1. Principios

- Un solo camino de 4 pasos, sin bifurcaciones que el usuario tenga que entender.
- Mensaje fijo visible desde el inicio:
  > **Solo recogemos y llevamos. No compramos ni pagamos por ti.**
- El artículo debe estar **coordinado, pagado y listo** antes de solicitar.
- **Sin foto.** Solo texto.
- **Sin recargos.** Si algo no se puede cumplir, se cancela y no se cobra.

## 2. Disponibilidad

- **Horario: todos los días, de 6 pm a 11 pm** (configurable). **Zona: solo San Jacinto.**
- Fuera de horario, el botón de pedir se reemplaza por: **"Recoge y Lleva atiende todos los días de 6 pm a 11 pm."** No se aceptan solicitudes programadas.
- Interruptor manual en el admin: **disponible / pausado**, con texto editable. Cuando está pausado se muestra: **"Recoge y Lleva no está disponible ahora."**

## 3. Puntos de entrada

| Entrada | Comportamiento |
|---|---|
| Tarjeta de un negocio (lista o mapa) → "Pedir Recoge y Lleva" | Abre el paso 1 con el negocio elegido y salta al paso 2 |
| Enlace `tindivo.com/r/<slug>` (QR o link del negocio) | Igual que el anterior |
| Botón "Recoge y Lleva" en la navegación o tarjeta en el home | Abre el paso 1 vacío |
| Aviso posterior a "Llamar" (ver 04) | Abre con ese negocio elegido |

Todo enlace acepta `?src=` (`afiche`, `qr`, `whatsapp`, `catalogo`, `popup`, `home`, `redes`).

## 4. Pantallas

### Paso 1: ¿Dónde recogemos?

Dos botones grandes:

- **En un negocio:** buscador con resultados en vivo (nombre, etiquetas y descripción; ver 02). Al elegir un negocio se autocompleta: pin, nombre, teléfono, referencia y tiempo típico de preparación (si existe).
- **Con una persona o en otro lugar:** se marca el punto en el mapa y se piden:
  - Referencia escrita (obligatoria).
  - **Nombre y teléfono de quien entrega** (obligatorios, para que el motorizado pueda llamar).

### Paso 2: ¿Dónde entregamos?

- Punto de entrega en el mapa (con "usar mi ubicación" solo si el usuario lo pulsa) y referencia escrita (obligatoria).
- **Nombre y teléfono de quien recibe** (obligatorios; se prellenan con los del cliente).
- Solo se aceptan puntos dentro de San Jacinto; fuera de la zona se muestra: **"Por ahora solo llegamos dentro de San Jacinto."**

### Paso 3: ¿Qué llevamos? y ¿cuándo estará listo?

- **¿Qué llevamos?**: una línea de texto (máx. ~120 caracteres). Sin foto.
- **A nombre de**: nombre bajo el cual está el pedido en el negocio (obligatorio si el punto A es un negocio).
- **Recuadro opcional:** "Es frágil o difícil de llevar (algo que se pueda voltear o romper)". Si se marca, el pedido llega al motorizado con una advertencia y el cliente ve: **"El motorizado confirmará si puede llevarlo."**
- **¿Cuándo estará listo?** Chips de selección única: `Ya está listo` · `En 10 min` · `En 20 min` · `En 30 min`. Si el negocio tiene `prep_tipico_min`, se preselecciona el más cercano. Con una persona, el valor por defecto es `Ya está listo`.
- Recordatorio corto: **"Máximo 5 kg."**

### Paso 4: Confirmar y quién paga

- Resumen: A → B, qué se lleva y cuándo estará listo.
- Precio: **S/3** (leído de configuración).
- **Quién paga el transporte:**
  - Punto A es un **negocio**: sin opciones. Texto: **"Pagas S/3 al recibir tu pedido."**
  - Punto A es una **persona**: el cliente elige, sin opción marcada de antemano: **"Paga quien entrega (se cobra al recoger)"** o **"Paga quien recibe (se cobra al entregar)"**.
- Checkboxes obligatorios:
  - Negocio: **"Ya pagué mi pedido en el negocio."**
  - Persona: **"Lo que envío está permitido"** (enlace a las reglas, ver 02).
- Línea fija de términos: **"Tindivo solo transporta. El contenido y la calidad del producto son responsabilidad del negocio."**
- Botón: **Pedir Recoge y Lleva · S/3**.

## 5. Confirmación y seguimiento

- Al pulsar "Pedir", el pedido queda **solicitado** (aún no confirmado).
- Queda **confirmado** cuando **un motorizado lo acepta en su app**. El cliente lo ve en pantalla.
- Si **nadie acepta en 10 minutos** (valor configurable), el pedido se cancela solo y se avisa: **"No hubo motorizado disponible. Puedes intentarlo de nuevo."** *(Regla que se agregó para no dejar solicitudes colgadas; es editable.)*
- **Seguimiento por estados** en pantalla (sin GPS en vivo).
- Cuando el punto A es un negocio, mostrar arriba: **"Avísale al negocio que pasará un motorizado de Tindivo a nombre de [nombre]."**
- Botón **"Avisar por WhatsApp"** con el mensaje ya escrito (solo si el negocio tiene WhatsApp): `https://wa.me/<telefono>?text=...`
  > "Hola, soy [nombre]. Pasará un motorizado de Tindivo a recoger mi pedido. Estará listo a las [hora]. Gracias."
- WhatsApp de Tindivo (solo consultas): enlace visible en la pantalla de seguimiento.

## 6. Estados

| Estado | Quién lo cambia | Nota |
|---|---|---|
| `solicitado` | Cliente | Espera que un motorizado acepte |
| `aceptado` | Motorizado | **Aquí queda confirmado** |
| `en_camino_a_recoger` | Motorizado | Sale para llegar a la hora de listo |
| `en_punto_a` | Motorizado | Botón "Llegué". Inicia el conteo de 5 minutos |
| `recogido` | Motorizado | Botón "Recogí" |
| `en_camino_entrega` | Motorizado | |
| `entregado` | Motorizado | Cierra el pedido |
| `cancelado` | Cliente / motorizado / sistema | Guardar `motivo_cancelacion` |

Motivos: `sin_motorizado`, `rechazado_por_motorizado`, `no_estaba_listo`, `no_pago_transporte`, `cliente_cancela`, `no_contesta`, `otro`.

## 7. Cobro del transporte

- El motorizado cobra **solo los S/3 de transporte** (efectivo o Yape) y marca **"Cobré el transporte"** en su app.
- **Paga quien entrega:** se cobra en el punto A **antes de llevarse el artículo**.
- **Paga quien recibe** (siempre en negocios): se cobra en el punto B **antes de entregar**.
- El motorizado **nunca paga ni cobra nada del producto**.
- Si quien debe pagar no paga: **el pedido se cancela** (`no_pago_transporte`) y **el artículo vuelve a quien lo entregó**.
- **Riesgo asumido:** con "paga quien recibe", si el receptor se niega, se pierde el viaje.

## 8. Lado del motorizado

Cada pedido muestra: negocio o punto A (nombre, teléfono, referencia, pin), **"a nombre de [nombre]"**, **hora estimada de listo**, hora sugerida de salida (hora de listo menos el traslado), qué se lleva, punto B con teléfono y referencia, **quién paga y en qué punto**, y la advertencia de frágil si está marcada.

Acciones: `Aceptar` / `Rechazar` → `Llegué` → `Cobré el transporte` (cuando toque) → `Recogí` → `Entregué`.

Recordatorio fijo: **"El pedido ya está pagado. Cobra solo los S/3 del transporte."**

## 9. Cancelación y esperas

- **Sin recargos en ningún caso.**
- **No está listo:** desde `Llegué`, el motorizado espera **hasta 5 minutos** y llama. Si sigue sin estar listo, cancela con motivo `no_estaba_listo`. No se cobra a nadie.
- **Nadie en el punto A o B:** llamar dos veces y esperar 5 minutos; luego cancelar con motivo `no_contesta`. No se cobra.
- **Rechazo del motorizado:** puede rechazar antes de aceptar, o cancelar al llegar si el artículo no se puede llevar con seguridad (`rechazado_por_motorizado`). Sin costo.
- **Cancelación del cliente:** sin costo hasta que el motorizado llega al punto A; se guarda el motivo. Si un mismo teléfono cancela con frecuencia, se revisa en el admin.

## 10. Casos borde

| Caso | Manejo |
|---|---|
| El negocio no responde o está cerrado | Aplica lo de "no está listo" |
| El pedido no está pagado | El motorizado no paga; se cancela con motivo y se avisa al cliente |
| Reclamo por el producto | Se redirige al negocio (Tindivo solo transporta) |
| Punto A o B mal marcado | El motorizado llama y corrige por teléfono |
| Receptor distinto del cliente en un pedido de negocio | Paga quien recibe; se dice claro en el paso 4 |

## 11. Modelo de datos sugerido (entidad `recojos`)

Adapta o extiende la entidad de pedidos/encargos existente; si ya existe, añade solo lo que falte.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | id | |
| `tipo` | enum | `negocio` / `persona` |
| `negocio_id` | fk, null | Solo si `tipo = negocio` |
| `solicitante_nombre`, `solicitante_telefono` | text | Quien pide |
| `a_lat`, `a_lng`, `a_referencia` | number, text | Punto A |
| `a_contacto_nombre`, `a_contacto_telefono` | text | Quien entrega (en negocio, el del negocio) |
| `b_lat`, `b_lng`, `b_referencia` | number, text | Punto B |
| `b_contacto_nombre`, `b_contacto_telefono` | text | Quien recibe |
| `descripcion` | text | Qué se lleva. **Sin foto** |
| `a_nombre_de` | text, null | Nombre del pedido en el negocio |
| `fragil` | bool | Recuadro del paso 3 |
| `listo_en_min` | int | Opción elegida |
| `listo_at` | datetime | Calculado al pedir |
| `prepagado_confirmado` | bool | Checkbox del cliente |
| `paga_transporte` | enum | `quien_entrega` / `quien_recibe` |
| `precio_base`, `precio_total` | decimal | Copia de configuración al pedir (sin recargo) |
| `transporte_cobrado_at` | datetime, null | Marca "Cobré el transporte" |
| `promo_aplicada` | text, null | |
| `estado` | enum | Ver sección 6 |
| `motorizado_id` | fk, null | |
| `aceptado_at`, `llego_a_at`, `recogido_at`, `entregado_at` | datetime | Para tiempos y métricas |
| `origen` | text | Valor de `?src=` |
| `motivo_cancelacion` | text, null | |
| `created_at`, `updated_at` | datetime | |

## 12. Validaciones

- `tipo = negocio`: exigir `negocio_id`, `a_nombre_de`, `prepagado_confirmado = true` y `paga_transporte = quien_recibe`.
- `tipo = persona`: exigir `paga_transporte` elegido explícitamente.
- Teléfonos: formato peruano de 9 dígitos.
- Puntos A y B dentro del área de San Jacinto.
- Rechazar solicitudes fuera de horario o con el servicio pausado.
- Un mismo teléfono no puede tener más de 2 pedidos activos a la vez.
