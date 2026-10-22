import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type Ace,
  assertPrivateAcl,
  assertStorageBoundary,
  boundaryViolations,
  openPrivateAccountsFile as openReal,
  recordThenActivate,
  redactSecrets,
  securePrivateDir,
  TRUSTED_INSTALLER_SID,
  type WriteFn,
} from '../../scripts/staging-accounts-file.ts'

/** Las pruebas usan carpetas temporales: la frontera real se prueba aparte (más abajo). */
const openPrivateAccountsFile = (
  dir: string,
  nowIso: string,
  secure: (p: string) => void,
  hooks?: Parameters<typeof openReal>[3],
) => openReal(dir, nowIso, secure, { boundary: () => {}, ...hooks })

const NOW = '2026-10-22T10:00:00.000Z'
const SUB = 'staging-credenciales-2026-10-22T10-00-00-000Z'
let root: string
let n = 0
const freshDir = () => {
  const d = join(root, `d${n++}`)
  mkdirSync(d)
  return d
}
const throwing = () => {
  throw new Error('no se pudo')
}
const exists = (p: string) => {
  try {
    lstatSync(p)
    return true
  } catch {
    return false
  }
}
const canLink = (dir: string): boolean => {
  try {
    symlinkSync(join(dir, 'sonda-destino'), join(dir, 'sonda'))
    return true
  } catch (e) {
    console.warn(`SALTADO: este SO no deja crear enlaces simbólicos (${(e as Error).message})`)
    return false
  }
}
/** Entradas de ACL (texto tras la ruta) que imprime `icacls`, solo en Windows. */
const aclEntries = (p: string): string[] =>
  execFileSync('icacls', [p], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((l) => (l.toLowerCase().startsWith(p.toLowerCase()) ? l.slice(p.length) : l).trim())
    .filter((l) => /:(\([^)]*\))+$/.test(l))

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'cuentas-test-'))
})
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('openPrivateAccountsFile', () => {
  it('(a) crea la carpeta privada y el archivo dentro, y llama a la restricción con la carpeta', () => {
    const dir = freshDir()
    const seen: string[] = []
    const {
      path,
      dir: sub,
      fd,
    } = openPrivateAccountsFile(dir, NOW, (p) => {
      seen.push(p)
      securePrivateDir(p)
    })
    closeSync(fd)
    expect(sub).toBe(join(dir, SUB))
    expect(path).toBe(join(sub, 'cuentas.md'))
    expect(seen).toEqual([sub])
    expect(readFileSync(path, 'utf8')).toContain('| Email | Rol | Contraseña | Estado |')
    expect(() => assertPrivateAcl(sub, 'dir')).not.toThrow()
    expect(() => assertPrivateAcl(path, 'file')).not.toThrow()
  })

  it('(b) si la carpeta ya existe, lanza y su contenido queda intacto', () => {
    const dir = freshDir()
    mkdirSync(join(dir, SUB))
    writeFileSync(join(dir, SUB, 'cuentas.md'), 'ORIGINAL')
    expect(() => openPrivateAccountsFile(dir, NOW, securePrivateDir)).toThrow(/ya existe/)
    expect(readFileSync(join(dir, SUB, 'cuentas.md'), 'utf8')).toBe('ORIGINAL')
  })

  describe('(c) enlaces simbólicos en la carpeta', () => {
    it('un enlace a otra carpeta: lanza y el destino queda intacto y sin cuentas.md', (ctx) => {
      const dir = freshDir()
      if (!canLink(dir)) return ctx.skip()
      const target = join(dir, 'destino')
      mkdirSync(target)
      writeFileSync(join(target, 'ajeno.txt'), 'AJENO')
      symlinkSync(target, join(dir, SUB), 'dir')
      expect(() => openPrivateAccountsFile(dir, NOW, securePrivateDir)).toThrow()
      expect(readFileSync(join(target, 'ajeno.txt'), 'utf8')).toBe('AJENO')
      expect(exists(join(target, 'cuentas.md'))).toBe(false)
    })

    it('un enlace colgado: lanza y no crea el destino', (ctx) => {
      const dir = freshDir()
      if (!canLink(dir)) return ctx.skip()
      const target = join(dir, 'no-existe')
      symlinkSync(target, join(dir, SUB), 'dir')
      expect(() => openPrivateAccountsFile(dir, NOW, securePrivateDir)).toThrow()
      expect(exists(target)).toBe(false)
    })
  })

  describe('(h, i) carrera entre la comprobación y la creación', () => {
    it('(h) enlace colgado creado en medio: lanza, no se escribe nada y nada se borra', (ctx) => {
      const dir = freshDir()
      if (!canLink(dir)) return ctx.skip()
      const destino = join(dir, 'destino-en-repo')
      let secured = false
      expect(() =>
        openPrivateAccountsFile(
          dir,
          NOW,
          () => {
            secured = true
          },
          { beforeMkdir: (sub) => symlinkSync(destino, sub, 'dir') },
        ),
      ).toThrow(/No se borró nada/)
      expect(secured).toBe(false)
      expect(exists(join(destino, 'cuentas.md'))).toBe(false)
    })

    it('(i) enlace a una carpeta con contenido creado en medio: lanza y conserva su contenido', (ctx) => {
      const dir = freshDir()
      if (!canLink(dir)) return ctx.skip()
      const target = join(dir, 'existente')
      mkdirSync(target)
      writeFileSync(join(target, 'ajeno.txt'), 'AJENO')
      expect(() =>
        openPrivateAccountsFile(dir, NOW, securePrivateDir, {
          beforeMkdir: (sub) => symlinkSync(target, sub, 'dir'),
        }),
      ).toThrow()
      expect(readFileSync(join(target, 'ajeno.txt'), 'utf8')).toBe('AJENO')
      expect(exists(join(target, 'cuentas.md'))).toBe(false)
    })

    it('(i2) enlace en la ruta del archivo creado en medio: lanza, sin secretos y sin borrar', (ctx) => {
      const dir = freshDir()
      if (!canLink(dir)) return ctx.skip()
      const destino = join(dir, 'destino-en-repo.md')
      expect(() =>
        openPrivateAccountsFile(dir, NOW, securePrivateDir, {
          beforeOpen: (file) => symlinkSync(destino, file),
        }),
      ).toThrow(/No se borró nada/)
      // Si el SO creó el destino, está vacío; el enlace sigue donde lo dejó la carrera.
      if (exists(destino)) expect(readFileSync(destino, 'utf8')).toBe('')
      expect(exists(join(dir, SUB, 'cuentas.md'))).toBe(true)
    })
  })

  it('(l) si restringir la carpeta falla: lanza, la carpeta sigue y no se creó el archivo', () => {
    const dir = freshDir()
    expect(() => openPrivateAccountsFile(dir, NOW, throwing)).toThrow(/no se pudo/)
    expect(exists(join(dir, SUB))).toBe(true)
    expect(exists(join(dir, SUB, 'cuentas.md'))).toBe(false)
  })

  it('(m) si la carpeta se sustituye mientras se restringe: lanza por identidad y no escribe', () => {
    const dir = freshDir()
    const sub = join(dir, SUB)
    expect(() =>
      openPrivateAccountsFile(dir, NOW, (p) => {
        renameSync(p, `${p}.movida`)
        mkdirSync(p)
        writeFileSync(join(p, 'ajeno.txt'), 'AJENO')
      }),
    ).toThrow(/cambió mientras se restringía/)
    expect(readFileSync(join(sub, 'ajeno.txt'), 'utf8')).toBe('AJENO')
    expect(exists(join(sub, 'cuentas.md'))).toBe(false)
    expect(exists(join(`${sub}.movida`, 'cuentas.md'))).toBe(false)
  })

  it('(n) si la carpeta se mueve y se restaura sin restringirla, la ACL del archivo manda', () => {
    const dir = freshDir()
    const sub = join(dir, SUB)
    const run = () =>
      openPrivateAccountsFile(dir, NOW, (p) => {
        renameSync(p, `${p}.movida`)
        renameSync(`${p}.movida`, p)
      })
    if (process.platform === 'win32') {
      // La carpeta hereda la ACL del padre (varias entradas): no es privada y no se escribe.
      expect(run).toThrow(/no es privado/)
      expect(readFileSync(join(sub, 'cuentas.md'), 'utf8')).toBe('')
    } else {
      // En POSIX el archivo nace 0600 aunque la carpeta no se haya restringido.
      const { path, fd } = run()
      closeSync(fd)
      expect((statSync(path).mode & 0o777).toString(8)).toBe('600')
    }
  })
})

