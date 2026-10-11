Audité `docs/canon-dinero@b8a4f88`. **No firmo su promoción al canon todavía**: hay afirmaciones incorrectas y discrepancias con normas vigentes que debe resolver Jesús.

Cambios exactos propuestos en `dinero.md`:

1. **Bloqueo: el repo contradice el dato recibido de producción.** [`0180`](</D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2-docs/supabase/migrations/0180_the_admin_can_say_the_suspension_is_for_debt.sql:55>) escribe `blocked_for_debt = p_for_debt`; la API pasa `forDebt`. `0076` exige `balance_due <= 0` para desbloquear. Sustituir el punto 4 por:

   > No hay bloqueo automático por deuda. El repo permite que Jesús bloquee manualmente por deuda; registrar un pago levanta ese bloqueo solo si el saldo queda en cero o menos. Esto contradice la observación recibida de producción y requiere contrastar ambas versiones. La periodicidad de liquidación sigue pendiente de reconciliar con `DECISIONS.md §4`.

2. **La banda no nace siempre del motorizado.** `0190` permite declararla a la cajera; `0230` la calcula para pedidos web. `0224` conserva la tarifa previa al recoger. Sustituir ese párrafo por:

   > La banda puede venir del negocio o del cálculo del sistema; el motorizado puede declararla al recoger, sin recalcular por ello la tarifa ya guardada. Jesús puede corregirla después de entregar, mientras exista un cargo de envío pendiente: cambia el reparto entre comida y envío, conservando el total del pedido.

3. **No siempre se crean dos cargos; un cancelado puede generar deuda de reembolso.** [`0124`](</D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2-docs/supabase/migrations/0124_balance_due_is_derived_and_settlements_are_gone.sql:109>) contiene `IF v_delivery_fee > 0` e `IF v_commission > 0`. Sustituir el punto 1 por:

   > Al entregar, se crea un cargo pendiente por cada importe positivo de envío y comisión. El recojo y el envío gratis no generan cargo de envío. Un cancelado no genera estos cargos, pero puede generar un cargo de reembolso.

4. **El total liquidado incluye el reembolso.** Sustituir el párrafo de conciliación por:

   > Medido al 2026-10-10: S/ 3,165.00 liquidados —S/ 3,144.50 de comisión y envío más S/ 20.50 de `refund_charge`— y S/ 273.00 pendientes. Los 23 pagos suman S/ 3,165.00: coincide la suma agregada; falta verificar la conciliación por pago y cargos vinculados.

5. **Registrar deuda no demuestra devolver dinero.** Sustituir la introducción de reembolsos por:

   > El código registra tres caminos de cargos de reembolso contra el negocio; registrar el cargo no ejecuta una devolución al cliente. Quién adelanta y quién devuelve requiere decisión de Jesús.

   Añadir:

   > Si falla el cargo automático por prepago cancelado, se abre un reporte `prepay_refund_review`.

   Sustituir «En toda la historia hubo un reembolso…» por:

   > Los datos recibidos muestran un `refund_charge` liquidado de S/ 20.50 y ninguna reclamación de fraude; no identifican el origen del cargo ni prueban la devolución al cliente.

6. **Hay afirmaciones históricas sin respaldo crudo suficiente.** Sustituir «Toda la historia…» por:

   > En las semanas reportadas desde el 2026-08-03, la comisión fue S/ 1.50 por delivery y S/ 1.00 por recojo.

   Sustituir el párrafo de promociones por:

   > Los 16 pedidos reportados con fuente `promo` tuvieron envío al cliente y cargo de envío al negocio de S/ 0.00, con comisión de S/ 1.50. El código contempla promociones generales y por plato; los datos recibidos no identifican qué promoción originó cada pedido ni verifican que la general esté hoy inactiva.

7. **Flujos omitidos.** Añadir:

   > En recojo, el negocio registra el pago y entrega en mostrador; se genera la comisión de recojo y no hay efectivo que rendir por motorizado.

   > Los pedidos manuales permiten modificar total y forma de pago antes de que el motorizado llegue al local (`update_business_manual_order`).

   > En Entregas, `driver_courier_step` registra el cobro mediante `advance_courier_order`. Una cancelación posterior conserva ese cobro y permite rendirlo; el código no ejecuta su devolución.

   > Store registra precio y estado vendido; esos registros no prueban un cobro ni constituyen una liquidación.

Las seis entradas para Jesús necesitan estos ajustes:

- **Cabecera:** sustituir «Ninguna es un defecto activo…» por «El uso escaso o nulo no demuestra ausencia de defectos».
- **1:** quitar «Nunca ha ocurrido…». Mantener la recomendación de devolución directa, aclarando: «¿Quién devuelve, con qué evidencia y cuándo corresponde cargar deuda con Tindivo?».
- **2:** sustituir la conclusión sobre el signo por «¿Quién es el beneficiario de la cobertura y quién financia la pérdida? Recomiendo definirlo antes de cambiar el signo o retirar el flujo».
- **3:** sustituir por «¿Autorizas que Jesús adelante dinero propio en apelaciones y lo recupere del negocio? Adelantar dinero propio no demuestra retención de fondos del cliente».
- **4:** sustituir por «El canon dispone bloqueo manual y el repo implementa la marca por deuda; producción fue reportada de otra forma. Recomiendo contrastar `block_business` antes de proponer retirar la marca o introducir automatismo».
- **5:** quitar las cifras operativas sin crudos y preguntar «¿Sigue vigente ~S/ 30 por motorizado por noche? ¿Con qué costos y dotación se calcula el equilibrio?».
- **6:** cambiar «las rindió» por «declaró haberlas rendido»; falta confirmación del receptor.

Faltan preguntas sobre **comisión y periodicidades frente a `DECISIONS.md §4`**, **devolución de Entregas canceladas después del cobro**, **quién cubre faltantes de efectivo** y **quién cobra las ventas de Store**. Los tres primeros puntos de «Lo que ya no es pregunta» deben seguir abiertos: evidencia de ejecución no equivale a aprobación.

No modifiqué archivos. Otra sesión cambió la rama durante la revisión; comprobé que los archivos auditados no difieren entre ambos commits.