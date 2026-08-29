import { fitWithin, type ImageProfile, PROFILES, type ProfileSpec } from './profiles'
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
 * ── NUNCA DEVUELVE UNA IMAGEN EN BLANCO, Y NUNCA SE QUEDA SIN SALIDA ──
 *
 * El 2026-08-23, en producción, un comprobante de Yape se subió como un WebP de
 * 2.666 bytes: un rectángulo vacío. El negocio lo rechazó por «comprobante
 * inválido» y el cliente gastó uno de los dos únicos intentos que permite
 * `prepay-proof` — con un fallo más se habría quedado sin poder pagar su pedido.
 *
 * La causa es que ni iOS ni Android avisan cuando un dibujo a canvas no sale:
 * `drawImage` no lanza nada, simplemente deja el canvas SIN PINTAR, y `toBlob`
 * codifica ese vacío tan ricamente.
 *
 * El 2026-08-28 volvió a pasar, y enseñó la SEGUNDA mitad del problema. El
 * blanco se detectó —eso funcionó— pero la única salida que había era un error
 * pidiendo «vuelve a elegirla», y volver a elegir EL MISMO archivo da
 * exactamente el mismo resultado. El cliente entró en un bucle del que solo
 * salió mandándose la captura por WhatsApp y descargándola de vuelta: WhatsApp
 * la reencoda a JPEG, más pequeña y por otro decodificador, y esa sí pasó. Un
 * callejón sin salida en la única pantalla del flujo donde corre un reloj y solo
 * hay dos intentos.
 *
 * De ahí la forma de este archivo: no una vía con una comprobación al final,
 * sino VARIAS VÍAS INDEPENDIENTES, cada una verificada, y un último recurso que
 * no puede fallar.
 *
 *   1. El navegador decodifica YA ESCALADO (`createImageBitmap` con
 *      `resizeWidth`). No se crea ningún canvas del tamaño del original.
 *   2. `ImageBitmap` a tamaño completo y escalado a mano, bajando de mitad en
 *      mitad y SOLTANDO cada canvas intermedio, que es lo que Safari necesita
 *      para devolver la memoria antes de pedir la siguiente. Ningún canvas de
 *      esta vía llega a medir lo que el original.
 *   3. Un `<img>`, que dentro del mismo navegador es OTRO camino de
 *      decodificación, distinto del de `createImageBitmap`. Es la vía que le
 *      faltaba al cliente que se quedó atascado: cuando el problema está en el
 *      decodificador y no en la memoria, esta pasa y las otras no.
 *   4. Si las tres salen lisas, se sube EL ORIGINAL SIN TOCAR. Una captura sin
 *      comprimir cuesta datos móviles; un comprobante que no se puede mandar
 *      cuesta el pedido. Y un archivo que no hemos procesado no lo podemos
 *      haber roto nosotros: si ese sale en blanco, en blanco estaba.
 *
 * Cada vía se MIRA antes de aceptarla (`looksFlat`), y ninguna puede llevarse
 * por delante a las siguientes: `renderToTarget` no lanza. Quedan exactamente
 * DOS errores que el usuario puede llegar a ver, y los dos dicen algo que no
 * está en nuestra mano arreglar por él:
 *
 *   · `UNREADABLE`, cuando NINGUNA vía consiguió siquiera leer el archivo. Ahí
 *     no hay nada que subir: lo que eligió no es una imagen que este navegador
 *     entienda.
 *   · `TOO_HEAVY`, cuando el original no cabe en su bucket (ver
 *     `ProfileSpec.fallbackLimit`; para un comprobante esto no puede pasar).
 *
 * Cualquier otro fallo —memoria, decodificador, encoder— termina en una subida,
 * no en una pantalla de error.
 */

const UNREADABLE = 'No pudimos leer esa imagen. Prueba con una foto en JPG o PNG.'
const TOO_HEAVY = 'No pudimos procesar esa imagen y pesa demasiado para subirla tal cual.'

interface Size {
  width: number
  height: number
}

export async function compressImage(file: File, profile: ImageProfile): Promise<File> {
  const spec = PROFILES[profile]
  const { canvas, readable } = await renderToTarget(file, spec.maxEdge)

  // Ninguna de las tres vías dio una imagen con contenido. Ver el bloque de
  // arriba: aquí se sube el original antes que dejar al cliente sin salida —
  // salvo que NINGUNA llegara siquiera a leer el archivo, y entonces no es
  // cosa nuestra: lo que eligió no es una imagen que este navegador entienda.
  if (!canvas) {
    if (!readable) throw new Error(UNREADABLE)
    return asIs(file, spec)
  }

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
  } catch {
    // El encoder también puede caerse (`toBlob` devolviendo null, un contexto
    // 2D que no se concede). Habiendo dibujado bien, sería absurdo bloquear al
    // cliente por el último paso: va el original.
    return asIs(file, spec)
  } finally {
    release(canvas)
  }
}

