import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { notifySuccess } from '@/components/dashboard/toast'
import { compressImage } from '@/lib/images/compress'
import { UPLOAD_CACHE_CONTROL, validateImageInput } from '@/lib/images/upload'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { makeLocalId } from '../lib/utils'
import type { Category, FormData, ModifierGroup } from '../types'

export function useItemEditor() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()

  const rawId = params.id
  const itemId = typeof rawId === 'string' ? rawId : (rawId?.[0] ?? 'nuevo')
  const isNew = itemId === 'nuevo'
  const defaultCatId = searchParams.get('cat') ?? ''

  const [ready, setReady] = useState(false)
  const [bizId, setBizId] = useState<string | null>(null)
  const [bizName, setBizName] = useState('Mi negocio')
  const [accent, setAccent] = useState('#F472B6')
  const [pendingOrders, setPendingOrders] = useState(0)
  const [cats, setCats] = useState<Category[]>([])
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    category_id: defaultCatId,
    base_price: '',
    is_available: true,
    is_compact: false,
    image_url: null,
    badges: [],
  })
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const previewUrlRef = useRef<string | null>(null)
  /**
   * "Quitar foto" solo cambia el formulario; el archivo no se toca hasta que
   * el negocio guarda. Si se borrara al pulsar el botón, quien se arrepiente y
   * sale sin guardar se quedaría con un plato apuntando a un objeto que ya no
   * existe.
   */
  const imageRemovedRef = useRef(false)
  const [groups, setGroups] = useState<ModifierGroup[]>([])
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const pendingNavRef = useRef<string | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/')
        return
      }

      // Filtrado por `user_id`: ver `chrome.tsx:refetchBiz`. Sin él, la cuenta
      // con rol business + admin ve todos los negocios, `maybeSingle()` falla y
      // aquí eso sacaba al editor a la portada — el síntoma más confuso de los
      // cuatro, porque parece que el plato no existe.
      const { data: biz, error } = await supabase
        .from('businesses')
        .select('id,name,accent_color')
        .eq('user_id', data.session.user.id)
        .maybeSingle()
      if (error) console.error('[item-editor] no se pudo resolver el negocio:', error.message)
      if (!biz?.id) {
        router.replace('/')
        return
      }
      setBizId(biz.id)
      setBizName(biz.name ?? 'Mi negocio')
      setAccent(biz.accent_color ? `#${biz.accent_color}` : '#F472B6')

      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', biz.id)
        .eq('status', 'pending_acceptance')
      setPendingOrders(count ?? 0)

      const { data: catsData } = await supabase
        .from('menu_categories')
        .select('id,name')
        .eq('business_id', biz.id)
        .order('display_order')
      const loadedCats = catsData ?? []
      setCats(loadedCats)

      if (!isNew) {
        const { data: item } = await supabase
          .from('menu_items')
          .select(
            'id,name,description,category_id,base_price,is_available,is_compact,image_url,badges',
          )
          .eq('id', itemId)
          .eq('business_id', biz.id)
          .is('deleted_at', null)
          .maybeSingle()

        if (!item) {
          router.replace('/menu')
          return
        }

        setFormData({
          name: item.name,
          description: item.description ?? '',
          category_id: item.category_id,
          base_price: Number(item.base_price).toFixed(2),
          is_available: item.is_available,
          is_compact: item.is_compact,
          image_url: item.image_url ?? null,
          badges: item.badges ?? [],
        })

        const { data: junctions } = await supabase
          .from('menu_item_modifier_groups')
          .select('group_id,display_order')
          .eq('item_id', itemId)
          .order('display_order')

        if (junctions && junctions.length > 0) {
          const groupIds = junctions.map((j) => j.group_id)
          const { data: groupsData } = await supabase
            .from('menu_modifier_groups')
            .select(
              'id,name,selection_type,is_required,min_selections,max_selections,display_order',
            )
            .in('id', groupIds)

          const { data: optionsData } = await supabase
            .from('menu_modifier_options')
            .select('id,group_id,name,additional_price,is_available,display_order')
            .in('group_id', groupIds)
            .order('display_order')

          const optsByGroup: Record<string, typeof optionsData> = {}
          for (const opt of optionsData ?? []) {
            const list = optsByGroup[opt.group_id] ?? []
            list.push(opt)
            optsByGroup[opt.group_id] = list
          }

          const loadedGroups: ModifierGroup[] = (junctions ?? []).flatMap((j) => {
            const g = (groupsData ?? []).find((x) => x.id === j.group_id)
            if (!g) return []
            return [
              {
                id: g.id,
                localId: g.id,
                name: g.name,
                selection_type: g.selection_type as 'single' | 'multi',
                is_required: g.is_required,
                min_selections: g.min_selections,
                max_selections: g.max_selections,
                display_order: j.display_order,
                isExpanded: false,
                options: (optsByGroup[g.id] ?? []).map((o) => ({
                  id: o.id,
                  localId: o.id,
                  name: o.name,
                  additional_price: Number(o.additional_price),
                  is_available: o.is_available,
                  display_order: o.display_order,
                })),
              },
            ]
          })

          if (loadedGroups[0]) {
            loadedGroups[0] = { ...loadedGroups[0], isExpanded: true }
          }

          setGroups(loadedGroups)
        }
      } else {
        if (defaultCatId && loadedCats.some((c) => c.id === defaultCatId)) {
          setFormData((prev) => ({ ...prev, category_id: defaultCatId }))
        } else if (loadedCats.length > 0) {
          setFormData((prev) => ({ ...prev, category_id: loadedCats[0]?.id ?? '' }))
        }
      }

      setReady(true)
    })
  }, [router, itemId, isNew, defaultCatId])

  function patchForm(patch: Partial<FormData>) {
    setFormData((prev) => ({ ...prev, ...patch }))
    setHasUnsaved(true)
  }

  function patchGroup(localId: string, patch: Partial<ModifierGroup>) {
    setGroups((prev) => prev.map((g) => (g.localId === localId ? { ...g, ...patch } : g)))
    setHasUnsaved(true)
  }

  function toggleGroupExpand(localId: string) {
    setGroups((prev) =>
      prev.map((g) => (g.localId === localId ? { ...g, isExpanded: !g.isExpanded } : g)),
    )
  }

  function deleteGroup(localId: string) {
    setGroups((prev) => prev.map((g) => (g.localId === localId ? { ...g, isDeleted: true } : g)))
    setHasUnsaved(true)
  }

  function addGroup() {
    const newGroup: ModifierGroup = {
      id: '',
      localId: makeLocalId(),
      name: '',
      selection_type: 'single',
      is_required: true,
      min_selections: 1,
      max_selections: 1,
      display_order: groups.filter((g) => !g.isDeleted).length,
      options: [],
      isNew: true,
      isExpanded: true,
    }
    setGroups((prev) => [...prev, newGroup])
    setHasUnsaved(true)
  }

  function addOptionToGroup(groupLocalId: string) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.localId !== groupLocalId) return g
        const newOpt = {
          id: '',
          localId: makeLocalId(),
          name: '',
          additional_price: 0,
          is_available: true,
          display_order: g.options.filter((o) => !o.isDeleted).length,
          isNew: true,
        }
        return { ...g, options: [...g.options, newOpt] }
      }),
    )
    setHasUnsaved(true)
  }

  function deleteOption(groupLocalId: string, optLocalId: string) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.localId !== groupLocalId) return g
        return {
          ...g,
          options: g.options.map((o) => (o.localId === optLocalId ? { ...o, isDeleted: true } : o)),
        }
      }),
    )
    setHasUnsaved(true)
  }

  function changeOption(
    groupLocalId: string,
    optLocalId: string,
    patch: Partial<{ name: string; additional_price: number; is_available: boolean }>,
  ) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.localId !== groupLocalId) return g
        return {
          ...g,
          options: g.options.map((o) => (o.localId === optLocalId ? { ...o, ...patch } : o)),
        }
      }),
    )
    setHasUnsaved(true)
  }

  function moveOption(groupLocalId: string, optLocalId: string, dir: -1 | 1) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.localId !== groupLocalId) return g
        const opts = [...g.options]
        const idx = opts.findIndex((o) => o.localId === optLocalId)
        if (idx < 0) return g
        let j = idx + dir
        while (j >= 0 && j < opts.length && opts[j]?.isDeleted) j += dir
        const a = opts[idx]
        const b = opts[j]
        if (j < 0 || j >= opts.length || !a || !b) return g
        opts[idx] = b
        opts[j] = a
        return { ...g, options: opts }
      }),
    )
    setHasUnsaved(true)
  }

  function moveGroupUp(index: number) {
    const visible = groups.filter((g) => !g.isDeleted)
    if (index === 0) return
    const above = visible[index - 1]
    const curr = visible[index]
    if (!above || !curr) return
    setGroups((prev) =>
      prev
        .map((g) => {
          if (g.localId === above.localId) return { ...g, display_order: curr.display_order }
          if (g.localId === curr.localId) return { ...g, display_order: above.display_order }
          return g
        })
        .sort((a, b) => a.display_order - b.display_order),
    )
    setHasUnsaved(true)
  }

  function moveGroupDown(index: number) {
    const visible = groups.filter((g) => !g.isDeleted)
    if (index >= visible.length - 1) return
    const below = visible[index + 1]
    const curr = visible[index]
    if (!below || !curr) return
    setGroups((prev) =>
      prev
        .map((g) => {
          if (g.localId === below.localId) return { ...g, display_order: curr.display_order }
          if (g.localId === curr.localId) return { ...g, display_order: below.display_order }
          return g
        })
        .sort((a, b) => a.display_order - b.display_order),
    )
    setHasUnsaved(true)
  }

  /**
   * Revoca el objectURL anterior antes de soltar el nuevo. Sin esto cada
   * "Reemplazar" dejaba una foto entera retenida en memoria hasta recargar la
   * página, y aquí se reemplaza mucho desde el celular.
   */
  function replacePreview(next: string | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = next
    setImagePreview(next)
  }

  async function onPickImage(file: File) {
    const err = validateImageInput(file)
    if (err) {
      setImageError(err)
      return
    }
    setImageError(null)
    setImageBusy(true)
    try {
      // Se comprime al elegir, no al guardar: el preview enseña exactamente la
      // imagen que verá el cliente, y el botón "Guardar" no se queda colgado.
      const optimized = await compressImage(file, 'product')
      // Si quitó la foto y acto seguido eligió otra, no hay nada que borrar:
      // la nueva sobrescribe el mismo objeto.
      imageRemovedRef.current = false
      setPendingImageFile(optimized)
      replacePreview(URL.createObjectURL(optimized))
      setHasUnsaved(true)
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'No pudimos procesar la imagen.')
    } finally {
      setImageBusy(false)
    }
  }

  function onClearImage() {
    if (formData.image_url) imageRemovedRef.current = true
    setPendingImageFile(null)
    replacePreview(null)
    setImageError(null)
    setFormData((f) => ({ ...f, image_url: null }))
    setHasUnsaved(true)
  }

  async function save(): Promise<boolean> {
    if (!bizId) return false
    setSaving(true)
    setSaveError(null)
    const supabase = getSupabaseBrowser()

    try {
      const priceVal = Number.parseFloat(formData.base_price)
      if (Number.isNaN(priceVal) || priceVal < 0) {
        setSaveError('El precio base debe ser un número válido.')
        setSaving(false)
        return false
      }
      if (!formData.name.trim()) {
        setSaveError('El nombre del plato es obligatorio.')
        setSaving(false)
        return false
      }

      let savedItemId = isNew ? '' : itemId
      if (isNew) {
        const { data: newItem, error: insertErr } = await supabase
          .from('menu_items')
          .insert({
            business_id: bizId,
            category_id: formData.category_id,
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            base_price: priceVal,
            is_available: formData.is_available,
            is_compact: formData.is_compact,
            badges: formData.badges,
            display_order: 9999,
          })
          .select('id')
          .single()
        if (insertErr || !newItem) {
          setSaveError(insertErr?.message ?? 'Error al crear el plato.')
          setSaving(false)
          return false
        }
        savedItemId = newItem.id
      } else {
        const { error: updateErr } = await supabase
          .from('menu_items')
          .update({
            category_id: formData.category_id,
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            base_price: priceVal,
            is_available: formData.is_available,
            is_compact: formData.is_compact,
            badges: formData.badges,
            image_url: formData.image_url,
          })
          .eq('id', itemId)
          .eq('business_id', bizId)
        if (updateErr) {
          setSaveError(updateErr.message)
          setSaving(false)
          return false
        }
      }

      if (pendingImageFile) {
        const path = `${bizId}/items/${savedItemId}`
        const { error: upErr } = await supabase.storage
          .from('menu-items')
          .upload(path, pendingImageFile, {
            upsert: true,
            contentType: pendingImageFile.type,
            cacheControl: UPLOAD_CACHE_CONTROL,
          })
        if (upErr) {
          setSaveError(`No se pudo subir la imagen: ${upErr.message}`)
          setSaving(false)
          return false
        }
        const { data: pub } = supabase.storage.from('menu-items').getPublicUrl(path)
        const versionedUrl = `${pub.publicUrl}?v=${Date.now()}`
        const { error: imgErr } = await supabase
          .from('menu_items')
          .update({ image_url: versionedUrl })
          .eq('id', savedItemId)
          .eq('business_id', bizId)
        if (imgErr) {
          setSaveError(imgErr.message)
          setSaving(false)
          return false
        }
        setFormData((f) => ({ ...f, image_url: versionedUrl }))
        setPendingImageFile(null)
        replacePreview(null)
      } else if (imageRemovedRef.current) {
        // La fila ya guardó `image_url: null` más arriba, así que el objeto se
        // quedó sin quien lo referencie. Se va ahora.
        await supabase.storage.from('menu-items').remove([`${bizId}/items/${savedItemId}`])
        imageRemovedRef.current = false
      }

      for (let i = 0; i < groups.length; i++) {
        const g = groups[i]
        if (!g) continue

        if (g.isDeleted) {
          if (g.id) {
            await supabase.from('menu_modifier_options').delete().eq('group_id', g.id)
            await supabase
              .from('menu_item_modifier_groups')
              .delete()
              .eq('group_id', g.id)
              .eq('item_id', savedItemId)
            await supabase.from('menu_modifier_groups').delete().eq('id', g.id)
          }
          continue
        }

        let groupId = g.id
        if (g.isNew || !g.id) {
          const { data: newGroup, error: gErr } = await supabase
            .from('menu_modifier_groups')
            .insert({
              business_id: bizId,
              name: g.name.trim() || 'Grupo',
              selection_type: g.selection_type,
              is_required: g.is_required,
              min_selections: g.min_selections,
              max_selections: g.max_selections,
              display_order: g.display_order,
            })
            .select('id')
            .single()
          if (gErr || !newGroup) {
            setSaveError(
              gErr?.message ?? `No se pudo guardar el grupo "${g.name.trim() || 'Grupo'}".`,
            )
            setSaving(false)
            return false
          }
          groupId = newGroup.id

          await supabase.from('menu_item_modifier_groups').insert({
            item_id: savedItemId,
            group_id: groupId,
            display_order: i,
          })
        } else {
          const { error: gUpdErr } = await supabase
            .from('menu_modifier_groups')
            .update({
              name: g.name.trim() || 'Grupo',
              selection_type: g.selection_type,
              is_required: g.is_required,
              min_selections: g.min_selections,
              max_selections: g.max_selections,
              display_order: g.display_order,
            })
            .eq('id', groupId)
          if (gUpdErr) {
            setSaveError(gUpdErr.message)
            setSaving(false)
            return false
          }

          await supabase
            .from('menu_item_modifier_groups')
            .update({ display_order: i })
            .eq('item_id', savedItemId)
            .eq('group_id', groupId)
        }

        for (let j = 0; j < g.options.length; j++) {
          const opt = g.options[j]
          if (!opt) continue

          if (opt.isDeleted) {
            if (opt.id) {
              await supabase.from('menu_modifier_options').delete().eq('id', opt.id)
            }
            continue
          }

          if (opt.isNew || !opt.id) {
            await supabase.from('menu_modifier_options').insert({
              group_id: groupId,
              name: opt.name.trim() || 'Opción',
              additional_price: opt.additional_price,
              is_available: opt.is_available,
              display_order: j,
            })
          } else {
            await supabase
              .from('menu_modifier_options')
              .update({
                name: opt.name.trim() || 'Opción',
                additional_price: opt.additional_price,
                is_available: opt.is_available,
                display_order: j,
              })
              .eq('id', opt.id)
          }
        }
      }

      setHasUnsaved(false)
      setSaving(false)
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error desconocido')
      setSaving(false)
      return false
    }
  }

  async function handleSave(): Promise<boolean> {
    const ok = await save()
    if (!ok) return false
    notifySuccess(isNew ? 'Plato creado' : 'Plato guardado')
    if (isNew) router.replace('/menu')
    return true
  }

  /**
   * Retira el plato de la carta sin borrar la fila: las líneas de pedido
   * apuntan a ella y `customer_order_items.menu_item_id` es NO ACTION, así que
   * un DELETE real reventaría en cuanto el plato se hubiera vendido una vez.
   *
   * Los grupos de modificadores no se tocan. Si se borrasen, un plato que
   * vuelve a la carta volvería sin sus opciones.
   */
  async function handleDeleteItem() {
    if (!bizId || isNew) return
    setSaving(true)
    const supabase = getSupabaseBrowser()

    const { error: delErr } = await supabase
      .from('menu_items')
      .update({ deleted_at: new Date().toISOString(), image_url: null })
      .eq('id', itemId)
      .eq('business_id', bizId)

    if (delErr) {
      setSaveError(`No se pudo eliminar el plato: ${delErr.message}`)
      setSaving(false)
      return
    }

    // La foto va después y sin bloquear: el plato ya está fuera de la carta,
    // y un archivo que sobra molesta menos que un error en la cara de la
    // cajera por algo que, para ella, ya salió bien.
    if (formData.image_url) {
      await supabase.storage.from('menu-items').remove([`${bizId}/items/${itemId}`])
    }

    router.replace('/menu')
  }

  function handleBack() {
    if (hasUnsaved) {
      pendingNavRef.current = '/menu'
    } else {
      router.push('/menu')
    }
  }

  async function handleSaveAndExit() {
    const ok = await save()
    if (ok) {
      notifySuccess(isNew ? 'Plato creado' : 'Plato guardado')
      router.push('/menu')
    }
  }

  function handleDiscard() {
    router.push('/menu')
  }

  async function signOut() {
    await getSupabaseBrowser().auth.signOut()
    router.replace('/')
  }

  return {
    ready,
    isNew,
    itemId,
    bizId,
    bizName,
    accent,
    pendingOrders,
    cats,
    formData,
    groups,
    hasUnsaved,
    saving,
    saveError,
    imagePreview,
    imageError,
    imageBusy,
    pendingNavRef,
    patchForm,
    patchGroup,
    toggleGroupExpand,
    deleteGroup,
    addGroup,
    addOptionToGroup,
    deleteOption,
    changeOption,
    moveOption,
    moveGroupUp,
    moveGroupDown,
    onPickImage,
    onClearImage,
    handleSave,
    handleDeleteItem,
    handleBack,
    handleSaveAndExit,
    handleDiscard,
    signOut,
  }
}
