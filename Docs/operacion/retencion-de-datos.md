# Retención de datos: plazos, purga diaria y borrado manual

Runbook de los plazos de conservación que fijó Jesús el 2026-11-12. La política de privacidad solo
promete lo que esta página describe como **automático** o como **procedimiento manual con
responsable**. Si un plazo está en «pendiente de decisión», la política no puede prometerlo todavía.

- Mecanismo: migración `supabase/migrations/0284_los_datos_tienen_plazo_de_conservacion.sql`,
  módulo `packages/backend/src/modules/retention/` (`applyRetentionPolicy`) y job Inngest
  `apply-data-retention-cron` (`apps/api/lib/inngest/functions.ts`), todos los días a las **04:45 de
  Lima**. La purga de comprobantes de cuentas borradas (0269, 90 días) es otro job, a las 04:30.
- Plazos: `app_settings.data_retention` (jsonb, en meses). Se cambian ahí, sin desplegar. Si la clave
  falta o un valor no es un entero entre 1 y 1200, esa categoría **no se toca** (falla cerrada).
- Cómo se cuenta: en días de Lima. Vence lo ocurrido **antes** del día de corte (hoy en Lima menos el
  plazo); lo del mismo día de corte se queda hasta el día siguiente.
- Ninguna purga toca importes, estados ni fechas de negocio, ni borra filas de dinero (invariante 9).

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
| Strikes antifraude | `customer_strikes` | 24 meses (propuesto) | — | **Pendiente de decisión**: el prepago los cuenta sin ventana (ver abajo) |
| Directorio de la cajera | `address_directory` | 24 meses sin uso (propuesto) | — | **Pendiente de decisión**: una fila hace «confiable» al número (ver abajo) |
| Historial de dueños del número | `phone_assignments` (y `phone_transfer_challenges`) | 24 meses desde `ended_at` (propuesto) | — | **Pendiente de decisión**: protege a quien recicla un número (ver abajo) |
| Solicitudes de soporte y de derechos ARCO | Fuera de la base (WhatsApp de soporte) | 2 años desde la respuesta | Borrado manual | Manual (procedimiento abajo) |

### Por qué hay plazos pendientes de decisión

Borrar o anonimizar estas filas **cambia a quién se le exige pago adelantado**, y eso es una decisión
de negocio, no de retención:

- `customer_strikes`: `customer_requires_prepayment`, `customer_contraentrega_blocked`,
  `refresh_customer_profile_risk` y la regla de validación de `create_customer_order` cuentan strikes
  por teléfono y por referencia **sin ventana de tiempo**. Anonimizar teléfono y referencia de un
  strike viejo le quitaría a ese número el prepago obligatorio.
- `address_directory`: `customer_contraentrega_decision` da por confiable (`trusted`) a un número con
  **cualquier** fila en el directorio. Borrar la fila lo pasa a `no_history`: pago adelantado o
  validación por GPS.
- `phone_assignments`: la misma función mira si el número tuvo **otro** dueño; si lo tuvo, solo cuenta
  la confianza ganada en la asignación actual. Borrar la asignación terminada del dueño anterior haría
  que el nuevo heredara sus entregas (P5 de 0277). No se puede anonimizar `user_id` (NOT NULL con FK).

Para aplicar estos plazos hace falta antes decidir la regla de riesgo (por ejemplo, contar strikes
solo de los últimos 24 meses, o guardar «el número tuvo otro dueño» sin la persona).

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
