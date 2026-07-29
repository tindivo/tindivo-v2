'use client'

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
    <div className="flex items-center justify-between gap-3 px-5 pt-12 pb-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="t-display shrink-0 text-[28px] leading-none">Tindivo</div>
        <div className="min-w-0 flex-1 border-l border-black/10 pl-3">
          <AddressBar />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <CartButton />
        {user.signedIn ? (
          <Link
            href="/cuenta"
            className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-brand font-bold text-[14px] text-white"
            aria-label="Mi cuenta"
          >
            {name[0]?.toUpperCase() ?? 'U'}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => useOnboarding.getState().openSheet({ next: null })}
            className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-black/[0.06] font-bold text-[14px] text-ink"
            aria-label="Ingresar"
          >
            <Icon.Person />
          </button>
        )}
      </div>
    </div>
  )
}
