# 07 · Integración con los documentos de «Recojo» de Jesús

> 2026-09-19. Jesús aportó seis documentos (`origen-jesus/`, copiados tal cual). Este archivo los **compara con lo que ya estaba diseñado en `01`–`06`**, marca las discrepancias, y propone una resolución **por lo que sea mejor para el negocio**, no por quién lo escribió primero.
> **Regla:** donde este archivo y `01`–`06` discrepen, **una vez Jesús decida, manda este archivo**, y se actualizan los demás.

---

## 1. Qué aportan los documentos nuevos (y por qué son mejores en varias cosas)

Mis documentos diseñaban **cómo funciona el servicio**. Los de Jesús añaden lo que a los míos les faltaba: **por qué existe y cómo se llena**.

1. **Un objetivo de negocio medible.** Llenar los días flojos (lunes a jueves; hoy 10–12 viajes al día, a veces 4) hacia ~20, con el punto de equilibrio del motorizado adicional en ~10 viajes por noche a S/ 30 (`origen-jesus/05`). Mi diseño no tenía objetivo ni criterio de éxito real.
2. **El canal de adquisición.** «La gente no sabe que Tindivo existe» → el tráfico llega por **los negocios** (QR, estado de WhatsApp), por el aviso justo después de tocar «Llamar», y por el afiche. Sin esto, un servicio bien construido puede no usarse.
3. **El caso de uso principal: recoger un pedido ya pagado en un negocio** (el cliente llama, pide, paga, y luego pide a Tindivo que lo recoja). Yo había pensado en «cualquier objeto de A a B».
4. **Reglas de espera** (tolerancia, recargo, cancelación) y **hora de listo**, que son donde este servicio pierde o gana dinero.
5. **Criterios de decisión** para la prueba de 2 semanas.

**Se adoptan casi completos.** Lo que sigue son las discrepancias.

---

## 2. Hallazgos del repo que cambian cosas

Los documentos de Jesús dicen *«adapta a lo que ya existe (encargos, mapa, panel admin…)»*. Comprobé qué existe de verdad:

| Hallazgo | Consecuencia |
|---|---|
| **«Recojo» ya significa lo contrario en el producto.** En `apps/customer` aparece **126 veces en 26 archivos** con el sentido de *«voy yo a buscarlo al mostrador del restaurante»* (`delivery_method = 'pickup'`, `ready_for_pickup`, `pickup_timing`, el banner del carrusel *«Recojo en tienda · Pide, paga y recoge»*, `cart-pickup-notice`). | Llamar «Recojo» al nuevo servicio **choca de frente** con uno que el cliente ya aprendió y con el vocabulario del código y `DECISIONS §5`. Ver discrepancia **A**. |
| **No existe ningún flujo de «encargos» en el código.** Solo hay una línea en el roadmap («Encomiendas», fuera del MVP). | No hay nada que «extender»: es un módulo nuevo. Lo que **sí** hay para reutilizar está en `03` §1. |
| **Ya existe un mapa Leaflet con puntos de referencia curados por el admin:** tabla `map_landmarks` (`0208`, `0214`), con nombre, categoría, `lat`/`lng`, `active`, RLS, una hoja de edición pensada para el celular (`LandmarksSheet`) y la página `apps/admin/.../mapa-referencias`. | Es **casi el patrón exacto** del «catálogo de negocios» que piden (`origen-jesus/02`, `03`). Ver discrepancia **N**. |
| **Ya existen negocios «solo catálogo (WhatsApp)»** (`catalog_only`, `businesses.whatsapp_number`, `DECISIONS §18`): negocios que aparecen en el home con «pide directo por WhatsApp». | Son **exactamente el tipo de negocio** al que Recojo le vende. No conviene duplicarlos a mano. Ver **N**. |
| **El polígono de cobertura del repo no es fiable como referencia.** El sembrado en `0045` está centrado en **(-9.1547, -78.5042)**, mientras que la página admin de referencias fija el centro real de San Jacinto en **(-9.1465, -78.2779)**: unos **25 km de diferencia**. La propia migración dice que es «un punto de partida». | **Retiro el cálculo que te di** («mediana A–B = 1.8 km, corte en 2.0 km»): estaba hecho sobre un polígono sin valor. Tu dato («5 o 10 km, tendría que medirlo») es el que vale. Ver **B**. |

