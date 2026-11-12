# Retención de datos: plazos, purga diaria y borrado manual

Runbook de los plazos de conservación que fijó Jesús el 2026-11-12. La política de privacidad solo
promete lo que esta página describe como **automático** o como **procedimiento manual con
responsable**. Si un plazo estuviera en «pendiente de decisión», la política no puede prometerlo todavía (hoy no hay ninguno).

- Mecanismo: migraciones `supabase/migrations/0284_los_datos_tienen_plazo_de_conservacion.sql` y `0285_la_caja_y_los_reclamos_tienen_plazo_de_conservacion.sql` (esta, de dinero) y `0286_el_antifraude_solo_cuenta_lo_de_los_ultimos_24_meses.sql`,
  módulo `packages/backend/src/modules/retention/` (`applyRetentionPolicy`) y job Inngest
  `apply-data-retention-cron` (`apps/api/lib/inngest/functions.ts`), todos los días a las **04:45 de
  Lima**. La purga de comprobantes de cuentas borradas (0269, 90 días) es otro job, a las 04:30.
- Plazos: `app_settings.data_retention` (jsonb, en meses). Se cambian ahí, sin desplegar. Si la clave
  falta o un valor no es un entero entre 1 y 1200, esa categoría **no se toca** (falla cerrada).
- Cómo se cuenta: en días de Lima. Vence lo ocurrido **antes** del día de corte (hoy en Lima menos el
  plazo); lo del mismo día de corte se queda hasta el día siguiente.
- Ninguna purga toca importes, estados ni fechas de negocio, ni borra filas de dinero (invariante 9). El plazo de caja está en años (`cashRecordsYears`, 1 a 100).

## Tabla de plazos

| Dato | Tabla y columnas | Plazo y desde cuándo | Qué pasa | Estado |
|---|---|---|---|---|
| Comentario de una reseña | `order_reviews.comment` | Al borrar la cuenta | Se borra; quedan nota y etiquetas, sin autor | Automático (`delete_customer_account`, 0284) |
| Comprobantes de una cuenta borrada | `orders.comprobante_prepago_url`, archivos de `payment-proofs` y `receipts` | 90 días desde el borrado | Se borran archivo y referencia | Automático (0269, 04:30) |
| Incidentes antifraude revisados | `customer_incidents`: teléfono, referencia, descripción, `customer_user_id` | 24 meses desde el hecho o su revisión (lo más reciente) | Se anonimizan; el teléfono queda como `eliminado` (la columna no admite NULL). Un incidente sin revisar no se toca | Automático (`anonymize_old_customer_incidents`) |
| Reportes cerrados | `reports`: teléfono, descripción, nota de resolución, `customer_user_id`, evidencia | 24 meses desde el hecho, la resolución o la devolución (lo más reciente) | Se anonimizan. La imagen de la evidencia se borra de Storage antes, salvo que otra fila la use. Un reporte abierto, una apelación pendiente o en revisión y una devolución pendiente no se tocan. `refund_proof_path` se conserva (comprobante de dinero) | Automático (`list_report_retention_due` → Storage → `finish_report_retention`) |
| Restricciones del número levantadas o vencidas | `phone_restrictions` | 24 meses desde `lifted_at` o `until` (el más tardío) | Se eliminan. Una restricción activa nunca se toca | Automático (`purge_old_phone_restrictions`) |
| Eventos de la tienda | `store_events` | 13 meses desde `created_at` | Se eliminan | Automático (`purge_old_store_events`) |
| Registro de envío de avisos | `push_delivery_log` | 13 meses desde `at` | Se eliminan | Automático (`purge_old_push_delivery_log`) |
| Alertas de administración resueltas | `admin_alerts` | 13 meses desde `resolved_at` | Se eliminan; una alerta sin resolver no se toca | Automático (`purge_old_admin_alerts`) |
| Notas de liquidaciones de caja | `cash_settlements.dispute_note`, `resolution_note` | 5 años desde el 1 de enero siguiente a `created_at` (hora de Lima) | Se borran las notas; importes, estado y fechas se quedan. Una liquidación en disputa no se toca | Automático (`anonymize_old_cash_settlement_notes`, 0285; **pendiente de revisión de Jesús**) |
| Reclamos económicos antifraude | `fraud_coverage_claims`: `reason`, `resolution_note`, `evidence_url` | 5 años desde el 1 de enero siguiente a `created_at` (hora de Lima) | El motivo queda como `Dato eliminado`, se borran nota e imagen (Storage antes); el importe y el estado se quedan. Un reclamo pendiente no se toca | Automático (`list_fraud_claim_retention_due` → Storage → `finish_fraud_claim_retention`, 0285; **pendiente de revisión de Jesús**) |
| Strikes antifraude | `customer_strikes` | 24 meses desde `created_at` (`strikesMonths`) | Dejan de contar para el prepago y se anonimizan: teléfono → `eliminado`, sin referencia, coordenadas, cuenta ni pedido | Automático (`anonymize_old_customer_strikes`, 0286) |
| Directorio de la cajera | `address_directory` | 24 meses sin uso: lo último entre `last_used_at`, `updated_at` y `created_at` (`addressDirectoryMonths`) | Deja de hacer «confiable» al número y se elimina; los pedidos no se pierden (`ON DELETE SET NULL`) | Automático (`purge_old_address_directory`, 0286) |
| Historial de dueños del número | `phone_assignments` y sus `phone_transfer_challenges` | 24 meses desde `ended_at` (`phoneAssignmentsMonths`) | La asignación terminada deja de contar y se elimina con sus desafíos. Una asignación abierta nunca se toca | Automático (`purge_old_phone_assignments`, 0286) |
| Solicitudes de soporte y de derechos ARCO | Fuera de la base (WhatsApp de soporte) | 2 años desde la respuesta | Borrado manual | Manual (procedimiento abajo) |

