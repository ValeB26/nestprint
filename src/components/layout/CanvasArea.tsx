import { useEffect, useState } from 'react'
import { useApp } from '../../state/AppContext'
import { useElementSize } from '../../hooks/useElementSize'
import { newId } from '../../lib/id'
import { isDarkColor } from '../../lib/color'
import type { HistoryAction } from '../../state/history'
import CanvasStage from '../canvas/CanvasStage'
import PieceToolbar from '../canvas/PieceToolbar'

/**
 * Area central de trabajo. Sobre un fondo tipo plancha de corte (cutting-mat),
 * muestra el lienzo con las piezas y maneja la EDICION MANUAL.
 *
 * La seleccion vive aca, en estado local, y no en el estado global: es
 * informacion de interfaz (que esta mirando el usuario), no del trabajo. Si
 * estuviera en el estado global entraria al historial de undo/redo y deshacer
 * terminaria moviendo la seleccion en vez de deshacer un cambio real.
 *
 * Se puede seleccionar mas de una pieza con Ctrl+clic (Cmd en Mac). Todas las
 * acciones (rotar, duplicar, eliminar, mover) se aplican a la seleccion
 * completa en UN solo paso, para que deshacer tambien sea un solo paso.
 */

type Dispatch = React.Dispatch<HistoryAction>

/*
 * Las acciones viven fuera del componente y reciben dispatch + ids. Asi no
 * dependen del render y el listener de teclado puede usarlas sin que haya que
 * volver a registrarlo en cada render.
 */
function rotatePieces(dispatch: Dispatch, pieceIds: string[], deltaDegrees: number) {
  dispatch({ type: 'ROTATE_PIECES', pieceIds, deltaDegrees })
}

function setPiecesRotation(dispatch: Dispatch, pieceIds: string[], degrees: number) {
  dispatch({ type: 'SET_PIECES_ROTATION', pieceIds, degrees })
}

function duplicatePieces(dispatch: Dispatch, pieceIds: string[]) {
  dispatch({
    type: 'DUPLICATE_PIECES',
    items: pieceIds.map((pieceId) => ({ pieceId, newId: newId() })),
  })
}

function removePieces(dispatch: Dispatch, pieceIds: string[]) {
  dispatch({ type: 'REMOVE_PIECES', pieceIds })
}

export default function CanvasArea() {
  const { state, dispatch } = useApp()
  const [ref, size] = useElementSize<HTMLDivElement>()
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const { placedPieces, variants } = state
  const hasPieces = placedPieces.length > 0

  // Derivamos las piezas seleccionadas en cada render. Si un id ya no existe
  // (se elimino, o un undo lo saco) simplemente no aparece, sin necesidad de
  // limpiar el estado a mano.
  const selectedPieces = placedPieces.filter((p) => selectedIds.includes(p.id))
  const ids = selectedPieces.map((p) => p.id)
  const selectedVariant =
    selectedPieces.length === 1
      ? variants.find((v) => v.id === selectedPieces[0].variantId) ?? null
      : null

  /** Clic en una pieza. Con Ctrl/Cmd agrega o quita; sin Ctrl, selecciona esa. */
  function selectPiece(pieceId: string, additive: boolean) {
    setSelectedIds((prev) => {
      if (additive) {
        return prev.includes(pieceId) ? prev.filter((id) => id !== pieceId) : [...prev, pieceId]
      }
      // Si la pieza ya estaba seleccionada mantenemos la seleccion tal cual:
      // asi se puede empezar a arrastrar un grupo sin deshacerlo.
      return prev.includes(pieceId) ? prev : [pieceId]
    })
  }

  // Atajos de teclado. Se registran a nivel window para que funcionen sin tener
  // que clickear el canvas primero.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Si el usuario esta escribiendo en un campo, el teclado es suyo.
      const target = e.target as HTMLElement | null
      if (target && (target.closest('input, textarea, select') || target.isContentEditable)) {
        return
      }

      const ctrl = e.ctrlKey || e.metaKey

      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' })
        return
      }
      if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        dispatch({ type: 'REDO' })
        return
      }

      // Las piezas que siguen existiendo de las que estaban seleccionadas.
      const activeIds = placedPieces.filter((p) => selectedIds.includes(p.id)).map((p) => p.id)
      if (activeIds.length === 0) return

      if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicatePieces(dispatch, activeIds)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        removePieces(dispatch, activeIds)
        return
      }
      if (e.key.toLowerCase() === 'r') {
        e.preventDefault()
        // Shift+R rota en sentido contrario.
        rotatePieces(dispatch, activeIds, e.shiftKey ? -90 : 90)
        return
      }
      if (e.key === 'Escape') {
        setSelectedIds([])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dispatch, selectedIds, placedPieces])

  return (
    <main className="relative flex-1 overflow-hidden">
      {/* Fondo cutting-mat con grilla */}
      <div
        className="absolute inset-0 bg-[#13332b]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Contenedor medido: el Stage de Konva se dimensiona a este tamano. */}
      <div ref={ref} className="absolute inset-0">
        {hasPieces ? (
          size.width > 0 && (
            <CanvasStage
              width={size.width}
              height={size.height}
              selectedPieceIds={ids}
              onSelectPiece={selectPiece}
              onClearSelection={() => setSelectedIds([])}
            />
          )
        ) : (
          <EmptyCanvas
            widthCm={state.config.widthCm}
            background={state.config.previewBackground}
          />
        )}
      </div>

      {/* Acciones de las piezas seleccionadas */}
      {selectedPieces.length > 0 && (
        <PieceToolbar
          pieces={selectedPieces}
          variant={selectedVariant}
          onRotateBy={(delta) => rotatePieces(dispatch, ids, delta)}
          onSetRotation={(degrees) => setPiecesRotation(dispatch, ids, degrees)}
          onDuplicate={() => duplicatePieces(dispatch, ids)}
          onRemove={() => removePieces(dispatch, ids)}
        />
      )}
    </main>
  )
}

/**
 * Lienzo vacio, antes de optimizar. Toma el color de fondo elegido para que el
 * cambio se vea al instante, aunque todavia no haya piezas. El texto se adapta
 * al color para que siempre se pueda leer.
 */
function EmptyCanvas({ widthCm, background }: { widthCm: number; background: string }) {
  const dark = isDarkColor(background)
  return (
    <div className="relative flex h-full items-center justify-center p-10">
      <div
        className="flex h-full max-h-[80%] w-[280px] flex-col items-center justify-center rounded-sm shadow-xl ring-1 ring-black/10"
        style={{ background }}
      >
        <p
          className="px-6 text-center text-sm font-medium"
          style={{ color: dark ? '#ffffff' : 'var(--color-ink)' }}
        >
          El lienzo aparece acá
        </p>
        <p
          className="mt-1 px-6 text-center text-xs"
          style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'var(--color-muted)' }}
        >
          Cargá diseños y presioná Optimizar para distribuir las piezas.
        </p>
      </div>

      <span className="measure absolute left-1/2 top-6 -translate-x-1/2 rounded bg-black/40 px-2 py-0.5 text-xs text-white/90">
        {widthCm} cm
      </span>
    </div>
  )
}
