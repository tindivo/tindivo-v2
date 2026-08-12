# Fixtures del seed

## `address-directory.json` — NO está en el repo todavía

El directorio de direcciones es el activo que hace posible el autocompletado de
la cajera. En local la tabla `address_directory` está **vacía**, y
`pnpm db:seed:e2e` no la toca. Sin este fixture, el autocompletado solo se puede
ver en su estado "cliente nuevo" — justo el camino que no hay que diseñar con
cuidado.

### De dónde sale la data

**Del legacy** (`nwcdxmebsozswnjlblip`, `tindivo-delivery`), no de prod.

El ETL de la `0122` corrió contra prod el 2026-08-04 y dejó 658 filas, pero
**el piloto sigue operando en el legacy**, así que el directorio siguió
creciendo desde entonces y prod quedó congelada. Para tener el directorio al día
hay que volver a extraer del origen.

> El spec (`spec_manual.md`, REGLA DURA #5) dice que este ETL corre UNA VEZ. Eso
> asumía que los 4 negocios migraban el mismo día. Mientras el piloto siga en el
> legacy, la limpieza hay que poder re-correrla.

---

## Los tres pasos

### 1. Exportar del legacy

En el **SQL editor** del panel de `tindivo-delivery`. Los dos exports van
envueltos en `json_agg` a propósito: devuelven **una sola fila**, así que no los
alcanza ningún tope de filas. El PostgREST del legacy trunca a 1000 en silencio
(ver `spec_manual.md` §2.2) y ese truncamiento ya falseó una corrida.

**Export A — el directorio** (obligatorio):

```sql
SELECT json_agg(t) FROM (
  SELECT address_id, phone, customer_name, reference,
         lat, lng, accuracy_m, source, is_default,
         times_used, last_used_at, created_at, updated_at
  FROM public.customer_addresses
  ORDER BY phone, address_id
) t;
```

**Export B — primer pedido por teléfono** (opcional, mejora `created_at`):

```sql
SELECT json_agg(t) FROM (
  SELECT client_phone AS phone, MIN(created_at) AS primer_pedido
  FROM public.orders
  WHERE client_phone IS NOT NULL
  GROUP BY client_phone
) t;
```

Sin el B, las filas nacidas en el backfill del legacy (2026-06-23) conservan esa
fecha artificial como `created_at` en vez de la del primer pedido real del
cliente. No afecta al autocompletado —la cajera nunca ve `created_at`— pero sí
al dato si algún día esto se sincroniza contra prod.

Guardá cada resultado como `.json` **fuera del repo**: llevan teléfonos y
nombres de personas reales.

### 2. Limpiar

```bash
node apps/api/scripts/etl-address-directory.ts /ruta/export-a.json \
  --orders /ruta/export-b.json \
  --out /ruta/limpio.json
```

Aplica R0–R7 de `spec_manual.md` §Parte 3 en el **mismo orden** que la
implementación de referencia (`Docs/spec/etl-parte3-staging.sql`) — el orden no
es cosmético: R3 va antes que R2 porque si no, un pin falso con `accuracy = 0`
queda indistinguible de una medición legítima.

Qué imprime, y qué hacer con cada cosa:

| salida | qué significa |
| --- | --- |
| conteo por regla, contra el baseline del 2026-08-04 | una desviación grande en R0/R3/R5 —reglas que no deberían crecer— es señal de que cambió el origen |
| `descartadas + colapsadas + a insertar = crudas` | la única verificación que cierra con cualquier volumen. Si no cierra, aborta |
| **nuevas desde el corte** | exactamente lo que entró después del 2026-08-04 |
| **⚠️ sospechosas** | **hay que revisarlas a mano** |
| 🚨 filas que el destino no acepta | sin referencia o teléfono inválido. Aborta salvo `--force` |

**Sobre las sospechosas.** `R0_GARBAGE_IDS` es una lista de 4 `address_id` del
2026-08-04; la basura que entró después no la atrapa nadie. Y no se puede
automatizar: el spec prohíbe descartar por patrón porque un patrón sobre
`reference` arrastra direcciones reales mal escritas. Por eso el script las
**reporta y no las toca**. Si confirmás que alguna es basura, agregá su
`address_id` a `R0_GARBAGE_IDS` en el script y volvé a correr.

### 3. Anonimizar y sembrar

```bash
node apps/api/scripts/anonymize-address-directory.ts /ruta/limpio.json
pnpm db:seed:addresses
```

El anonimizador:

- sustituye teléfonos y nombres por alias **deterministas**, para que el
  agrupamiento por teléfono —lo que prueba el modal de múltiples direcciones—
  sobreviva;
- conserva calles y referencias, y protege los topónimos (`SANTA ROSA` no se
  convierte en `SANTA CARMEN`);
- mueve las coordenadas ~±100 m sin salirse de la caja de la `0122`;
- valida contra **todos** los CHECK de la tabla antes de escribir, y aborta si
  algún teléfono real se coló en el resultado;
- lista los tokens que sustituyó dentro de referencias. **Revisala:** si aparece
  un lugar y no una persona, agregalo a `PLACE_PREFIXES` y regenerá.

El seed es idempotente. Hay que volver a correrlo después de cada
`supabase db reset`, igual que `pnpm db:seed:e2e`.

---

## Por qué las fechas del fixture son relativas

El fixture guarda `last_used_days_ago` en vez de un timestamp. El modal de la
cajera muestra "ayer" y "hace 3 semanas"; con fechas absolutas congeladas, en
seis meses todo diría "hace 8 meses" y ese camino dejaría de poder probarse.
El seeder las convierte a absolutas al sembrar.

## Qué NO hace este pipeline

No escribe en prod. El sync del corte real es otro trabajo: tendrá que ser
UPSERT sobre `legacy_address_id` (hoy el índice único hace que un segundo INSERT
reviente) y necesita una regla de precedencia declarada para cuando v2 y el
legacy hayan capturado coordenadas distintas para la misma dirección.