---

## 3. Discrepancias y resolución propuesta

| # | Tema | `01`–`06` (mío + chat de hoy) | `origen-jesus/` | Recomendación y por qué |
|---|---|---|---|---|
| **A** | **Nombre** | «Encargos» | «Recojo» | **«Encargos»**, con bajada *«Recogemos y llevamos»*. «Recojo» ya está ocupado (arriba) y confundiría al cliente, al código y a los reportes. Además «encargos» es la palabra que Jesús y sus clientes ya usan («lo que los usuarios ya pagan por encargos»). Los textos de los documentos de Jesús se adaptan sustituyendo el nombre. |
| **B** | **Precio** | S/ 3.00 cerca / S/ 3.50 lejos, corte en km | **S/ 3 fijo**; S/ 3.50 «se evaluará con datos tras 2 semanas» | **S/ 3 fijo al lanzar, guardando `distance_m` desde el día 1.** (1) El propio `05` calcula que S/ 0.50 de diferencia son **S/ 10 al día** con 20 viajes: poco dinero para lo que cuesta explicarlo. (2) **No hay hoy un corte en km que se pueda defender**: el polígono del repo no sirve y Jesús aún no ha medido. (3) **S/ 3 es el ancla de mercado** («es lo que ya pagan»). (4) Con 2 semanas de `distance_m` real se decide con datos, sin rehacer nada: la configuración ya soporta escalones (`03` §2). Lo que Jesús dijo hoy («3.50 sí o sí del grifo al centro») se cubre después con una tarifa `far`. **Decide Jesús.** |
| **C** | **Cómo se paga la tarifa** | Todo el dinero pasa por el motorizado (efectivo exacto o su Yape) y él debe a Tindivo | «Prepago siempre. **Sin dinero en manos del motorizado**» | **No es una contradicción real, es de redacción.** El **producto** va prepagado al negocio y el motorizado **no lo paga ni lo cobra**. La **tarifa de Tindivo** (S/ 3) **sí** la cobra el motorizado y la debe a Tindivo, porque no existe una pasarela para cobrarla antes (Tindivo usa Yape manual). El documento de Jesús no dice cómo se cobra el S/ 3: es un hueco. **Texto propuesto:** *«El motorizado no paga ni cobra tu pedido. Solo cobra la tarifa de Tindivo.»* |
| **C2** | **Pagar al recoger o al entregar** (aprobado hace dos días) | Selector como InDrive | No existe (el flujo termina en «Pedir recojo · S/3») | **Simplificar: paga quien pide, en el punto donde está.** El selector *«que me traigan / que lleven algo»* ya lo determina: si me traen algo, pago al recibir en B; si mando algo, pago al entregarlo en A. Con un negocio como A, **siempre es en B** (no se le cobra a un negocio). Es un control menos y no se pierde nada. |
| **D** | **Hora de listo y espera** | Espera de 5 min en cada punto | Chips «ya listo / 10 / 20 / 30 min»; tolerancia de 10 min, recargo S/ 1, cancelar desde 20 min; salida = listo − traslado | **Adoptar lo de Jesús**, todo en configuración y como **[POR CONFIRMAR]**. Es donde el servicio pierde dinero y mi diseño no lo veía. La «hora sugerida de salida» usa un traslado fijo configurable (propuesta: 5 min), porque no hay GPS del motorizado. |
| **E** | **Estados** | `searching → heading_to_pickup → at_pickup → …` | + `aceptado` y `esperando` | Añadir **`accepted`** (aceptó, todavía no sale) y una acción **«Salgo»** que pasa a `heading_to_pickup`: sin ella, «listo en 30 min» no tiene sentido. **`esperando` NO es un estado**: es una marca de tiempo (`not_ready_at`) sobre `at_pickup`; menos estados, menos transiciones que validar. |
| **F** | **Cancelación** | Libre hasta que llega a A | Libre hasta `en_camino_a_recoger`; desde ahí se cobra S/ 3 | **Adoptar lo de Jesús**, apoyado en la acción «Salgo» de **E**: el cobro empieza cuando el viaje ya se gastó. Cancelar por parte del motorizado o de Tindivo: sin costo para el cliente. |
| **G** | **Alcohol** | Hoy Jesús dijo: una categoría «Bebidas» sin destacar ni casilla | **No permitido en v1** (verificación de edad y responsabilidad), `[POR CONFIRMAR]`; no incluir licorerías | **Alcohol fuera de v1.** Es lo que dicen los documentos que Jesús armó con más contexto de negocio, coincide con la lista oficial de inDrive, y con lo que encontré: la **Ley 28681** prohíbe **suministrar** alcohol a menores, y hay un proyecto de delito de hasta 4 años (`05` §4). Con un motorizado solo en la puerta de noche no hay cómo comprobar la edad, y el alcohol **no es el negocio** (llenar lunes–jueves). Se enciende después si hay demanda. «Bebidas» sí (gaseosas, jugos, agua). **Revierte lo que Jesús dijo hoy; lo dejo a su decisión.** |
| **H** | **Documentos** | «Documentos y papeles: contratos, trámites» | Papeles sí; **DNI, pasaportes y originales de valor no** (con código de entrega si algún día entran) | **Adoptar lo de Jesús.** Corrijo `05`: sobres y papeles de trámite sí; documentos de identidad y originales de valor, no. |
| **I** | **Encargos simultáneos por cliente** | 1 | 2 por teléfono | **1** (Jesús, hoy). `max_active_per_phone = 1` en configuración. |
| **J** | **Foto del cliente al pedir** | No | «Foto opcional» | **No** (Jesús, hoy): un campo menos, y el documento mismo dice «cada campo que no sea imprescindible se quita». |
| **K** | **Categoría del artículo y valor declarado** | Obligatorias siempre | No hay: solo «¿qué llevamos?» en una línea | **Solo para «persona a persona»**. Cuando el punto A es un negocio, la **categoría del negocio** ya dice qué es (farmacia → reglas de medicinas) y el producto va pagado, así que se omiten. Menos campos donde más se usa. |
| **L** | **Nombres en base de datos** | Inglés (`errands`, `status`…) | Español (`recojos`, `estado`, `a_nombre_de`…) | **Inglés**, porque es la convención del repo (`CLAUDE.md`: «código y DB en inglés, contenido y UI en español»). Equivalencias en `origen-jesus/01` §11 → `errands`, `status`, `pickup_lat…`, `on_behalf_of`, `ready_in_min`, `ready_at`, `origin`, `cancel_reason`. |
| **M** | **Cuántos motorizados y cuándo** | Jesús hoy: máx. 2; sábado y domingo 2, lunes a viernes 1 | «2 motos + un motorizado adicional jueves, sábado y domingo» | **Pregunta a Jesús** (ver §5): cambia cuánta capacidad hay lunes–jueves, que es donde se quiere vender. |
| **N** | **El catálogo de negocios** | No existía | Directorio con mapa rojo/gris, panel admin, QR por negocio, `/r/<slug>`, kit, afiche | **Adoptar, por fases y sin duplicar.** Tabla **nueva y ligera** (`catalog_places`) que **copia el patrón de `map_landmarks`** (RLS, caja de sanidad geográfica, hoja de edición móvil), con `business_id` opcional para los partners. Los negocios `catalog_only` **aparecen solos** en el buscador, sin cargarlos dos veces. **No mezclarla con `map_landmarks`**: aquella es para orientarse (colegio, iglesia) y esta es comercial, con permiso, QR y métricas. |
| **O** | **Home** | Dos tarjetas grandes (Encargos / Restaurantes), estilo Rappi (pedido de Jesús) | Tarjeta descartable bajo el saludo + ícono en la navegación; el orden de prioridad pone el botón en la ficha del negocio primero | **Las dos**, en este orden: (1) botón «Pedir encargo» en la ficha de cada negocio y el aviso post-«Llamar» (donde nace la intención, `origen-jesus/04`); (2) la tarjeta grande en el home (lo que Jesús quiere ver); (3) ícono en la navegación. La tarjeta grande **es** la puerta del paso 1 («¿Dónde recogemos?»). |
| **P** | **Prioridad frente a restaurantes** | Panel único etiquetado; el motorizado decide | «Partners primero en horas pico» | **Compatibles.** En el panel único los **pedidos de restaurante se ordenan antes** que los encargos, y el interruptor «Encargos disponible / pausado» (con texto editable) cubre las horas pico. |
| **Q** | **Medición** | Solo métricas de operación | Eventos con `?src=` y un panel semanal | **Adoptar**, pero **decidir dónde se guardan los eventos** (una tabla mínima `funnel_events` escrita por una ruta del API; `anon` no puede insertar directo). Sin esto, los criterios de decisión de la prueba no se pueden calcular. |
| **R** | **Promo del primer recojo** (S/ 1.50, 30 usuarios, lun–jue) | No existía | Se activa después, con límites | **Adoptar como configuración apagada.** Como la deuda del motorizado sale del precio **realmente cobrado**, la promo no rompe el cuadre (`02` §5). |
| **S** | **Etiqueta «A nombre de»**, `prepagado_confirmado`, aviso «Avisar por WhatsApp» al negocio | No existían | Sí | **Adoptar.** Son las piezas que hacen funcionar el caso «recoger en un negocio». El botón de WhatsApp reutiliza el patrón de `tracking_link_sent_at` de restaurantes (`DECISIONS §5`). |

