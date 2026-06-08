import type { SVGProps } from 'react'

/**
 * Set de iconos del admin — mismo lenguaje visual que el set del cliente
 * (viewBox 24, stroke 2, currentColor, sin relleno). Server-safe.
 */
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export const Ico = {
  dashboard: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
    </svg>
  ),
  orders: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  ),
  metrics: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M4 4v16h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </svg>
  ),
  reports: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M5 21V4" />
      <path d="M5 4h12l-2 3.5L17 11H5" />
    </svg>
  ),
  cash: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5h.01M18 14.5h.01" />
    </svg>
  ),
  shield: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  wallet: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M3 8a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
      <path d="M16 11.5h3.5v4H16a2 2 0 010-4z" />
    </svg>
  ),
  store: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M4 8h16l-1.5-4h-13L4 8z" />
      <path d="M5 8v12h14V8" />
      <path d="M9 20v-5h6v5" />
    </svg>
  ),
  truck: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M3 7h11v9H3V7zM14 11h4l3 3v2h-7v-5z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  ),
  audit: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 3v1.5h6V3M9 11h4M9 15h6" />
    </svg>
  ),
  config: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
      <circle cx="16" cy="7" r="2.6" />
      <circle cx="8" cy="17" r="2.6" />
    </svg>
  ),
  bell: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M6 9a6 6 0 1112 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" />
      <path d="M10 20a2 2 0 004 0" />
    </svg>
  ),
  menu: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
  close: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  refresh: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M20 11a8 8 0 10-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </svg>
  ),
  logout: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  external: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
    </svg>
  ),
  plus: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  search: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5L21 21" />
    </svg>
  ),
  clock: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  ),
  chevronRight: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p} aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
}
