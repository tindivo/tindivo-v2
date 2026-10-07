import type { ApiEnvelope } from '@tindivo/api-client'
import type { StoreProductPatch, StoreStatus } from '@tindivo/contracts'
import { compressImage, UPLOAD_CACHE_CONTROL, validateImageInput } from '@tindivo/images'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import type { StatusChange, StoreCategory, StoreItem, StoreListData, StoreSettings } from './types'

const BUCKET = 'store-products'

/** Todas las llamadas del admin de Tindivo Store, tipadas, en un solo sitio. */
export const storeApi = {
  list: async (status: StoreStatus) =>
    (await api.get<ApiEnvelope<StoreListData>>(`/admin/store?status=${status}`)).data,
  categories: async () =>
    (await api.get<ApiEnvelope<StoreCategory[]>>('/admin/store/categories')).data,
  create: async () => (await api.post<ApiEnvelope<StoreItem>>('/admin/store', {})).data,
  get: async (id: string) => (await api.get<ApiEnvelope<StoreItem>>(`/admin/store/${id}`)).data,
  patch: async (id: string, patch: StoreProductPatch) =>
    (await api.patch<ApiEnvelope<StoreItem>>(`/admin/store/${id}`, patch)).data,
  setStatus: async (id: string, status: Exclude<StoreStatus, 'draft'>) =>
    (await api.post<ApiEnvelope<StatusChange>>(`/admin/store/${id}/status`, { status })).data,
  duplicate: async (id: string) =>
    (await api.post<ApiEnvelope<StoreItem>>(`/admin/store/${id}/duplicate`, {})).data,
  deleteDraft: async (id: string) => {
    await api.delete(`/admin/store/${id}`)
  },
  addImage: async (id: string, url: string, thumbUrl: string) =>
    (await api.post<ApiEnvelope<StoreItem>>(`/admin/store/${id}/images`, { url, thumbUrl })).data,
  reorder: async (id: string, ids: string[]) =>
    (await api.put<ApiEnvelope<StoreItem>>(`/admin/store/${id}/images`, { ids })).data,
  removeImage: async (id: string, imageId: string) =>
    (await api.delete<ApiEnvelope<StoreItem>>(`/admin/store/${id}/images/${imageId}`)).data,
  settings: async () => (await api.get<ApiEnvelope<StoreSettings>>('/admin/store/settings')).data,
  saveSettings: async (s: StoreSettings) =>
    (await api.put<ApiEnvelope<StoreSettings>>('/admin/store/settings', s)).data,
}

function extFor(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/jpeg') return 'jpg'
  return 'webp'
}

/**
 * Sube UNA foto del artículo: la comprime en el celular (detalle ~1080 px y
 * miniatura), las sube a `store-products/<id>/` con la sesión del admin y las
 * registra en la API. Cada foto va por separado (PRD §6.3) para que una red
 * mala no pierda las demás.
 */
export async function uploadStorePhoto(productId: string, file: File): Promise<StoreItem> {
  const invalid = validateImageInput(file)
  if (invalid) throw new Error(invalid)

  const [detail, thumb] = await Promise.all([
    compressImage(file, 'store'),
    compressImage(file, 'store-thumb'),
  ])
  const key = crypto.randomUUID()
  const sb = getSupabaseBrowser()

  const put = async (path: string, f: File) => {
    const { error } = await sb.storage.from(BUCKET).upload(path, f, {
      contentType: f.type,
      cacheControl: UPLOAD_CACHE_CONTROL,
      upsert: false,
    })
    if (error) throw new Error(`No se pudo subir la foto: ${error.message}`)
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  }

  const url = await put(`${productId}/${key}.${extFor(detail.type)}`, detail)
  const thumbUrl = await put(`${productId}/${key}-t.${extFor(thumb.type)}`, thumb)
  return storeApi.addImage(productId, url, thumbUrl)
}
