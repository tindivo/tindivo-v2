import { HomeShell } from '@/features/catalog/components/home-shell'
import type { CatalogUser, PublicBusiness } from '@/features/catalog/types'
import { getServerUser } from '@/lib/supabase/server'

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

function buildInitialUser(
  serverUser: Awaited<ReturnType<typeof getServerUser>>,
): CatalogUser | null {
  if (!serverUser) return null
  return {
    signedIn: true,
    name: serverUser.fullName ?? serverUser.email ?? '',
    userId: serverUser.id,
  }
}

export default async function Home() {
  const [initialBusinesses, serverUser] = await Promise.all([
    fetchInitialBusinesses(),
    getServerUser(),
  ])
  return (
    <HomeShell initialBusinesses={initialBusinesses} initialUser={buildInitialUser(serverUser)} />
  )
}
