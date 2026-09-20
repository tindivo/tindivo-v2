# 09 · Análisis de la segunda versión de los documentos de Jesús

> ✅ **RESUELTO (2026-09-19).** Jesús decidió: nombre **«Tindivo Entregas»** (ni «Recoge y Lleva» ni «Courier»), **15 minutos** para aceptar, **un solo pedido activo por teléfono** y **alcohol con la redacción de v2**. Nombre técnico interno **`courier`** (asumido; no lo objetó). El servicio se pausa solo sin motorizado, y aliados en naranja. Con eso se **actualizó `01`–`06` a v1.0** (versiones anteriores en `historico-pre-v2/`). Este archivo queda como **registro del razonamiento**; lo vigente está en `04-decisiones-abiertas.md`. Donde diga «Recoge y Lleva», léase «Tindivo Entregas».

> 2026-09-19. Jesús pasó una versión actualizada (`origen-jesus-v2/`, siete archivos: los seis anteriores más un **brief de publicidad**) y pidió **primero un análisis**, para decidir después si se actualiza o no lo que ya está en `01`–`08`.
> **Este archivo no cambia nada de `01`–`08`.** Compara, evalúa y propone. Criterio, como dijo Jesús: **lo que sea mejor para el negocio**, no quién lo escribió.

---

## 0. Resumen

1. **Casi todos los cambios son mejoras.** Los documentos v2 **simplifican** (sin recargos, sin foto, sin categorías del artículo, una espera de 5 minutos) y **cierran huecos** que yo había señalado: el nombre, quién paga, el horario, el peso, cómo se confirma un pedido. Recomiendo **adoptarlos**.
2. **Nombre.** Jesús propone ahora **«Tindivo Courier»**, mientras que sus documentos v2 ya definen **«Tindivo Recoge y Lleva»** (y el brief de publicidad está escrito con él). Mi recomendación: **«Recoge y Lleva» como nombre público**, y **«courier» como nombre técnico interno en inglés** (sección 4).
3. **Hay contradicciones** entre los documentos v2 y lo que Jesús me dijo en el chat (10 vs 15 minutos, 2 vs 1 pedidos activos, rojo vs naranja, alcohol). Están en la sección 3 y **hay que resolverlas antes de imprimir el afiche**, porque el brief las convierte en promesas al público.
4. **Lo que los v2 no tienen y mis documentos sí:** cómo se lleva la cuenta del dinero del motorizado (la deuda y la rendición), su Yape, el panel único del motorizado, el diseño técnico (RLS, tablas, RPC, push) y el UX de conversión. **Lo que mis documentos no tenían y los v2 sí:** el objetivo de negocio, el directorio como canal, la hora de listo, el kit para negocios, el afiche y las métricas de decisión.
5. **Recomendación:** **sí, actualizar `01`–`08`**, pero **solo lo que cambia** (sección 7), y **antes** resolver las 9 decisiones de la sección 8.

---

## 1. Qué cambió (v1 → v2)

| Tema | Versión 1 | Versión 2 |
|---|---|---|
| **Nombre público** | «Recojo» | **«Tindivo Recoge y Lleva»**. Nunca «Recojo», «encargos» ni «mandado» hacia el usuario. Nombre técnico interno: `recojo` |
| **Quién paga los S/ 3** | No especificado | **Negocio:** paga **quien recibe**, en B. **Persona:** el cliente **elige**, sin opción marcada, si paga quien entrega (en A) o quien recibe (en B). Cobra el motorizado, en efectivo o Yape |
| **Recargo por espera** | S/ 1 tras 10 min | **Sin recargos en ningún caso** |
| **Espera y cancelación** | Tolerancia 10 min; cancelar desde 20 min; cobrar S/ 3 si cancela tras salir | **Espera máx. 5 min y se cancela sin cobrar a nadie**; el cliente cancela gratis hasta que el motorizado llega a A |
| **Horario** | Por definir | **Todos los días, 6 pm a 11 pm** (configurable) |
| **Zona** | Por definir | **Solo San Jacinto** (casco urbano) |
| **Peso** | Por definir | **5 kg**; tamaño: lo que quepa con seguridad |
| **Frágil** | No existía | **Recuadro «es frágil»**; el motorizado decide y **puede rechazar sin costo** |
| **Foto** | «Foto opcional» | **Sin foto** |
| **Confirmación** | No definida | **«Confirmado» = un motorizado lo acepta.** Antes, «solicitado» |
| **Aceptación** | No definida | **Si nadie acepta en 10 min, se cancela solo** (valor configurable) |
| **Seguimiento** | «Mapa con el motorizado» | **Por estados, sin GPS en vivo** |
| **WhatsApp de Tindivo** | No existía | **Solo consultas; no se hacen pedidos por WhatsApp** |
| **Promo** | Primer recojo a S/ 1.50 | **Sin promo al lanzar**; el «primer delivery gratis» del afiche es **solo de restaurantes** |
| **Modelo de datos** | Un cliente, un teléfono | Separa **solicitante**, **contacto en A** y **contacto en B**; añade `fragil` y `paga_transporte` |
| **Brief de publicidad** | No existía | **Nuevo:** define el afiche A6 de dos caras, qué decir y qué no |
| **Backlog** | — | Añade **recargo por espera, foto del artículo y GPS en vivo** |

