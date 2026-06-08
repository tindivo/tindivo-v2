import type { ComponentType, SVGProps } from 'react'
import { Ico } from '@/components/admin/icons'

export interface NavItem {
  href: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

/** Fuente única de navegación (sidebar desktop + drawer móvil). */
export const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: Ico.dashboard },
  { href: '/orders', label: 'Pedidos', icon: Ico.orders },
  { href: '/metricas', label: 'Métricas', icon: Ico.metrics },
  { href: '/reportes', label: 'Reportes', icon: Ico.reports },
  { href: '/incidentes', label: 'Incidentes', icon: Ico.bell },
  { href: '/strikes', label: 'Strikes', icon: Ico.shield },
  { href: '/claims', label: 'Cobertura', icon: Ico.wallet },
  { href: '/efectivo', label: 'Efectivo', icon: Ico.cash },
  { href: '/contingencia', label: 'Contingencia', icon: Ico.shield },
  { href: '/cobros', label: 'Cobros', icon: Ico.wallet },
  { href: '/negocios', label: 'Negocios', icon: Ico.store },
  { href: '/motorizados', label: 'Motorizados', icon: Ico.truck },
  { href: '/auditoria', label: 'Auditoría', icon: Ico.audit },
  { href: '/configuracion', label: 'Configuración', icon: Ico.config },
]
