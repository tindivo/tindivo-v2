/**
 * ETL del directorio de direcciones: export crudo del legacy → dataset limpio.
 *
 * Implementa las reglas R0–R7 de `Docs/spec/spec_manual.md` §Parte 3, con la
 * misma semántica y EL MISMO ORDEN que la implementación de referencia en
 * `Docs/spec/etl-parte3-staging.sql`. Si divergen, manda el SQL: fue el que
 * corrió contra el legacy el 2026-08-04 y produjo las 658 filas de prod.
 *
 * POR QUÉ EXISTE SI YA CORRIÓ UNA VEZ
 *   El piloto sigue operando en el legacy, así que el directorio siguió
 *   creciendo después del corte. La premisa del spec ("este ETL corre UNA VEZ")
 *   dejó de ser cierta: hace falta poder re-correr la limpieza sobre un export
 *   fresco. Este script es esa limpieza, desacoplada de dónde se inserta.
 *
 * QUÉ NO HACE
 *   No escribe en ninguna base. Lee un JSON y escribe otro JSON. Lo que se haga
 *   con el resultado —anonimizar para el fixture local, o sincronizar contra
 *   prod— es decisión de quien lo llame.
 *
 * LOS CONTEOS ESPERADOS SON DEL 2026-08-04 Y YA NO VAN A CUADRAR
 *   Se imprimen igual, como referencia: una desviación GRANDE en una regla que
 *   no debería crecer (R0, R3, R5) es señal de que algo cambió en el origen.
 *   Una desviación proporcional al crecimiento del directorio es normal.
 *
 * Uso:
 *   node apps/api/scripts/etl-address-directory.ts <export.json> [--orders <orders.json>] [--out <limpio.json>]
 *
 * Los exports se obtienen con las queries de `fixtures/README.md`.
 */
import { readFileSync, writeFileSync } from 'node:fs'

// ── Constantes medidas ───────────────────────────────────────────────────────

/**
 * El pin que el legacy plantaba cuando el GPS fallaba. Valor exacto, repetido
 * al bit — por eso se detecta con igualdad y no con distancia.
 *
 * NO CONFUNDIR con `SAN_JACINTO_CENTER` (`-9.148104, -78.280353`), que es la
 * mediana real de las direcciones con GPS y sirve para centrar el mapa. Son dos
 * coordenadas distintas: una es el bug, la otra es el pueblo.
 */
const LEGACY_FALLBACK_PIN = { lat: -9.146872, lng: -78.279047 }

/** Caja destino de la 0122. */
const BBOX = { latMin: -9.2, latMax: -9.1, lngMin: -78.33, lngMax: -78.23 }

/**
 * R0 — basura explícita, por `address_id` y NUNCA por patrón.
 *
 * Un patrón sobre `reference`/`customer_name` arrastraría direcciones reales
 * mal escritas. Estas cuatro se enumeran una por una:
 *   E2E Push Test · Ejemplo/Av. Mansiche · aslkdaskldlasd · mashdkashjd
 *
 * OJO: la lista es del 2026-08-04. La basura que haya entrado DESPUÉS no está
 * acá y no se puede detectar con una regla — para eso está el informe de
 * sospechosas del final, que reporta y deja decidir a una persona.
 */
const R0_GARBAGE_IDS = new Set([
  '5edca29c-364f-4277-ab50-18ef35f953f4',
  '004269be-921a-4a48-a701-8c7c75710fe0',
  '667fc9d7-4b33-458a-9cab-7c3aad0a0f70',
  '63e3e9e1-6f59-458a-9a38-a4d11571a4c6',
])

/** Fecha del backfill del legacy. Ver "Fechas (hallazgo 6)" en el spec. */
const BACKFILL_DATE = '2026-06-23'

/** Conteos medidos el 2026-08-04, solo como referencia. */
const BASELINE = {
  crudas: 664,
  R0: 4,
  R1: 0,
  R3: 18,
  R2: 48,
  R4: 4,
  R5: 2,
  R6: 0,
  colapsadas: 2,
  aInsertar: 658,
  telefonos: 591,
  conGps: 351,
  conAccuracy: 199,
}

