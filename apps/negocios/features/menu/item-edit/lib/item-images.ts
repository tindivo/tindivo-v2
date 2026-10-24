/**
 * Fotos del plato: la grande y su miniatura (D-55).
 *
 * El panel sube dos objetos al bucket `menu-items`: la foto de siempre y la
 * miniatura WebP de ~384 px que pintan las apps nativas. Cada guardado con foto
 * nueva usa rutas NUEVAS por versión (`<biz>/items/<id>.<v>` y `<id>.<v>-t`) y nunca
 * sobrescribe: lo que la fila publica no cambia de contenido hasta que una sola
 * actualización de la fila cambia las dos URL a la vez. Los objetos anteriores
 * se borran solo después de esa confirmación (CAX-001: nunca foto B con
 * miniatura A). Aquí vive el «qué se sube, qué se escribe y qué se borra»,
 * separado del hook para probarlo con un almacenamiento falso.
 */

const BUCKET = 'menu-items'
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`

/** Lo mínimo que se usa del cliente de Storage de Supabase. */
export interface ItemImageStorage {
  from(bucket: string): {
    upload(
      path: string,
      file: File,
      options: { upsert: boolean; contentType: string; cacheControl: string },
    ): PromiseLike<{ error: { message: string } | null }>
    remove(paths: string[]): PromiseLike<{ error: { message: string } | null }>
    getPublicUrl(path: string): { data: { publicUrl: string } }
  }
}

/** Las URL de foto que una fila de `menu_items` publica. */
export interface ItemImageUrls {
  imageUrl: string | null
  thumbnailUrl: string | null
}

/**
 * Rutas de una versión nueva. La carpeta `<biz>` se conserva: las policies de Storage la miran. El nombre es
 * plano (`<id>.<v>`, no `<id>/<v>`): la foto histórica vive en `<biz>/items/<id>` y no se usa ese nombre como
 * carpeta a la vez.
 */
export function itemImagePaths(bizId: string, itemId: string, version: number | string) {
  const full = `${bizId}/items/${itemId}.${version}`
  return { full, thumb: `${full}-t` }
}

/**
 * Ruta del objeto a partir de su URL pública, o null si no es nuestra: otro
 * bucket, otra carpeta de negocio o basura. Ignora `?v=`. Así no se intenta
 * borrar nada ajeno, y sirve igual para las fotos antiguas (`<biz>/items/<id>`)
 * que para las versionadas.
 */
export function objectPathFromPublicUrl(
  url: string | null | undefined,
  bizId: string,
): string | null {
  if (!url) return null
  const at = url.indexOf(PUBLIC_MARKER)
  if (at < 0) return null
  const rest = url.slice(at + PUBLIC_MARKER.length).split(/[?#]/)[0] ?? ''
  let path: string
  try {
    path = decodeURIComponent(rest)
  } catch {
    return null
  }
  if (!path.startsWith(`${bizId}/`) || path.length === bizId.length + 1) return null
  if (path.split('/').some((s) => s === '..' || s === '')) return null
  return path
}

/** Los objetos que una fila referenciaba y hay que borrar (sin repetidos ni ajenos). */
export function itemImageRemovalPaths(bizId: string, urls: ItemImageUrls): string[] {
  const out: string[] = []
  for (const u of [urls.imageUrl, urls.thumbnailUrl]) {
    const p = objectPathFromPublicUrl(u, bizId)
    if (p && !out.includes(p)) out.push(p)
  }
  return out
}

/** Borrado de mejor esfuerzo: un objeto que sobra molesta menos que un error. */
export async function removeItemImageObjects(
  storage: ItemImageStorage,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return
  try {
    const { error } = await storage.from(BUCKET).remove(paths)
    if (error) console.error('[item-images] no se pudieron borrar objetos:', error.message)
  } catch (e) {
    console.error('[item-images] no se pudieron borrar objetos:', e)
  }
}

export type ItemImagePublish =
  | { ok: false; message: string }
  | {
      ok: true
      imageUrl: string
      /** Null si la miniatura no se generó o no subió: la grande sigue valiendo. */
      thumbnailUrl: string | null
      /** Por qué falta la miniatura, para registrarlo; no es un error del guardado. */
      thumbnailError: string | null
    }

/**
 * Sube la foto grande y su miniatura a rutas nuevas, publica las dos URL con UNA
 * actualización de la fila (`updateRow`) y, solo si salió bien, borra lo que la
 * fila referenciaba antes (`previous`).
 *
 * - Falla la grande: no sube nada más; la fila no cambia.
 * - Falla solo la miniatura: se publica grande/null.
 * - Falla algo ANTES de intentar `updateRow` (una subida lanza): se borran los
 *   objetos nuevos; la fila y los objetos anteriores nunca se tocaron.
 * - `updateRow` devuelve error o lanza: el resultado es incierto (la base pudo
 *   confirmar y perderse la respuesta), así que NO se borra nada (CAX-002): ni
 *   lo nuevo, que la fila quizá ya publica, ni lo anterior, que quizá sigue
 *   publicado. Pueden quedar objetos huérfanos; nunca una URL sin objeto.
 */
export async function publishItemImages(
  storage: ItemImageStorage,
  updateRow: (urls: ItemImageUrls) => PromiseLike<{ error: { message: string } | null }>,
  params: {
    bizId: string
    itemId: string
    full: File
    thumb: File | null
    cacheControl: string
    version: number
    previous: ItemImageUrls
  },
): Promise<ItemImagePublish> {
  const bucket = storage.from(BUCKET)
  const paths = itemImagePaths(params.bizId, params.itemId, params.version)
  const options = (file: File) => ({
    upsert: false,
    contentType: file.type,
    cacheControl: params.cacheControl,
  })
  const uploaded: string[] = []
  // Desde que se intenta publicar, lo nuevo puede estar referenciado: ya no se limpia.
  let publishAttempted = false

  try {
    const { error: fullErr } = await bucket.upload(paths.full, params.full, options(params.full))
    if (fullErr) return { ok: false, message: `No se pudo subir la imagen: ${fullErr.message}` }
    uploaded.push(paths.full)
    const imageUrl = bucket.getPublicUrl(paths.full).data.publicUrl

    let thumbnailUrl: string | null = null
    let thumbnailError: string | null = null
    if (!params.thumb) {
      thumbnailError = 'no se generó la miniatura'
    } else {
      const { error: thumbErr } = await bucket.upload(
        paths.thumb,
        params.thumb,
        options(params.thumb),
      )
      if (thumbErr) {
        thumbnailError = thumbErr.message
      } else {
        uploaded.push(paths.thumb)
        thumbnailUrl = bucket.getPublicUrl(paths.thumb).data.publicUrl
      }
    }

    publishAttempted = true
    const { error: rowErr } = await updateRow({ imageUrl, thumbnailUrl })
    if (rowErr) return { ok: false, message: rowErr.message }

    // Confirmado: ahora sí se va lo anterior (sin tocar lo recién publicado).
    const stale = itemImageRemovalPaths(params.bizId, params.previous).filter(
      (p) => !uploaded.includes(p),
    )
    await removeItemImageObjects(storage, stale)
    return { ok: true, imageUrl, thumbnailUrl, thumbnailError }
  } catch (e) {
    if (!publishAttempted) await removeItemImageObjects(storage, uploaded)
    return {
      ok: false,
      message: `No se pudo guardar la imagen: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}
