'use client'

import {
  conditionScoreLabel,
  missingForPublish,
  STORE_DESCRIPTION_MAX,
  STORE_MAX_PHOTOS,
  STORE_SIZE_MAX,
  STORE_TITLE_MAX,
  type StoreAudience,
  type StoreCondition,
  type StoreProductPatch,
} from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { errMsg } from '@/lib/api'
import { Deco } from './parts'
import { CoverPicker, PhotoGrid } from './photo-grid'
import { storeApi, uploadStorePhoto } from './store-api'
import type { StoreCategory, StoreItem } from './types'

const AUTOSAVE_MS = 700
const LAST_KEY = 'tdv-store-last'

const CONDITIONS: { id: StoreCondition; label: string }[] = [
  { id: 'new_with_tag', label: 'Nuevo con etiqueta' },
  { id: 'new_unused', label: 'Nuevo sin uso' },
  { id: 'used', label: 'Usado' },
]
const AUDIENCES: { id: StoreAudience; label: string }[] = [
  { id: 'women', label: 'Dama' },
  { id: 'men', label: 'Caballero' },
  { id: 'kids', label: 'Niños' },
  { id: 'unisex', label: 'Unisex' },
]
/** «Para quién» solo tiene sentido en lo que se viste o se lleva puesto (PRD §4). */
const AUDIENCE_CATEGORIES = new Set(['ropa', 'calzado', 'bolsos'])

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface Fields {
  title: string
  price: string
  originalPrice: string
  description: string
  sizeLabel: string
  categoryId: string | null
  condition: StoreCondition | null
  conditionScore: number | null
  audience: StoreAudience | null
  isClearance: boolean
  negotiable: boolean
  coverFocusX: number
  coverFocusY: number
}

const fromItem = (i: StoreItem | null): Fields => ({
  title: i?.title ?? '',
  price: i?.price != null ? String(i.price) : '',
  originalPrice: i?.originalPrice != null ? String(i.originalPrice) : '',
  description: i?.description ?? '',
  sizeLabel: i?.sizeLabel ?? '',
  categoryId: i?.categoryId ?? null,
  condition: i?.condition ?? null,
  conditionScore: i?.conditionScore ?? null,
  audience: i?.audience ?? null,
  isClearance: i?.isClearance ?? false,
  negotiable: i?.negotiable ?? false,
  coverFocusX: i?.coverFocusX ?? 0.5,
  coverFocusY: i?.coverFocusY ?? 0.5,
})

