# 04 · Decisiones de Encargos

> v0.5 · 2026-09-19. **Este es el documento a discutir primero.**
> Las decisiones **cerradas** son de Jesús. Las **propuestas** llevan un valor por defecto: si nadie dice lo contrario, ese es el que se usa.

---

## Cerradas por Jesús

| ID | Decisión | Fecha | Dónde quedó |
|---|---|---|---|
| **D-02** | El cliente elige **pagar al recoger o al entregar** (por defecto, al entregar). El artículo no cambia de manos hasta cobrar | 09-18 | `02` §3 |
| **D-03** | **Todo el dinero pasa por el motorizado** (efectivo exacto o **su Yape personal**); él queda en deuda con Tindivo | 09-18 | `02` |
| **D-04** | **S/ 3 fijo al lanzar; por distancia más adelante.** Se guarda `distance_m` desde el primer encargo. (Pasó por 3.50 fijo → 3.00/3.50 por distancia → S/ 3 fijo) | 09-19 | `02` §2 |
| **D-05** | El cliente que pide **escribe A y B** | 09-18 | `01` §2 |
| **D-06** | **Catálogo de categorías permitidas**; mochila **45×45×45 cm**; texto como borrador | 09-18 | `05` |
| **D-07** | **Solo recojo y entrega, sin compras** | 09-18 | `05` §1 |
| **D-12** | La contraparte al rendir es **Tindivo** (el admin) | 09-18 | `02` §5 |
| **D-16** | El motorizado **rinde a diario**. **Jesús precarga el QR/Yape de cada motorizado** | 09-19 | `02` §5, `03` §3 |
| **D-17** | **Máx. 2 motorizados**: sábado y domingo 2, lunes a viernes 1 (con excepciones) | 09-19 | abajo |
| **D-18** | **Sin dinero en efectivo** como artículo | 09-19 | `05` §5 |
| **D-19** | **Peso máximo 5 kg** | 09-19 | `05` §6 |
| **D-20** | **Joyas no se mencionan.** Tope general S/ 200 | 09-19 | `05` §2 |
| **D-22** | **Solo de noche** por ahora, como prueba (después, día con mototaxistas: `06` B-11) | 09-19 | `06` |
| **D-14** | La solicitud **caduca a los 15 minutos**: es lo máximo que puede tardar un motorizado en terminar lo que trae | 09-19 | `01` §2 paso 5, `03` §2 |
| **D-15** | **Selector «que me traigan / que lleven algo»** y **el mapa como parte principal** de la pantalla, con «usar mi ubicación actual» | 09-19 | `01` §2 |
| **D-08** | **Un solo panel** en la app del motorizado: encargos y pedidos juntos, **bien etiquetados** | 09-19 | `01` §3, `03` §5 |
| **D-23a** | **Medicinas: sí**, en el compartimento aislado; **sin controladas** | 09-19 | `05` §3 |
| **D-23b** | **Una sola categoría «Bebidas»**, sin separar ni anunciar el alcohol y **sin casilla de mayor de edad**; nada de cajas; Jesús resuelve cómo proteger las botellas | 09-19 | `05` §4 |
| **D-25** | Un motorizado **puede tener varios encargos activos**; la app solo avisa. La frase «no limito…» hablaba del **mismo panel** de pedidos, que ya es D-08 | 09-19 | `01` §6 |
| **D-26** | **Sin avisos al admin** por ahora; el panel del admin se trabaja después | 09-19 | `06` B-1 |
| **Leaflet** | **Línea recta punteada** entre A y B para empezar, aunque no sea la ruta real | 09-19 | `01` §2 |
| **B-1** | Subir la oferta de S/ 0.50 en S/ 0.50: **al backlog** | 09-18 | `06` |

**Sobre Leaflet:** confirmado, **no traza rutas por calles**, y no hace falta. Se dibuja una **línea recta punteada** entre A y B (`Polyline`) y se guarda `distance_m` (`03` §1).