// ── Tipos ────────────────────────────────────────────────────────────────────

interface LegacyRow {
  address_id: string
  phone: string
  customer_name: string | null
  reference: string | null
  lat: number | null
  lng: number | null
  accuracy_m: number | null
  source: string
  is_default: boolean
  times_used: number | null
  last_used_at: string | null
  created_at: string
  updated_at?: string | null
}

interface WorkRow extends LegacyRow {
  descartada: boolean
  colapsada: boolean
  ganadora: boolean
  reglas: string[]
  grupoKey: string
}

/** Fila del dataset limpio. Misma forma que espera el anonimizador. */
export interface CleanRow {
  id: string
  phone: string
  customer_name: string | null
  reference: string
  lat: number | null
  lng: number | null
  accuracy_m: number | null
  source: 'backfill' | 'driver_verified' | 'admin_curated'
  is_default: boolean
  times_used: number
  last_used_at: string | null
  legacy_address_id: string
  legacy_created_at: string
  created_at: string
}

// ── Utilidades ───────────────────────────────────────────────────────────────

/** Normalización de referencia usada por el dedup Y por el índice único. Las
 *  dos TIENEN que coincidir, o el índice rechaza filas que el dedup dejó pasar. */
function normalizeReference(reference: string): string {
  return reference.replace(/\s+/g, ' ').trim().toLowerCase()
}

function isFallbackPin(lat: number, lng: number): boolean {
  return (
    Math.abs(lat - LEGACY_FALLBACK_PIN.lat) < 0.000001 &&
    Math.abs(lng - LEGACY_FALLBACK_PIN.lng) < 0.000001
  )
}

function outOfBox(lat: number, lng: number): boolean {
  return lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax
}

/** Anula la coordenada y su precisión. Van juntas: el CHECK
 *  `address_directory_accuracy_needs_coords` no admite precisión sin punto. */
function voidCoords(row: WorkRow): void {
  row.lat = null
  row.lng = null
  row.accuracy_m = null
}

function line(label: string, value: number, expected?: number): string {
  const base = `  ${label.padEnd(34)}${String(value).padStart(6)}`
  if (expected === undefined) return base
  const delta = value - expected
  const mark = delta === 0 ? '=' : delta > 0 ? `+${delta}` : String(delta)
  return `${base}    (2026-08-04: ${expected}, ${mark})`
}

// ── ETL ──────────────────────────────────────────────────────────────────────