---

## 2. Evaluación de cada cambio

**✅ adoptar tal cual · ⚠️ adoptar con un ajuste · ❌ no adoptar**

| Cambio | Veredicto | Por qué |
|---|:-:|---|
| **Nombre «Recoge y Lleva»**, sin «recojo/encargos/mandado» | ⚠️ | Evita las dos confusiones (comprar / recojo en tienda) y dice qué hace. **Ajuste:** el nombre técnico **no** debe ser `recojo` (sección 3.6). Y hay que decidir entre este y «Courier» (sección 4) |
| **Quién paga, con la regla de negocio y la elección en persona** | ✅ | Coincide con lo que Jesús quería (elegir como en InDrive) **y es más simple que mi propuesta** de atarlo al «sentido» (`07` C2). **Retiro mi propuesta C2** |
| **Cobra «solo el transporte»; el producto siempre llega pagado** | ✅ | Resuelve la contradicción de redacción que señalé en `07` C |
| **Sin recargos** | ⚠️ | Menos fricción y menos discusión, y **el recargo era difícil de cobrar** en la puerta. **Pero** traslada todo el costo del viaje perdido a Tindivo (sección 6). Adoptar **midiéndolo**: la propia alarma de Jesús (más de 1 de cada 5 cancelados) es el disparador para reconsiderarlo |
| **Espera de 5 min y cancelar sin cobrar** | ⚠️ | Simple y justo para el cliente. **Riesgo:** un negocio que retrasa 6 minutos hace perder el viaje. Lo mitiga la **hora de listo** que elige el cliente y la **hora sugerida de salida**. Con el aviso a los negocios (kit) es razonable |
| **Cancelación libre hasta que llega a A** | ✅ | Reemplaza mi regla («se cobra desde que sale»); **retiro mi `07` F**. Coherente con «sin recargos» |
| **Horario 6 pm–11 pm todos los días** | ⚠️ | Cierra `D-27`. **Ajuste:** «todos los días» solo es cierto si hay motorizado cada día; usar además la **disponibilidad real** (`driver_availability`) para pausar solo (sección 3.7) |
| **Peso 5 kg; frágil; el motorizado puede rechazar** | ✅ | Menos campos que mis categorías y da al motorizado el control que necesita. Cierra `D-19` |
| **Sin foto del cliente** | ✅ | Coincide con lo que dijo Jesús |
| **«Confirmado» = aceptado por un motorizado; «solicitado» antes** | ✅ | **Honesto** con el cliente; es el patrón que ya usa el checkout (`DECISIONS §15`) |
| **Seguimiento por estados, sin GPS en vivo** | ✅ | Confirma mi hallazgo `07` T: **no hay GPS del motorizado** |
| **Se cancela solo si nadie acepta en 10 min** | ⚠️ | Correcto en el fondo. **Choca con los 15 min que dijo Jesús** (sección 3.1) |
| **Solicitante ≠ contacto en A ≠ contacto en B** | ✅ | Es lo correcto para un pueblo donde quien pide no siempre es quien recibe. Más rico que mi modelo (`03` §3) |
| **Sin promo al lanzar; primer delivery gratis solo restaurantes** | ✅ | Evita apilar promos, que es un riesgo real de dinero |
| **WhatsApp de Tindivo solo para consultas** | ✅ | Evita abrir un segundo canal de pedidos que una sola persona no puede atender. **Cierra mi idea 9 de `08` §11.2** (pedir por WhatsApp), que queda descartada |
| **Brief de publicidad** | ⚠️ | Muy buen brief: **usa solo lo escrito**, no promete tiempos ni GPS ni «todo tipo». **Riesgo:** convierte en promesa pública decisiones que aún no están cerradas (sección 3) |
| **Recuadro «frágil» en lugar de mis categorías del artículo y del valor declarado** | ⚠️ | Menos campos, y los documentos siguen su propio principio («cada campo que no sea imprescindible se quita»). **Ajuste:** conservar el **tope de responsabilidad** (S/ 200) **en los términos**, no como campo de formulario |

