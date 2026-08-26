import { fitWithin, type ImageProfile, PROFILES } from './profiles'
import { MAX_UPLOAD_BYTES } from './upload'

/**
 * Comprime una imagen en el navegador ANTES de subirla a Storage.
 *
 * Se hace en el cliente y no en el servidor a propósito: así el negocio
 * tampoco gasta sus datos móviles subiendo los 4 MB que suelta la cámara de un
 * celular. Una foto de plato de 4000×3000 sale de aquí en ~150 KB.
 *
 * Devuelve siempre un `File` listo para `.upload()`. Si por lo que sea el
 * resultado no mejora al original (imágenes ya optimizadas, WebP pequeños),
 * devuelve el original: nunca sube algo más pesado de lo que entró.
 *
 * ── NUNCA DEVUELVE UNA IMAGEN EN BLANCO ──
 *
 * El 2026-08-23, en producción, un comprobante de Yape se subió como un WebP de
 * 2.666 bytes: un rectángulo vacío. El negocio lo rechazó por «comprobante
 * inválido» y el cliente gastó uno de los dos únicos intentos que permite
 * `prepay-proof` — con un fallo más se habría quedado sin poder pagar su pedido.
 *
 * La causa es que ni iOS ni Android avisan cuando se acaba la memoria de
 * canvas: `drawImage` no lanza nada, simplemente deja el canvas SIN PINTAR, y
 * `toBlob` codifica ese vacío tan ricamente. La versión anterior lo tenía todo
 * en contra: empezaba creando un canvas del tamaño completo del original y
 * encadenaba mitades sucesivas sin soltar ninguna.
 *
 * Ahora hay tres defensas, en este orden:
 *
 *   1. El navegador decodifica YA ESCALADO (`createImageBitmap` con
 *      `resizeWidth`). No se crea ningún canvas del tamaño del original ni
 *      cadena de mitades: se pasa de un JPEG de 12 MP a un canvas de 1600 px
 *      sin nada enorme en medio.
 *   2. Si ese camino no está disponible, se escala a mano SOLTANDO cada canvas
 *      intermedio (`release`), que es lo que Safari necesita para devolver la
 *      memoria antes de pedir la siguiente.
 *   3. Se MIRA el resultado. Si sale liso —todo transparente o todo del mismo
 *      color— no se sube: se reintenta por el otro camino y, si tampoco, se
 *      lanza un error que el usuario ve. Vale mil veces más un «vuelve a
 *      elegirla» que un comprobante en blanco que quema un intento.
 */

const UNREADABLE = 'No pudimos leer esa imagen. Prueba con una foto en JPG o PNG.'
const BLANK = 'La imagen salió en blanco al procesarla. Vuelve a elegirla, por favor.'

export async function compressImage(file: File, profile: ImageProfile): Promise<File> {
  const spec = PROFILES[profile]
  const canvas = await renderToTarget(file, spec.maxEdge)

  try {
    const encoded = spec.lossless
      ? await encodeLossless(canvas)
      : await encodeLossy(canvas, spec.quality)

    // Reescalar y recomprimir un archivo ya ligero puede engordarlo. En ese
    // caso el original es la mejor versión que tenemos... salvo que no quepa
    // en el bucket, y entonces el comprimido es lo único que va a entrar.
    if (encoded.size >= file.size && file.size <= MAX_UPLOAD_BYTES) return file

    return new File([encoded], renameFor(file.name, encoded.type), {
      type: encoded.type,
      lastModified: Date.now(),
    })
  } finally {
    release(canvas)
  }
}

/**
 * Un canvas del tamaño destino, comprobado. Intenta el camino barato y, si no
 * está o sale liso, cae al de siempre.
 */
