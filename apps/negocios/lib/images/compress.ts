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
 */
export async function compressImage(file: File, profile: ImageProfile): Promise<File> {
  const spec = PROFILES[profile]
  const source = await decode(file)

  try {
    const target = fitWithin(source.width, source.height, spec.maxEdge)
    const canvas = drawScaled(source, target.width, target.height)

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
    if ('close' in source) source.close()
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

  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () =>
        reject(new Error('No pudimos leer esa imagen. Prueba con una foto en JPG o PNG.'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Dibuja la imagen al tamaño destino. Cuando la reducción es grande, baja a
 * mitades sucesivas: hacerlo de una sola pasada deja los thumbs pequeños
 * llenos de aliasing en la mayoría de navegadores.
 */
function drawScaled(source: DecodedImage, width: number, height: number): HTMLCanvasElement {
  let current = toCanvas(source, sourceWidth(source), sourceHeight(source))

  while (current.width > width * 2 && current.height > height * 2) {
    const next = document.createElement('canvas')
    next.width = Math.max(width, Math.floor(current.width / 2))
    next.height = Math.max(height, Math.floor(current.height / 2))
    context(next).drawImage(current, 0, 0, next.width, next.height)
    current = next
  }

  if (current.width === width && current.height === height) return current

  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  context(out).drawImage(current, 0, 0, width, height)
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
