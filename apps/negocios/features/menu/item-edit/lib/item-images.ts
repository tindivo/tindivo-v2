/**
 * Fotos del plato: la grande y su miniatura (D-55).
 *
 * El panel sube dos objetos al bucket `menu-items`: la foto de siempre
 * (`<biz>/items/<id>`) y la miniatura WebP de ~384 px que pintan las apps nativas
 * (`<biz>/items/<id>-t`). Aquí vive el «qué se sube y qué se escribe», separado
 * del hook para poder probarlo con un almacenamiento falso.
 */

const BUCKET = 'menu-items'

/** Lo mínimo que se usa del cliente de Storage de Supabase. */
export interface ItemImageStorage {
  from(bucket: string): {
    upload(
      path: string,
      file: File,
      options: { upsert: boolean; contentType: string; cacheControl: string },
    ): PromiseLike<{ error: { message: string } | null }>
    getPublicUrl(path: string): { data: { publicUrl: string } }
  }
}

export function itemImagePaths(bizId: string, itemId: string) {
  const full = `${bizId}/items/${itemId}`
  return { full, thumb: `${full}-t` }
}

/** Los dos objetos que hay que borrar al quitar la foto del plato. */
export function itemImageRemovalPaths(bizId: string, itemId: string): string[] {
  const { full, thumb } = itemImagePaths(bizId, itemId)
  return [full, thumb]
}

export type ItemImageUpload =
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
 * Sube la foto grande y, si hay, su miniatura. Si falla la grande, no sube nada
 * más y devuelve el error (el guardado se comporta como antes). Si falla solo la
 * miniatura, `thumbnailUrl` queda en null: nunca se deja apuntando a la foto
 * anterior. Las dos URL llevan el MISMO `?v=`.
 */
export async function uploadItemImages(
  storage: ItemImageStorage,
  params: {
    bizId: string
    itemId: string
    full: File
    thumb: File | null
    cacheControl: string
    version: number
  },
): Promise<ItemImageUpload> {
  const bucket = storage.from(BUCKET)
  const paths = itemImagePaths(params.bizId, params.itemId)
  const options = (file: File) => ({
    upsert: true,
    contentType: file.type,
    cacheControl: params.cacheControl,
  })

  const { error: fullErr } = await bucket.upload(paths.full, params.full, options(params.full))
  if (fullErr) return { ok: false, message: `No se pudo subir la imagen: ${fullErr.message}` }
  const imageUrl = `${bucket.getPublicUrl(paths.full).data.publicUrl}?v=${params.version}`

  if (!params.thumb) {
    return { ok: true, imageUrl, thumbnailUrl: null, thumbnailError: 'no se generó la miniatura' }
  }
  const { error: thumbErr } = await bucket.upload(paths.thumb, params.thumb, options(params.thumb))
  if (thumbErr) {
    return { ok: true, imageUrl, thumbnailUrl: null, thumbnailError: thumbErr.message }
  }
  const thumbnailUrl = `${bucket.getPublicUrl(paths.thumb).data.publicUrl}?v=${params.version}`
  return { ok: true, imageUrl, thumbnailUrl, thumbnailError: null }
}
