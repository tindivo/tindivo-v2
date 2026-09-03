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
      { href: '/monitoreo', label: 'Monitoreo Online', icon: Ico.metrics },
      { href: '/metricas', label: 'Métricas', icon: Ico.audit },
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
      { href: '/cobros', label: 'Cobros', icon: Ico.wallet },
    ],
  },
  {
    title: 'Gestión',
    items: [
      { href: '/negocios', label: 'Negocios', icon: Ico.store },
      { href: '/motorizados', label: 'Motorizados', icon: Ico.truck },
      { href: '/agenda', label: 'Agenda', icon: Ico.contacts },
      { href: '/zonas', label: 'Zonas de cobro', icon: Ico.store },
      { href: '/mapa-referencias', label: 'Referencias del mapa', icon: Ico.mapPin },
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
