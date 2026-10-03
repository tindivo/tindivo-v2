import type { ReactNode } from 'react'
import '@/components/store/store-admin.css'

export default function StoreAdminLayout({ children }: { children: ReactNode }) {
  return <div className="as-wrap">{children}</div>
}
