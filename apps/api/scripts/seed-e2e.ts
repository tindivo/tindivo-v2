/**
 * Seed del MUNDO para el e2e — SOLO DB LOCAL.
 *
 * Siembra un mundo mínimo pero completo para recorrer el camino feliz:
 * un negocio abierto, menú con modificadores, motorizado disponible, cliente
 * con dirección dentro de la zona de cobertura, y los app_settings necesarios.
 *
 * IDEMPOTENTE: usa IDs FIJOS + upsert. Correrlo N veces deja el mismo estado,
 * sin truncate y sin duplicar. Por eso NO borra nada del mundo.
 *
 * Los pedidos de prueba NO se tocan aquí: se limpian con `seed-e2e-clean.ts`,
 * que borra solo transaccionales por el marcador del cliente de prueba.
 *
 * GUARD ANTI-PRODUCCIÓN: se hereda de `local-db.ts`, que evalúa `assertLocalOnly`
 * al importarse y aborta si la URL no es 127.0.0.1/localhost. No se duplica aquí.
 *
 * Uso:  pnpm db:seed:e2e
 */
import { localClient as db } from '../lib/__tests__/helpers/local-db.ts'
import { E2E, LOCAL_ONLY_SETTINGS } from './e2e-fixtures.ts'
import { seedWorld } from './seed-world.ts'

// El cliente Supabase está tipado con un `Database` que aún no conoce algunas
// tablas (business_charges y otras). El seed opera sobre datos crudos, así que
// se accede sin tipar en vez de forzar castings tabla por tabla.
// biome-ignore lint/suspicious/noExplicitAny: database.types.ts está desactualizado
const raw = db as any

async function upsert(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  const { error } = await raw.from(table).upsert(rows, { onConflict })
  if (error) throw new Error(`upsert ${table} falló: ${error.message}`)
  console.log(`  ✓ ${table.padEnd(28)} ${rows.length} fila(s)`)
}

/** Crea el usuario en auth.users si no existe; devuelve siempre el mismo id fijo. */
async function ensureAuthUser(id: string, email: string, fullName: string): Promise<void> {
  const { data } = await db.auth.admin.getUserById(id)
  if (data?.user) {
    console.log(`  ✓ auth.users                  ${email} (ya existía)`)
    return
  }
  const { error } = await db.auth.admin.createUser({
    // El id fijo es lo que hace idempotente todo lo que cuelga del usuario.
    id,
    email,
    password: E2E.PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error) throw new Error(`crear auth user ${email} falló: ${error.message}`)
  console.log(`  ✓ auth.users                  ${email} (creado)`)
}

async function main(): Promise<void> {
  console.log('\nSeed e2e — mundo (idempotente, IDs fijos)\n')

  // ── 1. app_settings ────────────────────────────────────────────────────────
  // Las migraciones ya siembran estas claves con valores de producción. Aquí solo
  // se sobrescriben las que harían el e2e no determinista: `platform_schedule`
  // (18:00-23:00) y `order_intake_cutoff` (22:30) bloquean la creación de pedidos
  // fuera de la tarde-noche, así que en LOCAL se abren 24h. Entregas, justo
  // debajo.
  console.log('app_settings')
  await upsert('app_settings', LOCAL_ONLY_SETTINGS, 'key')

  // Entregas, igual: a toda hora en LOCAL. Pero sin tocar su horario —con
  // 00:00-23:59 el home diría «12 am a 11:59 pm»—, sino con `ignoreSchedule`
  // (0241). Se fusiona en vez de hacer upsert porque `courier` lleva precio,
  // límites y demás que las migraciones ya dejaron bien.
  const { data: courier, error: courierErr } = await raw
    .from('app_settings')
    .select('value')
    .eq('key', 'courier')
    .single()
  if (courierErr) throw new Error(`leer app_settings.courier falló: ${courierErr.message}`)
  const { error: courierUpdErr } = await raw
    .from('app_settings')
    .update({ value: { ...courier.value, ignoreSchedule: true } })
    .eq('key', 'courier')
  if (courierUpdErr) throw new Error(`abrir Entregas a toda hora falló: ${courierUpdErr.message}`)
  console.log(`  ✓ ${'courier.ignoreSchedule'.padEnd(28)} true`)

  // ── 2. Usuarios, negocios, menú, motorizados y clientes ────────────────────
  await seedWorld(db, ensureAuthUser, { includeAdmin: true })

  console.log('\nMundo e2e listo.\n')
}

main().catch((err) => {
  console.error('\nSeed FALLÓ:', err instanceof Error ? err.message : err)
  process.exit(1)
})
