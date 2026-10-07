import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { StoreHeader } from '@/features/store/components/store-chrome'

/** Un artículo que no existe, está en borrador u oculto: la misma pantalla para todos. */
export default function StoreNotFound() {
  return (
    <>
      <StoreHeader />
      <div className="st-empty" style={{ marginTop: 24 }}>
        <div className="st-empty-ico">
          <Icon name="search_off" size={28} />
        </div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Este artículo ya no está</h1>
        <p>Puede que se haya vendido o que lo hayan retirado. Mira lo que hay disponible.</p>
        <Link href="/store" className="st-cta">
          Ver la tienda
        </Link>
      </div>
    </>
  )
}
