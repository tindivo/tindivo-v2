import type { ComponentType, SVGProps } from 'react'
import { Ico } from '@/components/admin/icons'

export interface NavItem {
  href: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  countEndpoint?: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operaciones',
    items: [
      { href: '/', label: 'Dashboard', icon: Ico.dashboard },
      { href: '/orders', label: 'Pedidos', icon: Ico.orders },
      { href: '/metricas', label: 'Métricas', icon: Ico.metrics },
    ],
  },
  {
    title: 'Casos',
    items: [
      {
        href: '/apelaciones',
        label: 'Apelaciones',
        icon: Ico.shield,
        countEndpoint: '/admin/appeals?appeal_status=pending&per_page=1',
      },
      { href: '/casos', label: 'Casos', icon: Ico.reports },
    ],
  },
  {
    title: 'Finanzas',
    items: [
      { href: '/efectivo', label: 'Efectivo', icon: Ico.cash },
      { href: '/contingencia', label: 'Contingencia', icon: Ico.shield },
      { href: '/cobros', label: 'Cobros', icon: Ico.wallet },
    ],
  },
  {
    title: 'Gestión',
    items: [
      { href: '/negocios', label: 'Negocios', icon: Ico.store },
      { href: '/motorizados', label: 'Motorizados', icon: Ico.truck },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { href: '/strikes', label: 'Strikes', icon: Ico.shield },
      { href: '/auditoria', label: 'Auditoría', icon: Ico.audit },
      { href: '/configuracion', label: 'Configuración', icon: Ico.config },
    ],
  },
]

/** Array plano para compatibilidad con código que itere NAV directamente */
export const NAV: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items)