describe('(k) privacidad real', () => {
  it('la carpeta y el archivo son privados aunque el padre dé lectura a Todos', (ctx) => {
    const dir = freshDir()
    if (process.platform === 'win32') {
      try {
        execFileSync('icacls', [dir, '/grant', '*S-1-1-0:(OI)(CI)R'], { stdio: 'pipe' })
      } catch (e) {
        console.warn(`SALTADO: icacls no disponible (${(e as Error).message})`)
        return ctx.skip()
      }
      // Control: una carpeta hija sin restringir SÍ hereda la lectura de Todos.
      const control = join(dir, 'control')
      mkdirSync(control)
      expect(aclEntries(control).join()).toMatch(/Everyone|Todos|S-1-1-0/i)
    }
    const { path, dir: sub, fd } = openPrivateAccountsFile(dir, NOW, securePrivateDir)
    closeSync(fd)
    if (process.platform === 'win32') {
      const user = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`.toLowerCase()
      const d = aclEntries(sub)
      const f = aclEntries(path)
      expect(d).toHaveLength(1)
      expect(d[0]?.toLowerCase().startsWith(`${user}:`)).toBe(true)
      expect(d[0]).toContain('(OI)(CI)(F)')
      expect(f).toHaveLength(1)
      expect(f[0]?.toLowerCase().startsWith(`${user}:`)).toBe(true)
      expect(f[0]).toContain('(F)')
      expect(`${d.join()}${f.join()}`).not.toMatch(/Everyone|Todos|S-1-1-0/i)
    } else {
      expect((statSync(sub).mode & 0o777).toString(8)).toBe('700')
      expect((statSync(path).mode & 0o777).toString(8)).toBe('600')
    }
  })
})

describe('recordThenActivate', () => {
  const entry = (email: string) => ({ email, role: 'driver', password: `pw-${email}` })
  const open = () => openPrivateAccountsFile(freshDir(), NOW, securePrivateDir)

  it('(e) la fila "por activar" está en disco cuando activate se ejecuta; luego queda "activada"', async () => {
    const { path, fd } = open()
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
    const { path, fd } = open()
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
    const { path, fd } = open()
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

  it('(o) una escritura que avanza de 3 en 3 bytes se completa y luego activa', async () => {
    const { path, fd } = open()
    const slow: WriteFn = (f, buf, off, len) => writeSync(f, buf, off, Math.min(3, len))
    let seenDuring = ''
    await recordThenActivate(
      fd,
      entry('a@x.pe'),
      async () => {
        seenDuring = readFileSync(path, 'utf8')
      },
      slow,
    )
    closeSync(fd)
    expect(seenDuring).toContain('| a@x.pe | driver | pw-a@x.pe | por activar |\n')
    expect(readFileSync(path, 'utf8')).toContain('| a@x.pe | driver | — | activada |\n')
  })

  it('(p) una escritura que devuelve 0 lanza y activate NO se llama', async () => {
    const { fd } = open()
    let activated = false
    await expect(
      recordThenActivate(
        fd,
        entry('a@x.pe'),
        async () => {
          activated = true
        },
        () => 0,
      ),
    ).rejects.toThrow(/no avanzó/)
    closeSync(fd)
    expect(activated).toBe(false)
  })

  it('(q) una escritura que lanza tras escribir un prefijo: activate NO se llama', async () => {
    const { fd } = open()
    let activated = false
    const partial: WriteFn = (f, buf, off) => {
      writeSync(f, buf, off, 4)
      throw new Error('disco lleno')
    }
    await expect(
      recordThenActivate(
        fd,
        entry('a@x.pe'),
        async () => {
          activated = true
        },
        partial,
      ),
    ).rejects.toThrow('disco lleno')
    closeSync(fd)
    expect(activated).toBe(false)
  })
})

describe('redactSecrets', () => {
  it('sustituye cada secreto por [redactado] e ignora los vacíos', () => {
    expect(redactSecrets('clave K1 y pw P2 y K1', ['K1', 'P2', ''])).toBe(
      'clave [redactado] y pw [redactado] y [redactado]',
    )
  })
})

describe('boundaryViolations', () => {
  const ME = 'S-1-5-21-1-2-3-1001'
  const ALLOWED = [ME, 'S-1-5-18', 'S-1-5-32-544']
  const OTHER = 'S-1-5-11'
  const ace = (sid: string, rights: number, extra: Partial<Ace> = {}): Ace => ({
    sid,
    rights,
    allow: true,
    inheritOnly: false,
    ...extra,
  })
  const at = (aces: Ace[], path = 'C:/a', owner = ME) => [{ path, owner, aces }]

  it('otro SID con Modify es violación', () => {
    expect(boundaryViolations(at([ace(OTHER, 1245631)]), ALLOWED)).toEqual([
      `C:/a: ${OTHER} tiene 0x1301bf`,
    ])
  })
  it('ReadAndExecute y AppendData no son violación', () => {
    expect(boundaryViolations(at([ace(OTHER, 1179817), ace(OTHER, 4)]), ALLOWED)).toEqual([])
  })
  it('FullControl solo heredable (inherit-only) no cuenta', () => {
    expect(boundaryViolations(at([ace(OTHER, 2032127, { inheritOnly: true })]), ALLOWED)).toEqual(
      [],
    )
  })
  it('una ACE de denegación no cuenta', () => {
    expect(boundaryViolations(at([ace(OTHER, 2032127, { allow: false })]), ALLOWED)).toEqual([])
  })
  it('los SID permitidos con FullControl no cuentan', () => {
    expect(boundaryViolations(at(ALLOWED.map((s) => ace(s, 2032127))), ALLOWED)).toEqual([])
  })
  it('un dueño que no es de confianza es violación', () => {
    expect(boundaryViolations(at([], 'C:/a', OTHER), ALLOWED)).toEqual([`C:/a: dueño ${OTHER}`])
  })
  it('TrustedInstaller, SYSTEM y Administradores como dueño no lo son', () => {
    const allowed = [...ALLOWED, TRUSTED_INSTALLER_SID]
    for (const o of [TRUSTED_INSTALLER_SID, 'S-1-5-18', 'S-1-5-32-544', ME]) {
      expect(boundaryViolations(at([], 'C:/', o), allowed)).toEqual([])
    }
  })
  it('con varios niveles devuelve todas las líneas', () => {
    const levels = [
      { path: 'C:/a', owner: ME, aces: [ace(OTHER, 2032127)] },
      { path: 'C:/', owner: ME, aces: [ace('S-1-1-0', 0x10000000), ace(ME, 2032127)] },
    ]
    expect(boundaryViolations(levels, ALLOWED)).toHaveLength(2)
  })
})

describe('assertStorageBoundary (real)', () => {
  it.skipIf(process.platform !== 'win32')(
    'Windows: el temporal del perfil es privado desde la raíz; una carpeta con Authenticated Users:M no',
    () => {
      expect(() => assertStorageBoundary(tmpdir())).not.toThrow()
      const mine = join(process.env.USERPROFILE ?? '', 'tindivo-secretos')
      if (existsSync(mine)) expect(() => assertStorageBoundary(mine)).not.toThrow()
      const d = freshDir()
      execFileSync('icacls', [d, '/grant', '*S-1-5-11:(OI)(CI)M'], { stdio: 'pipe' })
      expect(() => assertStorageBoundary(d)).toThrow(/S-1-5-11/)
    },
    60_000,
  )

  it.skipIf(process.platform === 'win32')(
    'POSIX: una carpeta escribible por todos sin sticky no vale',
    () => {
      const d = freshDir()
      chmodSync(d, 0o777)
      expect(() => assertStorageBoundary(d)).toThrow(/frontera privada/)
    },
  )

  it('openPrivateAccountsFile no crea nada si la frontera falla', () => {
    const dir = freshDir()
    expect(() =>
      openReal(dir, NOW, securePrivateDir, {
        boundary: () => {
          throw new Error('ABORTADO: frontera')
        },
      }),
    ).toThrow(/frontera\. No se creó nada\.$/)
    expect(exists(join(dir, SUB))).toBe(false)
  })
})
