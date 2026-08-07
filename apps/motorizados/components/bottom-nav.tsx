'use client'

import { type BottomNavItem, BottomNav as BottomNavPattern } from '@tindivo/ui'

export type { BottomNavItem }

export interface BottomNavProps {
  items: BottomNavItem[]
  className?: string
}

/**
 * Navegación inferior del motorizado.
 * Wrapper local sobre el pattern compartido de @tindivo/ui.
 */
export function BottomNav({ items, className }: BottomNavProps) {
  return <BottomNavPattern items={items} variant="pill" className={className} />
}
