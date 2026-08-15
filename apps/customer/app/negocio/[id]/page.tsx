import Link from 'next/link'
import { NegocioShell } from '@/features/catalog/components/negocio-shell'
import type { BusinessDetail } from '@/features/catalog/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

async function fetchInitialBusiness(id: string): Promise<BusinessDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/public/businesses/${id}`, {
      next: { revalidate: 15 },
    })
    if (!res.ok) return null
    const envelope = (await res.json()) as { data: BusinessDetail | null }
    return envelope.data ?? null
  } catch {
    return null
  }
}

export default async function NegocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const initialData = await fetchInitialBusiness(id)

  if (initialData === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[768px] flex-col items-center justify-center px-4 text-center md:max-w-[860px]">
        <p className="text-ink-muted">Negocio no encontrado o no disponible.</p>
        <Link href="/" className="mt-3 inline-block text-sm font-semibold text-brand underline">
          Volver al inicio
        </Link>
      </main>
    )
  }

  return <NegocioShell id={id} initialData={initialData} />
}
