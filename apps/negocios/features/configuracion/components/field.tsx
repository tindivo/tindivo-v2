interface FieldProps {
  label: string
  helper?: string
  children: React.ReactNode
}

export function Field({ label, helper, children }: FieldProps) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: children siempre contiene un input
    <label className="block">
      <span className="mb-2 block font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
        {label}
      </span>
      {children}
      {helper && <span className="mt-1.5 block text-[12px] text-ink-muted">{helper}</span>}
    </label>
  )
}
