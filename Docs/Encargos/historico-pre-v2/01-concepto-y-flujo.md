# 01 · Concepto y flujo de Encargos

> ⚠️ **En revisión:** los documentos de «Recojo» de Jesús traen discrepancias (nombre, precio, hora de listo, espera, cancelación, estados, alcohol). Ver **`07-integracion-recojo.md`**; donde discrepen, manda `07`. Las «notas del motorizado» **se eliminaron** de v1.
>
> v0.3 · 2026-09-19 · decisiones de Jesús incorporadas (pago al recoger o al entregar, **S/ 3 fijo**, dinero al motorizado, solo recojo y entrega). Lo que aparece como **[D-xx]** remite a `04-decisiones-abiertas.md`.
> Identificadores de código en inglés, textos de UI en español peruano (convención del repo).

---

## 1. Quién es quién

| Rol | Quién | Notas |
|---|---|---|
| **Cliente (quien pide)** | Usuario de `tindivo.com`, con sesión y teléfono verificado por OTP | Crea el encargo y **escribe él mismo A y B**. Puede estar en cualquiera de los dos puntos: en «que me traigan algo» está en B; en «que lleven algo» está en A. |
| **Contacto en A** | Quien entrega el artículo al motorizado | Nombre + teléfono. **No necesita cuenta.** |
| **Contacto en B** | Quien lo recibe | Nombre + teléfono. **No necesita cuenta.** |
| **Motorizado** | El de Tindivo (`drivers`), ya existente | Encargos se suma a lo que ya hace; no es un rol nuevo. |
| **Admin** | Jesús | Activa el servicio, fija el precio, carga la cuenta de Tindivo para las rendiciones, confirma la deuda que rinden los motorizados y resuelve incidencias. |

No hay **negocio** ni **cajera**. Ese es el cambio de fondo: todo lo que en un pedido de restaurante hacía la cajera (aceptar, validar, cobrar la comisión) o desaparece o lo hace el admin.

---

## 2. Flujo del cliente (`apps/customer`)

Objetivo de UX: parecerse al courier de InDrive —pocas pantallas, un dato por paso, precio claro antes de pedir—, con el estilo de Tindivo (`DECISIONS §16`: cercano, naranja, bordes redondeados, un solo icono set).

### Paso 0 · Entrada

Botón **«Encargos»** en el home de `tindivo.com`. Sin sesión se puede **ver la pantalla**, y el login se exige al continuar (onboarding diferido, `DECISIONS §15`). Si el servicio está apagado o fuera de horario, el botón lo dice con su motivo; no desaparece.

Bajo el título, **siempre visible**: *«Solo recojo y entrega. No hacemos compras.»* (`05` §1).

### Paso 1 · ¿Qué llevamos?

Detalle completo de categorías, límites y prohibidos en **`05-que-se-puede-llevar.md`**.

| Campo | Regla propuesta |
|---|---|
| **Categoría** | Se elige de un **catálogo de categorías permitidas** (documentos, comida lista, bebidas, medicinas, ropa, llaves y objetos pequeños, paquete cerrado). **No hay «Otro»** y **el alcohol no se anuncia aparte** (`05` §4). Cada una trae sus reglas (`05` §2) |
| **Descripción** | Texto libre, 5–140 caracteres (mismo criterio que la referencia de dirección) |
| **Valor aproximado** (S/) | Número, **máx. S/ 200** por defecto (configurable por categoría). Ver «Para qué sirve el valor» abajo |
| **Cabe en la mochila** | Casilla obligatoria, junto a una **imagen de la mochila con sus medidas: 45 × 45 × 45 cm** |
| **Reglas de la categoría** | Se muestran al elegirla (envase cerrado, compartimento aparte, etc.); se aceptan junto con los términos, **sin casillas adicionales por categoría** |

**Para qué sirve el valor declarado** (conviene fijarlo porque es fácil confundirlo): **no se cobra ni se reembolsa nada con él.** Sirve para (a) poner un tope de lo que Tindivo acepta transportar, (b) fijar hasta dónde llega la responsabilidad si algo se pierde, y (c) avisar al motorizado de que lleva algo delicado.

### Principio de pantalla: **el mapa es lo principal**

Decisión de Jesús: en todo el pedido de un encargo **el mapa ocupa la parte central de la pantalla**, como en el courier de InDrive, porque de él depende que el motorizado llegue al lugar correcto.

