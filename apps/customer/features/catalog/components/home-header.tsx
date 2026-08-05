import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { AddressBar } from '@/components/address-bar'
import { CartButton } from '@/components/cart-sheet'
import { firstName } from '@/features/catalog/lib/format'
import type { CatalogUser } from '@/features/catalog/types'
import { useOnboarding } from '@/lib/onboarding-store'

interface HomeHeaderProps {
  user: CatalogUser
}

export function HomeHeader({ user }: HomeHeaderProps) {
  const name = firstName(user.name)

  return (
    <header className="sticky top-0 z-30 w-full border-b border-ink/[0.04] bg-surface px-5 pt-3 pb-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="shrink-0 font-display text-[24px] font-bold leading-none tracking-tight text-brand-dark"
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
              className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-brand font-bold text-[13px] text-white shadow-glow-brand"
              aria-label="Mi cuenta"
            >
              {name[0]?.toUpperCase() ?? 'U'}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => useOnboarding.getState().openSheet({ next: null })}
              className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-ink/[0.06] font-bold text-[14px] text-ink transition-colors hover:bg-ink/[0.10]"
              aria-label="Ingresar"
            >
              <Icon name="person" size={20} />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
