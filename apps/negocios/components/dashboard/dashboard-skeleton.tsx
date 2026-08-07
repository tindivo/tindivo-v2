'use client'

import { Skeleton } from '@tindivo/ui'

export function DashboardSkeleton() {
  return (
    <div className="flex h-dvh bg-surface">
      {/* Desktop sidebar skeleton — mismo ancho/borde/color que Sidebar real */}
      <div className="hidden h-dvh w-[240px] shrink-0 flex-col border-r border-border bg-white px-3.5 py-5 pb-4 lg:flex">
        <div className="flex items-center gap-2.5 px-1.5 pb-[18px]">
          <Skeleton className="h-[38px] w-[38px] rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-2.5 w-20 rounded-md" />
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </nav>
        <div className="flex items-center gap-2.5 border-t border-border px-1.5 py-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 flex-1 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </div>

      {/* Main area */}
      <div className="flex h-dvh min-w-0 flex-1 flex-col">
        {/* Topbar skeleton — mismo fondo/borde/padding que header real */}
        <div className="flex items-center justify-between border-b border-ink/[0.06] bg-white/82 px-3.5 py-3 backdrop-blur-md lg:px-6">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-9 w-9 rounded-[10px] lg:hidden" />
            <Skeleton className="h-5 w-40 rounded-md" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="hidden h-9 w-28 rounded-xl lg:block" />
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="h-9 w-9 rounded-xl" />
          </div>
        </div>

        {/* Content skeleton */}
        <div className="flex-1 overflow-y-auto p-3.5 lg:px-6 lg:py-5">
          <Skeleton className="mb-4 h-8 w-48 rounded-md" />
          <Skeleton className="mb-6 h-32 w-full rounded-2xl" />
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        </div>

        {/* Mobile bottom nav skeleton — misma grid/borde/fondo que BottomNav real */}
        <div className="grid grid-cols-5 border-t border-border bg-white px-1 pb-[max(18px,env(safe-area-inset-bottom))] pt-1.5 lg:hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5 py-1.5">
              <Skeleton className="h-6 w-6 rounded-md" />
              <Skeleton className="h-2 w-10 rounded-sm" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
