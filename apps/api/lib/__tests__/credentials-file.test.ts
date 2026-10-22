import { execFileSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  openPrivateCredentialsFile,
  recordThenActivate,
  redactSecrets,
  securePlatform,
} from '../../scripts/credentials-file.ts'

const NOW = '2026-10-22T10:00:00.000Z'
const FILE = 'staging-credenciales-2026-10-22T10-00-00-000Z.md'
let root: string
let n = 0
const freshDir = () => {
  const d = join(root, `d${n++}`)
  mkdirSync(d)
  return d
}
const noop = () => {}
const lstatExists = (p: string) => {
  try {
    lstatSync(p)
    return true
  } catch {
    return false
  }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'cred-test-'))
})
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('openPrivateCredentialsFile', () => {
  it('(a) crea el archivo con el nombre esperado y llama a secure con su ruta', () => {
    const dir = freshDir()
    const seen: string[] = []
    const { path, fd } = openPrivateCredentialsFile(dir, NOW, (p) => seen.push(p))
    closeSync(fd)
    expect(path).toBe(join(dir, FILE))
    expect(seen).toEqual([path])
    expect(readFileSync(path, 'utf8')).toContain('por activar')
    expect(readFileSync(path, 'utf8')).toContain('| Email | Rol | Contraseña | Estado |')
  })

  it('(b) si el archivo ya existe, lanza y su contenido queda intacto', () => {
    const dir = freshDir()
    writeFileSync(join(dir, FILE), 'ORIGINAL')
    expect(() => openPrivateCredentialsFile(dir, NOW, noop)).toThrow()
    expect(readFileSync(join(dir, FILE), 'utf8')).toBe('ORIGINAL')
  })

  describe('(c) enlaces simbólicos', () => {
    const tryLink = (target: string, path: string): boolean => {
      try {
        symlinkSync(target, path)
        return true
      } catch (e) {
        console.warn(`SALTADO: este SO no deja crear enlaces simbólicos (${(e as Error).message})`)
        return false
      }
    }

    it('un enlace a otro archivo: lanza y el destino queda intacto', (ctx) => {
      const dir = freshDir()
      const target = join(dir, 'destino.txt')
      writeFileSync(target, 'ORIGINAL')
      if (!tryLink(target, join(dir, FILE))) return ctx.skip()
      expect(() => openPrivateCredentialsFile(dir, NOW, noop)).toThrow()
      expect(readFileSync(target, 'utf8')).toBe('ORIGINAL')
    })

    it('un enlace colgado: lanza y no crea el destino', (ctx) => {
      const dir = freshDir()
      const target = join(dir, 'no-existe.txt')
      if (!tryLink(target, join(dir, FILE))) return ctx.skip()
      expect(() => openPrivateCredentialsFile(dir, NOW, noop)).toThrow()
      expect(existsSync(target)).toBe(false)
    })
  })

  describe('(h, i) carrera entre la comprobación y la apertura', () => {
    const canLink = (dir: string): boolean => {
      try {
        symlinkSync(join(dir, 'sonda-destino'), join(dir, 'sonda'))
        return true
      } catch (e) {
        console.warn(`SALTADO: este SO no deja crear enlaces simbólicos (${(e as Error).message})`)
        return false
      }
    }

    it('(h) enlace colgado creado en medio: lanza, no queda destino ni ruta', (ctx) => {
      const dir = freshDir()
      if (!canLink(dir)) return ctx.skip()
      const destino = join(dir, 'destino-en-repo.md')
      let secured = false
      expect(() =>
        openPrivateCredentialsFile(
          dir,
          NOW,
          () => {
            secured = true
          },
          { beforeOpen: (p) => symlinkSync(destino, p) },
        ),
      ).toThrow(/cambió entre la comprobación y la apertura/)
      expect(secured).toBe(false)
      expect(existsSync(destino)).toBe(false)
      expect(lstatExists(join(dir, FILE))).toBe(false)
    })

    it('(i) enlace a un archivo con contenido creado en medio: lanza y conserva su contenido', (ctx) => {
      const dir = freshDir()
      if (!canLink(dir)) return ctx.skip()
      const target = join(dir, 'existente.md')
      writeFileSync(target, 'ORIGINAL')
      expect(() =>
        openPrivateCredentialsFile(dir, NOW, noop, { beforeOpen: (p) => symlinkSync(target, p) }),
      ).toThrow()
      expect(readFileSync(target, 'utf8')).toBe('ORIGINAL')
      expect(lstatExists(join(dir, FILE))).toBe(true) // el enlace lo dejó el "atacante"; no se sigue
    })
  })

  it('(j) si secure deja otro archivo en la ruta: lanza y no escribe en ninguno', () => {
    const dir = freshDir()
    const path = join(dir, FILE)
    expect(() =>
      openPrivateCredentialsFile(dir, NOW, (p) => {
        renameSync(p, `${p}.movido`)
        writeFileSync(p, '')
      }),
    ).toThrow(/cambió entre la comprobación y la apertura/)
    expect(readFileSync(`${path}.movido`, 'utf8')).toBe('')
    expect(existsSync(path) ? readFileSync(path, 'utf8') : '').toBe('')
  })

  it('(d) si secure lanza, el archivo no queda en disco', () => {
    const dir = freshDir()
    expect(() =>
      openPrivateCredentialsFile(dir, NOW, () => {
        throw new Error('no se pudo')
      }),
    ).toThrow('no se pudo')
    expect(readdirSync(dir)).toEqual([])
  })
})