async function renderToTarget(file: File, maxEdge: number): Promise<HTMLCanvasElement> {
  const size = await measure(file)
  const target = fitWithin(size.width, size.height, maxEdge)

  const direct = await resizedBitmapCanvas(file, target)
  if (direct) {
    if (!looksFlat(direct)) return direct
    release(direct)
  }

  const source = await decode(file)
  try {
    const fallback = fitWithin(sourceWidth(source), sourceHeight(source), maxEdge)
    const canvas = drawScaled(source, fallback.width, fallback.height)
    if (!looksFlat(canvas)) return canvas
    release(canvas)
    throw new Error(BLANK)
  } finally {
    if ('close' in source) source.close()
  }
}

/**
 * Mide sin quedarse con nada. Un `<img>` basta para saber el tamaño y su
 * decodificado lo administra el navegador, que puede soltarlo — al revés que un
 * `ImageBitmap`, que queda anclado hasta que se cierra.
 */
async function measure(file: File): Promise<{ width: number; height: number }> {
  const img = await loadImageElement(file)
  const size = { width: img.naturalWidth, height: img.naturalHeight }
  img.src = ''
  if (!size.width || !size.height) throw new Error(UNREADABLE)
  return size
}

/**
 * Camino bueno: que la decodificación salga ya del tamaño que queremos.
 *
 * Devuelve `null` —y no un error— cuando el navegador no sabe hacerlo. Safari
 * es el motivo del segundo `if`: en vez de fallar ante `resizeWidth`, LO IGNORA
 * y devuelve el bitmap a tamaño completo tan tranquilo. Comprobar las medidas
 * es la única forma de saber si obedeció.
 */
async function resizedBitmapCanvas(
  file: File,
  target: { width: number; height: number },
): Promise<HTMLCanvasElement | null> {
  if (typeof createImageBitmap !== 'function') return null

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
      resizeWidth: target.width,
      resizeHeight: target.height,
      resizeQuality: 'high',
    })
  } catch {
    return null
  }

  try {
    if (bitmap.width !== target.width || bitmap.height !== target.height) return null
    return toCanvas(bitmap, target.width, target.height)
  } catch {
    return null
  } finally {
    bitmap.close()
  }
}

type DecodedImage = ImageBitmap | HTMLImageElement

/**
 * Decodifica respetando la orientación EXIF. Sin esto las fotos verticales de
 * celular se suben giradas 90°, que es como se veían en el v1.
 */
async function decode(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Safari viejo no acepta `imageOrientation`. Cae al <img>, que aplica la
      // orientación EXIF por su cuenta (`image-orientation: from-image` es el
      // valor por defecto en CSS).
    }
  }
  return loadImageElement(file)
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(UNREADABLE))
    img.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

/**
 * Dibuja la imagen al tamaño destino. Cuando la reducción es grande, baja a
 * mitades sucesivas: hacerlo de una sola pasada deja los thumbs pequeños
 * llenos de aliasing en la mayoría de navegadores.
 *
 * Cada canvas que se descarta se SUELTA en el momento. Poner `width = 0`
 * parece un gesto vacío y no lo es: es lo que hace que el navegador devuelva el
 * búfer. Sin ello quedaban vivos a la vez el del tamaño original y todas las
 * mitades, y en un celular apretado el siguiente `drawImage` no pintaba nada.
 */
function drawScaled(source: DecodedImage, width: number, height: number): HTMLCanvasElement {
  let current = toCanvas(source, sourceWidth(source), sourceHeight(source))

  while (current.width > width * 2 && current.height > height * 2) {
    const next = document.createElement('canvas')
    next.width = Math.max(width, Math.floor(current.width / 2))
    next.height = Math.max(height, Math.floor(current.height / 2))
    context(next).drawImage(current, 0, 0, next.width, next.height)
    release(current)
    current = next
  }

  if (current.width === width && current.height === height) return current

  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  context(out).drawImage(current, 0, 0, width, height)
  release(current)
  return out
}

function toCanvas(source: DecodedImage, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  context(canvas).drawImage(source, 0, 0, width, height)
  return canvas
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No pudimos procesar la imagen en este navegador.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return ctx
}

