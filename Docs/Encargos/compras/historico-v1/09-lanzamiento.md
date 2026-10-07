# 09 · El lanzamiento: la semana, el ensayo y cuándo se decide

> Simulado como si se lanzara el **lunes 12 de octubre de 2026**. Las fechas son
> la meta, no una promesa. Si algo se atrasa, se recorta lo que diga el README,
> **no** el modo compra ni el cuadre.

## 1. La semana

| Día | Software | Calle y operación | Listo cuando |
|---|---|---|---|
| **Mar 6** | Esta propuesta | — | Jesús la lee |
| **Mié 7** | Decisiones D1–D9 → `DECISIONS §33`. Migración `0246`, `packages/core` con TDD, RPC y tests de integración. Arreglo del teléfono público (`08` §2.5) | Jesús: comprueba **Yape** (`04` §8). Habla con **Pollería Nadia** (`02` §4) | Tests verdes con `Cached: 0` |
| **Jue 8** | `apps/motorizados`: tarjeta, modo compra, preguntar, cobrar, «Mi cuadre» | Jesús: arma el **canguro** del fondo y el sencillo | e2e del motorizado: comprar con un «no hay» y cobrar |
| **Vie 9** | `apps/admin`: `/encargos/nuevo`, `/directorio` (con cámara), `/cuadre`, tablero. `apps/customer`: formulario y seguimiento | Jesús: lista de los 5 aliados y la ruta del sábado | e2e completo de punta a punta, en local |
| **Sáb 10** | `supabase db push` **de madrugada**. Apps a producción con `enabled: false` | **Calle (3 a 4 h):** 5 aliados, fotos de fachada, 10-15 productos cada uno, stickers. Carga desde el admin, en el celular | 5 tiendas con productos visibles en prod |
| **Dom 11** | Arreglos del ensayo | **Ensayo general** (§2). **10 min de capacitación** al motorizado (`05` §5) | Los 8 encargos del ensayo cuadran al céntimo |
| **Lun 12** | `enabled: true` a las 5:30 pm | Lanzamiento suave (§3) | Primer encargo real |

## 2. El ensayo del domingo: 8 encargos que fuerzan los casos

Jesús (y una o dos personas de confianza) piden **de verdad**, con plata de
verdad, a los aliados de verdad. Cada encargo fuerza un caso de `03`:

| # | Encargo | Qué se prueba |
|---|---|---|
| 1 | 2 cosas de Bodega Kira, todo hay, paga con Yape | El camino feliz y la boleta |
| 2 | 3 cosas de la botica, una con «Pregúntame» que **no hay**, el cliente dice que sí | La pregunta, el push y el reloj |
| 3 | Igual, pero el cliente **no contesta** | Que venza a los 3 min y se salte |
| 4 | El imprescindible **no hay** | Cancelar sin gastar ni cobrar |
| 5 | Lista que **pasa del tope** | Que la app diga qué dejar |
| 6 | Paga en efectivo con S/ 50 y el motorizado da vuelto | El vuelto y el sencillo |
| 7 | Pollería El Sabroso, pedido anticipado | La llamada, «listo a las…» y el recordatorio |
| 8 | Creado **desde el admin** con un mensaje de WhatsApp pegado; **nadie abre la puerta** | Crear en menos de 1 min, los 5 min de espera, volver con la bolsa, marcar pérdida y bloquear |

Al terminar: **cuadre completo** en la app del motorizado y en el admin. Si no
cierra al céntimo, **no se lanza el lunes**: se arregla y se ensaya otra vez.

**Además se mide:** cuántos minutos le tomó a Jesús todo el ensayo. Si pasan de
15 min de intervención (sin contar pedir), hay algo que el sistema no está
resolviendo.

## 3. El lanzamiento suave

**No hay afiche la primera semana.** Primero se comprueba que funciona, luego
se grita.

1. **Clientes que ya pidieron encargos por WhatsApp:** Jesús les escribe uno
   por uno con el enlace. Es el público que ya quiere esto.
2. **Respuesta automática** de WhatsApp Business con el enlace (`02` §6).
3. **Estado de WhatsApp** de Jesús, lunes y miércoles, con un caso real: *«Hoy
   le llevamos a la señora Rosa su remedio de la botica en 25 min. Tindivo
   Encargos: te lo compramos y te lo llevamos. tindivo.com/encargos»*.