### Ventana de 24 meses del antifraude (0286)

Jesús decidió el 2026-11-12 que el antifraude solo cuenta lo de los últimos 24 meses, y aceptó que eso
**cambie a quién se le exige pago adelantado**:

- Quien tuvo strikes hace más de 24 meses vuelve a poder pagar contra entrega.
- Un número que solo era confiable por una fila del directorio sin uso en 24 meses pasa a `no_history`
  (pago adelantado o validación por GPS).
- La asignación terminada de un dueño anterior protege a quien recicla el número mientras haya terminado
  dentro de la ventana; pasada, el nuevo dueño puede ganar confianza por el historial del teléfono.

`customer_requires_prepayment` y `customer_contraentrega_decision` cuentan solo lo que cae dentro de la
ventana; la purga diaria quita lo que la pasa. La regla de validación de `create_customer_order` y
`refresh_customer_profile_risk` no llevan ventana propia: quedan coherentes por la purga (desfase máximo
de un día). Si una clave de `data_retention` falta o es inválida, esa ventana no excluye nada y esa tabla
no se purga (falla cerrada: se cuenta todo, como antes de la 0286).

## Solicitudes de soporte y de derechos ARCO (manual)

Las solicitudes llegan por el **WhatsApp de soporte** (política de privacidad, §5). No se guardan en
la base de Tindivo.

- **Responsable:** Jesús (dueño), o quien él designe por escrito.
- **Qué se borra:** el chat de la solicitud en el WhatsApp de soporte (mensajes, audios, imágenes y
  documentos adjuntos, como fotos del DNI) y cualquier copia: capturas en el teléfono o en la PC,
  notas, hojas de cálculo o correos reenviados.
- **Cuándo:** 2 años después de la última respuesta de Tindivo en esa solicitud. Revisión el **primer
  día hábil de cada mes**: se borran las solicitudes cuya última respuesta tenga más de 2 años.
- **Cómo:**
  1. En WhatsApp Business, abrir el chat y comprobar la fecha de la última respuesta.
  2. Si pasó el plazo, sin exportar el chat: «Vaciar chat» incluyendo multimedia y, si ya no hay
     relación activa con la persona, «Eliminar chat».
  3. Borrar del teléfono y de la PC las capturas o archivos de esa solicitud (galería, Descargas,
     carpeta de WhatsApp).
  4. Anotar en el registro mensual: fecha de la revisión, cuántas solicitudes se borraron y quién lo
     hizo. **Sin** nombres ni teléfonos: el registro no puede volver a guardar el dato.
- **Excepción:** si hay un reclamo o un proceso legal abierto sobre esa solicitud, se conserva hasta
  que se cierre y se anota el motivo en el registro.

## Cómo se comprueba que la purga corre

1. **Inngest:** en el panel de Inngest, la función `apply-data-retention-cron` debe tener una corrida
   por día, a las 04:45 de Lima, en estado `Completed`. Su resultado es un resumen por categoría:
   `{ rows, files, pending, failed }`.
2. **Logs:** el módulo `retention` deja una línea `data_retention_category_done` por categoría con los
   conteos, y `data_retention_category_failed` o `data_retention_row_failed` si algo falló (solo el
   tipo de error: nunca ids, rutas ni mensajes). `failed > 0` dos días seguidos en la misma categoría
   es un incidente: revisar la base o Storage.
3. **`pending` en `reports`:** filas anonimizadas cuya evidencia es una URL externa que la purga no
   puede borrar. Revisarlas a mano:
   ```sql
   select id, evidence_url from public.reports
   where evidence_url is not null and position('://' in evidence_url) > 0
     and customer_phone is null and description is null and customer_user_id is null;
   ```
4. **Nada vencido sin tocar** (con `service_role` o en el editor de solo lectura): cada consulta debe
   dar 0 al día siguiente de una corrida sin fallos.
   ```sql
   select count(*) from public.store_events where created_at < public.retention_cutoff('storeEventsMonths');
   select count(*) from public.push_delivery_log where "at" < public.retention_cutoff('pushDeliveryLogMonths');
   select count(*) from public.admin_alerts
    where resolved_at < public.retention_cutoff('adminAlertsMonths');
   select count(*) from public.phone_restrictions
    where (lifted_at is not null or "until" <= now())
      and greatest(lifted_at, "until") < public.retention_cutoff('phoneRestrictionsMonths');
   select count(*) from public.customer_incidents
    where reviewed_at is not null and customer_phone <> 'eliminado'
      and greatest(created_at, reviewed_at) < public.retention_cutoff('customerIncidentsMonths');
   select count(*) from public.reports r
    where public.retention_report_due(r, public.retention_cutoff('reportsMonths'));
   ```
   El job procesa como mucho 10 000 filas por categoría de lote y 1000 reportes por corrida: el primer
   día en producción puede quedar resto, que sale en los días siguientes.
5. **Pruebas:** `apps/api/lib/__tests__/data-retention.integration.test.ts` (base local, `pnpm db:cycle`)
   y `packages/backend/src/modules/retention/application/apply-retention-policy.test.ts`.
