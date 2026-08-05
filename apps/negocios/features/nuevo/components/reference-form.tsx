'use client'

export function ReferenceForm({
  reference,
  onChange,
  isValid,
}: {
  reference: string
  onChange: (v: string) => void
  isValid: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
          Dirección o referencia
        </span>
        <span className="font-mono text-[11px] text-ink-muted">{reference.length}/500</span>
      </div>
      <textarea
        className="min-h-[80px] w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] leading-relaxed text-ink outline-none focus:border-brand"
        maxLength={500}
        value={reference}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Jr. San Martín 245 — Casa azul, al lado de la bodega Lucy"
      />
      {!isValid && reference.trim().length > 0 && (
        <p className="mt-1 text-[11px] text-danger">
          La referencia debe tener al menos 5 caracteres.
        </p>
      )}
      <p className="mt-1 text-[11px] text-ink-muted">
        El motorizado verá este texto en su app al recoger el pedido.
      </p>
    </div>
  )
}