- El mapa se ve **grande** desde el primer paso; la ficha con dirección, referencia y teléfono se apoya sobre él (hoja inferior), no al revés.
- Botón **«Usar mi ubicación actual»**: toma el GPS y **coloca el punto ahí** y rellena la dirección. Debe poder hacerse **en A o en B**, según dónde esté la persona. Se reutiliza lo que ya existe (`lib/geolocation.ts`, `location-sheet.tsx`, `map-picker.tsx`), incluida la validación de precisión.
- Se puede **mover el pin** para afinar el punto; la referencia escrita (15–140 caracteres) sigue siendo obligatoria.
- Con A y B puestos, el mapa muestra **los dos pines y una línea recta punteada** entre ellos. **No es una ruta por calles**: Leaflet no calcula rutas y tampoco hace falta (no cambia el precio). Se dibuja con una `Polyline` de Leaflet (unas cinco líneas de código, sin dependencias nuevas).

**Decisión de Jesús: empezar así**, aunque el camino real no sea recto, porque el cliente necesita *ver* que se conectan A y B. Para que no se confunda con una ruta: **línea fina y punteada**, de un color suave, **sin flechas ni distancia en kilómetros**, y el mapa se **encuadra automáticamente** para que se vean los dos pines. Si algún día se quiere una ruta real por calles, es `06` B-3.

### Paso 2 · ¿En qué sentido? y Punto A — dónde recoge

Un selector de dos opciones (**aprobado por Jesús**, [D-15]), porque el caso más común es *«que me traigan un documento de la casa de un amigo»*, y ahí **mi dirección es B, no A**:

- **«Que me traigan algo»** → B se rellena con mi dirección; yo escribo A.
- **«Que lleven algo»** → A se rellena con mi dirección; yo escribo B.

Sea cual sea el sentido, **el cliente escribe los dos puntos**.

- **Dirección por defecto (en el lado que es mío):** la del perfil del cliente (`customer_profiles.default_address` + coordenadas), ya guardada al registrarse. Botón «Cambiar» abre el mapa.
- **Mapa** con el mismo componente del checkout (`apps/customer/components/map-picker.tsx`, Leaflet + OSM). El punto debe caer dentro del polígono de cobertura (`app_settings.coverage_polygon`).
- **Contacto en A:** nombre y teléfono. Se rellenan con los del perfil; editable.
- **Referencia:** obligatoria, la escribe el cliente (15–140 caracteres, mismo contador en vivo que el resto de formularios, `DECISIONS §13 #12`).

### Paso 3 · Punto B — adónde lleva

- Mapa + dirección escrita + **referencia obligatoria** (15–140).
- **Nombre y teléfono de quien recibe.** El motorizado necesita poder llamarlo.
- **Lo escribe el cliente que pide**, no un tercero (confirmado, [D-05]).

### Paso 4 · Resumen y pago

- Tarjeta con A → B y **precio: S/ 3** (fijo; por distancia más adelante, ver `02` §2). Sin regateo: a diferencia de InDrive, la tarifa la pone Tindivo. El cliente ve **lo que va a pagar** antes de pedir, y **antes de iniciar sesión** (`08`).
- **Indicaciones para el motorizado** (opcional, hasta 140 caracteres): lo que el cliente quiere que el motorizado sepa («toca el timbre dos veces», «pregunta por Rosa»). **El motorizado las ve al aceptar.**
- **¿Cuándo pagas?** Dos opciones, como en InDrive (`02` §3):
  - **Al entregar** *(por defecto)*: paga quien recibe en B.
  - **Al recoger**: paga quien entrega en A.
- **¿Cómo pagas?** *Yape / Plin al motorizado* o *Efectivo exacto*.
  - Con efectivo se muestra, en grande: **«Paga el monto exacto. El motorizado no lleva vuelto.»**
- Se dice claro que **el artículo no se entrega hasta que se pague**.
- Casilla de términos (prohibidos, responsabilidad, política de espera).
- Botón **«Pedir motorizado»**. La creación es idempotente (`Idempotency-Key`, `DECISIONS §12`), para que un doble toque no cree dos encargos.

### Paso 5 · «Buscando motorizado…»

Pantalla de espera con **contador regresivo** (mismo patrón que la espera de restaurantes, `countdown-bar`), la ruta A → B y **Cancelar** (libre en esta etapa). Si nadie acepta en **15 minutos** (decidido, [D-14]: es lo máximo que puede tardar un motorizado en terminar lo que trae entre manos), el encargo pasa solo a `expired` —**no quedan solicitudes abiertas**—, se le avisa al cliente y se le ofrece **reintentar** con un toque.

### Paso 6 · Seguimiento

