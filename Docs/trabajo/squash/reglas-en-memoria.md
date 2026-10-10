# Reglas que vivían en la memoria de Claude, pendientes de pasar al canon

> 2026-10-10 · Paso 6 del estándar (§6.6). Estas notas solo las veía Claude. **No son canon todavía**: cada una se
> contrasta con el código y la base al reescribir su área (paso 5) y se promueve con la aprobación de Jesús. Este
> archivo se borra cuando la última esté promovida o descartada.

| # | Regla | Origen | Qué es | Área de destino |
|---|---|---|---|---|
| 1 | **El sencillo lo pone la cajera.** El vuelto que lleva el motorizado lo adelanta siempre la caja del negocio; el motorizado nunca pone fondo propio. Lo que rinde = adelanto + efectivo recibido del cliente − vuelto entregado. | Jesús, 2026-08-11 | Decisión de negocio | Dinero |
| 2 | **Los avisos de estado al cliente van solo por la app** (push, pantalla abierta, título de la pestaña, badge o banner del pedido en curso). Ni llamadas ni WhatsApp son canal de aviso; la llamada de la cajera es antifraude. | Jesús, 2026-09-06 (dos veces) | Decisión de producto | Cliente · notificaciones |
| 3 | **Si suena, se ve.** En `apps/negocios`, la condición de sonar y la de pintar el aviso salen de una sola llamada (`lib/orders/attention.ts` → `attentionState`), con `banner === null` ⟺ `!hasPending`. Separarlas perdió un pedido en producción. | Incidente en producción | Invariante técnico | Pedidos de restaurante (negocios) |
| 4 | ~~`create_customer_order` es de los dos canales~~ **Refutada el 2026-10-10:** la cajera crea sus pedidos con `create_business_manual_order` (425 de 425 en 30 días, sin ítems); `create_customer_order` solo la usa la app. Ya está corregido en `negocio/pedidos-restaurante.md`. | Medido en prod | Ya no aplica | — |
| 5 | **`business_service_days` guarda lo declarado, no lo trabajado**: en prod contradice a los pedidos. «Trabajó esa noche» se cuenta con jornadas distintas con al menos un `delivered`, como hace `business_performance_metrics` desde la 0222. | Medido en prod, 2026-09-07 | Hecho de datos | Pedidos de restaurante (horarios y métricas) |
| 6 | **La declaración de apertura es por día, no por turno**: una fila por `business_id + service_date`. El turno se deriva del horario (`packages/contracts/src/schedule.ts`); una declaración vale si se hizo después de que terminara el turno anterior. | Medido en prod | Hecho + diseño | Pedidos de restaurante (horarios) |
| 7 | **La franja horaria de un plato se deriva en cada lectura, sin cron** (0226): `is_available` = «se acabó» (lo decide la cajera) y la franja = «no es su turno»; disponible = las dos. La API manda la regla, no el resultado, por el ISR de 15 s. La regla vive duplicada en TS y SQL a sabiendas. | Pedido de La Florencia, 2026-09-10 | Decisión de diseño | Catálogo |
| 8 | **Un plazo que se le enseña a alguien sale del sitio que de verdad cancela**: desde la 0174 los plazos viven solo en `app_settings.timers`. Antes, la misma cifra estaba en tres sitios y la `0113` cambió solo uno. | Arreglado en la 0174 | Patrón técnico | Arquitectura (parámetros operativos) |
| 9 | **`address_directory` mezcla dos épocas**: `legacy_address_id IS NOT NULL` = entregas consumadas del v1; `NULL` = filas que crea la cajera al **tomar** el pedido (0145). Estar en el directorio no prueba una entrega. El corte a v2 fue hacia el 2026-08-11. | Jesús, 2026-08-18 + medido | Hecho de datos | Plataforma (datos) |
| 10 | **El desacoplamiento es la prioridad de arquitectura**: lo nuevo nace desacoplado, lo que se toca se deja mejor, lo que no se toca no se toca; monolito modular, sin microservicios todavía. | Jesús, 2026-10-08 | Prioridad de Jesús (los estándares que la desarrollan siguen en propuesta) | Arquitectura (ADR) |
| 11 | **Libro de Reclamaciones: en stand by** por falta de RUC. Decidido: es de Tindivo hacia el consumidor (no por negocio), formulario público sin sesión, copia por correo con Resend tras `RESEND_API_KEY`, datos del proveedor en `app_settings`. | Acordado 2026-08-16 | Tema abierto | `Docs/trabajo/` como tema propio al retomarlo |
| 12 | **Decisiones de diseño de Entregas** (naranja del customer `#F97316`, texto `#C2410C`; sin azul; «Desde S/ 3»; pago confirmado obligatorio; patrones de inDrive), **manual de marca** (Geist; el logo es vectorial y no se escribe con fuente; descartado el carbón sobre naranja) y la vara de calidad «nivel inDrive, mobile first». | Jesús, 19-20 sep | Decisiones de diseño | Diseño · Entregas |
| 13 | **Canvas de avisos al cliente y de la tarjeta del motorizado**: propuestas publicadas, sin implementar. | Propuesta de Claude | Propuesta | `Docs/trabajo/` si se retoman |

## Una discrepancia que la memoria daba por abierta y ya no existe

La nota de la regla 1 decía que la rama `deliver` de `advance_order` (0140) calculaba lo que rinde el motorizado en
**neto** y dejaba escapar el adelanto. **Comprobado el 2026-10-10 en `tindivo-prod` (solo lectura): ya no.** Hay una
sola `advance_order` y su rama `deliver` hace `v_cash_owed := round(v_advance + v_cash_portion, 2)`, con el comentario
«rendir = adelanto + efectivo recibido − vuelto devuelto». Lo corrigió la `0146`. Al reescribir el área de dinero,
`spec-efectivo-todo-vuelve.md` se lee con eso en mente: sus tablas en neto son anteriores al arreglo.