**D-17 y el panel único:** entre semana hay un solo motorizado, y con encargos y pedidos en el mismo panel la etiqueta pasa a ser lo que evita confundirlos. Los encargos se muestran con insignia **«ENCARGO»**, color e icono propios, **sin** la franja de «papelito» de los negocios, y con la pista de cómo llevarlos («compartimento aislado»).

---

## Propuestas con valor por defecto (dime solo si quieres otro)

| ID | Propuesta | Notas |
|---|---|---|
| **D-24** | Sobre el **alcohol**, sin pantalla extra: los **términos** dicen que el cliente responde por lo que pide y el **motorizado puede negarse** a entregar a un menor evidente. Sin casilla ni tope de botellas (`05` §4) | Jesús me pidió ayuda; es la opción que **no cuesta nada de experiencia de usuario**. Conviene revisión legal |
| **D-27** | **Horario del servicio = horario de la plataforma** (`platform_schedule`, ≈ 18:00–23:00). Fuera de él el botón se ve, deshabilitado, con su motivo | Confirmar las horas exactas |
| **D-28** | **Visible solo para una lista de prueba** mientras se valida una noche real (`app_settings.errands.enabled` apagado por defecto) | Cómo se relaciona con el gate del piloto (`apps/api/lib/pilot/gate.ts`): **no lo he abierto** |
| **D-11** | Sin foto en v1 (la del motorizado al entregar es `06` B-13); **enlace público de seguimiento**. Código de entrega: backlog (`06` B-4) | |
| **D-10** | Cancelación **libre** hasta que el motorizado llega a A; desde ahí, solo por admin y, si es culpa del cliente, **se cobra** el precio o una fracción | |
| **D-13** | Nombre en la UI: **«Te lo llevamos»** (provisional; ver P-15). «Encargos» sugiere comprar y «Recojo» choca con «Recojo en tienda». El nombre técnico sigue siendo `errands` | |
| **D-21** | `distance_m` con Haversine **en el servidor**: ahora **decide la tarifa** y se guarda en cada encargo | |
| **D-09** | Sin bono al motorizado al arrancar; se cuenta cuántos hace | |
| **D-16b** | Rinden en **efectivo o Yape** a una **cuenta de negocio** de Tindivo, y recibe el admin | |
| **D-29** | Home tipo Rappi: **Claude Design** para diseñarlo (con la imagen de Jesús); primero la tarjeta de Encargos, luego el home completo (`docs/Home/README.md`) | |
| **D-01** | Tabla propia `errands`, no `orders` *(técnica)* | |

---

## Respondidas el 2026-09-19 (ya aplicadas)

| # | Respuesta de Jesús | Dónde |
|---|---|---|
| **P-1** | El motorizado ve **toda la información al aceptar**, no antes; en la tarjeta previa solo lo necesario para decidir. Los encargos se diferencian con **un color propio (azul vibrante)** | `01` §3 |
| **P-2** | **Sí puede soltar** un encargo aceptado: se arregla hablando en el equipo («me voy a un restaurante, te lo suelto») | `01` §3 |
| **P-3** | **A y B dentro del polígono.** No hay caseríos | `02` §2 |
| **P-6** | **Calificación en los dos sentidos** (cliente→motorizado y motorizado→cliente, para saber quién es confiable): **al backlog, sin descartarla** | `06` B-12 |
| **P-7** | **Sí, juntos** en «Pedidos» (historial). Y un cliente **puede tener a la vez un encargo y un pedido a un restaurante**: son independientes | `03` §5 |
| **P-8** | Sin foto del cliente al pedir. La **foto del motorizado al entregar** es buena idea, pero **versión pequeña primero** | `06` B-13 |

## Respondidas también el 2026-09-19, después de leer sus documentos

| # | Respuesta de Jesús |
|---|---|
| **P-9** | Al soltar un encargo, **el reloj de 15 min NO se reinicia**: sigue igual que en restaurantes |
| **P-11** | **Un solo encargo activo por cliente** (sus documentos decían 2 por teléfono; manda esto) |
| **P-4** | Las «notas del motorizado» **se eliminan en v1** (no quedó claro para qué servían; el botón «Reportar problema» cubre el caso). Se **conservan las indicaciones del cliente** al motorizado |

