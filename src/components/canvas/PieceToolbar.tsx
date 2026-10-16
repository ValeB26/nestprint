import type { DesignVariant, PlacedPiece } from '../../types'
import NumberInput from '../ui/NumberInput'

/**
 * Barra de acciones de las piezas seleccionadas. Aparece flotando abajo del
 * lienzo y muestra que hay seleccionado junto a las acciones disponibles.
 *
 * Rotacion: los botones 90 y 180 son los atajos del dia a dia (rotan de forma
 * RELATIVA, sumando al angulo actual) y el campo de grados permite cualquier
 * angulo (ABSOLUTO). Con varias piezas seleccionadas, los botones rotan cada
 * una sobre su propio centro y el campo las deja todas en el mismo angulo.
 *
 * Es un componente presentacional: no toca el estado, recibe callbacks. Cada
 * boton indica su atajo de teclado para que el uso repetido sea mas rapido.
 */
interface PieceToolbarProps {
  /** Piezas seleccionadas (al menos una). */
  pieces: PlacedPiece[]
  /** Variante de la pieza, solo cuando hay exactamente una seleccionada. */
  variant: DesignVariant | null
  onRotateBy: (deltaDegrees: number) => void
  onSetRotation: (degrees: number) => void
  onDuplicate: () => void
  onRemove: () => void
}

export default function PieceToolbar({
  pieces,
  variant,
  onRotateBy,
  onSetRotation,
  onDuplicate,
  onRemove,
}: PieceToolbarProps) {
  const single = pieces.length === 1 ? pieces[0] : null

  // Si todas comparten el mismo angulo lo mostramos; si no, el campo arranca
  // en 0 y al confirmarlo las iguala a todas.
  const allSameRotation = pieces.every((p) => p.rotation === pieces[0].rotation)
  const shownRotation = allSameRotation ? pieces[0].rotation : 0

  return (
    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1.5 shadow-lg">
      {/* Que hay seleccionado */}
      <div className="mr-1 flex items-baseline gap-2 pl-1">
        {single && variant ? (
          <>
            <span className="max-w-[140px] truncate text-sm font-medium text-ink" title={variant.name}>
              {variant.name}
            </span>
            <span className="measure text-xs text-muted">
              {single.widthCm} × {single.heightCm} cm
            </span>
          </>
        ) : (
          <span className="text-sm font-medium text-ink">
            {pieces.length} piezas seleccionadas
          </span>
        )}
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Rotacion rapida */}
      <Action label="90°" hint="R" title="Rotar 90 grados" onClick={() => onRotateBy(90)} />
      <Action label="180°" title="Rotar 180 grados" onClick={() => onRotateBy(180)} />

      {/* Angulo libre */}
      <label className="ml-1 flex items-center gap-1.5 text-xs text-muted">
        Ángulo
        <NumberInput
          value={shownRotation}
          onCommit={onSetRotation}
          min={0}
          max={359}
          step={1}
          integer
          className="measure w-16 rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-brand"
          aria-label="Ángulo de rotación en grados"
        />
        °
      </label>

      <div className="mx-1 h-5 w-px bg-border" />

      <Action label="Duplicar" hint="Ctrl+D" onClick={onDuplicate} />
      <Action label="Eliminar" hint="Supr" onClick={onRemove} danger />
    </div>
  )
}

function Action({
  label,
  hint,
  title,
  onClick,
  danger,
}: {
  label: string
  hint?: string
  title?: string
  onClick: () => void
  danger?: boolean
}) {
  const tooltip = [title ?? label, hint ? `(${hint})` : null].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={`h-7 rounded-md px-2 text-sm font-medium transition-colors ${
        danger ? 'text-invalid hover:bg-invalid/10' : 'text-ink hover:bg-panel'
      }`}
    >
      {label}
    </button>
  )
}
