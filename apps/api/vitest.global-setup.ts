/**
 * Barrido de mundos de test huérfanos — DB LOCAL, antes y después de la suite.
 *
 * Los helpers (`cleanup`, `cleanupLedgerWorld`) ya borran lo suyo, y cuando la
 * suite termina —aunque sea en rojo— funcionan. Lo que no cubren es la corrida
 * que NO termina: un Ctrl-C, un crash del runner, un `vitest --watch` cerrado a
 * lo bruto. Ahí el `afterAll` nunca corre y el negocio inventado se queda en la
 * base para siempre.
 *
 * No es teórico: el 2026-08-11 había 71 negocios y 110 usuarios acumulados así,
 * una corrida abortada tras otra. Ninguno de los dos scripts de limpieza los
 * alcanzaba —`seed-e2e-clean` filtra por `customer_user_id` (estos lo tienen
 * NULL) y el `wipe()` de `seed-demo-board` solo barre los dos negocios e2e
 * fijos— así que crecían sin techo hasta que la cajera y el motorizado abrían
 * sus tableros y veían cientos de pedidos ajenos.
 *
 * Por eso barre en el SETUP y no solo en el teardown: el teardown tampoco corre
 * si matas el proceso. Barrer al arrancar es lo único que garantiza que la
 * basura de la corrida anterior no sobreviva a la siguiente.
 *
 * Se identifica por NOMBRE porque es lo único que estos mundos comparten: sus
 * ids son aleatorios. Los nombres son exclusivos de los fixtures —ningún
 * negocio real ni del seed e2e se llama así—, y el guard anti-producción de
 * `local-db.ts` (aborta si la URL no es 127.0.0.1) se hereda al importarlo.
 */
import { localClient as db, TELEFONOS_FIXTURE } from './lib/__tests__/helpers/local-db.ts'

/** Negocios que crean los fixtures. Ver `local-db.ts` y `ledger-fixtures.ts`. */
const NEGOCIOS_FIXTURE = [
  'La Florencia (cash test)', // seedContraentregaOrder
  'La Florencia (timer test)', // seedPrepaidOrder
  'Test Restaurant Integration', // seedFraudClaim
]
/** `Ledger Test <hash>` — el hash es aleatorio, así que va por prefijo. */
const PREFIJO_LEDGER = 'Ledger Test '

/** Negocios del seed e2e: mundo compartido, NUNCA se borran. */
const NEGOCIOS_SEED = [
  'e2e00000-0000-4000-8000-000000000010',
  'e2e00000-0000-4000-8000-0000000000b1',
]

/**
 * Usuarios de fixture. Nombres exclusivos de los helpers: los del seed e2e son
 * `Dueño E2E`, `Motorizado E2E`, etc., así que no pueden caer aquí por error.
 */
const USUARIOS_FIXTURE = [
  'Ledger Test Owner',
  'Ledger Test Driver',
  'Test Business Owner',
  'Test Admin',
]

/** PostgREST mete los `.in()` en la URL: con miles de UUID revienta con un 414. */
const LOTE = 200

async function enLotes<T>(ids: string[], fn: (lote: string[]) => Promise<T>): Promise<void> {
  for (let i = 0; i < ids.length; i += LOTE) await fn(ids.slice(i, i + LOTE))
}

interface Barrido {
  negocios: number
  usuarios: number
  pedidos: number
  ciclos: number
}