/** El original tal cual, si cabe en su bucket. Ver `ProfileSpec.fallbackLimit`. */
function asIs(file: File, spec: ProfileSpec): File {
  if (file.size > spec.fallbackLimit) throw new Error(TOO_HEAVY)
  return file
}

interface RenderResult {
  /** El canvas listo, o `null` si ninguna vía dio una imagen con contenido. */
  canvas: HTMLCanvasElement | null
  /** ¿Alguna vía llegó a LEER la imagen? Si no, el archivo está roto de verdad. */
  readable: boolean
}

/**
 * Un canvas del tamaño destino, comprobado. Prueba las tres vías en orden de
 * más barata a más terca y devuelve la primera que salga con contenido.
 *
 * NO LANZA. Es deliberado y es la mitad del arreglo: cada vía se intenta
 * entera, y que una se caiga no puede llevarse por delante a las que vienen
 * detrás ni al último recurso. Quien decide qué hacer con las manos vacías es
 * `compressImage`, que tiene el original.
 */
async function renderToTarget(file: File, maxEdge: number): Promise<RenderResult> {
  let readable = false

  const size = await attempt(() => measure(file))
  if (size) {
    readable = true
    const target = fitWithin(size.width, size.height, maxEdge)
    const direct = await attempt(() => resizedBitmapCanvas(file, target))
    if (direct) {
      if (!looksFlat(direct)) return { canvas: direct, readable }
      release(direct)
    }
  }

  const bitmap = await decodeBitmap(file)
  if (bitmap) {
    readable = true
    try {
      const scaled = await attempt(() => drawScaled(bitmap, maxEdge))
      if (scaled) {
        if (!looksFlat(scaled)) return { canvas: scaled, readable }
        release(scaled)
      }
    } finally {
      bitmap.close()
    }
  }

  const loaded = await attempt(() => loadImageElement(file, { forceDecode: true }))
  if (loaded) {
    readable = true
    try {
      const scaled = await attempt(() => drawScaled(loaded.img, maxEdge))
      if (scaled) {
        if (!looksFlat(scaled)) return { canvas: scaled, readable }
        release(scaled)
      }
    } finally {
      loaded.release()
    }
  }

  return { canvas: null, readable }
}

/** Corre una vía y se traga lo que lance: aquí ninguna caída es definitiva. */
async function attempt<T>(run: () => T | Promise<T>): Promise<T | null> {
  try {
    return await run()
  } catch {
    return null
  }
}

/**
 * Mide sin quedarse con nada. Un `<img>` basta para saber el tamaño y su
 * decodificado lo administra el navegador, que puede soltarlo — al revés que un
 * `ImageBitmap`, que queda anclado hasta que se cierra. Aquí NO se fuerza el
 * decodificado: para leer `naturalWidth` no hacen falta los píxeles.
 */
async function measure(file: File): Promise<Size> {
  const loaded = await loadImageElement(file, { forceDecode: false })
  try {
    const size = { width: loaded.img.naturalWidth, height: loaded.img.naturalHeight }
    if (!size.width || !size.height) throw new Error(UNREADABLE)
    return size
  } finally {
    loaded.release()
  }
}

/**
 * Vía 1: que la decodificación salga ya del tamaño que queremos.
 *
 * Devuelve `null` —y no un error— cuando el navegador no sabe hacerlo. Safari
 * es el motivo del segundo `if`: en vez de fallar ante `resizeWidth`, LO IGNORA
 * y devuelve el bitmap a tamaño completo tan tranquilo. Comprobar las medidas
 * es la única forma de saber si obedeció.
 */
async function resizedBitmapCanvas(file: File, target: Size): Promise<HTMLCanvasElement | null> {
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
 * Vía 2: el bitmap a tamaño completo, respetando la orientación EXIF. Sin
 * `imageOrientation` las fotos verticales de celular se suben giradas 90°, que
 * es como se veían en el v1.
 *
 * Si el navegador no acepta la opción se devuelve `null` en vez de reintentar
 * sin ella: la vía del `<img>` que viene detrás también aplica la orientación
 * (`image-orientation: from-image` es el valor por defecto en CSS), así que no
 * hace falta pasar por una que la pierde.
 */
async function decodeBitmap(file: File): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return null
  }
}

interface LoadedImage {
  img: HTMLImageElement
  /** Suelta la `blob:` URL y el decodificado. Llamar SIEMPRE, y nunca antes de dibujar. */
  release: () => void
}

