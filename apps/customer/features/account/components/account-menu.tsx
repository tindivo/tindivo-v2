import Link from 'next/link'

interface AccountMenuProps {
  onSignOut: () => void
}

export function AccountMenu({ onSignOut }: AccountMenuProps) {
  return (
    <>
      <div className="mt-6 mb-2">
        <div className="t-display text-[19px]">Cuenta</div>
      </div>
      <div className="overflow-hidden rounded-[18px] border border-border bg-white">
        <Link
          href="/terminos"
          className="flex items-center gap-3 border-b border-border px-4 py-3.5 text-[14px] font-medium"
        >
          📄 <span className="flex-1">Términos y privacidad</span>
          <span className="opacity-40">›</span>
        </Link>
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[14px] font-medium text-[#C2410C]"
        >
          🚪 <span className="flex-1">Cerrar sesión</span>
        </button>
      </div>
    </>
  )
}
