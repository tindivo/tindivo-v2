/**
 * Anonimizador del directorio de direcciones — prod → fixture commiteable.
 *
 * POR QUÉ EXISTE
 *   `address_directory` en prod tiene 658 filas de personas reales: teléfono,
 *   nombre y descripción de su casa. Ese fixture entra a git, así que no puede
 *   llevar el dato real. Pero tampoco puede ser inventado: lo que hace útil al
 *   directorio para probar la UI es su FORMA — que el 9,7% de los teléfonos
 *   tenga más de una dirección, que solo la mitad tenga GPS, y que las
 *   referencias sean largas y se distingan por el final.
 *
 *   Este script conserva la forma y sustituye la identidad.
 *
 * QUÉ SE SUSTITUYE Y QUÉ NO
 *   phone          → hash determinista, formato `^9\d{8}$` (lo exige el CHECK)
 *   customer_name  → alias estable del pool de abajo
 *   reference      → se conservan calles y referencias; se sustituyen SOLO los
 *                    nombres de pila que aparecen dentro del texto
 *   lat / lng      → jitter determinista de ~±100 m, recortado a la caja
 *   accuracy_m     → intacto (es la señal que distingue GPS bueno de malo)
 *   times_used     → intacto (alimenta el "22 pedidos" del modal)
 *   fechas         → se guardan como DÍAS ATRÁS, no absolutas (ver abajo)
 *
 * EL DETERMINISMO NO ES COSMÉTICO
 *   El mismo teléfono real debe producir siempre el mismo teléfono falso, o el
 *   AGRUPAMIENTO se pierde — y agrupar por teléfono es justo lo que el modal de
 *   múltiples direcciones tiene que probar. Igual con los nombres: la misma
 *   persona conserva su alias en todas sus filas.
 *
 * LAS FECHAS SE GUARDAN RELATIVAS
 *   El modal muestra "ayer" y "hace 3 semanas". Con fechas absolutas congeladas
 *   en el fixture, dentro de seis meses todo diría "hace 8 meses" y ese camino
 *   dejaría de poder probarse. El seeder las convierte a absolutas al sembrar.
 *
 * Uso:
 *   node apps/api/scripts/anonymize-address-directory.ts <dump.json> [salida.json]
 *
 * El dump de entrada es el resultado crudo de:
 *   SELECT id, phone, customer_name, reference, lat, lng, accuracy_m, source,
 *          is_default, times_used, last_used_at, legacy_address_id, created_at
 *   FROM public.address_directory ORDER BY phone, created_at;
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

// ── Forma de la fila cruda que sale de prod ──────────────────────────────────
interface RawRow {
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
  legacy_address_id: string | null
  created_at: string
}

// ── Forma de la fila del fixture ─────────────────────────────────────────────
export interface FixtureRow {
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
  /** null = nunca usada. El seeder lo convierte a timestamp absoluto. */
  last_used_days_ago: number | null
  created_days_ago: number
  /** true = la fila vino del ETL del legacy; el seeder rellena el par
   *  `legacy_address_id` + `imported_at` que exige el CHECK de la 0122. */
  from_legacy: boolean
}

// ── Pool de alias ────────────────────────────────────────────────────────────
// Nombres de pila peruanos comunes. El pool es más chico que el conjunto real
// de nombres a propósito: la repetición de nombres entre clientes distintos
// también ocurre en el directorio real y la cajera tiene que poder convivir con
// ella (dos "Rosa" con teléfonos distintos no son un error).
const ALIAS_POOL = [
  'ROSA', 'CARMEN', 'LUIS', 'JOSE', 'MARIA', 'JUANA', 'PEDRO', 'ANA',
  'MIGUEL', 'TERESA', 'JORGE', 'ELENA', 'CESAR', 'GLORIA', 'RAUL', 'NORMA',
  'VICTOR', 'DORIS', 'MARIO', 'SILVIA', 'FELIX', 'IRMA', 'JULIO', 'NELLY',
  'OSCAR', 'YOLANDA', 'WALTER', 'SONIA', 'ANGEL', 'BETTY',
]