function main(): void {
  const argv = process.argv.slice(2)
  const inputPath = argv.find((a) => !a.startsWith('--'))
  const ordersPath = argv.includes('--orders') ? argv[argv.indexOf('--orders') + 1] : null
  const outPath = argv.includes('--out')
    ? argv[argv.indexOf('--out') + 1]
    : 'address-directory-clean.json'
  const force = argv.includes('--force')

  if (!inputPath) {
    console.error(
      'Uso: node apps/api/scripts/etl-address-directory.ts <export.json> [--orders <o.json>] [--out <f.json>]',
    )
    process.exit(1)
  }

  const parsed = JSON.parse(readFileSync(inputPath, 'utf8'))
  // `SELECT json_agg(t)` en el panel devuelve a veces [{json_agg: [...]}].
  const raw: LegacyRow[] = Array.isArray(parsed)
    ? (parsed[0]?.json_agg ?? parsed)
    : (parsed.json_agg ?? parsed.rows ?? [])

  if (!Array.isArray(raw) || raw.length === 0) {
    console.error('El export está vacío o no tiene la forma esperada.')
    process.exit(1)
  }

  console.log(`\n═══ ETL del directorio · ${raw.length} filas crudas ═══\n`)

  // ── AVISO DE TRUNCAMIENTO ──────────────────────────────────────────────────
  // El PostgREST del legacy topa en 1000 filas SIN dar error. Un export de
  // exactamente 1000 casi nunca es una coincidencia: es un truncamiento.
  if (raw.length === 1000) {
    console.error('🚨 El export trae EXACTAMENTE 1000 filas.')
    console.error('   El PostgREST del legacy trunca ahí en silencio (ver spec §2.2).')
    console.error('   Reexportá desde el SQL editor, o paginá. Abortado.\n')
    process.exit(1)
  }

  const rows: WorkRow[] = raw.map((r) => ({
    ...r,
    times_used: r.times_used ?? 0,
    descartada: false,
    colapsada: false,
    ganadora: false,
    reglas: [],
    grupoKey: '',
  }))

  const counts: Record<string, number> = {
    R0: 0, R1: 0, R3: 0, R2: 0, R4: 0, R5: 0, R6: 0, RP: 0,
  }

  // ── R0 · basura explícita ──────────────────────────────────────────────────
  for (const row of rows) {
    if (R0_GARBAGE_IDS.has(row.address_id)) {
      row.descartada = true
      row.reglas.push('R0_basura_explicita')
      counts.R0++
    }
  }

  // ── R1 · sin referencia ────────────────────────────────────────────────────
  const sinReferencia: WorkRow[] = []
  for (const row of rows) {
    if (row.descartada) continue
    if (row.reference === null || row.reference.trim() === '') {
      row.descartada = true
      row.reglas.push('R1_sin_reference')
      counts.R1++
      sinReferencia.push(row)
    }
  }

  // ── RP · teléfono que no cumple el CHECK destino ───────────────────────────
  // No está en el spec como regla numerada porque en la corrida del 2026-08-04
  // no había ninguna (2.3.e daba 0). Se añade porque el destino tiene
  // `address_directory_phone_check` y una fila así no se puede insertar: sin
  // esto el INSERT revienta a mitad y deja la carga partida.
  const telefonoMalo: WorkRow[] = []
  for (const row of rows) {
    if (row.descartada) continue
    if (!/^9\d{8}$/.test(row.phone ?? '')) {
      row.descartada = true
      row.reglas.push('RP_telefono_invalido')
      counts.RP++
      telefonoMalo.push(row)
    }
  }

  // ── R3 · pin plantado en el centro · ¡VA ANTES QUE R2! ─────────────────────
  // Si R2 corriera primero, a la fila con `accuracy = 0` le anularía el metadato
  // y le CONSERVARÍA la coordenada falsa, que quedaría indistinguible de una
  // medición legítima. El rastro que la delata es justo el que R2 borra.
  for (const row of rows) {
    if (row.descartada || row.lat === null || row.lng === null) continue
    if (isFallbackPin(row.lat, row.lng)) {
      voidCoords(row)
      row.source = 'backfill'
      row.reglas.push('R3_pin_en_centro')
      counts.R3++
    }
  }

  // ── R2 · accuracy 0 · conserva coordenadas ─────────────────────────────────
  for (const row of rows) {
    if (row.descartada) continue
    if (row.accuracy_m === 0) {
      row.accuracy_m = null
      row.reglas.push('R2_accuracy_cero')
      counts.R2++
    }
  }

  // ── R4 · centinela 999 en coordenada distinta · conserva coordenadas ───────
  // No necesita condición de distancia: R3 ya dejó en NULL el accuracy de las
  // que estaban en el centro.
  for (const row of rows) {
    if (row.descartada || row.accuracy_m === null) continue
    if (row.accuracy_m >= 998.5 && row.accuracy_m <= 999.5) {
      row.accuracy_m = null
      row.reglas.push('R4_centinela_arrastrado')
      counts.R4++
    }
  }

  // ── R5 · fix por IP · anula todo ───────────────────────────────────────────
  // Por PRECISIÓN, no por distancia: un fix preciso pero lejano es un pedido
  // fuera de zona, no un dato malo.
  for (const row of rows) {
    if (row.descartada || row.accuracy_m === null) continue
    if (row.accuracy_m >= 1000) {
      voidCoords(row)
      row.reglas.push('R5_fix_por_ip')
      counts.R5++
    }
  }

  // ── R6 · fuera de la caja · red de seguridad ───────────────────────────────
  for (const row of rows) {
    if (row.descartada || row.lat === null || row.lng === null) continue
    if (outOfBox(row.lat, row.lng)) {
      voidCoords(row)
      row.reglas.push('R6_fuera_de_caja')
      counts.R6++
    }
  }

  // ── R7 · deduplicación ─────────────────────────────────────────────────────
  const vivas = rows.filter((r) => !r.descartada)
  for (const row of vivas) {
    row.grupoKey = `${row.phone}|${normalizeReference(row.reference as string)}`
  }

  const groups = new Map<string, WorkRow[]>()
  for (const row of vivas) {
    const bucket = groups.get(row.grupoKey)
    if (bucket) bucket.push(row)
    else groups.set(row.grupoKey, [row])
  }

  // Desempate: 1) tiene GPS  2) last_used_at más reciente  3) address_id menor.
  // El tercer criterio existe solo para que el resultado sea determinista: sin
  // él, dos corridas sobre el mismo export pueden elegir ganadoras distintas.
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const gpsA = a.lat !== null ? 0 : 1
      const gpsB = b.lat !== null ? 0 : 1
      if (gpsA !== gpsB) return gpsA - gpsB
      // NULLS LAST, igual que el SQL de referencia.
      const usedA = a.last_used_at ? Date.parse(a.last_used_at) : Number.NEGATIVE_INFINITY
      const usedB = b.last_used_at ? Date.parse(b.last_used_at) : Number.NEGATIVE_INFINITY
      if (usedA !== usedB) return usedB - usedA
      return a.address_id < b.address_id ? -1 : 1
    })
    group[0].ganadora = true
    for (const loser of group.slice(1)) loser.colapsada = true
  }

  // ── Primer pedido por teléfono (export 2.2, opcional) ──────────────────────
  const firstOrderByPhone = new Map<string, string>()
  if (ordersPath) {
    const ordersParsed = JSON.parse(readFileSync(ordersPath, 'utf8'))
    const orders: { phone: string; primer_pedido: string }[] = Array.isArray(ordersParsed)
      ? (ordersParsed[0]?.json_agg ?? ordersParsed)
      : (ordersParsed.json_agg ?? [])
    for (const o of orders) if (o.phone) firstOrderByPhone.set(o.phone, o.primer_pedido)
    if (orders.length === 1000) {
      console.error('🚨 El export de pedidos trae EXACTAMENTE 1000 filas — truncado. Abortado.\n')
      process.exit(1)
    }
    console.log(`  · primer pedido conocido para ${firstOrderByPhone.size} teléfonos\n`)
  } else {
    console.log('  · sin export de pedidos: `created_at` = el del legacy, tal cual\n')
  }

  // ── Consolidación del grupo sobre la ganadora ──────────────────────────────
  const clean: CleanRow[] = []
  for (const group of groups.values()) {
    const winner = group[0]

    const timesUsed = group.reduce((sum, r) => sum + (r.times_used ?? 0), 0)
    const lastUsed = group
      .map((r) => r.last_used_at)
      .filter((v): v is string => v !== null)
      .sort()
      .at(-1) ?? null
    const legacyCreated = group.map((r) => r.created_at).sort()[0]
    const isDefault = group.some((r) => r.is_default)
    // El nombre de la ganadora; si es NULL, el primero no-NULL del grupo
    // ordenado por uso más reciente.
    const name =
      winner.customer_name ??
      group
        .slice()
        .sort((a, b) => (b.last_used_at ?? '').localeCompare(a.last_used_at ?? ''))
        .find((r) => r.customer_name !== null)?.customer_name ??
      null

    // Fechas: la regla es CONDICIONAL. Aplicar el primer pedido del teléfono a
    // TODAS las direcciones backdatearía una segunda dirección creada en julio
    // hasta el primer pedido de mayo, falseando el dato. Solo las filas cuyo
    // `created_at` es artefacto del backfill se corrigen.
    const esDelBackfill = legacyCreated.slice(0, 10) === BACKFILL_DATE
    const createdAt = esDelBackfill
      ? (firstOrderByPhone.get(winner.phone) ?? legacyCreated)
      : legacyCreated

    clean.push({
      id: winner.address_id,
      phone: winner.phone,
      customer_name: name,
      reference: (winner.reference as string).replace(/\s+/g, ' ').trim(),
      lat: winner.lat,
      lng: winner.lng,
      accuracy_m: winner.accuracy_m,
      source: winner.source as CleanRow['source'],
      is_default: isDefault,
      times_used: timesUsed,
      last_used_at: lastUsed,
      legacy_address_id: winner.address_id,
      legacy_created_at: legacyCreated,
      created_at: createdAt,
    })
  }

  // ── `is_default`: máximo uno por teléfono ──────────────────────────────────
  // El índice `address_directory_default_unique` es parcial sobre `is_default`,
  // así que dos principales del mismo teléfono revientan el INSERT. Y un
  // teléfono sin ninguna deja al autocompletado sin fila preferente.
  const byPhone = new Map<string, CleanRow[]>()
  for (const row of clean) {
    const bucket = byPhone.get(row.phone)
    if (bucket) bucket.push(row)
    else byPhone.set(row.phone, [row])
  }
  let defaultsArreglados = 0
  for (const group of byPhone.values()) {
    const marked = group.filter((r) => r.is_default)
    if (marked.length === 1) continue
    const candidates = marked.length > 1 ? marked : group
    candidates.sort((a, b) => {
      const usedA = a.last_used_at ? Date.parse(a.last_used_at) : Number.NEGATIVE_INFINITY
      const usedB = b.last_used_at ? Date.parse(b.last_used_at) : Number.NEGATIVE_INFINITY
      if (usedA !== usedB) return usedB - usedA
      return a.id < b.id ? -1 : 1
    })
    for (const row of group) row.is_default = false
    candidates[0].is_default = true
    defaultsArreglados++
  }

  // ── Informe ────────────────────────────────────────────────────────────────
  const descartadas = rows.filter((r) => r.descartada).length
  const colapsadas = rows.filter((r) => r.colapsada).length
  const conGps = clean.filter((r) => r.lat !== null).length
  const conAcc = clean.filter((r) => r.accuracy_m !== null).length

  console.log('── Reglas de limpieza ──')
  console.log(line('R0 basura explícita', counts.R0, BASELINE.R0))
  console.log(line('R1 sin referencia', counts.R1, BASELINE.R1))
  console.log(line('RP teléfono inválido', counts.RP, 0))
  console.log(line('R3 pin en el centro', counts.R3, BASELINE.R3))
  console.log(line('R2 accuracy 0', counts.R2, BASELINE.R2))
  console.log(line('R4 centinela 999 arrastrado', counts.R4, BASELINE.R4))
  console.log(line('R5 fix por IP', counts.R5, BASELINE.R5))
  console.log(line('R6 fuera de la caja', counts.R6, BASELINE.R6))

  console.log('\n── Conservación de filas ──')
  console.log(line('crudas', rows.length, BASELINE.crudas))
  console.log(line('descartadas', descartadas, BASELINE.R0 + BASELINE.R1))
  console.log(line('colapsadas (R7)', colapsadas, BASELINE.colapsadas))
  console.log(line('a insertar', clean.length, BASELINE.aInsertar))

  // La identidad que tiene que cerrar SIEMPRE, con cualquier volumen de datos.
  // Es la única verificación que no depende de conteos históricos.
  const suma = descartadas + colapsadas + clean.length
  if (suma !== rows.length) {
    console.error(
      `\n🚨 No cierra: ${descartadas} + ${colapsadas} + ${clean.length} = ${suma} ≠ ${rows.length}`,
    )
    process.exit(1)
  }
  console.log(`  ✓ ${descartadas} + ${colapsadas} + ${clean.length} = ${rows.length}`)

  console.log('\n── Resultado ──')
  console.log(line('teléfonos únicos', byPhone.size, BASELINE.telefonos))
  console.log(line('con GPS', conGps, BASELINE.conGps))
  console.log(line('con accuracy_m', conAcc, BASELINE.conAccuracy))
  if (defaultsArreglados > 0) {
    console.log(`  is_default normalizado en ${defaultsArreglados} teléfono(s)`)
  }

  // ── Filas nuevas desde el corte ────────────────────────────────────────────
  const nuevas = clean.filter((r) => r.legacy_created_at > '2026-08-04')
  console.log(`\n── Nuevas desde el corte del 2026-08-04: ${nuevas.length} ──`)
  for (const row of nuevas.slice(0, 25)) {
    const gps = row.lat !== null ? '◎' : ' '
    console.log(
      `  ${gps} ${row.phone}  ${(row.customer_name ?? '—').padEnd(18).slice(0, 18)}  ${row.reference.slice(0, 46)}`,
    )
  }
  if (nuevas.length > 25) console.log(`  … y ${nuevas.length - 25} más`)

  // ── Sospechosas: SE REPORTAN, NO SE DESCARTAN ──────────────────────────────
  // R0 es una lista de IDs del 2026-08-04, así que la basura posterior no la
  // atrapa nadie. Y no se puede automatizar: el propio spec prohíbe descartar
  // por patrón, porque un patrón sobre `reference` arrastra direcciones reales
  // mal escritas. Así que esto es un informe para que decida una persona.
  const suspicious = clean.filter((row) => {
    const ref = row.reference.toLowerCase()
    if (/test|prueba|ejemplo|asdf|qwer/.test(ref)) return true
    // Demasiado corta para orientar a nadie.
    if (row.reference.trim().length < 8) return true
    // Una sola palabra larga. Una dirección de verdad casi siempre lleva calle
    // Y referencia, así que trae espacios; "aslkdaskldlasd" y "mashdkashjd"
    // —dos de las cuatro basuras de R0— son exactamente esto.
    if (!/\s/.test(ref) && ref.length >= 10) return true
    // Racha de consonantes impropia del español.
    if (/[bcdfghjklmnpqrstvwxyz]{5,}/.test(ref)) return true
    return false
  })

  if (suspicious.length > 0) {
    console.log(`\n⚠️  ${suspicious.length} fila(s) sospechosas — REVISAR A MANO:`)
    for (const row of suspicious) {
      console.log(`  ${row.legacy_address_id}  ${row.phone}  "${row.reference}"`)
    }
    console.log('\n  Si alguna es basura, agregá su id a R0_GARBAGE_IDS y volvé a correr.')
    console.log('  NO se descartan solas: el patrón también atrapa direcciones reales.')
  }

  // ── Bloqueantes ────────────────────────────────────────────────────────────
  if (sinReferencia.length > 0 || telefonoMalo.length > 0) {
    console.error('\n🚨 Filas que el destino NO puede aceptar y quedaron fuera:')
    for (const row of sinReferencia) {
      const gps = row.lat !== null ? ' (¡TENÍA GPS!)' : ''
      console.error(`  sin referencia · ${row.address_id} · ${row.phone}${gps}`)
    }
    for (const row of telefonoMalo) {
      console.error(`  teléfono "${row.phone}" · ${row.address_id} · "${row.reference}"`)
    }
    if (!force) {
      console.error('\n  El spec manda PARAR acá (§R1). Revisalo y re-corré con --force')
      console.error('  si confirmás que se pueden perder.\n')
      process.exit(1)
    }
    console.error('\n  --force: se continúa sin ellas.\n')
  }

  writeFileSync(outPath, `${JSON.stringify(clean, null, 2)}\n`, 'utf8')
  console.log(`\n✓ ${outPath} · ${clean.length} filas limpias`)
  console.log('  Contiene datos REALES. No lo commitees.')
  console.log('  Siguiente: node apps/api/scripts/anonymize-address-directory.ts ' + outPath + '\n')
}

main()