---

## 3. Contradicciones que hay que resolver

### 3.1 Tiempo para aceptar: 10 o 15 minutos

- **Jesús, en el chat (D-14):** **15 min**, porque es «lo máximo que puede tardar un motorizado» en terminar lo que trae.
- **Documento v2 (`01` §5, `05`):** **10 min**, marcado *«regla que se agregó»*, o sea, sin decisión suya explícita. El brief lo repite al cliente.
- **Lo que pesa:** entre semana hay **un solo motorizado** (D-17). Si está entregando comida, 10 min caducan pedidos que 15 habrían salvado; pero 15 min es mucho tiempo mirando una pantalla.
- **Recomendación:** **15**, **configurable**, y **quitar el número de todo texto impreso** (el brief lo usa hacia el cliente, no en el afiche). Decide Jesús.

### 3.2 Pedidos activos por teléfono: 2 o 1

- Documento v2 (`01` §12, `05`): **2**. Jesús, en el chat: **1**.
- **Recomendación:** **1** (palabra de Jesús, la más reciente), en `recojo.max_activos_por_telefono`.

### 3.3 Color de los aliados: rojo o naranja

- Documentos v2 (`03` §3, `00` §7): **rojo vibrante**. Jesús, en el chat: **naranja**.
- **Recomendación:** **naranja** (el rojo del sistema es `Danger` y se lee como error). Hay que corregir `03`.

### 3.4 Alcohol

- **Jesús, en el chat:** entra dentro de «Bebidas», sin destacarlo; «es problema de cada uno».
- **Documentos v2 (`02` §6, brief §7):** el alcohol **figura como «no se lleva»**, con la nota *«lista de trabajo; no destacarla en el afiche»*, y `02` §2 dice **«no incluir licorerías en v1»**.
- **Las dos posturas son compatibles** si se lee así: **la regla existe y está escrita, pero no se convierte en un control** (sin verificación de edad ni casillas). Es la fórmula más segura que la que yo había propuesto en `05` §4 y **coincide con lo que descubrí de la Ley 28681**. **Recomendación: adoptar la redacción de los documentos v2** y **retirar** mi tratamiento especial de «Bebidas» con cláusula de mayor de edad. Jesús debe confirmar que es lo que quiere.

### 3.5 Nombre público: «Recoge y Lleva» o «Tindivo Courier»

Ver sección 4. **Hay que decidirlo antes de imprimir.**

### 3.6 Nombre técnico interno: `recojo`

Los documentos v2 fijan **`recojo`** como nombre interno (tablas, claves, eventos, archivos). **No lo recomiendo:**

1. **La convención del repo** es *código y base de datos en inglés* (`CLAUDE.md`).
2. **Choca con el vocabulario del código:** «recojo» ya aparece **126 veces en 26 archivos** de `apps/customer` para el recojo en tienda (`pickup`, `ready_for_pickup`, `pickup_timing`). Una tabla `recojos` junto a `pickup` es un error a punto de suceder en un `grep`.
3. Es **el mismo problema que Jesús vio** con el nombre público, pero escondido en el código.

**Recomendación:** nombre técnico **`courier`** (inglés, no choca, dice qué es): tabla `courier_requests`, claves `app_settings.courier.*`, eventos `Courier*`. Sustituye al `errands` que yo usaba, que a su vez sugiere compras. **Es un cambio solo de nombres**, ninguno de diseño.

### 3.7 «Todos los días» frente a los motorizados reales

Jesús: **1 motorizado de lunes a viernes, 2 el sábado y domingo.** Los documentos v2: **todos los días, 6–11 pm**, con **interruptor manual**. Si un día nadie trabaja, el botón sigue activo y las solicitudes caducan. **Recomendación:** el servicio se ofrece si `enabled` **y** está en horario **y** hay al menos un motorizado disponible (`driver_availability.is_available`, que ya existe). Es lo que el `01` v1 §9 buscaba con «evitar aceptar pedidos que nadie atiende», y no cuesta nada.

### 3.8 Dónde viven los plazos

`05` guarda `recojo.aceptacion_timeout_min` y `recojo.espera.tolerancia_min` como claves sueltas. `DECISIONS §10` dice que **todo plazo sale de `app_settings.timers`** (la `0174` deshizo el caso contrario). Se ajusta en la implementación, no en la decisión de producto.

### 3.9 El brief promete cosas que aún no existen

