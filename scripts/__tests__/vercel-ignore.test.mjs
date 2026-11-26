import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { buildCommand, decide } from '../vercel-ignore.mjs'

const quiet = () => {}
const marcadores = ['[skip ci]', '[vercel skip @tindivo/api]', '[vercel only @tindivo/web]']

describe('producción nunca se salta', () => {
  for (const m of marcadores) {
    test(`producción + ${m} -> construir`, () => {
      let llamado = false
      const run = () => {
        llamado = true
        return 0
      }
      const env = {
        VERCEL_ENV: 'production',
        VERCEL_GIT_COMMIT_MESSAGE: `fix: algo ${m}`,
      }
      assert.equal(decide({ env, run, log: quiet }), 1)
      assert.equal(llamado, false)
    })
  }
})

describe('previews', () => {
  const env = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feat/x' }
  test('sin cambios propaga 0 (saltar)', () => {
    assert.equal(decide({ env, run: () => 0, log: quiet }), 0)
  })
  test('con cambios -> 1 (construir)', () => {
    assert.equal(decide({ env, run: () => 1, log: quiet }), 1)
  })
  test('error del ejecutor -> 1 (fallar seguro)', () => {
    const run = () => {
      throw new Error('boom')
    }
    assert.equal(decide({ env, run, log: quiet }), 1)
  })
  test('VERCEL_ENV ausente tampoco salta sin respaldo de turbo-ignore', () => {
    assert.equal(decide({ env: {}, run: () => 1, log: quiet }), 1)
  })
})

describe('versiones fijas', () => {
  test('el comando fija turbo-ignore y turbo', () => {
    const { cmd, args } = buildCommand()
    const linea = [cmd, ...args].join(' ')
    assert.match(linea, /turbo-ignore@2\.9\.16/)
    assert.match(linea, /--turbo-version 2\.9\.16/)
    assert.doesNotMatch(linea, /\^|@latest/)
  })
})