/** Apellidos, para los nombres compuestos. Separado del pool de pila para que
 *  "DIANA MENDOZA" no se convierta en dos nombres de pila pegados. */
const SURNAME_POOL = [
  'QUISPE', 'HUAMAN', 'FLORES', 'CHAVEZ', 'RAMOS', 'VASQUEZ', 'CASTILLO',
  'MEZA', 'PAREDES', 'SALAZAR', 'ROJAS', 'AGUILAR', 'MORALES', 'VEGA',
]

/**
 * Palabras que NUNCA son nombre de persona, aunque aparezcan dentro de un
 * `customer_name`.
 *
 * MEDIDO, no supuesto. El `customer_name` del legacy es texto libre: de los 541
 * valores distintos hay `"Casa Profesor Chipi"`, `"Cada Del Profesor Chipi"`,
 * `"SUB OFICIAL RIOS"`, `"Pareja De Carlos"`, `"SRA FELIPA"`. Sin este stoplist
 * una sola de esas filas mete `CASA` al conjunto de nombres, y a partir de ahí
 * "CASA" se sustituye en TODA referencia que la mencione — medido: 131 de 701.
 * La referencia queda ilegible y el fixture pierde su único valor.
 *
 * El sesgo es deliberado: pasarse de stoplist solo deja algún nombre de pila
 * suelto dentro de un texto cuyo teléfono ya está barajado; quedarse corto
 * corrompe direcciones. El identificador real es el teléfono, no el nombre.
 */
const NOT_A_NAME = new Set([
  // artículos y preposiciones
  'DE', 'DEL', 'LA', 'LAS', 'EL', 'LOS', 'CON', 'POR', 'EN', 'ANTE', 'TRAS',
  // tratamientos y oficios
  'SR', 'SRA', 'SRTA', 'DON', 'DOÑA', 'PROF', 'PROFESOR', 'PROFESORA',
  'DR', 'DRA', 'DOCTOR', 'DOCTORA', 'ING', 'SUB', 'OFICIAL', 'PAREJA',
  'TIO', 'TIA', 'MAMA', 'PAPA', 'HIJO', 'HIJA', 'ABUELA', 'ABUELO',
  'SEÑORA', 'SEÑOR', 'FAMILIA', 'PROFE',
  // vocabulario de dirección
  'CASA', 'CADA', 'TIENDA', 'BODEGA', 'CALLE', 'AVENIDA', 'JIRON', 'PASAJE',
  'FRENTE', 'LADO', 'COSTADO', 'ESQUINA', 'ALTOS', 'BAJOS', 'BAJO', 'ALTO',
  'PISO', 'PUERTA', 'PORTON', 'COLEGIO', 'MERCADO', 'IGLESIA', 'PARQUE',
  'PLAZA', 'LOZA', 'BARRIO', 'CUADRA', 'PUESTO', 'LOCAL', 'FONDO', 'ENTRADA',
  // ordinales. `SEGUNDO` es nombre de pila peruano Y ordinal, pero medido en
  // las 701 referencias aparece SIEMPRE como ordinal ("SEGUNDO PORTON",
  // "segundo pasaje") y nunca señalando a la persona que se llama así.
  'PRIMER', 'PRIMERA', 'SEGUNDO', 'SEGUNDA', 'TERCER', 'TERCERA',
  'CUARTO', 'CUARTA', 'ULTIMO', 'ULTIMA',
  // colores — se usan constantemente para describir la fachada
  'CELESTE', 'VERDE', 'AZUL', 'ROJA', 'ROJO', 'BLANCA', 'BLANCO', 'NEGRA',
  'NEGRO', 'AMARILLA', 'AMARILLO', 'CREMA', 'PLOMO', 'MARRON', 'NARANJA',
  'MORADA', 'MORADO', 'ROSADO', 'ROSADA',
])