4. **Stickers con QR** en la puerta de los 5 aliados.
5. **Banner en el home** de tindivo.com, junto a Comida y Entregas. Quien ya
   pide comida ve que existe.

**Semana 2 (L19–J22):** si la semana 1 cuadró y no demoró la comida, se suma
la base de clientes de comida por canales consentidos y el afiche.

## 4. Las noches del piloto

**8 noches:** L12, M13, X14, J15, L19, M20, X21, J22. De 6 a 10 pm.

Cada noche, al cerrar, Jesús hace **tres cosas** y nada más:

1. Confirma el cuadre (`06` §4).
2. Mira la pestaña de reportes (§5).
3. Anota en una línea **qué fue raro** (`Docs/Encargos/compras/bitacora.md`,
   que se crea el lunes).

## 5. Qué se mide

Todo sale de las tablas (`08` §2). Nada depende de que alguien lo anote.

| Métrica | Meta | Alarma |
|---|---|---|
| **Encargos completados por noche** | **4** | < 2 dos noches seguidas |
| Tiempo de aceptar → entregado (mediana) | ≤ 35 min | > 45 min |
| Tiempo dentro de la tienda (mediana) | ≤ 8 min | > 15 min |
| Encargos cancelados por «no hay nada» | ≤ 1 de 10 | > 1 de 10 (`03` §6) |
| Artículos saltados | ≤ 1 de 4 | > 1 de 4 |
| Preguntas que vencen sin respuesta | ≤ 1 de 2 | > 1 de 2 |
| **Cuadre** | Al céntimo **todas** las noches | Una noche que no cierra |
| **Pérdidas** | ≤ S/ 15 por semana | > S/ 15 |
| **Pedidos de comida demorados por un encargo** | **0** | 1 |
| **Minutos de Jesús por noche** | ≤ 15 | > 15 tres noches |
| Encargos creados por Jesús (canal WhatsApp) | Bajando cada semana | Más de la mitad en la semana 2 |
| Clientes que repiten | Se registra | — |
| Ingreso por encargo (servicio) | S/ 3.50-3.70 | — |

**Cómo se mide «comida demorada por un encargo»:** pedidos de comida cuyo
motorizado tenía un encargo activo cuando el pedido pasó a listo, y que tardó
más que la mediana de la semana. Es una aproximación: se revisa caso por caso.

## 6. La decisión del jueves 22

| Resultado | Qué se hace |
|---|---|
| **≥ 4 por noche, cuadre perfecto, 0 comida demorada, ≤ 15 min de Jesús** | **Seguir.** Afiche, abrir viernes 6-7 pm, segunda botica y segunda bodega, y en v1.1 el pago directo a la tienda (`04` §3) |
| **2-4 por noche y la operación sana** | Seguir **una semana más cambiando una sola cosa**: el canal (más difusión) si la gente no llega, o el formulario si llega y no termina |
| **La operación duele** (cuadre que no cierra, comida demorada, Jesús > 15 min) | **Pausar** los encargos sin vergüenza, arreglar lo que falló y volver a ensayar. La demanda no se va |
| **< 2 por noche con exposición real** | La oferta no convence a S/ 3.50 en la web. Se prueba la promo acotada (`01` §4) antes de concluir nada |

**Lo que no se hace en ningún caso:** abrir el fin de semana, construir panel
para aliados o pasar esto a la app móvil antes de dos semanas seguidas sanas.

## 7. Lo que hay que tener en la mano el lunes a las 5:30 pm

- [ ] `courier.purchase.enabled = true` y horario L–J 18:00-22:00
- [ ] Canguro con S/ 100 (S/ 20 en monedas) registrado en la app
- [ ] QR de Yape del motorizado impreso y en su celular
- [ ] 5 aliados con sticker, foto y productos
- [ ] Respuesta automática de WhatsApp Business con el enlace
- [ ] Pollería Nadia avisada (`02` §4)
- [ ] Plantillas de Entregas sin la palabra «encargo» (`02` §1)
- [ ] El teléfono de los aliados **no** se ve como `anon` (`08` §2.5)
- [ ] Jesús sabe dónde mirar: `/encargos` y `/cuadre`
- [ ] El motorizado hizo el ensayo y sabe las 5 reglas (`05` §5)
