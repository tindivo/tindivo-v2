import type { Metadata } from 'next'
import { StoreShell } from '@/features/store/components/store-shell'
import { fetchStoreList } from '@/features/store/lib/api'
import type { StoreUrlFilters } from '@/features/store/types'
import { SITE_NAME } from '@/lib/seo'

const TITLE = `Tindivo Store — Nuevo y de segunda en San Jacinto`
const DESCRIPTION =
  'Ropa, calzado, perfumes y más, nuevo y de segunda, en San Jacinto. Pide por WhatsApp, te lo llevamos y pagas al recibir.'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<Metadata> {
  const sp = await searchParams
  // Una búsqueda o un filtro no es una página nueva: canónica a /store para no
  // repartir el SEO entre infinitas combinaciones, y sin indexar la variante.
  const filtered = ['q', 'categoria', 'condicion', 'orden'].some((k) => sp[k])
  return {
    title: 'Tindivo Store',
    description: DESCRIPTION,
    alternates: { canonical: '/store' },
    robots: filtered ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: '/store',
      title: TITLE,
      description: DESCRIPTION,
    },
    twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  }
}

const first = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? '') : (v ?? '')

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const filters: StoreUrlFilters = {
    q: first(sp.q).slice(0, 80),
    categoria: first(sp.categoria),
    condicion: ['nuevo', 'segunda'].includes(first(sp.condicion))
      ? (first(sp.condicion) as StoreUrlFilters['condicion'])
      : '',
    orden: ['precio_asc', 'precio_desc'].includes(first(sp.orden))
      ? (first(sp.orden) as StoreUrlFilters['orden'])
      : '',
  }
  const initial = await fetchStoreList(filters)
  return <StoreShell initial={initial} initialFilters={filters} />
}
