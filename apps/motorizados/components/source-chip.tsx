/** Badge Manual/Online del pedido (origen del pedido). */
export function SourceChip({ source }: { source: string }) {
  const online = source === 'customer_pwa'
  return (
    <span
      className="rounded-md px-2 py-0.5 font-bold font-mono text-[10px] uppercase"
      style={
        online
          ? { letterSpacing: '0.08em', background: 'rgba(249,115,22,0.1)', color: '#C2410C' }
          : { letterSpacing: '0.08em', background: 'rgba(14,165,233,0.12)', color: '#0369A1' }
      }
    >
      {online ? 'Online' : 'Manual'}
    </span>
  )
}
