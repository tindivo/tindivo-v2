# 01. Flujo de Recojo / Envío

> Lee primero `00-maestro.md`. Adapta este flujo a lo que ya existe en el código (flujo de encargos actual, entidad de pedidos, app del motorizado). Si ya hay tablas o pantallas equivalentes, extiéndelas en vez de crear paralelas.

## 1. Principios del flujo

- Un solo camino de 4 pasos, sin bifurcaciones visibles para el usuario.
- Mensaje fijo, visible desde el inicio de la pantalla:
  > **Solo recogemos y llevamos. No compramos ni pagamos por ti.**
- El usuario ve un solo nombre: **"Recojo"** (botón: "Recojo o envío" si hace falta ser más explícito). La diferencia interna (`tipo = negocio | persona`) no se le explica.
- Cada campo que no sea imprescindible se quita.

## 2. Puntos de entrada al flujo

| Entrada | Comportamiento |
|---|---|
| Tarjeta de un negocio (lista o mapa) → "Pedir recojo" | Abre el paso 1 con el negocio ya elegido; salta al paso 2 |
| Enlace `tindivo.com/r/<slug>` (QR o link del negocio) | Igual que la anterior |
| Botón/tarjeta "Recojo" en el home o en la navegación | Abre el paso 1 vacío |
| Sheet posterior a tocar "Llamar" (ver 04) | Abre con ese negocio ya elegido |
| "Otro lugar / persona" en el buscador | Abre el selector de punto en mapa (ver 03) |

Todo enlace acepta el parámetro `?src=` (`afiche`, `qr`, `whatsapp`, `catalogo`, `popup`, `home`) para medir el origen.

## 3. Pantallas

### Paso 1: ¿Dónde recogemos?

- Buscador con resultados en vivo (busca en nombre, etiquetas y descripción del negocio; ver 02). Cada resultado muestra logo, nombre y categoría.
- Al elegir un negocio se autocompleta: pin, nombre, teléfono, referencia y tiempo típico de preparación (si existe).
- Opción al final de la lista: **"Otro lugar o persona"** → abre el selector de punto (mapa) y pide:
  - Referencia escrita (obligatoria).
  - Teléfono de contacto en el punto A (obligatorio, para que el motorizado pueda llamar).

### Paso 2: ¿Dónde entregamos?

- Ubicación del cliente (pin en el mapa, con opción "usar mi ubicación" solo si el usuario la pulsa).
- Referencia escrita (obligatoria).
- Nombre del cliente y teléfono (obligatorios; prellenar si ya hay sesión).

### Paso 3: ¿Qué llevamos? y ¿cuándo estará listo?

- **¿Qué llevamos?**: una línea (máx. ~120 caracteres). Foto opcional.
- **A nombre de**: nombre con el que está registrado el pedido en el negocio (obligatorio si `tipo = negocio`).
- **¿Cuándo estará listo?**: chips de selección única:
  - `Ya está listo` · `En 10 min` · `En 20 min` · `En 30 min`
  - Si el negocio tiene `prep_tipico_min`, se preselecciona el chip más cercano.
  - **[PROPUESTA]** Solo minutos, no hora exacta. La programación por hora exacta queda en backlog.
- Para `tipo = persona`, se omite "A nombre de" y se puede omitir el tiempo (default `Ya está listo`).

### Paso 4: Confirmar

- Resumen: A → B, qué se lleva, cuándo estará listo.
- Precio: **`S/3`** (leído de configuración).
- Checkboxes obligatorios:
  - `tipo = negocio`: **"Ya pagué mi pedido en el negocio"**.
  - `tipo = persona`: **"Lo que envío está permitido"** (enlaza a las reglas de contenido, ver 02).
- Línea corta de términos, siempre visible: **"Tindivo solo transporta. El contenido y la calidad del producto son responsabilidad del negocio."**
- Botón: **Pedir recojo · S/3**.

## 4. Después de pedir

Pantalla de seguimiento (reutilizar la existente si la hay), con:

- Estado actual y mapa con el motorizado cuando esté en camino.
- Cuando `tipo = negocio`, mostrar arriba un aviso: **"Avísale al negocio que pasará un motorizado de Tindivo a nombre de [nombre]."**
- Botón **"Avisar por WhatsApp"** que abre `https://wa.me/<telefono_negocio>?text=...` con el mensaje ya escrito:
  > "Hola, soy [nombre]. Pasará un motorizado de Tindivo a recoger mi pedido. Estará a las [hora]. Gracias."
  (Solo si `tiene_whatsapp = true`. Es gratis y no requiere API.)

## 5. Estados del recojo