El brief exige que Jesús confirme, antes de imprimir, que **el servicio y el buscador funcionen** (§8, §13). Coincido. Además, **todo lo que el afiche imprima queda fijado**: «hasta 5 kg», «todos los días 6–11 pm», «desde S/ 3». Si mañana cambia el horario o el peso, el afiche miente. **Recomendación:** **imprimir solo después de la prueba de una semana**, o dejar el horario **en una pegatina** o en el sitio web, no en el papel.

---

## 4. El nombre: «Tindivo Courier» frente a «Tindivo Recoge y Lleva»

**Lo que dijo Jesús:** *«Es Tindivo Courier… algo así como lo hace InDrive: InDrive es Courier, así maneja.»* Es un argumento razonable: **es la referencia que sus clientes ya conocen**.

**Lo que hace InDrive en realidad** (comprobado en su página): no dice solo «Courier»; dice **«Entrega express y mensajería en Perú – inDrive.Courier»**. **El nombre lleva puesta su explicación.**

| Criterio | «Tindivo Recoge y Lleva» | «Tindivo Courier» |
|---|---|---|
| **Se entiende solo** | ✅ Es la frase: *recogemos + llevamos* | 🟡 En Perú «courier» suena a **paquetería y encomiendas** (Olva Courier, Shalom), no a «recoge mi chaufa y tráemelo» |
| **Sugiere comprar** | ✅ No | ✅ No |
| **Choca con «recojo en tienda»** | 🟡 Comparte la raíz; se distingue con «tú vas / nosotros vamos» | ✅ No |
| **Corto** | 🟡 Cuatro palabras | ✅ Dos |
| **Marca (Tindivo + servicio)** | ✅ | ✅ Mejor: parece una línea de negocio |
| **Ya está escrito todo alrededor** | ✅ Brief, botones, avisos, afiche | ❌ Hay que reescribir |
| **Sirve para el caso principal** (recoger un pedido en un negocio) | ✅ | 🟡 Sirve, pero hay que explicarlo |

**Recomendación:**

1. **Nombre público: «Tindivo Recoge y Lleva».** Es la frase que el afiche necesita decir de todas formas, y **no requiere explicación**.
2. **«Courier» sí, pero en dos sitios donde funciona mejor:** (a) **como nombre técnico interno** en inglés (`courier`, §3.6), y (b) **como palabra de búsqueda** en el título de la página y la descripción («courier en San Jacinto»), porque **es lo que la gente teclea en Google**.
3. **Si Jesús prefiere «Courier» de cara al público**, que sea como **InDrive lo hace**: **«Tindivo Courier» con la bajada siempre visible «Recogemos y llevamos»**, nunca solo.

**Cómo decidir sin discutir (5 minutos):** pregunta a 5 personas qué creen que hace un botón que dice **«Recoge y Lleva · S/ 3»** y uno que dice **«Courier · S/ 3»**. **Antes de imprimir**, porque después cambiar cuesta dinero.

---

## 5. Qué tiene cada juego que le falta al otro

| Lo que **falta en los documentos v2** y está en `01`–`08` | Dónde |
|---|---|
| **La cuenta del dinero del motorizado:** la deuda derivada de los pedidos entregados, su Yape personal, la rendición diaria, la condonación | `02` §4–5 |
| **Diseño técnico:** tablas, RLS, RPC, cron, push, outbox, tests | `03` |
| **Un solo panel del motorizado** con encargos y pedidos etiquetados (azul), y el flujo de soltar | `01` §3 |
| **El UX de conversión:** dos botones junto al teléfono, pedido en dos toques, inicio de sesión al final, moto como identidad | `08` |
| **Guardar `distance_m`** para decidir precios con datos | `02` §2 |
| **El servicio se pausa solo** sin motorizado disponible | §3.7 |

| Lo que **falta en `01`–`08`** y está en los documentos v2 | Dónde |
|---|---|
| **El objetivo de negocio** (llenar lunes–jueves, punto de equilibrio ~10 viajes) y los **criterios de decisión** de la prueba | `00` §8, `05` §7 |
| **El directorio de negocios** como canal, con buscador, mapa, QR y kit | `02`–`04` |
| **Hora de listo**, «a nombre de», aviso por WhatsApp al negocio | `01` §4–5 |
| **Reglas de quién paga y cuándo** | `01` §4, §7 |
| **El afiche** y sus reglas de qué decir y qué no | brief, `04` §7 |
| **Eventos de medición** con `?src=` | `04`, `05` §5 |

---

## 6. El riesgo de «sin recargos» y 5 minutos, con números

