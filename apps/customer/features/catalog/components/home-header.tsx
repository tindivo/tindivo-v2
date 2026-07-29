import Link from 'next/link'
import { AddressBar } from '@/components/address-bar'
import { CartButton } from '@/components/cart-sheet'
import { Icon } from '@/components/ui'
import { firstName } from '@/features/catalog/lib/format'
import type { CatalogUser } from '@/features/catalog/types'
import { useOnboarding } from '@/lib/onboarding-store'

interface HomeHeaderProps {
  user: CatalogUser
}

export function HomeHeader({ user }: HomeHeaderProps) {
  const name = firstName(user.name)

  return (
    <header className="t-glass sticky top-0 z-30 flex items-center justify-between gap-3 px-4 pt-3 pb-3">
      <Link
        href="/"
        className="t-display shrink-0 text-[24px] leading-none tracking-tight text-brand-dark"
        aria-label="Tindivo"
      >
        Tindivo
      </Link>

      <div className="min-w-0 flex-1 px-2">
        <AddressBar />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <CartButton />
        {user.signedIn ? (
          <Link
            href="/cuenta"
            className="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-brand font-bold text-[13px] text-white shadow-glow-brand"
            aria-label="Mi cuenta"
          >
            {name[0]?.toUpperCase() ?? 'U'}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => useOnboarding.getState().openSheet({ next: null })}
            className="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-ink/[0.06] font-bold text-[14px] text-ink transition-colors hover:bg-ink/[0.10]"
            aria-label="Ingresar"
          >
            <Icon name="person" size={20} />
          </button>
        )}
      </div>
    </header>
  )
}
