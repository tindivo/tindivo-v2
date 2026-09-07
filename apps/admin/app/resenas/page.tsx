'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState, Ico, SectionHeader } from '@/components/admin'
import { api, errMsg } from '@/lib/api'

interface ReviewRow {
  id: string
  order_id: string
  business_id: string
  rating: number
  tags: string[]
  comment: string | null
  created_at: string
  orders: {
    short_id: string
    delivered_at: string | null
    customer_name: string | null
    customer_phone: string | null
  } | null
  businesses: { name: string } | null
  drivers: { full_name: string } | null
}

interface BizRow {
  id: string
  name: string
}

interface TagDef {
  id: string
  label: string
}

function cuando(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Estrellas({ nota }: { nota: number }) {
  return (
    <span className="font-mono text-[13px] tabular-nums" role="img" aria-label={`${nota} de 5`}>
      <span className={nota <= 2 ? 'text-danger' : 'text-warning'}>{'★'.repeat(nota)}</span>
      <span className="text-ink-subtle">{'☆'.repeat(5 - nota)}</span>
    </span>
  )
}

/**
 * La bandeja de reseñas del admin. ES EL ÚNICO SITIO DONDE SE LEE EL COMENTARIO.
 *
 * No está en «Casos» a propósito: eso es antifraude, y una reseña no es una
 * falta de nadie. Vive en Gestión, al lado de Negocios, porque la pregunta que
 * contesta es «¿cómo va este restaurante?».
 *
 * EL FILTRO POR NEGOCIO ES LO PRIMERO, no un extra. Con cuatro negocios en el
 * pueblo, «todas las reseñas» mezcladas no dicen nada; leídas por restaurante
 * se ve enseguida si lo que falla es una cocina o son las motos de esa semana.
 *
 * EL TEXTO SE DESTACA. La nota y las etiquetas ya las ve el dueño en su panel;
 * lo que solo está aquí es el comentario, así que es lo que manda visualmente.
 * El resto es el contexto para entenderlo.
 */
export default function AdminResenasPage() {
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [negocios, setNegocios] = useState<BizRow[]>([])
  const [etiquetas, setEtiquetas] = useState<Map<string, string>>(new Map())
  const [bizId, setBizId] = useState<string>('')
  const [soloConTexto, setSoloConTexto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    const params = new URLSearchParams()
    if (bizId) params.set('businessId', bizId)
    if (soloConTexto) params.set('withComment', 'true')
    const qs = params.toString()
    api
      .get<ApiEnvelope<ReviewRow[]>>(`/admin/reviews${qs ? `?${qs}` : ''}`)
      .then((r) => setRows(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [bizId, soloConTexto])

  useEffect(() => {
    load()
  }, [load])

  /**
   * El filtro y los nombres de las etiquetas.
   *
   * LOS ERRORES NO SE TRAGAN. La primera version hacia `.catch(() => vacio)` en
   * las dos, y el resultado fue una pantalla que MENTIA en silencio: el
   * desplegable salia con «Todos los restaurantes» y nada mas, y las etiquetas
   * se pintaban en crudo (`falto_algo`), sin un solo error en consola que
   * dijera por que. Si esto falla, el admin tiene que verlo.
   */
  useEffect(() => {
    api
      .get<ApiEnvelope<BizRow[]>>('/admin/businesses')
      .then((r) => setNegocios(r.data ?? []))
      .catch((e) => setError(errMsg(e)))
    // El catálogo de etiquetas está en la lista blanca de `app_settings` (0218),
    // pero aquí se pide por la API para no montar un cliente Supabase solo por
    // cinco palabras.
    api
      .get<ApiEnvelope<{ key: string; value: { tags?: TagDef[] } }[]>>('/admin/settings')
      .then((r) => {
        const fila = (r.data ?? []).find((s) => s.key === 'reviews')
        setEtiquetas(new Map((fila?.value?.tags ?? []).map((t) => [t.id, t.label])))
      })
      .catch((e) => setError(errMsg(e)))
  }, [])

  const resumen = useMemo(() => {
    if (!rows || rows.length === 0) return null
    const suma = rows.reduce((a, r) => a + Number(r.rating), 0)
    const conTexto = rows.filter((r) => r.comment).length
    return { total: rows.length, promedio: suma / rows.length, conTexto }
  }, [rows])

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        eyebrow="Gestión"
        title="Reseñas"
        description={
          resumen
            ? `${resumen.total} reseñas · ${resumen.promedio.toFixed(1)} de promedio · ${resumen.conTexto} con comentario`
            : 'Lo que dijeron los clientes, restaurante por restaurante'
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={bizId}
          onChange={(e) => setBizId(e.target.value)}
          className="h-9 rounded-[10px] border border-border bg-white px-3 text-[13px] text-ink"
          aria-label="Filtrar por restaurante"
        >
          <option value="">Todos los restaurantes</option>
          {negocios.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setSoloConTexto((v) => !v)}
          className={`h-9 rounded-[10px] border px-3 text-[13px] font-semibold transition-colors ${
            soloConTexto
              ? 'border-ink bg-ink text-white'
              : 'border-border bg-white text-ink-muted hover:text-ink'
          }`}
        >
          Solo con comentario
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-[14px] bg-danger-soft p-3 text-[13px] text-danger">
          {error}
        </div>
      )}

      {rows === null ? (
        <div className="h-40 animate-pulse rounded-[18px] bg-ink/[0.04]" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Ico.reports />}
          title="Sin reseñas todavía"
          hint="Se le pregunta al cliente la siguiente vez que pide, y solo a quien tiene cuenta en la app."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`rounded-[18px] border bg-white p-4 ${
                r.rating <= 2 ? 'border-danger/40' : 'border-border'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Estrellas nota={r.rating} />
                  <span className="font-semibold text-[14px] text-ink">
                    {r.businesses?.name ?? 'Restaurante'}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-ink-subtle">
                  #{r.orders?.short_id ?? '????????'} ·{' '}
                  {cuando(r.orders?.delivered_at ?? r.created_at)}
                </span>
              </div>

              {/* El comentario es lo único que no está en ningún otro sitio. */}
              {r.comment && (
                <p className="mt-2.5 border-ink/10 border-l-2 pl-3 text-[14px] text-ink leading-relaxed">
                  {r.comment}
                </p>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {r.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-ink/[0.06] px-1.5 py-0.5 text-[11px] text-ink-muted"
                  >
                    {etiquetas.get(t) ?? t}
                  </span>
                ))}
              </div>

              {/* Quién atendió y a quién. El admin SÍ puede llamar — es la
                  capacidad que al negocio se le niega a propósito. */}
              <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-subtle">
                {r.orders?.customer_name && <span>Cliente: {r.orders.customer_name}</span>}
                {r.orders?.customer_phone && (
                  <a href={`tel:${r.orders.customer_phone}`} className="hover:text-ink">
                    {r.orders.customer_phone}
                  </a>
                )}
                {r.drivers?.full_name && <span>Motorizado: {r.drivers.full_name}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
