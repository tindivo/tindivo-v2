'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode, useState } from 'react'
import { NAV } from '@/lib/nav'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { AlertsBell } from './admin/alerts-bell'
import { Ico } from './admin/icons'

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-brand text-white shadow-glow-brand">
        <Ico.dashboard className="h-5 w-5" />
      </span>
      <div className="leading-none">
        <p className="t-display text-[18px] text-ink">Tindivo</p>
        <p className="t-eyebrow mt-1 !text-[9px]">Sala de control</p>
      </div>
    </div>
  )
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((it) => {
        const active = isActive(pathname, it.href)
        const Icon = it.icon
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-[14px] transition-colors ${
              active
                ? 'bg-brand-light font-semibold text-brand-dark shadow-glow-brand'
                : 'text-ink-muted hover:bg-ink/[0.04] hover:text-ink'
            }`}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {it.label}
          </Link>
        )
      })}
    </nav>
  )
}

function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => getSupabaseBrowser().auth.signOut()}
      className="mt-2 flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-[14px] text-ink-muted transition-colors hover:bg-ink/[0.04] hover:text-ink"
    >
      <Ico.logout className="h-[18px] w-[18px]" />
      Cerrar sesión
    </button>
  )
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [drawer, setDrawer] = useState(false)

  return (
    <div className="lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-border border-r bg-card p-4 lg:flex">
        <div className="px-2 py-2">
          <Brand />
        </div>
        <div className="t-scroll mt-5 flex-1 overflow-y-auto">
          <NavLinks pathname={pathname} />
        </div>
        <SignOutButton />
      </aside>

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar (móvil) */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-border border-b bg-surface/90 px-4 py-3 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="grid h-9 w-9 place-items-center rounded-xl bg-ink/[0.06] text-ink"
            aria-label="Menú"
          >
            <Ico.menu className="h-5 w-5" />
          </button>
          <Brand />
          <AlertsBell />
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      {/* Drawer (móvil) */}
      {drawer && (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop que cierra al click fuera
        <div
          className="t-modal-backdrop !items-stretch !justify-start lg:hidden"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawer(false)
          }}
        >
          <div className="t-drawer flex h-full w-72 max-w-[80%] flex-col bg-card p-4">
            <div className="flex items-center justify-between px-2 py-1">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-ink/[0.06]"
                aria-label="Cerrar"
              >
                <Ico.close className="h-5 w-5" />
              </button>
            </div>
            <div className="t-scroll mt-4 flex-1 overflow-y-auto">
              <NavLinks pathname={pathname} onNavigate={() => setDrawer(false)} />
            </div>
            <SignOutButton />
          </div>
        </div>
      )}
    </div>
  )
}