**Lo que ya coincide y no se toca:** solo recojo y entrega, sin compras (regla central de ambos); un solo mensaje fijo visible; tope de mochila; flota propia; nada de compras con dinero adelantado en v1; la negociación de precio va a backlog; app móvil fuera de alcance; catálogo cargado a mano al principio.

---

## 4. Alcance integrado y orden de trabajo

Se combina `03` §8 con `origen-jesus/00` §7. **Cada fase pide aprobación de Jesús** (regla del repo).

| Fase | Contenido | Sale cuando |
|---|---|---|
| **0** | Cerrar las decisiones de §5; añadir `DECISIONS.md §29`; actualizar `01`–`06` a lo resuelto aquí | Jesús aprueba |
| **1 · Núcleo** | Migración, contratos, RPC, tests: `errands` con `accepted`, «Salgo», hora de listo, espera y recargo, cancelación, `on_behalf_of`, `origin`, configuración (`app_settings.errands`) | Tests verdes en local |
| **2 · Cliente y motorizado** | Pantalla de pedido (mapa principal, 4 pasos), «Buscando motorizado» 15 min, seguimiento; panel único etiquetado (azul); cobro y deuda | Un encargo completo con dos celulares |
| **3 · Buscador de negocios** | `catalog_places` + hoja de alta móvil en el admin, ~10 negocios a mano; los `catalog_only` aparecen solos; sin mapa aún | Se puede pedir un recojo eligiendo un negocio |
| **4 · Entradas y eventos** | Botón en la ficha del negocio, aviso post-«Llamar», tarjeta en el home, `funnel_events` con `?src=` | Se puede medir el embudo |
| **5 · Kit y adquisición** | `/r/<slug>`, QR por negocio, kit, afiche | Jesús visita negocios |
| **6 · Mapa del catálogo** | Modo `catalogo` del mapa (rojo/gris) y filtros | — |
| **7 · Promo y página pública** | Promo del primer encargo; «Negocios de San Jacinto» | Flujo estable |

