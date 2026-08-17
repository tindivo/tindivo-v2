import { HomeShell } from '@/features/catalog/components/home-shell'
import type { CatalogUser, PublicBusiness } from '@/features/catalog/types'
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo'
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

/**
 * Quién es Tindivo y dónde opera, en el formato que Google entiende.
 * `areaServed` importa más de lo que parece: acota la marca a San Jacinto en
 * vez de dejar que compita con delivery de todo el Perú.
 */
function siteJsonLd(): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': absoluteUrl('/'),
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/icon-512x512.png'),
    areaServed: {
      '@type': 'City',
      name: 'San Jacinto',
      containedInPlace: { '@type': 'AdministrativeArea', name: 'Áncash, Perú' },
    },
  })
}

export default async function Home() {
  const [initialBusinesses, serverUser] = await Promise.all([
    fetchInitialBusinesses(),
    getServerUser(),
  ])
  return (
    <>
      {/* JSON-LD serializado con JSON.stringify, no HTML de usuario. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: siteJsonLd() }} />
      <HomeShell initialBusinesses={initialBusinesses} initialUser={buildInitialUser(serverUser)} />
    </>
  )
}
