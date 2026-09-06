import { existsSync } from 'node:fs'
import { DomainError } from '@tindivo/core'
import type { Browser } from 'puppeteer-core'
import puppeteer from 'puppeteer-core'
import { serverEnv } from '../env'

/**
 * Rutas típicas de Chrome/Edge instalados localmente, para dev sin depender de
 * descargar Chromium completo (~170MB) como devDependency solo para probar PDFs.
 */
const LOCAL_BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
]

function resolveLocalExecutablePath(): string | null {
  const configured = serverEnv().PUPPETEER_EXECUTABLE_PATH
  if (configured) return configured
  return LOCAL_BROWSER_CANDIDATES.find((p) => existsSync(p)) ?? null
}

/**
 * Lanza Chromium para renderizar un PDF. En producción usa
 * `@sparticuz/chromium` (binario comprimido pensado para funciones serverless,
 * cabe en el límite de tamaño de Vercel); en dev reutiliza el Chrome/Edge ya
 * instalado en la máquina en vez de sumar `puppeteer` completo como
 * devDependency solo para esto.
 */
export async function launchBrowser(): Promise<Browser> {
  if (process.env.NODE_ENV === 'production') {
    const chromium = (await import('@sparticuz/chromium')).default
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }

  const executablePath = resolveLocalExecutablePath()
  if (!executablePath) {
    throw new DomainError(
      'No se encontró Chrome/Edge local para generar el PDF. Define PUPPETEER_EXECUTABLE_PATH en .env.local',
      'internal_error',
    )
  }
  return puppeteer.launch({ executablePath, headless: true })
}