/** Devuelve el búfer del canvas al navegador. Ver `drawScaled`. */
function release(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}

/** Lado del muestreo. 24×24 es de sobra para distinguir un plano liso. */
const PROBE_EDGE = 24

/**
 * ¿Salió liso? Se mira una miniatura, no la imagen entera: leer 738×1600 en RGBA
 * son 4,7 MB de vuelta, justo lo que no sobra en el celular donde esto falla.
 */
function looksFlat(canvas: HTMLCanvasElement): boolean {
  if (canvas.width === 0 || canvas.height === 0) return true

  const w = Math.max(1, Math.min(PROBE_EDGE, canvas.width))
  const h = Math.max(1, Math.min(PROBE_EDGE, canvas.height))
  const probe = document.createElement('canvas')
  probe.width = w
  probe.height = h

  try {
    const ctx = probe.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(canvas, 0, 0, w, h)
    return isUniform(ctx.getImageData(0, 0, w, h).data)
  } catch {
    // Si no se puede mirar, no se acusa: bloquear al cliente por una sospecha
    // que no podemos comprobar es peor que dejar pasar la imagen.
    return false
  } finally {
    release(probe)
  }
}

/** Margen por pixel. Un blanco liso en JPEG oscila un par de niveles. */
const TOLERANCE = 4

/**
 * ¿Estos píxeles son todos el mismo? Separado del canvas a propósito: es la
 * única parte con lógica de verdad y así se puede probar sin un navegador.
 *
 * Dos formas de estar vacío, y las dos se han visto: TODO TRANSPARENTE, que es
 * el canvas que nunca llegó a pintarse, y TODO DE UN COLOR, que es lo mismo
 * después de que un encoder sin canal alfa le meta el fondo blanco. Un
 * comprobante de Yape no es ni una cosa ni la otra jamás.
 */
export function isUniform(data: Uint8ClampedArray): boolean {
  if (data.length < 4) return true

  let anyOpaque = false
  for (let i = 3; i < data.length; i += 4) {
    if ((data[i] ?? 0) !== 0) {
      anyOpaque = true
      break
    }
  }
  if (!anyOpaque) return true

  const r = data[0] ?? 0
  const g = data[1] ?? 0
  const b = data[2] ?? 0
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs((data[i] ?? 0) - r) > TOLERANCE) return false
    if (Math.abs((data[i + 1] ?? 0) - g) > TOLERANCE) return false
    if (Math.abs((data[i + 2] ?? 0) - b) > TOLERANCE) return false
  }
  return true
}

function sourceWidth(source: DecodedImage): number {
  return source instanceof HTMLImageElement ? source.naturalWidth : source.width
}

function sourceHeight(source: DecodedImage): number {
  return source instanceof HTMLImageElement ? source.naturalHeight : source.height
}

async function encodeLossy(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const webp = await toBlob(canvas, 'image/webp', quality)
  if (webp.type === 'image/webp') return webp

  // Sin encoder WebP: JPEG. Como no lleva canal alfa, hay que meter un fondo
  // blanco o los logos con transparencia salen sobre negro. `destination-over`
  // lo pinta por detrás de lo ya dibujado, sin volver a escalar la imagen.
  const ctx = context(canvas)
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = 'source-over'

  return toBlob(canvas, 'image/jpeg', quality)
}

/** Para el QR: WebP sin pérdida, y PNG si el navegador no sabe escribir WebP. */
async function encodeLossless(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await toBlob(canvas, 'image/webp', 1)
  if (webp.type === 'image/webp') return webp
  return toBlob(canvas, 'image/png')
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('No pudimos procesar la imagen. Inténtalo de nuevo.'))
      },
      type,
      quality,
    )
  })
}

const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

function renameFor(name: string, mimeType: string): string {
  const extension = EXTENSIONS[mimeType] ?? 'webp'
  const base = name.replace(/\.[^./\\]+$/, '') || 'imagen'
  return `${base}.${extension}`
}
