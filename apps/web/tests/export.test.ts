import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { loadLegalDocument } from '@tindivo/legal'
import { beforeAll, describe, expect, it } from 'vitest'

const APP_DIR = resolve(__dirname, '..')
const OUT = join(APP_DIR, 'out')
const ROUTES = ['terminos', 'privacidad', 'libro-de-reclamaciones', 'borrar-cuenta'] as const
const SUPPORT_WHATSAPP = '51906550166'

const html = (route: string) =>
  readFileSync(join(OUT, route === '' ? 'index.html' : `${route}/index.html`), 'utf8')

/** Contenido de `<main>`: sin cabecera, pie ni título del documento. */
function mainOf(page: string): string {
  const match = /<main\b[^>]*>([\s\S]*)<\/main>/.exec(page)
  if (!match) throw new Error('La página no tiene <main>')
  return match[1] as string
}

function visibleText(page: string): string {
  return page
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

beforeAll(() => {
  // El export se genera siempre desde cero: así la prueba no mira un `out/` viejo.
  const next = createRequire(join(APP_DIR, 'package.json')).resolve('next/dist/bin/next')
  const build = spawnSync(process.execPath, [next, 'build'], { cwd: APP_DIR, encoding: 'utf8' })
  if (build.status !== 0) throw new Error(`next build falló:\n${build.stdout}\n${build.stderr}`)
}, 240_000)

describe('export estático (CA-WPU-01)', () => {
  it('genera index.html y una página por ruta del spec', () => {
    expect(existsSync(join(OUT, 'index.html'))).toBe(true)
    for (const route of ROUTES) {
      expect(existsSync(join(OUT, route, 'index.html')), route).toBe(true)
    }
  })

  it('genera robots.txt y sitemap.xml estáticos', () => {
    expect(readFileSync(join(OUT, 'robots.txt'), 'utf8')).toContain('Sitemap:')
    const sitemap = readFileSync(join(OUT, 'sitemap.xml'), 'utf8')
    for (const route of ['terminos', 'privacidad', 'borrar-cuenta']) {
      expect(sitemap).toContain(`/${route}/`)
    }
  })

  it('declara lang es-PE y trae título, descripción y Open Graph', () => {
    for (const route of ['', ...ROUTES]) {
      const page = html(route)
      expect(page, route).toContain('lang="es-PE"')
      expect(page, route).toMatch(/<title>[^<]+<\/title>/)
      expect(page, route).toContain('property="og:title"')
      expect(page, route).toContain('name="description"')
    }
  })

  it('no deja ningún enlace interno roto', () => {
    const missing: string[] = []
    for (const file of walk(OUT).filter((f) => f.endsWith('.html'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/href="(\/[^"#?]*)/g)) {
        const href = match[1] as string
        if (href.startsWith('//')) continue
        const target = href.endsWith('/') ? join(OUT, href, 'index.html') : join(OUT, href)
        if (!existsSync(target)) missing.push(`${file} -> ${href}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('el 404 lleva a la landing con el botón de not-found.tsx, dentro de <main>', () => {
    const source = readFileSync(join(APP_DIR, 'app/not-found.tsx'), 'utf8')
    const button = /<ButtonLink href="([^"]+)">([^<]+)<\/ButtonLink>/.exec(source)
    expect(button, 'not-found.tsx debe tener un <ButtonLink href>').not.toBeNull()
    const [, href, label] = button as RegExpExecArray
    expect(href).toBe('/')
    const anchors = [
      ...mainOf(readFileSync(join(OUT, '404.html'), 'utf8')).matchAll(/<a\s[^>]*>[^<]*<\/a>/g),
    ]
    expect(
      anchors.some((a) => a[0].includes(`href="${href}"`) && a[0].includes(label as string)),
    ).toBe(true)
  })
})

describe('sin sesión ni API (CA-WPU-02)', () => {
  it('ningún archivo del export nombra Supabase ni la API de Tindivo', () => {
    const offenders = walk(OUT)
      .filter((f) => /\.(html|js|txt)$/.test(f))
      .filter((f) => /supabase|api\/v1/i.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('las páginas no escriben cookies ni almacenamiento propio', () => {
    // Los chunks del runtime de Next mencionan localStorage; lo que cuenta es el HTML de las páginas.
    const offenders = walk(OUT)
      .filter((f) => f.endsWith('.html'))
      .filter((f) => /document\.cookie|localStorage|sessionStorage/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})

describe('landing (CA-WPU-03)', () => {
  const landing = () => html('')

  it('tiene el botón de Google Play y el de WhatsApp con el número único', () => {
    expect(landing()).toContain(
      'href="https://play.google.com/store/apps/details?id=com.tindivo.customer"',
    )
    expect(landing()).toContain(`href="https://wa.me/${SUPPORT_WHATSAPP}?text=`)
    expect(landing()).toContain('Descárgala en Google Play')
  })

  it('no escribe ningún otro teléfono', () => {
    for (const route of ['', ...ROUTES]) {
      // Se mira el texto visible y los enlaces; espacios y guiones entre dígitos no esconden un teléfono.
      const text = visibleText(html(route)).replaceAll(SUPPORT_WHATSAPP, '')
      const joined = text.replace(/(?<=\d)[\s\-‐-―.()]+(?=\d)/g, '')
      expect(joined.match(/\d{9,}/g), route).toBeNull()
      const hrefs = [...html(route).matchAll(/href="([^"]+)"/g)].map((m) => m[1] as string)
      for (const href of hrefs.filter((h) => /^(tel|https:\/\/wa\.me)/.test(h))) {
        const number = (href.split('?')[0] ?? '').replace(/\D/g, '')
        expect([SUPPORT_WHATSAPP, '']).toContain(number)
      }
    }
  })

  it('no muestra botón de App Store mientras no haya enlace', () => {
    expect(landing()).not.toContain('apps.apple.com')
    expect(landing()).not.toContain('Descárgala en App Store')
  })
})

describe('Términos y Privacidad desde el markdown (CA-WPU-04)', () => {
  it.each([
    ['terminos', 'terminos'],
    ['privacidad', 'privacidad'],
  ] as const)('/%s muestra la versión, la fecha y el texto del markdown', (route, name) => {
    const doc = loadLegalDocument(name)
    const page = html(route)
    expect(page).toContain(`Versión ${doc.version}`)
    expect(page).toContain(`dateTime="${doc.date}"`)
    for (const section of doc.sections) {
      expect(page).toContain(section.heading)
      for (const block of section.blocks) {
        if (block.type === 'paragraph') {
          expect(page).toContain(block.text.replaceAll('&', '&amp;').replaceAll("'", '&#x27;'))
        }
      }
    }
  })
})

describe('/borrar-cuenta (CA-WPU-05)', () => {
  it('describe el camino por la app y el de WhatsApp, sin pedir sesión', () => {
    const main = mainOf(html('borrar-cuenta'))
    expect(main).toContain('Cómo borrarla desde la app')
    // Los nombres exactos de la app: `account_entry` y `account_delete` en strings.xml.
    expect(main).toContain('<li>Entra a «Mi cuenta».</li>')
    expect(main).toContain('<li>Toca «Borrar mi cuenta» y confirma.</li>')
    expect(main).toContain('Si no puedes entrar a la app')
    expect(main).toMatch(
      new RegExp(
        `<a href="https://wa\\.me/${SUPPORT_WHATSAPP}\\?text=[^"]*"[^>]*>Pedir el borrado por WhatsApp</a>`,
      ),
    )
    expect(main).not.toMatch(/<form|<input|href="\/entrar/)
  })
})

describe('build sin red', () => {
  it('la letra no se descarga de Google en el build (next/font/google)', () => {
    const layout = readFileSync(join(APP_DIR, 'app/layout.tsx'), 'utf8')
    expect(layout).not.toContain('next/font/google')
  })
})

describe('contraste del botón primario (CA-WPU-09, parte estática)', () => {
  it('el texto blanco sobre naranja es negrita y de al menos 19 px (blanco/#EE6417 = 3,25:1: solo vale como texto grande)', () => {
    const offenders: string[] = []
    for (const route of ['', ...ROUTES]) {
      for (const match of html(route).matchAll(/<a\s[^>]*>/g)) {
        const tag = match[0]
        if (!tag.includes('text-white')) continue
        const bigEnough = /\btext-(xl|2xl|3xl|4xl|\[(19|2\d)px\])\b/.test(tag)
        if (!tag.includes('font-bold') || !bigEnough) offenders.push(`${route || '/'}: ${tag}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('toque mínimo de 48 px (CA-WPU-08, parte estática)', () => {
  it('todo enlace de la maquetación mide al menos 48 px (min-h-12)', () => {
    const short: string[] = []
    for (const route of ['', ...ROUTES]) {
      for (const match of html(route).matchAll(/<a\s[^>]*>/g)) {
        const tag = match[0]
        // El enlace «Ir al contenido» solo aparece al enfocarse con teclado.
        if (tag.includes('href="#contenido"')) continue
        if (!tag.includes('min-h-12')) short.push(`${route || '/'}: ${tag}`)
      }
    }
    expect(short).toEqual([])
  })
})
