export interface ColorDotProps {
  color?: string
  size?: number
  className?: string
}

export function ColorDot({ color = 'ab3500', size = 10, className }: ColorDotProps) {
  const hex = color.startsWith('#') ? color.slice(1) : color
  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: `#${hex}`,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  )
}