| Estado | Quién lo cambia | Nota |
|---|---|---|
| `solicitado` | Cliente | Espera asignación |
| `aceptado` | Motorizado / admin | Ya hay motorizado asignado |
| `en_camino_a_recoger` | Motorizado | Sale según la hora de listo |
| `en_punto_a` | Motorizado | Botón "Llegué" |
| `esperando` | Motorizado | Botón "No está listo": inicia el contador de espera |
| `recogido` | Motorizado | Botón "Recogí" |
| `en_camino_entrega` | Motorizado | |
| `entregado` | Motorizado | Cierra el pedido |
| `cancelado` | Cliente / admin / motorizado | Guardar `motivo_cancelacion` |

## 6. Lado del motorizado

Cada recojo debe mostrar:

- Negocio o punto A: nombre, **teléfono**, **referencia** y pin.
- **A nombre de [nombre]** (lo que debe decir al llegar: "vengo por el pedido de Juan").
- **Hora estimada de listo** y **hora sugerida de salida** (= hora de listo − tiempo de traslado estimado).
- Qué se lleva, teléfono del cliente y punto B.
- Recordatorio fijo: **"Pedido prepagado. No cobres ni pagues nada."**

Acciones: `Llegué` → (`No está listo`) → `Recogí` → `Entregué`.

## 7. Regla de espera **[POR CONFIRMAR: números]**

Propuesta base, todo configurable (ver 05):

- Tolerancia de espera gratuita: **10 minutos** desde `Llegué`.
- Pasada la tolerancia, recargo de **S/1** sumado al cliente.
- Pasados **20 minutos**, el motorizado puede cancelar; se cobra el viaje base (S/3) o la política que Jesús defina.
- El cliente ve una alerta clara antes de confirmar: "Si el pedido no está listo cuando llegue el motorizado, puede aplicarse un recargo."
- Para minimizar espera, la salida del motorizado se calcula para llegar a la hora de listo, no antes.

## 8. Cancelación **[POR CONFIRMAR]**

Propuesta:

- Antes de `aceptado`: cancelación libre.
- Después de `aceptado` y antes de `en_camino_a_recoger`: libre, con aviso.
- Desde `en_camino_a_recoger`: se cobra S/3 (el viaje ya se gastó).
- Cancelación por parte del motorizado o de Tindivo: siempre sin costo para el cliente.

## 9. Disponibilidad **[POR CONFIRMAR]**

- Interruptor en el panel admin: **Recojo disponible / pausado**, más un texto editable.
- Cuando está pausado, en lugar del botón de pedir se muestra: **"Recojo no está disponible ahora. Vuelve [horario]."** (evita aceptar pedidos que nadie atiende, por ejemplo cuando no se llama al motorizado adicional en un día flojo).
- Horario de servicio y responsables: por definir por Jesús.

## 10. Casos borde

| Caso | Manejo |
|---|---|
| El negocio no responde / está cerrado | Motorizado marca `No está listo`; se llama al cliente; aplica la regla de espera/cancelación |
| El pedido no está pagado | Motorizado no paga; se cancela con motivo; se avisa al cliente |
| El cliente no contesta en B | Llamar dos veces; esperar la tolerancia; luego cancelar con motivo (política por definir) |
| Reclamo por el producto | Redirigir al negocio (Tindivo solo transporta) |
| Punto A o B mal marcado | Motorizado llama; corrección por chat/teléfono |

## 11. Modelo de datos sugerido (entidad `recojos`)

Adapta o extiende la entidad de pedidos/encargos existente; si ya la hay, añade solo lo que falte.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | id | |
| `tipo` | enum | `negocio` / `persona` |
| `negocio_id` | fk, null | Solo si `tipo = negocio` |
| `a_lat`, `a_lng` | number | Punto A |
| `a_referencia` | text | |
| `a_telefono` | text | Contacto en A |
| `b_lat`, `b_lng` | number | Punto B |
| `b_referencia` | text | |
| `cliente_nombre`, `cliente_telefono` | text | |
| `descripcion` | text | Qué se lleva |
| `foto_url` | text, null | |
| `a_nombre_de` | text, null | Nombre del pedido en el negocio |
| `listo_en_min` | int | Opción elegida |
| `listo_at` | datetime | Calculado al pedir |
| `prepagado_confirmado` | bool | Checkbox del cliente |
| `precio_base` | decimal | Copia de configuración al pedir |
| `recargo_espera` | decimal | default 0 |
| `precio_total` | decimal | |
| `promo_aplicada` | text, null | |
| `estado` | enum | Ver sección 5 |
| `motorizado_id` | fk, null | |
| `llego_a_at`, `espera_min` | datetime / int | Para métricas de espera |
| `origen` | text | Valor de `?src=` |
| `motivo_cancelacion` | text, null | |
| `created_at`, `updated_at` | datetime | |

## 12. Validaciones

- `tipo = negocio`: exigir `negocio_id`, `a_nombre_de`, `prepagado_confirmado = true`.
- Teléfonos: formato peruano de 9 dígitos.
- Rechazar el pedido si Recojo está pausado.
- Un mismo teléfono no puede tener más de N recojos activos simultáneos (N = 2 sugerido) para evitar abuso.