**Por qué el mapa del catálogo va después:** los propios documentos recomiendan *lista con buscador por defecto en móvil* y el mapa como segunda vista (`origen-jesus/03` §5), y el mapa **no es lo que llena los lunes**. Lo que sí va desde el principio es **el mapa en la pantalla de pedido** (Jesús: «priorizo que el mapa sea la parte principal»).

---

## 5. Decisiones que necesita Jesús

**Resueltas en la segunda ronda (2026-09-19, noche):**

| Tema | Decisión de Jesús |
|---|---|
| **B · Precio** | **S/ 3 fijo al lanzar; por distancia más adelante** («partimos de tres soles fijos»). Se guarda `distance_m` desde el primer encargo. |
| **G · Alcohol** | **Se ve dentro de «Bebidas», nada más**; «si envía o no envía es problema de cada uno». Jesús decidió **no excluirlo** y mantiene su postura tras conocer los riesgos (Ley 28681). Queda así: **sin categoría aparte, sin casilla de edad**, con la cláusula de responsabilidad del cliente y el derecho del motorizado a negarse (`05` §4). |
| **M · Motorizados** | **Lunes a viernes: 1. Sábado y domingo: 2** (con excepciones). |
| **N · Negocios de WhatsApp** | **Sí aparecen en el buscador**, y además **con un enlace a su perfil en Tindivo, donde está todo su catálogo**. Es mejor para **todos los aliados**. Ver `08` §4. |
| **A · Nombre** | **Sigue abierto** y se replantea: «Encargos» sugiere *«voy a comprar algo»*, y «Recojo» choca con el «Recojo en tienda». Ver `08` §7. |

