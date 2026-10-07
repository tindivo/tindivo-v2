# Tindivo Encargos · «Te lo compramos y te lo llevamos»

> **Propuesta v1 · 2026-10-06 · pendiente de aprobación de Jesús.**
> Escrita como si se lanzara el **lunes 12 de octubre**, para obligarnos a
> resolver lo que de verdad hará falta esa noche y no solo lo que se ve bonito
> en un documento.
> Base: la conversación del 4-oct (visto bueno de Juan Carlos a que sean dos
> servicios), los datos de `tindivo-prod` de hoy, lo ya construido de Entregas
> (`0232`–`0241`) y el debate del 30-sep (`Docs/nuevo-modelo/`), que **había
> dejado las compras fuera**. El §2 de `01-negocio.md` explica qué cambió.

## Qué es, en una frase

**El cliente pide desde tindivo.com una lista de cosas de una tienda de San
Jacinto; el motorizado de turno va, las compra con un fondo de Tindivo, se las
lleva y cobra al entregar: lo comprado más S/ 3.50.**

Es **otro servicio** que Tindivo Entregas, y así se presenta al cliente:

| | **Tindivo Entregas** (ya en prod) | **Tindivo Encargos** (esta propuesta) |
|---|---|---|
| Qué hace | Lleva algo **ya pagado y listo** de A a B | **Compra** por el cliente y lo lleva |
| Precio | S/ 3 | **S/ 3.50** (+ S/ 1 por una segunda tienda) |
| Dinero del producto | Nunca lo toca | Lo adelanta el **fondo de Tindivo** y se cobra al entregar |
| Quién lo pide | Cualquiera, persona a persona o negocio | Un cliente, para él |

Por dentro es **un solo motor** (`courier_orders`, con una columna `kind`):
mismo tablero del motorizado, mismos push, misma rendición. Ver `08`.

## Los documentos

| # | Documento | Qué resuelve |
|---|---|---|
| 01 | [`01-negocio.md`](01-negocio.md) | Por qué ahora, los números, el precio, la competencia y los riesgos |
| 02 | [`02-el-servicio.md`](02-el-servicio.md) | Reglas: qué se compra y qué no, horario, topes, el flujo del cliente |
| 03 | [`03-casos-dificiles.md`](03-casos-dificiles.md) | **«No hay el producto»** y otros 25 casos, cada uno con su respuesta decidida |
| 04 | [`04-dinero-y-cuadre.md`](04-dinero-y-cuadre.md) | El fondo, cómo se cobra, el cuadre nocturno al céntimo y quién absorbe pérdidas |
| 05 | [`05-herramienta-motorizado.md`](05-herramienta-motorizado.md) | **El modo compra**: que el motorizado no piense, solo toque |
| 06 | [`06-herramienta-admin.md`](06-herramienta-admin.md) | Tablero en vivo, crear un encargo desde WhatsApp, cuadre, clientes |
| 07 | [`07-aliados-y-catalogo.md`](07-aliados-y-catalogo.md) | Alianzas con tiendas y cómo tener «la idea» de su catálogo sin mantenerlo a mano |
| 08 | [`08-plan-tecnico.md`](08-plan-tecnico.md) | Tablas, RPC, rutas y pantallas sobre lo que ya existe |
| 09 | [`09-lanzamiento.md`](09-lanzamiento.md) | La semana día a día, el ensayo, las métricas y cuándo se decide |

## Lo que Jesús tiene que decidir antes del miércoles

Cada una lleva la recomendación. Si no se dice nada, se sigue la recomendación.

| # | Pregunta | Recomendación | Dónde |
|---|---|---|---|
| D1 | ¿Cómo se cobran hoy los encargos de WhatsApp? ¿Quién pone la plata de la compra? | Contármelo. Propuesta: **fondo de S/ 100 en efectivo** que Jesús entrega al motorizado cada noche | `04` §2 |
| D2 | ¿Tope de compra? | **S/ 40** a clientes con historial, **S/ 20** a nuevos. Más: v1.1 con pago directo a la tienda | `04` §3 |
| D3 | ¿Comida de restaurantes **no aliados** (Pollería El Sabroso)? | **Sí**, como «encargo con pedido anticipado». Los **aliados no**: se manda a su carta | `02` §4 |
| D4 | ¿Fin de semana? | **No, en el lanzamiento.** Lunes a jueves, 6 a 10 pm | `02` §3 |
| D5 | ¿Alcohol y cigarros? | **No.** Regla escrita, como en Entregas | `02` §2 |
| D6 | ¿Le pagamos algo extra al motorizado? | **S/ 0.50 por encargo que cuadra al céntimo**, no por volumen | `04` §7 |
| D7 | ¿El aliado ve su teléfono publicado? | **No.** Se ve todo menos el teléfono; del catálogo se muestra «la idea», no la lista de precios | `07` §3.4 |
| D8 | ¿«Encargos» como nombre público? | **Sí:** «Tindivo Encargos · Te lo compramos y te lo llevamos». Y **Entregas deja de decir «encargo»** en sus mensajes | `02` §1 |
| D9 | Los S/ 1.50 «de las mañanas»: ¿qué servicio es y quién lo cobra? | Contármelo. No se ofrece un precio menor al lanzar | `01` §4 |

**Al aprobar:** se escribe `DECISIONS.md §33 · Tindivo Encargos`, se anota en
`Docs/Encargos/04-decisiones-abiertas.md` que «no compramos» sigue valiendo
**para Entregas**, y se matiza otra vez «Tindivo no retiene fondos» (§4 y §7).
Hasta entonces, **gana `DECISIONS.md`**.

## El calendario, en corto

| Día | Qué | Ver |
|---|---|---|
| **Mar 6** | Esta propuesta | — |
| **Mié 7** | Decisiones D1–D9 · migración, RPC y tests | `08` |
| **Jue 8** | Modo compra del motorizado y cuadre | `05` |
| **Vie 9** | Admin (crear desde WhatsApp, tablero, cuadre) · formulario del cliente | `06` · `02` |
| **Sáb 10** | Calle: 5 aliados, fotos y productos · `db push` de madrugada | `07` |
| **Dom 11** | Ensayo general: 8 encargos con los casos difíciles forzados | `09` |
| **Lun 12** | Lanzamiento suave a clientes conocidos | `09` |
| **Jue 22** | Decisión con 8 noches de datos | `09` §6 |

**Si algo se atrasa**, se corta por aquí, en este orden: formulario del cliente
(Jesús crea los encargos desde el admin, `06` §2) → catálogo de productos →
tablero en vivo. **Lo que no se corta nunca:** el modo compra del motorizado y
el cuadre. Sin eso no se lanza.