> ⚠️ **Los documentos de «Recojo» de Jesús (`origen-jesus/`) traen discrepancias con este archivo.** Están analizadas en **`07-integracion-recojo.md`**. Estas decisiones están **en revisión**: **D-13** (nombre para el cliente; ver `07` A y `08` §7), **D-02** (cuándo se paga) y **D-27** (horario). **Ya cerradas tras leerlos: precio (S/ 3 fijo), alcohol (dentro de «Bebidas») y motorizados (1 de lunes a viernes, 2 sábado y domingo).** Donde discrepen, mandará `07` cuando Jesús decida.

## Preguntas pendientes

Cada una lleva la propuesta que usaría. **Sin respuesta, se aplica esa propuesta** salvo las marcadas como *bloquea*.

| # | Pregunta | Propuesta |
|---|---|---|
| **P-14** | Jesús dice que el directorio tendrá **«logo, notas y toda esa información»**. ¿Las **notas** son **internas** (solo Jesús, como `nota_interna` de `origen-jesus/02`) o hay también una **nota pública** que ve el cliente («solo efectivo», «pedir con 15 min de anticipación»)? | **Las dos**: `internal_note` (privada) y `public_note` (≤ 80 caracteres, visible en la ficha) |
| **P-15** | **Nombre para el cliente.** «Te lo llevamos» le parece bien a Jesús, pero busca algo **más fácil**. ¿Cuál probamos con la prueba de 5 segundos? | **«Te lo llevamos»**; finalistas: «Lo llevamos» y «Delivery a cualquier negocio» (`08` §11.1) |
| **P-5** | ¿Quién avisa a la persona que **recibe en B**? *(No la respondiste)* | El **cliente comparte el enlace** de seguimiento por WhatsApp; Tindivo no envía mensajes automáticos |
| **P-12** | La foto al entregar «en versión pequeña»: ¿**sin pantalla de captura en v1** y solo dejar preparada la columna? | **Sí**: solo se deja preparada (`06` B-13) |
| **P-13** | Sobre el backlog, ¿lo que quedó **fuera de v1** es **solo** la calificación y la foto, o también otra cosa que mencionaste («hay varias cositas… los pendientes»)? | Solo B-12 y B-13, además de lo que ya había en `06` |

---

## Lo que Jesús debe resolver fuera del software

- **Proteger las botellas** para que no revienten con los baches (acolchado en el compartimento aislado).
- **Cargar el QR/Yape de cada motorizado** (Jesús lo precarga: `03` §3).
- **Revisión legal** del texto de responsabilidad y, si quiere quedarse tranquilo, de las **medicinas** (no encontré una norma concreta para un mensajero; `05` §3).
- **Preguntar en la Municipalidad de San Jacinto** si tiene alguna regla local sobre entregar bebidas alcohólicas (las sanciones de la Ley 28681 las fijan las ordenanzas municipales; `05` §4).
- **Comprobar las condiciones de Yape** para una cuenta personal que recibe muchos cobros pequeños.
- **Artes** para la tarjeta de Encargos y su banner.

---

## Cómo se medirá la primera prueba

Es una **prueba corta**, no un lanzamiento.

| Métrica | Objetivo |
|---|---|
| Encargos completados de punta a punta en las primeras 2 semanas | ≥ 10 |
| Tiempo hasta que un motorizado acepta | Se mide por separado lunes–viernes (1 motorizado) y sábado–domingo (2) |
| Encargos `expired` | Se cuentan y se miran uno por uno |
| Deuda del motorizado al cierre de cada día | Cuadra al centavo con el efectivo y el Yape |
| Pedidos de restaurante demorados por atender un encargo | 0 |
| Botellas rotas y reclamos por contenido | Se cuentan; si son muchos, se revisan las reglas de «Bebidas» |

---

## Registro

Ver las dos tablas de arriba. Lo cerrado vive en la primera; lo demás se asume tal cual salvo que se diga lo contrario. Cuando estén cerradas, se llevan a **`DECISIONS.md §29`**.