Mismo patrón que el tracking de pedidos (`apps/customer/features/tracking`, con Supabase Realtime): pasos visibles, nombre y teléfono del motorizado una vez aceptado, botón «Llamar». Más un **enlace público** `tindivo.com/encargos/<shortId>` con lo mínimo, que el cliente puede mandarle al destinatario por WhatsApp.

Pasos que ve el cliente (proyección de los estados internos):

| Paso visible | Estados internos |
|---|---|
| Buscando motorizado | `searching` |
| Motorizado en camino a recoger | `heading_to_pickup`, `at_pickup` |
| En camino a entregar | `in_transit`, `at_dropoff` |
| Entregado | `delivered` |
| Cancelado / Sin respuesta | `cancelled` / `expired` |

---

## 3. Flujo del motorizado (`apps/motorizados`)

### Entrada

- **Push «Nuevo encargo»** (a todos los motorizados; *notificar no es asignar*, `DECISIONS §25`).
- **Un solo panel, no dos** (decisión de Jesús). Los encargos aparecen en las mismas pestañas **Disponibles** y **Míos** (`available-tab`, `mine-tab`) junto a los pedidos de restaurante, **etiquetados de forma inconfundible**: una insignia **«ENCARGO»** con **su propio color, un azul vibrante** (Jesús: «algún azul vibrante, es un ejemplo»; el naranja es de los restaurantes) e icono, distinta de la franja del «papelito de color» de los negocios (que un encargo **no tiene**: no hay negocio). Cada tarjeta dice además cómo llevarlo (p. ej. *«Compartimento aislado»* para medicinas y bebidas). Técnicamente son dos tablas; la app las une en una lista con un discriminante `kind: 'order' | 'errand'` y una tarjeta propia (`errand-card`) al lado de `order-card`.

### Antes de aceptar (tarjeta)

Ve lo necesario para decidir, **sin teléfonos ni direcciones exactas** (Jesús: «al momento de aceptar ya ve toda la información»):

- Categoría y valor declarado; «cabe en mochila»; pista de manejo («compartimento aislado»).
- Zona de A y de B (referencia), distancia y **precio**.
- Cuándo se paga y cómo (al recoger o al entregar · efectivo exacto / Yape).

**Al aceptar y entrar**, encuentra una **tarjeta de resumen con toda la información**: las dos direcciones exactas, los teléfonos de contacto, las **indicaciones del cliente**, el precio y cuándo cobrar. Los encargos aceptados viven en **Míos**, como los pedidos de restaurante.

### Aceptar

**Primero en aceptar gana** (FCFS, atómico en base de datos, no optimista en cliente: es una carrera). Al ganar, se revelan direcciones exactas y teléfonos, y **la solicitud desaparece en tiempo real de la lista de los demás motorizados**. Quien toque un instante tarde ve *«Ya lo tomó otro motorizado»*. Entre semana hay un solo motorizado (D-17), así que la carrera importa sobre todo los fines de semana.

### Avance

```
Aceptar → «Voy a A» → «Llegué a A» → «Recogí» → «Llegué a B» → «Entregué»
```

| Acción | Qué pasa | Detalle |
|---|---|---|
| **Aceptar** | `searching → heading_to_pickup` | Empieza el reloj del encargo. |
| **Llegué a A** | `→ at_pickup` | Empieza la espera en la puerta (5 min, como `noShowWaitMinutes`). |
| **Recogí** | `→ in_transit` | Si el cliente eligió **pago al recoger**, la app **no deja** pulsarlo hasta registrar el cobro. |
| **Llegué a B** | `→ at_dropoff` | Aviso al cliente y a quien recibe (por el enlace de seguimiento). |
| **Entregué** | `→ delivered` | Si el cliente eligió **pago al entregar**, la app **no deja** pulsarlo hasta registrar el cobro. Terminal. *(La foto al entregar es `06` B-13, después.)* Suma el precio del encargo (S/ 3) a la deuda del motorizado (`02` §5). |

Además, en cualquier punto: **Llamar** al contacto de A o B, y **Reportar problema** (no encuentro la dirección, no contestan, artículo distinto al declarado, sospechoso). El motorizado **nunca cancela por su cuenta**: reporta y decide el admin (regla vigente para pedidos, `DECISIONS §5`).

**Soltar un encargo aceptado** (decisión de Jesús). Antes de recoger, el motorizado puede **soltarlo** para que lo tome un compañero, igual que en restaurantes (`release-sheet`, `OrderReleased`). El caso real que describió: *«acepté un encargo, pero me voy a ir a este restaurante, así que te lo suelto para que tú lo cojas»*, algo que se acuerda **hablando entre el equipo**, no una regla del sistema. El encargo vuelve a `searching` y sale a las listas de los demás con un aviso. **El reloj de 15 minutos no se reinicia** al soltar (Jesús): sigue igual que en restaurantes.