Los documentos calculan que el motorizado adicional cuesta **S/ 30 por noche** y que el punto de equilibrio son **~10 viajes** a S/ 3 (`05` §4). Eso cuenta **viajes completados**. Un viaje cancelado por «no estaba listo» **cuesta tiempo y no ingresa nada**. Con la regla nueva:

| Cancelados por «no estaba listo» | Solicitudes necesarias para completar 10 viajes |
|---|---|
| 0 % | 10 |
| 10 % | ~11 |
| **20 % (la alarma de Jesús)** | **~13** |
| 30 % | ~14 |

**Lectura:** hasta el 20 % la regla **se sostiene** y es más simple que un recargo. **Por encima**, la operación pierde. **Recomendación:** adoptarla, **medir `no_estaba_listo` desde el primer día** (la alarma ya está en `00` §8) y **tener listo el interruptor** para reintroducir un costo. Un **control barato** mientras tanto: **el aviso por WhatsApp al negocio con la hora**, que ya está en el flujo, y que **el kit** (`04` §6) diga al negocio que **avise si se retrasa**.

Una nota más: los documentos dicen que si un teléfono cancela con frecuencia, **«se revisa en el admin»**. Eso es **manual**, y Jesús pidió automatizar lo máximo posible. **Propuesta:** un contador por teléfono de cancelaciones con motivo del cliente en 14 días, visible en el admin, sin bloqueo automático.

---

## 7. Qué cambiaría en `01`–`08` si se decide actualizar

| Archivo | Cambio |
|---|---|
| **`01` flujo** | Sustituir mis cuatro pasos por los de v2 (**«En un negocio» / «Con una persona o en otro lugar»**), quitar el **selector «que me traigan / que lleven»** (el flujo ya cubre ambos casos), añadir **hora de listo, «a nombre de», frágil, «Avisar por WhatsApp»**, estado **`accepted`**, espera de 5 min, sin recargos |
| **`02` dinero** | Quitar mi selector de pago (C2) y adoptar **quién paga** de v2. Mantener **deuda, rendición y Yape personal**. Cambiar la cancelación a «sin costo» |
| **`03` técnico** | Renombrar `errands` → `courier` (§3.6). Columnas de solicitante y contactos separados; `paga_transporte`; `fragil`; `ready_in_min`/`ready_at`. Plazos en `app_settings.timers` |
| **`04` decisiones** | Cerrar D-13, D-14 (pendiente 10/15), D-19, D-27; anotar lo retirado |
| **`05` qué se puede llevar** | **Se reduce mucho:** solo **peso 5 kg, frágil, lista de «no se lleva»** (con el alcohol como en v2) y **tope de responsabilidad en los términos**. Desaparecen las categorías del artículo y el valor declarado |
| **`06` backlog** | Unificar con el de v2 y añadir **recargo por espera**, **GPS en vivo** |
| **`07` integración** | Marcar como **superada** en lo que resuelve este archivo |
| **`08` UX** | Nombre; color naranja; **descartar la idea de pedir por WhatsApp**; el resto (dos botones, dos toques, sesión al final) **se mantiene** y **es lo que más falta hace en los v2** |
| **`Home/README.md`** | Nombre del servicio y color |

**Opción «no actualizar todavía»:** los documentos `01`–`08` siguen siendo **una base técnica válida**. Lo que dejaría de ser cierto: nombres, quién paga, reglas de espera, categorías del artículo. **Recomiendo actualizar ahora**, porque la sesión de diseño en Claude Design va a leer estos archivos, y un documento contradictorio produce un diseño contradictorio.

---

## 8. Decisiones que necesito de Jesús

| # | Pregunta | Mi recomendación |
|---|---|---|
| **1** | **Nombre público** | «**Tindivo Recoge y Lleva**»; «Courier» como nombre técnico y palabra de búsqueda (§4) |
| **2** | **Nombre técnico interno** | **`courier`**, no `recojo` (§3.6) |
| **3** | **Tiempo para aceptar** | **15 min**, configurable, sin imprimirlo (§3.1) |
| **4** | **Pedidos activos por teléfono** | **1** (§3.2) |
| **5** | **Alcohol** | La redacción de v2: regla escrita, sin control (§3.4) |
| **6** | **El servicio se pausa solo** si no hay motorizado disponible | **Sí** (§3.7) |
| **7** | **Aliados en naranja**, corregir `03` | **Sí** (§3.3) |
| **8** | **Cuándo imprimir el afiche** | Después de una semana de prueba, con el horario fuera del papel o en pegatina (§3.9) |
| **9** | **Actualizar `01`–`08`** con lo de §7 | **Sí, ahora** |
