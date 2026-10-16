import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Panel flotante que cuelga de un boton.
 *
 * Se usa para los ajustes del trabajo: cosas que se tocan una vez y despues no
 * se miran mas, y que no justifican ocupar espacio permanente en pantalla.
 *
 * Se cierra al clickear afuera o con Escape, que es lo que cualquiera espera.
 * Escuchamos `pointerdown` y no `click` para que cierre apenas se aprieta, sin
 * esperar a que se suelte el boton.
 */
interface PopoverProps {
  label: string
  title?: string
  children: ReactNode
}

export default function Popover({ label, title, children }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      const container = containerRef.current
      if (container && !container.contains(event.target as Node)) setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={title}
        className={`flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors ${
          open
            ? 'border-brand bg-brand/10 text-brand'
            : 'border-border bg-surface text-ink hover:bg-panel'
        }`}
      >
        <GearIcon />
        {label}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 rounded-lg border border-border bg-surface shadow-xl">
          {children}
        </div>
      )}
    </div>
  )
}

function GearIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </svg>
  )
}