/** Texto de un campo de precio → número, null si está vacío, undefined si no es válido (no se guarda). */
function parsePrice(v: string): number | null | undefined {
  const t = v.trim().replace(',', '.')
  if (t === '') return null
  const n = Number.parseFloat(t)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function Toggle({
  checked,
  onChange,
  label,
  help,
  icon,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  help: string
  icon: string
}) {
  return (
    <div className="as-sw">
      <Icon name={icon} size={22} />
      <div className="tt">
        <b>{label}</b>
        <span>{help}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="as-tg"
        onClick={() => onChange(!checked)}
      />
    </div>
  )
}

/**
 * Formulario de artículo (PRD §6.3). El BORRADOR vive en el servidor desde la
 * primera foto y cada campo se guarda solo (700 ms después de teclear): no hay
 * «Guardar borrador». Si se cierra la app a mitad, al volver el borrador sigue
 * ahí con sus fotos. Un solo botón fijo, «Publicar», que dice qué falta.
 */
export function ProductForm({ initialId }: { initialId?: string }) {
  const router = useRouter()
  const [item, setItem] = useState<StoreItem | null>(null)
  const [f, setF] = useState<Fields>(fromItem(null))
  const [cats, setCats] = useState<StoreCategory[]>([])
  const [save, setSave] = useState<SaveState>('idle')
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(!initialId)
  const [publishing, setPublishing] = useState(false)

  const itemRef = useRef<StoreItem | null>(null)
  const pending = useRef<StoreProductPatch>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const creating = useRef<Promise<StoreItem> | null>(null)
  itemRef.current = item

  useEffect(() => {
    storeApi
      .categories()
      .then(setCats)
      .catch((e) => setError(errMsg(e)))
  }, [])

  useEffect(() => {
    if (!initialId) return
    storeApi
      .get(initialId)
      .then((i) => {
        setItem(i)
        setF(fromItem(i))
        setLoaded(true)
      })
      .catch((e) => {
        setError(errMsg(e))
        setLoaded(true)
      })
  }, [initialId])

  /** Manda lo acumulado. Si todavía no hay borrador, se queda esperando a que exista. */
  const flush = useCallback(async () => {
    const current = itemRef.current
    if (!current || Object.keys(pending.current).length === 0) return
    const patch = pending.current
    pending.current = {}
    setSave('saving')
    try {
      const updated = await storeApi.patch(current.id, patch)
      // Solo se sincroniza lo que el servidor decide; los campos de texto no se
      // pisan para no comerse lo que se esté tecleando.
      setItem((prev) => (prev ? { ...prev, slug: updated.slug, status: updated.status } : updated))
      setSave('saved')
      setError(null)
    } catch (e) {
      pending.current = { ...patch, ...pending.current }
      setSave('error')
      setError(errMsg(e))
    }
  }, [])

  const schedule = useCallback(
    (delay: number) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), delay)
    },
    [flush],
  )

  /** Crea el borrador la PRIMERA vez que hace falta (primera foto) y lo deja en la URL. */
  const ensureDraft = useCallback(async (): Promise<StoreItem> => {
    if (itemRef.current) return itemRef.current
    creating.current ??= storeApi.create().then((created) => {
      setItem(created)
      itemRef.current = created
      window.history.replaceState(null, '', `/store/${created.id}`)
      return created
    })
    const created = await creating.current
    // Lo tecleado antes de la primera foto (y lo recordado) viaja con el borrador.
    if (Object.keys(pending.current).length > 0) void flush()
    return created
  }, [flush])

  const setField = useCallback(
    <K extends keyof Fields>(
      key: K,
      value: Fields[K],
      patch: StoreProductPatch,
      delay = AUTOSAVE_MS,
    ) => {
      setF((prev) => ({ ...prev, [key]: value }))
      pending.current = { ...pending.current, ...patch }
      setSave('idle')
      if (itemRef.current) schedule(delay)
    },
    [schedule],
  )

  // Lo último usado se recuerda para el siguiente artículo (PRD §6.3).
  useEffect(() => {
    if (initialId) return
    try {
      const last = JSON.parse(window.localStorage.getItem(LAST_KEY) ?? 'null') as {
        categoryId?: string
        condition?: StoreCondition
      } | null
      if (last?.categoryId) {
        setF((p) => ({
          ...p,
          categoryId: last.categoryId ?? null,
          condition: last.condition ?? null,
        }))
        pending.current = {
          ...pending.current,
          categoryId: last.categoryId,
          ...(last.condition ? { condition: last.condition } : {}),
        }
      }
    } catch {
      // sin almacenamiento no se recuerda nada
    }
  }, [initialId])

  // Al salir de la pantalla no se pierde lo que estaba esperando su turno.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      void flush()
    },
    [flush],
  )

  async function addFiles(files: File[]) {
    const room = STORE_MAX_PHOTOS - ((itemRef.current?.images.length ?? 0) + uploading)
    const take = files.slice(0, Math.max(0, room))
    if (files.length > take.length) setError(`Máximo ${STORE_MAX_PHOTOS} fotos por artículo`)
    if (take.length === 0) return
    setError(null)
    try {
      const draft = await ensureDraft()
      setUploading((n) => n + take.length)
      for (const file of take) {
        try {
          const updated = await uploadStorePhoto(draft.id, file)
          setItem((prev) =>
            prev ? { ...prev, images: updated.images, thumbUrl: updated.thumbUrl } : updated,
          )
        } catch (e) {
          setError(e instanceof Error ? e.message : errMsg(e))
        } finally {
          setUploading((n) => n - 1)
        }
      }
    } catch (e) {
      setError(errMsg(e))
    }
  }

  async function reorder(ids: string[]) {
    if (!item) return
    try {
      const updated = await storeApi.reorder(item.id, ids)
      setItem((prev) =>
        prev ? { ...prev, images: updated.images, thumbUrl: updated.thumbUrl } : updated,
      )
    } catch (e) {
      setError(errMsg(e))
    }
  }

  async function removeImage(imageId: string) {
    if (!item) return
    try {
      const updated = await storeApi.removeImage(item.id, imageId)
      setItem((prev) =>
        prev ? { ...prev, images: updated.images, thumbUrl: updated.thumbUrl } : updated,
      )
    } catch (e) {
      setError(errMsg(e))
    }
  }

  const photoCount = item?.images.length ?? 0
  const price = parsePrice(f.price)
  const missing = missingForPublish(
    {
      code: item?.code ?? '',
      slug: item?.slug ?? null,
      status: item?.status ?? 'draft',
      isClearance: f.isClearance,
      title: f.title,
      price: price ?? null,
      originalPrice: parsePrice(f.originalPrice) ?? null,
      condition: f.condition,
      conditionScore: f.conditionScore,
      sizeLabel: f.sizeLabel,
      categoryId: f.categoryId,
    },
    photoCount,
  )
  const published = item !== null && item.status !== 'draft'
  const category = cats.find((c) => c.id === f.categoryId)
  const showAudience = category ? AUDIENCE_CATEGORIES.has(category.slug) : false
  const prevPrice = parsePrice(f.originalPrice)
  const prevWarn = prevPrice != null && price != null && prevPrice <= price

  async function publish() {
    if (published) {
      router.push('/store')
      return
    }
    if (!item || missing) return
    setPublishing(true)
    try {
      if (timer.current) clearTimeout(timer.current)
      await flush()
      await storeApi.setStatus(item.id, 'available')
      try {
        window.localStorage.setItem(
          LAST_KEY,
          JSON.stringify({ categoryId: f.categoryId, condition: f.condition }),
        )
      } catch {
        // opcional
      }
      router.push('/store')
    } catch (e) {
      setError(errMsg(e))
      setPublishing(false)
    }
  }

  if (!loaded) return <div className="as-empty">Cargando…</div>

  const saveLabel =
    save === 'saving'
      ? 'Guardando…'
      : save === 'saved'
        ? 'Guardado'
        : save === 'error'
          ? 'No se guardó'
          : ''

  return (
    <>
      <div className="as-top">
        <Link href="/store" className="as-iconbtn" aria-label="Volver a la tienda">
          <Icon name="arrow_back" size={22} />
        </Link>
        <h1>
          {item?.title || (initialId ? item?.code : 'Nuevo artículo')}
          <span className="sub">
            {published ? 'Publicado · los cambios se guardan solos' : 'Borrador'}
          </span>
        </h1>
        {saveLabel && (
          <span className={`as-saved ${save === 'error' ? 'err' : ''}`} role="status">
            <Icon
              name={save === 'saving' ? 'sync' : save === 'error' ? 'error' : 'cloud_done'}
              size={18}
              className={save === 'saving' ? 'as-spin' : ''}
            />
            {saveLabel}
          </span>
        )}
      </div>

      {error && (
        <div className="as-err" role="alert">
          {error}
        </div>
      )}

      <div className="as-form">
        <div className="as-fld">
          <div className="lb">
            Fotos <span className="opt">Mínimo 1, máximo {STORE_MAX_PHOTOS}</span>
          </div>
          <PhotoGrid
            images={item?.images ?? []}
            uploading={uploading}
            onAdd={addFiles}
            onReorder={reorder}
            onRemove={removeImage}
          />
          {!item && (
            <div className="as-help">El borrador se guarda en cuanto subas la primera foto.</div>
          )}
        </div>

        {item && item.images[0] && (
          <div className="as-fld">
            <div className="lb">Portada</div>
            <CoverPicker
              src={item.images[0].thumbUrl}
              x={f.coverFocusX}
              y={f.coverFocusY}
              onChange={(x, y) => {
                setF((p) => ({ ...p, coverFocusX: x, coverFocusY: y }))
                pending.current = { ...pending.current, coverFocusX: x, coverFocusY: y }
                schedule(AUTOSAVE_MS)
              }}
            />
            <div className="as-help">Toca el punto que debe quedar al centro.</div>
          </div>
        )}

        <div className="as-fld">
          <label htmlFor="title">
            Título{' '}
            <span className="cnt">
              {f.title.length}/{STORE_TITLE_MAX}
            </span>
          </label>
          <input
            id="title"
            className="as-inp"
            maxLength={STORE_TITLE_MAX}
            value={f.title}
            placeholder="Ej.: Casaca jean talla M"
            onChange={(e) => setField('title', e.target.value, { title: e.target.value })}
          />
        </div>

        <div className="as-fld">
          <label htmlFor="price">Precio</label>
          <div className="as-money">
            <span className="cur">S/</span>
            <input
              id="price"
              className="as-inp"
              inputMode="decimal"
              value={f.price}
              placeholder="0"
              onChange={(e) => {
                const p = parsePrice(e.target.value)
                setField('price', e.target.value, p === undefined ? {} : { price: p })
              }}
            />
          </div>
        </div>

        <div className="as-fld">
          <label htmlFor="orig">
            Precio original <span className="opt">Opcional</span>
          </label>
          <div className="as-money">
            <span className="cur">S/</span>
            <input
              id="orig"
              className="as-inp"
              inputMode="decimal"
              value={f.originalPrice}
              placeholder="0"
              onChange={(e) => {
                const p = parsePrice(e.target.value)
                setField(
                  'originalPrice',
                  e.target.value,
                  p === undefined ? {} : { originalPrice: p },
                )
              }}
            />
          </div>
          <div className="as-help">
            {prevWarn
              ? 'El precio original tiene que ser mayor que el precio: si no, no se muestra.'
              : 'Solo si es el precio real que pagaste o el de tienda. Si no lo sabes, usa «Remate».'}
          </div>
        </div>

        <div className="as-fld">
          <div className="lb">Categoría</div>
          <div className="as-cats" role="group" aria-label="Categoría">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                className="as-cat"
                aria-pressed={f.categoryId === c.id}
                onClick={() => setField('categoryId', c.id, { categoryId: c.id }, 0)}
              >
                <Deco name={c.icon} size={24} />
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="as-fld">
          <div className="lb">Condición</div>
          <div className="as-conds" role="group" aria-label="Condición">
            {CONDITIONS.map((c) => (
              <button
                key={c.id}
                type="button"
                className="as-cond"
                aria-pressed={f.condition === c.id}
                onClick={() => {
                  const score = c.id === 'used' ? (f.conditionScore ?? 8) : null
                  setF((p) => ({ ...p, condition: c.id, conditionScore: score }))
                  pending.current = {
                    ...pending.current,
                    condition: c.id,
                    ...(c.id === 'used' ? { conditionScore: score } : {}),
                  }
                  setSave('idle')
                  if (itemRef.current) schedule(0)
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {f.condition === 'used' && (
          <div className="as-fld">
            <div className="lb">Estado del 1 al 10</div>
            <div className="as-est">
              <div className="top2">
                <span className="big">
                  {f.conditionScore ?? 8}
                  <small>/10</small>
                </span>
                <span className="tx">{conditionScoreLabel(f.conditionScore ?? 8)}</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={f.conditionScore ?? 8}
                aria-label="Estado del 1 al 10"
                onChange={(e) =>
                  setField('conditionScore', Number(e.target.value), {
                    conditionScore: Number(e.target.value),
                  })
                }
              />
              <div className="ends">
                <span>1 · Con detalles</span>
                <span>10 · Impecable</span>
              </div>
            </div>
          </div>
        )}

        <div className="as-two">
          <div className="as-fld">
            <label htmlFor="size">
              Talla o medida <span className="opt">Opcional</span>
            </label>
            <input
              id="size"
              className="as-inp"
              maxLength={STORE_SIZE_MAX}
              value={f.sizeLabel}
              placeholder="M, 38, 100 ml…"
              onChange={(e) => setField('sizeLabel', e.target.value, { sizeLabel: e.target.value })}
            />
          </div>
        </div>

        {showAudience && (
          <div className="as-fld">
            <div className="lb">
              Para quién <span className="opt">Opcional</span>
            </div>
            <div
              className="as-conds"
              style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
              role="group"
              aria-label="Para quién"
            >
              {AUDIENCES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="as-cond"
                  style={{ minHeight: 52, fontSize: 13 }}
                  aria-pressed={f.audience === a.id}
                  onClick={() => {
                    const next = f.audience === a.id ? null : a.id
                    setField('audience', next, { audience: next }, 0)
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="as-fld">
          <label htmlFor="desc">
            Descripción{' '}
            <span className="cnt">
              {f.description.length}/{STORE_DESCRIPTION_MAX}
            </span>
          </label>
          <textarea
            id="desc"
            className="as-inp"
            maxLength={STORE_DESCRIPTION_MAX}
            value={f.description}
            placeholder="Marca, medidas, cómo está, si tiene algún detalle"
            onChange={(e) =>
              setField('description', e.target.value, { description: e.target.value })
            }
          />
          <div className="as-help">Si tiene un defecto, dilo aquí y que se vea en alguna foto.</div>
        </div>

        <div>
          <Toggle
            icon="local_offer"
            label="Remate"
            help="Muestra la etiqueta «Remate» (sin precio tachado)."
            checked={f.isClearance}
            onChange={(v) => setField('isClearance', v, { isClearance: v }, 0)}
          />
          <Toggle
            icon="chat"
            label="Acepta ofertas"
            help="El precio se acuerda por chat antes del envío."
            checked={f.negotiable}
            onChange={(v) => setField('negotiable', v, { negotiable: v }, 0)}
          />
        </div>
      </div>

      <div className="as-actbar">
        <div>
          <button
            type="button"
            className="as-publish"
            disabled={publishing || uploading > 0 || (!published && !!missing)}
            onClick={publish}
          >
            {publishing
              ? 'Publicando…'
              : published
                ? 'Listo'
                : uploading > 0
                  ? 'Subiendo fotos…'
                  : (missing ?? 'Publicar')}
          </button>
        </div>
      </div>
    </>
  )
}