/**
 * Carga un `<img>` desde el archivo y NO revoca la URL hasta que quien la pidió
 * termina.
 *
 * La versión anterior revocaba en un `.finally()` encadenado al `onload`, o sea
 * antes de que nadie hubiera dibujado nada. Casi siempre da igual, porque el
 * fotograma decodificado ya está en memoria — pero «casi siempre» no basta: el
 * navegador puede soltar ese fotograma cuando va apretado y volver a
 * decodificarlo al dibujar, y entonces se encuentra la fuente revocada. No
 * lanza: pinta nada. Es exactamente la firma del fallo que estamos persiguiendo.
 *
 * `forceDecode` completa el decodificado mientras la URL sigue viva, para quien
 * va a dibujar. `measure` no lo necesita y no lo paga.
 */
async function loadImageElement(
  file: File,
  { forceDecode }: { forceDecode: boolean },
): Promise<LoadedImage> {
  const url = URL.createObjectURL(file)
  const img = new Image()
  const release = () => {
    URL.revokeObjectURL(url)
    img.src = ''
  }

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(UNREADABLE))
      img.src = url
    })
    // `decode()` puede rechazar por su cuenta; si no está o falla seguimos
    // igual, solo perdemos la garantía, no la imagen.
    if (forceDecode && typeof img.decode === 'function') await img.decode().catch(() => {})
  } catch (err) {
    release()
    throw err
  }

  return { img, release }
}

/**
 * Los tamaños por los que pasa una reducción, del origen al destino.
 *
 * Cuando la reducción es grande se baja de mitad en mitad: hacerlo de una sola
 * pasada deja los thumbs pequeños llenos de aliasing en la mayoría de
 * navegadores.
 *
 * El primer paso ya es MÁS PEQUEÑO que el original — nunca se copia la imagen a
 * un canvas de su propio tamaño, que es lo que antes hacía que en el momento de
 * más apuro hubiera un búfer del tamaño completo pedido sin necesidad. Se dibuja
 * directamente desde el origen decodificado, que ya está en memoria.
 *
 * Separado del canvas a propósito, como `isUniform`: así se puede probar sin un
 * navegador. Devuelve siempre al menos un paso.
 */
export function scaleSteps(source: Size, target: Size): Size[] {
  const steps: Size[] = []
  let width = source.width
  let height = source.height

  while (width > target.width * 2 && height > target.height * 2) {
    width = Math.max(target.width, Math.floor(width / 2))
    height = Math.max(target.height, Math.floor(height / 2))
    steps.push({ width, height })
  }

  const last = steps[steps.length - 1]
  if (!last || last.width !== target.width || last.height !== target.height) {
    steps.push({ width: target.width, height: target.height })
  }
  return steps
}

/**
 * Dibuja la imagen hasta el tamaño destino siguiendo `scaleSteps`. Cada canvas
 * que se descarta se SUELTA en el momento: poner `width = 0` parece un gesto
 * vacío y no lo es, es lo que hace que el navegador devuelva el búfer.
 */
function drawScaled(source: DecodedImage, maxEdge: number): HTMLCanvasElement {
  const from = { width: sourceWidth(source), height: sourceHeight(source) }
  if (!from.width || !from.height) throw new Error(UNREADABLE)

  let current: HTMLCanvasElement | null = null
  for (const step of scaleSteps(from, fitWithin(from.width, from.height, maxEdge))) {
    const next = toCanvas(current ?? source, step.width, step.height)
    if (current) release(current)
    current = next
  }

  if (!current) throw new Error(UNREADABLE)
  return current
}

function toCanvas(
  source: DecodedImage | HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement {
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

/** Lado del muestreo. 64×64 son 4.096 muestras: 16 KB de vuelta, nada. */
const PROBE_EDGE = 64

/**
 * ¿Salió liso? Se mira una miniatura, no la imagen entera: leer 738×1600 en RGBA
 * son 4,7 MB de vuelta, justo lo que no sobra en el celular donde esto falla.
 *
 * El muestreo va SIN SUAVIZADO, y esa es la parte que importa. Con suavizado, un
 * comprobante de Yape —texto fino y oscuro sobre mucho blanco— se promedia
 * contra su propio fondo al encogerlo tanto, y puede volver casi blanco liso: la
 * comprobación estaría acusando de vacías imágenes perfectamente buenas, que es
 * el peor error que puede cometer, porque quema un intento del cliente. Sin
 * suavizado cada muestra es un píxel real del original, y basta con que UNA
 * caiga en una letra para saber que hay algo.
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
    ctx.imageSmoothingEnabled = false
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
