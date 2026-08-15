import { HomeShell } from '@/features/catalog/components/home-shell'
import type { PublicBusiness } from '@/features/catalog/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

async function fetchInitialBusinesses(): Promise<PublicBusiness[] | null> {
  try {
    const res = await fetch(`${API_BASE}/public/businesses`, {
      next: { revalidate: 15 },
    })
    if (!res.ok) return null
    const envelope = (await res.json()) as { data: PublicBusiness[] | null }
    return envelope.data ?? null
  } catch {
    return null
  }
}

export default async function Home() {
  const initialBusinesses = await fetchInitialBusinesses()
  return <HomeShell initialBusinesses={initialBusinesses} />
}
