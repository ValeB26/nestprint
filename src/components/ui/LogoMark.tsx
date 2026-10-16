/** Marca: cuadrado con piezas anidadas, guiño al nesting. */
export default function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1" y="1" width="20" height="20" rx="4" fill="var(--color-brand)" />
      <rect x="4" y="4" width="8" height="10" rx="1.5" fill="white" opacity="0.9" />
      <rect x="13" y="4" width="5" height="5" rx="1.5" fill="white" opacity="0.6" />
      <rect x="13" y="10" width="5" height="4" rx="1.5" fill="white" opacity="0.6" />
      <rect x="4" y="15" width="14" height="3" rx="1.5" fill="white" opacity="0.6" />
    </svg>
  )
}