describe('recordThenActivate', () => {
  const entry = (email: string) => ({ email, role: 'driver', password: `pw-${email}` })

  it('(e) la fila "por activar" está en disco cuando activate se ejecuta; luego queda "activada"', async () => {
    const dir = freshDir()
    const { path, fd } = openPrivateCredentialsFile(dir, NOW, noop)
    let seenDuring = ''
    await recordThenActivate(fd, entry('a@x.pe'), async () => {
      seenDuring = readFileSync(path, 'utf8')
    })
    closeSync(fd)
    expect(seenDuring).toContain('| a@x.pe | driver | pw-a@x.pe | por activar |')
    expect(seenDuring).not.toContain('| — | activada |')
    expect(readFileSync(path, 'utf8')).toContain('| a@x.pe | driver | — | activada |')
  })

  it('(e) si activate lanza, no hay "activada" y se relanza', async () => {
    const dir = freshDir()
    const { path, fd } = openPrivateCredentialsFile(dir, NOW, noop)
    await expect(
      recordThenActivate(fd, entry('a@x.pe'), async () => {
        throw new Error('Auth caído')
      }),
    ).rejects.toThrow('Auth caído')
    closeSync(fd)
    const text = readFileSync(path, 'utf8')
    expect(text).toContain('por activar')
    expect(text).not.toContain('| — | activada |')
  })

  it('(f) tres usuarios, el segundo falla: 1.º activada, 2.º por activar, 3.º nunca se llama', async () => {
    const dir = freshDir()
    const { path, fd } = openPrivateCredentialsFile(dir, NOW, noop)
    const called: string[] = []
    const run = async () => {
      for (const email of ['u1@x.pe', 'u2@x.pe', 'u3@x.pe']) {
        await recordThenActivate(fd, entry(email), async () => {
          called.push(email)
          if (email === 'u2@x.pe') throw new Error('falló')
        })
      }
    }
    await expect(run()).rejects.toThrow('falló')
    closeSync(fd)
    expect(called).toEqual(['u1@x.pe', 'u2@x.pe'])
    const text = readFileSync(path, 'utf8')
    expect(text).toContain('| u1@x.pe | driver | — | activada |')
    expect(text).toContain('| u2@x.pe | driver | pw-u2@x.pe | por activar |')
    expect(text).not.toContain('u2@x.pe | driver | — | activada')
    expect(text).not.toContain('u3@x.pe')
  })
})

describe('securePlatform', () => {
  it('(g) deja el archivo accesible solo para el usuario actual', () => {
    const dir = freshDir()
    const p = join(dir, 'prueba.md')
    writeFileSync(p, 'x')
    securePlatform(p)
    if (process.platform === 'win32') {
      const user = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`.toLowerCase()
      const out = execFileSync('icacls', [p], { encoding: 'utf8' })
      const entries = out
        .split(/\r?\n/)
        .map((l) => l.replace(p, '').trim())
        .filter((l) => l.includes(':') && /\([A-Z]+\)/.test(l))
      expect(entries).toHaveLength(1)
      expect(entries[0]?.toLowerCase().startsWith(`${user}:`)).toBe(true)
      expect(entries[0]).toContain('(F)')
    } else {
      expect((statSync(p).mode & 0o777).toString(8)).toBe('600')
    }
  })
})

describe('redactSecrets', () => {
  it('sustituye cada secreto por [redactado] e ignora los vacíos', () => {
    expect(redactSecrets('clave K1 y pw P2 y K1', ['K1', 'P2', ''])).toBe(
      'clave [redactado] y pw [redactado] y [redactado]',
    )
  })
})