/**
 * Palabras tras las cuales un token NO es una persona, sino un topónimo.
 *
 * Sin esto, en cuanto exista una clienta llamada ROSA el barrio "SANTA ROSA"
 * se convierte en "SANTA CARMEN" en todas las referencias que lo mencionan. Y
 * eso rompe justo lo que el fixture tiene que reproducir: varias direcciones
 * que comparten prefijo de barrio y se distinguen SOLO por el final. Es el caso
 * duro del modal de múltiples direcciones (`spec_ui_cajera.md` B3-bis).
 */
const PLACE_PREFIXES = [
  'SAN', 'SANTA', 'SANTO', 'AV', 'AVENIDA', 'JR', 'JIRON', 'CALLE',
  'PSJE', 'PASAJE', 'MZ', 'URB', 'PLAZA', 'MERCADO', 'COLEGIO',
  // Un token puede ser apellido Y topónimo a la vez, y entonces no hay stoplist
  // que sirva: `LUNA` es el apellido de un cliente ("KELDER LUNA") y también el
  // parque por el que se orientan 9 direcciones ("parque MEDIA LUNA"); `ONO` es
  // apellido ("Piero Ono") y hospedaje ("HOSPEDAJE ONO"). Proteger la FRASE
  // resuelve los dos: el topónimo sobrevive y el apellido suelto se sustituye.
  'MEDIA', 'HOSPEDAJE', 'PARQUE', 'FARMACIA', 'POLLERIA', 'KINDER',
]

/**
 * Frases que se protegen ENTERAS, en cualquier posición del texto.
 *
 * `PLACE_PREFIXES` solo cubre el caso "marcador + nombre" (`SAN JOSE`). No
 * alcanza para las calles bautizadas con próceres, donde el nombre va PRIMERO:
 * `JOSE OLAYA` (18 apariciones medidas), `MIGUEL GRAU` (10), `JUAN VELAZCO`
 * (8). Sustituir ahí convierte una calle en otra —"WALTER OLAYA"— y la
 * referencia deja de ubicar la casa, que es lo único que el fixture tiene que
 * conservar.
 *
 * Se enmascaran antes de sustituir y se restauran después.
 */
const PROTECTED_PHRASES = [
  // medidas en el directorio de San Jacinto
  'JOSE OLAYA', 'JOSÉ OLAYA', 'MIGUEL GRAU', 'JUAN VELAZCO', 'JUAN VELASCO',
  'CARLOS MAR', 'LEONCIO PRADO', 'LUIS BAMBAREN', 'GABRIELA MISTRAL',
  'CAMPO MARTE', 'SANTA ROSA', 'SAN MARTIN', 'SAN MARTÍN', 'SAN PEDRO',
  'SAN JOSE', 'SAN JOSÉ', 'SAN FRANCISCO', 'SAN CRISTOBAL', 'SAN CRISTÓBAL',
  // próceres de uso corriente en el callejero peruano, por si aparecen luego
  'JOSE CARLOS MARIATEGUI', 'ANDRES AVELINO CACERES', 'MARIA PARADO DE BELLIDO',
  'FRANCISCO BOLOGNESI', 'RAMON CASTILLA', 'CESAR VALLEJO', 'JOSE GALVEZ',
  'MANUEL SEOANE', 'VICTOR RAUL', 'TUPAC AMARU',
]

/**
 * Alias de UN token, estable en todo el dataset.
 *
 * La consistencia se apoya en el TOKEN, no en el nombre completo, y eso es
 * deliberado: `customer_name` puede ser "DIANA MENDOZA" mientras la referencia
 * dice solo "casa de DIANA". Si el alias se derivara del nombre completo, esa
 * misma persona saldría con dos alias distintos —el del nombre y el del texto—
 * y el fixture se leería como dos clientes donde hay uno.
 */
function aliasForToken(token: string, isSurname = false): string {
  const pool = isSurname ? SURNAME_POOL : ALIAS_POOL
  return pool[hashInt('name', token.toUpperCase()) % pool.length]
}

/** Entero estable a partir de un texto. Misma entrada → misma salida, siempre. */
function hashInt(salt: string, value: string): number {
  const digest = createHash('sha256').update(`${salt}::${value}`).digest()
  // 6 bytes bastan y evitan pasarse de Number.MAX_SAFE_INTEGER.
  return digest.readUIntBE(0, 6)
}