### Cobro en la puerta

Con **efectivo**, se muestra el monto exacto en grande; si quien paga no tiene exacto, la app propone cobrar por Yape. Con **Yape**, se muestra **el QR del propio motorizado** (billetera, número y titular, el mismo patrón que `business_payment_qrs`, `0184`) y él confirma **al ver el ingreso en su celular**. El dinero es suyo hasta que lo rinde: `02` §4 y §5.

Un motorizado **sin método de cobro cargado en su perfil** no puede aceptar encargos.

---

## 4. Flujo del admin (`apps/admin`)

- **Interruptor** «Encargos activos» + horario del servicio.
- **Lista de encargos** en vivo (estado, motorizado, tiempo, monto), con filtros.
- **Precio** (S/ 3 y, más adelante, escalones por distancia) y **cuenta de Tindivo** para que los motorizados rindan por Yape (billetera, número, titular, imagen).
- **Incidencias:** los reportes de los motorizados llegan a la bandeja del admin (mismo patrón que `no_show`, `cash_difference`, etc.).
- **Deuda viva por motorizado** y rendiciones que confirmar o disputar (ver `02` §5).
- Cancelación forzada de un encargo, con motivo.

---

## 5. Máquina de estados (propia de Encargos)

```
searching ──accept──► heading_to_pickup ──arrive_pickup──► at_pickup
                                                              │ pickup (cobra aquí si pay_at = pickup)
                                                              ▼
                     delivered ◄──deliver── at_dropoff ◄── in_transit
                                              (arrive_dropoff)

searching ──(sin motorizado a tiempo)──► expired
cualquiera no terminal ──► cancelled
```

- **Terminales:** `delivered`, `cancelled`, `expired`. Igual que en pedidos: **`delivered` no tiene vuelta**, y así ninguna función tiene que razonar sobre reversiones.
- `expired` es distinto de `cancelled`: nadie decidió nada, se acabó el plazo. Los reportes no deben mezclarlos.
- Las transiciones se hacen **solo por RPC** (`advance_errand`, `service_role`), no con `UPDATE` directo, para que cada salto escriba su marca de tiempo, su fila de historial y su evento en el outbox en la **misma transacción** (invariante 4 de `CLAUDE.md`).

---

## 6. Casos borde y reglas

| Caso | Regla propuesta |
|---|---|
| **Nadie acepta** | A los **15 min** → `expired`, aviso al cliente, botón reintentar. *(Los avisos al admin se trabajan después, junto con el panel del admin.)* |
| **Fuera del horario** | Solo de noche por ahora (D-22). El botón se ve, deshabilitado, con *«Encargos atiende de 6 pm a 11 pm»*. |
| **Cliente cancela** | Libre mientras `searching` y hasta que el motorizado llega a A. Desde `at_pickup` o después, solo por admin. [D-10] |
| **No hay nadie en A** | Espera de 5 min en la puerta, con llamada. Luego el motorizado reporta → admin decide → cancelado con cargo o sin él. [D-10] |
| **Nadie recibe en B, o no quiere pagar** | Espera 5 min + llamadas. **El artículo se queda con el motorizado** (no se deja en la puerta ni se entrega sin cobrar). Reporta; el admin decide: devolver a A, reintentar o cerrar. Sin entrega no hay deuda. |
| **Entregó sin cobrar** | Queda en deuda del motorizado (`02` §5.1) y se abre incidencia; el admin puede condonarla con nota. |
| **El artículo no es lo declarado / es prohibido** | El motorizado **no lo recoge** y reporta. El servicio se cobra por la visita si ya se llegó a A [D-10]. |
| **Cliente sin teléfono verificado** | No puede pedir (mismo guard que el checkout). |
| **Fuera de cobertura (A o B)** | El mapa no deja fijar el punto; mensaje claro. |
| **Servicio apagado / fuera de horario** | El botón se muestra deshabilitado **con su motivo** (mismo criterio que «Cerrado» en negocios). |
| **Motorizado con pedidos de restaurante en curso** | Panel único, bien etiquetado [D-08]. **Sin límite duro** de encargos activos (propuesta [D-25], por confirmar): la app **avisa** si ya lleva comida o varios encargos, pero deja aceptar. |
| **Doble toque al pedir** | Idempotencia; se devuelve el mismo encargo. |