**Sigue pendiente:** D (cifras de espera de `origen-jesus/01` §7 como valores iniciales, todas configurables) y Q (dónde guardar los eventos de medición: propongo una tabla mínima `funnel_events`). Sin respuesta, se aplican esas propuestas.

**Nuevo hallazgo (T), no contemplado en ninguno de los dos juegos de documentos:** `origen-jesus/01` §4 promete un **«mapa con el motorizado cuando esté en camino»**. **No hay GPS del motorizado en el sistema** (`DECISIONS §14`: «GPS en mapa» está modelado pero no activo; el roadmap lo deja fuera del MVP). **Recomendación:** en v1 el seguimiento muestra **estados y un mapa fijo A–B**, sin moto en movimiento; la moto en vivo va al backlog. Lo que sí se puede hacer barato es **un icono de moto sobre el mapa como identidad** (`08` §5), no como posición real.

---

## 6. Resuelto hoy por Jesús (2026-09-19)

| Tema | Respuesta |
|---|---|
| Distancia del grifo al centro | «5 o 10 km, tendría que medirlo» → **sin dato fiable todavía**; ver B |
| Soltar un encargo aceptado | **El reloj de 15 minutos NO se reinicia**: sigue igual que en restaurantes |
| Notas del motorizado (mi P-4) | «No entiendo, explícate; si no se sabe bien para qué sirve, elimínalo» → **se elimina la nota libre del motorizado en v1** (ver abajo) |
| Encargos activos por cliente | **Uno a la vez** |
| Más backlog | Los documentos traen la lista completa (`origen-jesus/00` §8b): negociación de precio, compras con dinero adelantado, documentos/DNI con código de entrega, supermercados, negocios con delivery propio, programación por hora exacta, autoregistro de negocios, publicidad y marcadores destacados, horarios estructurados, foto de carta, app nativa |

**Sobre las notas del motorizado, ya explicado:** era una idea de tu primer mensaje («que el motorizado pueda dejar notas para mejorar la experiencia»). Serviría para **dejar constancia de un incidente** («no contestó», «lo dejé con la vecina») y como prueba si hay una disputa. **Pero para eso ya está el botón «Reportar problema»** (con motivo corto y texto opcional). Una nota libre añade una pantalla y un campo que nadie va a leer todos los días. **Se elimina.** Se conservan las **indicaciones del cliente al motorizado** («toca el timbre»), que sí sirven en la puerta.