async function barrer(): Promise<Barrido> {
  // 1. Negocios de fixture (por nombre exacto o por el prefijo del ledger).
  //
  // El filtro se hace en JS, no con `.or()` de PostgREST: los nombres llevan
  // paréntesis y espacios (`La Florencia (cash test)`), y dentro de un `or=(…)`
  // PostgREST los interpreta como sintaxis, no como texto — el filtro no casaba
  // NADA y el barrido se creía limpio mientras la basura seguía ahí. En una
  // base local `businesses` tiene decenas de filas: traerlas todas no cuesta.
  const { data: negocios, error: negErr } = await db.from('businesses').select('id, name')
  if (negErr) throw new Error(`barrido: leer businesses falló: ${negErr.message}`)
  const bizIds = (negocios ?? [])
    .filter((b) => NEGOCIOS_FIXTURE.includes(b.name) || b.name.startsWith(PREFIJO_LEDGER))
    .map((b) => b.id)

  if (bizIds.length > 0) {
    // 2. Sus pedidos, para poder soltar lo que cuelga de ellos sin FK que lo ate.
    const orderIds: string[] = []
    await enLotes(bizIds, async (lote) => {
      const { data } = await db.from('orders').select('id').in('business_id', lote)
      for (const o of data ?? []) orderIds.push(o.id)
    })

    // `domain_events` referencia el pedido por `aggregate_id` y SIN foreign key:
    // no cae por cascada, hay que borrarlo a mano o quedan eventos huérfanos.
    await enLotes(orderIds, async (lote) => {
      const { error } = await db.from('domain_events').delete().in('aggregate_id', lote)
      if (error) throw new Error(`barrido: borrar domain_events falló: ${error.message}`)
    })

    // FKs hacia `businesses` sin cascada (NO ACTION): bloquean el DELETE si quedan.
    await enLotes(bizIds, async (lote) => {
      for (const tabla of [
        'business_charges',
        'restaurant_payments',
        'cash_settlements',
        'orders',
      ] as const) {
        const { error } = await db.from(tabla).delete().in('business_id', lote)
        if (error) throw new Error(`barrido: borrar ${tabla} falló: ${error.message}`)
      }
      const { error } = await db.from('businesses').delete().in('id', lote)
      if (error) throw new Error(`barrido: borrar businesses falló: ${error.message}`)
    })
  }

  // 3. Pedidos de fixture colgados de los negocios del seed. No se van con el
  //    negocio (ese no se borra), así que van por su teléfono. Es la fuga más
  //    grande de las tres: 159 pedidos medidos el 2026-08-11, y son los que
  //    llenaban la bandeja del motorizado de códigos que no reconocía.
  const { data: pedidos, error: pedErr } = await db
    .from('orders')
    .select('id')
    .in('business_id', NEGOCIOS_SEED)
    .in('customer_phone', TELEFONOS_FIXTURE)
  if (pedErr) throw new Error(`barrido: leer orders de fixture falló: ${pedErr.message}`)
  const huerfanos = (pedidos ?? []).map((o) => o.id)

  await enLotes(huerfanos, async (lote) => {
    // `business_charges` sujeta el pedido con una FK sin cascada, y
    // `domain_events` lo referencia sin FK ninguna: los dos, a mano.
    for (const [tabla, col] of [
      ['business_charges', 'order_id'],
      ['domain_events', 'aggregate_id'],
      ['orders', 'id'],
    ] as const) {
      const { error } = await db.from(tabla).delete().in(col, lote)
      if (error) throw new Error(`barrido: borrar ${tabla} falló: ${error.message}`)
    }
  })

  // 4. Ciclos de caja que se quedaron sin pedidos.
  //
  // `create_cash_settlement` corre de verdad en los tests de efectivo y deja su
  // fila en los negocios del seed, que no se borran. Al llevarse sus pedidos el
  // paso anterior, el ciclo queda vacío — y un ciclo vacío no es una fila
  // inerte: la pantalla de efectivo lo pinta como una tarjeta "Por confirmar
  // ahora" pidiéndole a la cajera que cuente un fajo que no existe. Medidos 11
  // tras una sola corrida de la suite.
  const { data: ciclos, error: cicErr } = await db
    .from('cash_settlements')
    .select('id')
    .in('business_id', NEGOCIOS_SEED)
  if (cicErr) throw new Error(`barrido: leer cash_settlements falló: ${cicErr.message}`)

  const { data: conPedidos, error: cpErr } = await db
    .from('orders')
    .select('cash_settlement_id')
    .in('business_id', NEGOCIOS_SEED)
    .not('cash_settlement_id', 'is', null)
  if (cpErr) throw new Error(`barrido: leer orders liquidados falló: ${cpErr.message}`)
  const vivos = new Set((conPedidos ?? []).map((o) => o.cash_settlement_id))

  const vacios = (ciclos ?? []).map((c) => c.id).filter((id) => !vivos.has(id))
  await enLotes(vacios, async (lote) => {
    for (const [tabla, col] of [
      ['domain_events', 'aggregate_id'],
      ['cash_settlements', 'id'],
    ] as const) {
      const { error } = await db.from(tabla).delete().in(col, lote)
      if (error) throw new Error(`barrido: borrar ${tabla} falló: ${error.message}`)
    }
  })

  // 5. Los usuarios. `drivers`, `user_roles` y compañía caen por ON DELETE CASCADE.
  const { data: usuarios, error: usrErr } = await db
    .from('users')
    .select('id')
    .in('full_name', USUARIOS_FIXTURE)
  if (usrErr) throw new Error(`barrido: leer users falló: ${usrErr.message}`)
  const userIds = (usuarios ?? []).map((u) => u.id)

  await enLotes(userIds, async (lote) => {
    const { error } = await db.from('users').delete().in('id', lote)
    if (error) throw new Error(`barrido: borrar users falló: ${error.message}`)
  })
  // `public.users` NO tiene foreign key a `auth.users`: borrar una deja la otra
  // colgando, y el siguiente `createUser` con ese email choca. Van las dos.
  // Un fallo aquí NO tumba la suite: los usuarios de fixture que se insertaron
  // solo en `public.users` (los de una purga manual, sin par en auth) darían
  // "User not found" y no hay nada que arreglar.
  for (const id of userIds) await db.auth.admin.deleteUser(id)

  return {
    negocios: bizIds.length,
    usuarios: userIds.length,
    pedidos: huerfanos.length,
    ciclos: vacios.length,
  }
}

async function barrerYReportar(momento: 'antes' | 'después'): Promise<void> {
  const { negocios, usuarios, pedidos, ciclos } = await barrer()
  if (negocios > 0 || usuarios > 0 || pedidos > 0 || ciclos > 0) {
    console.log(
      `🧹 [${momento}] restos de test borrados: ${negocios} negocios, ` +
        `${usuarios} usuarios, ${pedidos} pedidos, ${ciclos} ciclos de caja`,
    )
  }
}

export async function setup(): Promise<void> {
  await barrerYReportar('antes')
}

export async function teardown(): Promise<void> {
  await barrerYReportar('después')
}
