interface MobileSectionTitleProps {
  children: React.ReactNode
}

export function MobileSectionTitle({ children }: MobileSectionTitleProps) {
  return (
    <h4 className="mt-5 mb-2 px-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
      {children}
    </h4>
  )
}
