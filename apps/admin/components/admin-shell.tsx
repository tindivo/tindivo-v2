'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { NAV_SECTIONS } from '@/lib/nav'
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
  const [counts, setCounts] = useState<Record<string, number>>({})

  const loadCounts = useCallback(async () => {
    const itemsWithCounts = NAV_SECTIONS.flatMap((s) => s.items).filter((it) => it.countEndpoint)
    const results = await Promise.allSettled(
      itemsWithCounts.map(async (it) => {
        try {
          const res = await api.get<any>(it.countEndpoint!)
          return { href: it.href, count: res?.data?.total ?? 0 }
        } catch {
          return { href: it.href, count: 0 }
        }
      }),
    )
    const newCounts: Record<string, number> = {}
    for (const r of results) {
      if (r.status === 'fulfilled') {
        newCounts[r.value.href] = r.value.count
      }
    }
    setCounts(newCounts)
  }, [])

  useEffect(() => {
    loadCounts()
    const interval = setInterval(loadCounts, 30000)
    return () => clearInterval(interval)
  }, [loadCounts])

  return (
    <nav className="flex flex-col gap-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          <div className="px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-subtle/60">
            {section.title}
          </div>
          {section.items.map((it) => {
            const active = isActive(pathname, it.href)
            const Icon = it.icon
            const count = counts[it.href] ?? 0
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
                <span className="flex-1">{it.label}</span>
                {count > 0 && (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                    {count}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      ))}
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
