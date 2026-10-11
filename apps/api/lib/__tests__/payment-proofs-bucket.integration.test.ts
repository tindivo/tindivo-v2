/**
 * C5 · Los límites del bucket `payment-proofs` (migración 0254).
 *
 * Se prueba con el cliente de Storage de la base LOCAL, igual que sube la app:
 * los topes del bucket valen para cualquier rol, también para service_role.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { localClient as db } from './helpers/local-db'

const BUCKET = 'payment-proofs'
const runId = crypto.randomUUID()
const uploaded: string[] = []

const MB = 1024 * 1024

async function put(name: string, type: string, bytes: number) {
  const path = `c5-test-${runId}/${name}`
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, new Blob([new Uint8Array(bytes)], { type }), { contentType: type })
  if (!error) uploaded.push(path)
  return error
}

afterAll(async () => {
  if (uploaded.length) await db.storage.from(BUCKET).remove(uploaded)
})

describe('bucket payment-proofs', () => {
  it.each([
    ['a.jpg', 'image/jpeg'],
    ['a.png', 'image/png'],
    ['a.webp', 'image/webp'],
    ['a.heic', 'image/heic'],
    ['a.heif', 'image/heif'],
  ])('acepta %s (%s) dentro del tamaño', async (name, type) => {
    expect(await put(name, type, 200 * 1024)).toBeNull()
  })

  it('acepta una foto de justo 15 MB', async () => {
    expect(await put('limite.jpg', 'image/jpeg', 15 * MB)).toBeNull()
  })

  it('rechaza un PDF', async () => {
    expect(await put('a.pdf', 'application/pdf', 100 * 1024)).not.toBeNull()
  })

  it('rechaza un archivo de más de 15 MB', async () => {
    expect(await put('grande.jpg', 'image/jpeg', 15 * MB + 1)).not.toBeNull()
  })
})
