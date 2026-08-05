'use client'

import { Skeleton } from '@tindivo/ui'

export function DashboardSkeleton() {
  return (
    <div className="flex bg-surface" style={{ height: '100dvh' }}>
      {/* Desktop sidebar skeleton */}
      <div
        className="hidden shrink-0 flex-col border-r border-ink/[0.04] bg-card lg:flex"
        style={{ width: 240 }}
      >
        <div className="flex items-center gap-3 p-4">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex-1 space-y-2 px-3 py-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
        <div className="p-3">
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </div>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col" style={{ height: '100dvh' }}>
        {/* Topbar skeleton */}
        <div className="flex items-center justify-between border-b border-ink/[0.04] bg-surface/80 px-4 py-3 backdrop-blur lg:px-6">
          <Skeleton className="h-6 w-40 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-full" />
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

        {/* Mobile bottom nav skeleton */}
        <div className="flex items-center justify-around border-t border-ink/[0.04] bg-card p-2 pb-5 lg:hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-12 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
