# 04 · Registro de decisiones de Tindivo Entregas

> **v1.0 · 2026-09-19.** Sustituye a la versión anterior (`historico-pre-v2/` (borrado; en git: `8f26aed`)), que arrastraba decisiones superadas. Aquí solo lo **vigente**.
> Cerradas por Jesús; lo demás lleva **propuesta por defecto**: si nadie dice lo contrario, se usa.

---

## Cerradas por Jesús

| Tema | Decisión | Fecha |
|---|---|---|
| **Nombre público** | **«Tindivo Entregas»**, siempre con la bajada *«Recogemos lo que ya pagaste y lo llevamos»*. Nunca «recojo», «encargos» ni «mandado» | 09-19 |
| **Qué es** | Recoger algo **ya coordinado, pagado y listo** y llevarlo dentro de San Jacinto. **Sin compras** | 09-18 |
| **Precio** | **S/ 3 fijo**, impreso «desde S/ 3». Por distancia, más adelante; se guarda `distance_m` desde el primer pedido | 09-19 |
| **Quién paga** | Negocio → quien recibe, en B. Persona → el cliente elige (quien entrega en A, o quien recibe en B). El artículo no cambia de manos hasta cobrar | 09-19 |
| **Dinero** | El motorizado cobra **solo el transporte** (efectivo exacto o **su Yape personal**) y queda **en deuda con Tindivo**; **rinde a diario** al admin. Jesús precarga el QR/Yape de cada motorizado | 09-18/19 |
| **Recargos y esperas** | **Sin recargos.** Espera máx. **5 min**; luego se cancela sin cobrar a nadie. El cliente cancela gratis hasta que el motorizado llega a A | v2 |
| **Tiempo para aceptar** | **15 minutos** (en vez de los 10 de los documentos v2), **configurable**. Razón: en horas pico un motorizado tarda hasta 15 min en terminar lo que trae | 09-19 |
| **Soltar** | Se puede **soltar** una entrega aceptada; el reloj **no se reinicia** | 09-19 |
| **Pedidos activos** | **Uno por teléfono** (en vez de los 2 de v2). Un cliente puede tener a la vez una entrega y un pedido a un restaurante | 09-19 |
| **Horario y zona** | Todos los días, **6 pm–11 pm**, **solo San Jacinto** dentro del polígono; no hay caseríos | v2 |
| **Motorizados** | **1 de lunes a viernes, 2 sábado y domingo** (excepciones) | 09-19 |
| **Límites** | **5 kg**; mochila **45×45×45 cm**; frágil marcable y el motorizado decide | v2 |
| **Sin foto** | El cliente no adjunta foto. La foto del motorizado al entregar: backlog | 09-19 |
| **Alcohol** | **Regla escrita («no se lleva») y sin control**: sin edad, sin casilla, sin categoría aparte (`05` §5) | 09-19 |
| **Medicinas** | Sí, en bolsa sellada, sin controladas, en el compartimento aislado | 09-19 |
| **Seguimiento** | Por **estados**; **sin GPS en vivo**. «Confirmado» = un motorizado lo acepta | v2 |
| **WhatsApp de Tindivo** | **Solo consultas**; no se hacen pedidos por WhatsApp | v2 |
| **Promo** | Ninguna al lanzar; el «primer delivery gratis» es solo de restaurantes | v2 |
| **Panel del motorizado** | **Un solo panel** con las entregas etiquetadas (**azul**); restaurantes primero | 09-19 |
| **Colores del mapa** | **Aliados naranja**, demás negocios **gris**, moto **azul** (no rojo) | 09-19 |
| **Mapa en el pedido** | **El mapa es lo principal**; «usar mi ubicación»; línea recta punteada A–B | 09-19 |
| **Directorio** | Se carga **a mano**, negocio por negocio, con **logo, nota interna y nota pública** y todos los campos de `origen-jesus-v2/02`. Los negocios con perfil en Tindivo aparecen con «Ver carta en Tindivo» | 09-19 |
| **Alta del directorio** | Nombre, teléfono, ubicación por GPS y logo bastan para publicar; el resto se completa después | 09-19 |
| **Estructura** | Tabla propia `courier_requests`, no `orders` | propuesta técnica |
| **Nombre técnico** | **`courier`** (inglés), no `recojo` | asumido: Jesús no lo objetó |

## Por defecto, sin rebatir

| Tema | Propuesta |
|---|---|
| **El servicio se pausa solo** si no hay motorizado disponible | Sí (`01` §3) |
| **Cuándo imprimir el afiche** | Después de una semana de prueba; el horario fuera del papel o en pegatina (`09` §3.9) |
| **Rendición** | Efectivo en mano o Yape a una **cuenta de negocio** de Tindivo; recibe el admin |
| **Sin avisos al admin** por ahora | El panel del admin se trabaja después |
| **Aviso al cliente de quien recibe (B)** | El cliente comparte el enlace de seguimiento por WhatsApp; sin mensajes automáticos |
| **Calificaciones** en los dos sentidos | Backlog (`06` B-12) |
| **Quién ve Entregas en la prueba** | Interruptor apagado + lista de prueba (a confirmar la relación con `apps/api/lib/pilot/gate.ts`, **no abierto**) |

## Lo que Jesús debe resolver fuera del software

- **Comprobar las condiciones de Yape** para una cuenta personal que recibe muchos cobros pequeños.
- **Proteger las botellas** (acolchado en el compartimento) para que no revienten con los baches.
- **Cargar el QR/Yape de cada motorizado.**
- **Revisión legal** del texto de responsabilidad y, si quiere, de las medicinas. **Preguntar en la Municipalidad** por el alcohol.
- **Medir** grifo → centro (5–10 km) para decidir escalones de precio.
- **Número de WhatsApp de consultas** para el afiche y **cuántos negocios** habrá al lanzar (no anunciar cifra).
- **Prueba de 5 segundos** con el nombre, antes de imprimir.
- **Artes** de la tarjeta del home y del banner.

## Cómo se medirá la primera prueba

De `origen-jesus-v2/00` §8 y `05` §7, con lo nuestro:

| Métrica | Objetivo |
|---|---|
| **Entregas completadas por semana entre semana** | ~40 |
| **Cancelados por `not_ready`** | Alarma si **> 1 de cada 5** |
| **Clics en «Llamar» frente a «Pedir entrega»** | El catálogo no puede ser solo una guía telefónica |
| **Segunda entrega pagando S/ 3** | Señal de salud |
| **Tiempo hasta que un motorizado acepta** | Se mide aparte lunes–viernes (1 motorizado) y sábado–domingo (2) |
| **Deuda del motorizado al cierre de cada día** | Cuadra al centavo con el efectivo y el Yape |
| **Pedidos de restaurante demorados por una entrega** | 0 |

**Decisión tras 2 semanas** (`origen-jesus-v2/05` §7): ≥ 40/semana y pocas cancelaciones → mantener S/ 3, probar S/ 3.50, sumar negocios · 15–40 → reforzar canales · < 15 → revisar el canal antes de invertir en producto.
