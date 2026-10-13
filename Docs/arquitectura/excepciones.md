# Excepciones a los estándares

> Verificado: 2026-10-12 · entorno: `develop@591ec569`

Cada fila es una excepción confinada y justificada a una regla de `Docs/arquitectura/estandares/`. Una excepción sin fila es un incumplimiento. El número de filas solo puede bajar, salvo aprobación explícita de Jesús en el PR; lo comprueba la CI.

Los hallazgos de Spectral y de las consultas de catálogo de `sql.md` sobre lo heredado se agrupan por criterio en una fila: no hay una fila por ruta o columna repetida.

| Regla | Ruta o símbolo | Por qué (una línea) | Desde | Revisar |
|---|---|---|---|---|
| API-4 | `GET /public/orders/{shortId}`, `GET /public/courier/status`, `GET /public/courier/{shortId}` | Responden sin la envoltura `data` (`raw()`); el contrato (§1) conserva la forma de las rutas vigentes | 2026-10-12 | Al migrar esas rutas |
| API-8 | `GET /public/courier/directory`: `opensAt` y `closesAt` | Son horas del día, no instantes; la regla de Spectral las marca por terminar en `At` | 2026-10-12 | Al renombrar los campos |
| DB-7 | `orders.customer_gps_lat`, `orders.customer_gps_lng`, `address_directory.lat`, `address_directory.lng` | Coordenadas en `double precision`, no `numeric(10,7)`; tipos heredados | 2026-10-12 | Al tocar esas tablas |
| DB-7 | `business_charges.amount`, `orders.commission_amount`, `orders.delivery_fee_charged` | Dinero en `numeric` sin precisión, no `numeric(10,2)`; cambiarlo toca dinero y exige la revisión de Jesús (invariante 9) | 2026-10-12 | Con Jesús, antes de cualquier cambio de ledger |
| DES-7, DB-18 | `delete_customer_account` (migración `0259`) escribe `customer_addresses` | Solo al borrar una cuenta: el borrado de datos personales es atómico, en la misma transacción (Ley 29733, D-44); un evento asíncrono podría dejar direcciones de una cuenta borrada. Decisión de Jesús, 2026-10-13 | 2026-10-13 | Al crear `geo`: el borrado pasa a una función pública de `geo` que la RPC llama en la misma transacción, y esta fila sale |
| DB-3 | 26 funciones `SECURITY DEFINER` de `public` ejecutables por `anon` o `authenticated` (consulta de `sql.md`, «Funciones `SECURITY DEFINER` ejecutables…») | Ayudantes de RLS y RPC heredadas, todas con `search_path` fijo; falta auditar una a una si cada permiso hace falta | 2026-10-12 | Auditar con Jesús; empezar por las de apelaciones |
