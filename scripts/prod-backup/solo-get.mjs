// Copia de producción P0.5: la ÚNICA función que habla por HTTP con Storage y con la API de gestión.
// El método es GET y no se puede cambiar desde fuera; no sigue redirecciones (la credencial no viaja a otro host)
// y sus errores nunca incluyen cabeceras.

const ESPERA_MS = [500, 2000, 5000]

/**
 * @param {URL} url
 * @param {Record<string, string>} cabeceras
 * @param {{ intentos?: number, timeoutMs?: number, fetchImpl?: typeof fetch, esperar?: (ms: number) => Promise<void> }} [opciones]
 * @returns {Promise<{ status: number, cuerpo: Buffer, etag: string | null }>}
 */
export async function soloGet(url, cabeceras, opciones = {}) {
  const { intentos = 3, timeoutMs = 120_000 } = opciones
  const fetchImpl = opciones.fetchImpl ?? fetch
  const esperar = opciones.esperar ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  if (!(url instanceof URL)) throw new Error('soloGet exige un objeto URL ya validado')
  let ultimo = 'sin intentos'
  for (let i = 0; i < intentos; i++) {
    if (i > 0) await esperar(ESPERA_MS[Math.min(i - 1, ESPERA_MS.length - 1)])
    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: cabeceras,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      })
      const cuerpo = Buffer.from(await res.arrayBuffer())
      if (res.status >= 500 || res.status === 429) {
        ultimo = `HTTP ${res.status}`
        continue
      }
      return { status: res.status, cuerpo, etag: res.headers?.get?.('etag') ?? null }
    } catch (err) {
      ultimo = `fallo de red (${err?.name ?? 'Error'})`
    }
  }
  // Solo el host: la ruta puede llevar el nombre de un archivo de un cliente.
  throw new Error(`GET ${url.origin}: ${ultimo} tras ${intentos} intentos`)
}

/** Lee una credencial del entorno y la quita de ahí para que no la hereden otros procesos. */
export function tomarCredencial(nombre) {
  const valor = process.env[nombre]
  delete process.env[nombre]
  if (!valor || /\s/.test(valor)) throw new Error(`falta la credencial ${nombre} (o trae espacios)`)
  return valor
}