/** Teléfono falso con el formato que exige `address_directory_phone_check`. */
function fakePhone(realPhone: string): string {
  const n = hashInt('phone', realPhone) % 100_000_000
  return `9${String(n).padStart(8, '0')}`
}

/** Jitter determinista de ~±100 m, recortado a la caja de la 0122. */
function jitter(value: number, salt: string, seed: string, limits: [number, number]): number {
  // 0,0009° ≈ 100 m en latitud, y en longitud a esta latitud la diferencia es
  // despreciable para lo que buscamos (romper la exactitud, no medir).
  const offset = ((hashInt(salt, seed) % 2001) - 1000) / 1000 // −1 … +1
  const moved = value + offset * 0.0009
  const clamped = Math.min(Math.max(moved, limits[0]), limits[1])
  return Number(clamped.toFixed(7))
}

/** Días enteros entre una fecha y el momento del dump. Mínimo 0. */
function daysAgo(iso: string, now: number): number {
  return Math.max(0, Math.round((now - new Date(iso).getTime()) / 86_400_000))
}

function main(): void {
  const [, , inputPath, outputPath = 'apps/api/scripts/fixtures/address-directory.json'] =
    process.argv

  if (!inputPath) {
    console.error('Uso: node apps/api/scripts/anonymize-address-directory.ts <dump.json> [salida]')
    process.exit(1)
  }

  const raw: RawRow[] = JSON.parse(readFileSync(inputPath, 'utf8'))
  if (!Array.isArray(raw) || raw.length === 0) {
    console.error('El dump está vacío o no es un array JSON.')
    process.exit(1)
  }

  const now = Date.now()

  // ── 1 · Papel de cada token: nombre de pila o apellido ─────────────────────
  // Se construye ANTES de tocar las referencias, porque el paso 2 necesita
  // conocer todos los nombres reales para poder buscarlos dentro del texto.
  //
  // El papel sale de la POSICIÓN en `customer_name`: el primer token es el
  // nombre de pila, los demás son apellidos. Un token visto primero como pila
  // se queda como pila —"MARIA" es nombre en "MARIA QUISPE" y también en
  // "ANA MARIA", y elegir uno de los dos consistentemente basta.
  const roleByToken = new Map<string, 'given' | 'surname'>()
  for (const row of raw) {
    const name = row.customer_name?.trim().toUpperCase()
    if (!name) continue
    row.customer_name?.trim().toUpperCase().split(/\s+/).forEach((token, position) => {
      if (token.length < 3 || NOT_A_NAME.has(token)) return
      const role = position === 0 ? 'given' : 'surname'
      const known = roleByToken.get(token)
      // 'given' gana: si el token ya se vio como nombre de pila, no se degrada.
      if (known === 'given') return
      roleByToken.set(token, role)
    })
  }

  /** Alias de un token respetando el papel que se le detectó. */
  const alias = (token: string): string =>
    aliasForToken(token, roleByToken.get(token.toUpperCase()) === 'surname')

  // Los tokens se sustituyen de más largo a más corto para que "MARIA LUISA" se
  // procese antes que "MARIA" y no quede un residuo suelto.
  const sortedTokens = [...roleByToken.keys()].sort((a, b) => b.length - a.length)

  // ── 2 · Transformar fila por fila ──────────────────────────────────────────
  const seenDefaultPhones = new Set<string>()
  const out: FixtureRow[] = []
  /** Cuántas veces se sustituyó cada token dentro de una referencia. Se imprime
   *  al final: es lo que permite revisar a ojo si el heurístico se comió un
   *  topónimo que PLACE_PREFIXES no cubre. */
  const substituted = new Map<string, number>()

  raw.forEach((row, index) => {
    const phone = fakePhone(row.phone)

    // El nombre se rearma token a token con el MISMO mapa que usa la
    // referencia, así "DIANA MENDOZA" y el "casa de DIANA" de su referencia
    // salen ambos con el alias de DIANA.
    const realName = row.customer_name?.trim().toUpperCase() ?? null
    const fakeName = realName
      ? realName
          .split(/\s+/)
          .map((token) => (token.length >= 3 && !NOT_A_NAME.has(token) ? alias(token) : token))
          .join(' ')
      : null

    // Sustitución de nombres dentro de la referencia. Tres guardas:
    //   · las frases protegidas se enmascaran antes y se restauran después
    //   · `\b` para no destrozar "ROSAL" al sustituir "ROSA"
    //   · lookbehind negativo para no tocar "SANTA ROSA" (ver PLACE_PREFIXES)
    let reference = row.reference

    // El centinela va entre NUL, que no puede aparecer en el texto de origen. Un
    // delimitador visible (espacios, corchetes) sí podría, y entonces la
    // restauración escribiría el texto en el lugar equivocado.
    const masked: string[] = []
    for (const phrase of PROTECTED_PHRASES) {
      const rx = new RegExp(phrase.replace(/\s+/g, '\\s+'), 'gi')
      reference = reference.replace(rx, (hit) => {
        masked.push(hit)
        return `\u0000${masked.length - 1}\u0000`
      })
    }

    for (const token of sortedTokens) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(
        `(?<!\\b(?:${PLACE_PREFIXES.join('|')})\\s)\\b${escaped}\\b`,
        'gi',
      )
      reference = reference.replace(pattern, () => {
        substituted.set(token, (substituted.get(token) ?? 0) + 1)
        return alias(token)
      })
    }

    // Restaurar las frases protegidas, tal cual estaban.
    reference = reference.replace(/\u0000(\d+)\u0000/g, (_, i) => masked[Number(i)])

    // `is_default` sobrevive solo la primera vez por teléfono: el índice único
    // parcial `address_directory_default_unique` rechaza el segundo. Si el dump
    // trae dos (no debería), el seed fallaría a mitad y dejaría el fixture a
    // medio sembrar.
    let isDefault = row.is_default
    if (isDefault) {
      if (seenDefaultPhones.has(phone)) isDefault = false
      else seenDefaultPhones.add(phone)
    }

    const hasCoords = row.lat !== null && row.lng !== null

    out.push({
      // UUID de fixture, con prefijo reconocible a simple vista (mismo criterio
      // que `e2e00000-…` en e2e-fixtures.ts). NO son los UUID de prod.
      id: `ad000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      phone,
      customer_name: fakeName,
      reference,
      lat: hasCoords ? jitter(row.lat as number, 'lat', row.id, [-9.2, -9.1]) : null,
      lng: hasCoords ? jitter(row.lng as number, 'lng', row.id, [-78.33, -78.23]) : null,
      // `accuracy_m` solo puede existir con coordenada (CHECK
      // `address_directory_accuracy_needs_coords`).
      accuracy_m: hasCoords ? row.accuracy_m : null,
      source: row.source,
      is_default: isDefault,
      times_used: row.times_used,
      last_used_days_ago: row.last_used_at ? daysAgo(row.last_used_at, now) : null,
      created_days_ago: daysAgo(row.created_at, now),
      from_legacy: row.legacy_address_id !== null,
    })
  })

  // ── 3 · Validar contra los CHECK de la 0122 ────────────────────────────────
  // Se valida AQUÍ y no al sembrar. Un fixture que viola un CHECK revienta a
  // mitad del insert y deja la tabla en un estado parcial que parece un bug del
  // seeder; detectarlo al generar convierte eso en un error legible.
  const problems: string[] = []
  for (const row of out) {
    if (!/^9\d{8}$/.test(row.phone)) problems.push(`${row.id}: teléfono "${row.phone}" inválido`)
    if ((row.lat === null) !== (row.lng === null))
      problems.push(`${row.id}: lat y lng deben ir juntas`)
    if (row.lat !== null && (row.lat < -9.2 || row.lat > -9.1))
      problems.push(`${row.id}: lat ${row.lat} fuera de la caja`)
    if (row.lng !== null && (row.lng < -78.33 || row.lng > -78.23))
      problems.push(`${row.id}: lng ${row.lng} fuera de la caja`)
    if (row.accuracy_m !== null && row.lat === null)
      problems.push(`${row.id}: accuracy_m sin coordenada`)
    if (
      row.accuracy_m !== null &&
      (row.accuracy_m <= 0 ||
        row.accuracy_m >= 1000 ||
        (row.accuracy_m >= 998.5 && row.accuracy_m <= 999.5))
    )
      problems.push(`${row.id}: accuracy_m ${row.accuracy_m} es un centinela o está fuera de rango`)
    if (row.reference.trim().length === 0) problems.push(`${row.id}: referencia vacía`)
  }

  if (problems.length > 0) {
    console.error(`\n🚨 ${problems.length} fila(s) violan los CHECK de la 0122:\n`)
    for (const p of problems.slice(0, 20)) console.error(`   · ${p}`)
    if (problems.length > 20) console.error(`   … y ${problems.length - 20} más`)
    process.exit(1)
  }

  // ── 4 · Fuga de PII: verificación explícita ────────────────────────────────
  // Barata y vale la pena: es lo único que separa este fixture de publicar
  // teléfonos reales en git.
  const realPhones = new Set(raw.map((r) => r.phone))
  const serialized = JSON.stringify(out)
  const leaked = [...realPhones].filter((p) => serialized.includes(p))
  if (leaked.length > 0) {
    console.error(`\n🚨 ${leaked.length} teléfono(s) reales aparecen en la salida. Abortado.`)
    process.exit(1)
  }

  writeFileSync(outputPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8')

  // ── 5 · Reporte de forma ───────────────────────────────────────────────────
  // Estos números deben coincidir con los de `PENDIENTES.md:17`. Si no
  // coinciden, el dump de entrada no es el que creemos.
  const phones = new Map<string, number>()
  for (const row of out) phones.set(row.phone, (phones.get(row.phone) ?? 0) + 1)
  const multi = [...phones.values()].filter((n) => n > 1).length
  const withGps = out.filter((r) => r.lat !== null).length
  const withAcc = out.filter((r) => r.accuracy_m !== null).length

  console.log(`\n✓ ${outputPath}\n`)
  console.log(`  filas                  ${out.length}`)
  console.log(`  teléfonos únicos       ${phones.size}`)
  console.log(
    `  con >1 dirección       ${multi} (${((100 * multi) / phones.size).toFixed(1)}% — esperado ~9,7%)`,
  )
  console.log(
    `  con GPS                ${withGps} (${((100 * withGps) / out.length).toFixed(1)}% — esperado ~53,3%)`,
  )
  console.log(`  con accuracy_m         ${withAcc}`)
  console.log(`  del ETL del legacy     ${out.filter((r) => r.from_legacy).length}`)

  // REVISAR A OJO. `PLACE_PREFIXES` atrapa "SANTA ROSA" pero no un topónimo que
  // sea idéntico a un nombre de pila y aparezca suelto. Si en esta lista sale
  // algo que es un lugar y no una persona, agregalo al stoplist y regenerá:
  // sustituirlo estaría corrompiendo referencias reales.
  const topSubstituted = [...substituted.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  if (topSubstituted.length > 0) {
    console.log('\n  Tokens sustituidos dentro de referencias (revisar que sean personas):')
    for (const [token, count] of topSubstituted) {
      console.log(`    ${token.padEnd(18)} ${count}×`)
    }
  }

  // Colisiones de hash: dos teléfonos reales distintos que caen en el mismo
  // falso fusionarían dos clientes en uno. Con 591 teléfonos sobre 10⁸ el
  // riesgo es ínfimo, pero silencioso — así que se comprueba en vez de suponer.
  const collisions = realPhones.size - phones.size
  if (collisions > 0) {
    console.warn(
      `\n⚠️  ${collisions} colisión(es) de hash: dos clientes reales comparten teléfono falso.`,
    )
    console.warn('   Cambiá el salt en `fakePhone` y regenerá.')
  }
}

main()
