import { StoreHeader } from '@/features/store/components/store-chrome'

/** Esqueleto con la misma estructura que la página: el layout no salta al cargar. */
export default function StoreLoading() {
  return (
    <>
      <StoreHeader />
      <div className="st-skel" style={{ height: 120, margin: '12px 16px 0', borderRadius: 16 }} />
      <div style={{ padding: '12px 16px 8px' }}>
        <div className="st-skel" style={{ height: 52, borderRadius: 16 }} />
      </div>
      <div className="st-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={`sk${i + 1}`} className="st-pc">
            <div className="st-ph st-skel" />
            <div className="st-pc-body">
              <div className="st-skel" style={{ height: 20, width: '50%' }} />
              <div className="st-skel" style={{ height: 14, width: '85%', marginTop: 8 }} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
