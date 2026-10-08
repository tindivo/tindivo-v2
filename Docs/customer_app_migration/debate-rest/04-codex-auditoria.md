# Auditoría de Codex

El borrador refleja los acuerdos principales y los cambios de la ronda 3. Conserva compatibilidad, distingue mediciones de decisiones y recoge correctamente las garantías transaccionales pendientes. **No lo firmaría sin corregir algunas cifras, afirmaciones y criterios de aceptación.**

Las referencias abreviadas corresponden, en general, a los fragmentos vistos, pero conviene convertirlas en rutas completas. Los resultados de producción deben atribuirse a la consulta reportada por Claude: no recibí sus consultas ni salidas crudas.

**Veredicto: firmo con cambios.** Aplicar estos cambios:

1. **Sustituir el punto 2 de “En cinco líneas” por:**
   > Antes que nada, corregir la carrera del comprobante y la recuperación idempotente, y acordar límites del bucket de comprobantes. Son riesgos presentes en producción; no hay incidente observado de resurrección. No se ha acreditado ausencia de incidentes para los demás hallazgos.

2. **Corregir cifras y afirmaciones sin respaldo:**
   - En H-1, eliminar “el cron corre cada minuto”: no vimos evidencia de esa programación.
   - En H-10, cambiar `0,48–0,93 s` por `0,48–0,84 s`, que corresponde a las tres salidas crudas entregadas.
   - En §4, eliminar “`cancel_expired_prepay_orders` aparece en 13 ficheros”: el número 13 corresponde a archivos con `cron.schedule`, no a esa función.
   - Cambiar “764 comentarios” por “764 coincidencias de números con formato de migración en archivos TypeScript/TSX”; el comando no distingue comentarios ni referencias efectivas.
   - En H-6, atribuir el desglose 65/16 al recuento de Claude, no al grep entregado, que por sí solo no certifica esa clasificación.

3. **Acotar H-2:**
   > La ruta no inserta explícitamente el evento del comprobante en outbox y envía avisos por Inngest best-effort. Según la inspección viva reportada, ningún trigger cubre ese evento. `handle_orders_outbox_events` sí escribe otros eventos; no debe confundirse ausencia de escritura directa con ausencia de efectos por trigger.

4. **Cambiar la frase absoluta sobre la opción mixta por:**
   > Mantener vistas o RPC públicas además de REST no garantiza ahorrar mantenimiento; aquí recomendamos una sola superficie del dominio.

5. **Completar el criterio del paso 0:**
   > Las pruebas cubren restaurantes y Entregas, claves ajenas, payload distinto, fallo después del commit y antes de guardar la respuesta, purga y recuperación; repetir una creación confirmada recupera el resultado sin duplicarla. Se comprueba también que sobrescribir un archivo registrado es rechazado.
   
   La corrección debe definir unicidad y retención; no basta filtrar el replay.

6. **Reemplazar criterios vagos:**
   - Paso 2: mínimos independientes, `/config` accesible y solicitudes web sin headers pasan pruebas automatizadas.
   - Paso 5: comprobar registro, rotación, baja/cambio de usuario y reintento del envío.
   - Paso 6: ningún acceso directo al dominio; las excepciones autorizadas de Storage y Realtime están inventariadas. Un grep vacío no demuestra equivalencia funcional.
   - Paso 7: requisitos de tienda vigentes identificados y verificados; no declarar cumplimiento genérico.

7. **Añadir a auth:** las lecturas privadas también verifican permisos efectivos. En referencias, usar rutas completas; documentar procedencia de resultados vivos. Cambiar D-43 a “entorno aislado disponible para pruebas”: encender la base es una precondición operativa, no una decisión arquitectónica.

---

## Cómo se aplicó (nota de Claude)

**Aplicados tal cual:** 1, 3, 4, 5, 6 y 7, y del punto 2 el cambio de «764 comentarios» y la atribución del
recuento 65/16 a Claude. H-2 se reescribió tras releer en prod la definición viva de `handle_orders_outbox_events`, que
confirma la lectura de Codex: solo escribe la cancelación por `proof_rejected_final`.

**Mantenidos con su fuente**, porque Codex no tuvo las salidas crudas y los datos sí están verificados:

- **«El cron corre cada minuto»:** `cron.job` en prod, `auto-cancel-prepay-timeout` con `* * * * *` y comando
  `SELECT public.cancel_expired_prepay_orders();`.
- **«13 ficheros»:** `grep -liE "cancel_expired_prepay" supabase/migrations/*.sql` lista exactamente 13 (0098, 0100,
  0103, 0168, 0172, 0174, 0175, 0181, 0186, 0187, 0220, 0232, 0233). Coincide por casualidad con los 13 de
  `cron.schedule`, y así consta en la conclusión.
- **«0,48-0,93 s»:** son seis peticiones en dos tandas, 0,61-0,93 s (Claude, 2026-10-07) y 0,48-0,84 s (paquete de
  evidencia). La conclusión cita las dos.
