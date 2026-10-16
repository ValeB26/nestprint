import { useEffect, useMemo, useRef, useState } from 'react'
import type Konva from 'konva'
import { Stage, Layer, Rect } from 'react-konva'
import { useApp } from '../../state/AppContext'
import { useDesignImages } from '../../hooks/useDesignImages'
import { layoutHeightCm } from '../../lib/metrics'
import { angleFromTo, normalizeAngle, pieceBounds, unionBounds } from '../../lib/geometry'
import { validateLayout } from '../../packing/validate'
import { useShapeLookup, designContentOf } from '../../hooks/useShapeLookup'
import PieceShape from './PieceShape'
import SelectionOverlay from './SelectionOverlay'

/**
 * Lienzo interactivo con Konva. Dibuja el output del packing (las piezas) sobre
 * una hoja blanca del ancho del lienzo y el alto usado, y permite seleccionarlas
 * y arrastrarlas (Fase 6).
 *
 * ESCALA (cm -> px): la Layer se escala en `view.scale` pixeles por cm. Asi todo
 * lo de adentro se dibuja en cm (las medidas de dominio) y Konva hace la
 * conversion. `view.scale` cambia con el zoom; no afecta las medidas reales.
 *
 * NAVEGACION:
 *   - Zoom con los botones +/- (centrado) y con la rueda (hacia el cursor).
 *   - Paneo arrastrando el fondo (Stage draggable).
 *   - "Fit": al cambiar el tamano del lienzo, encuadramos y centramos solos.
 */
const MIN_SCALE = 0.5 // px por cm
const MAX_SCALE = 400
const FIT_PADDING = 48 // px de aire alrededor del lienzo al encuadrar
/** Con Shift apretado, la rotacion con el tirador va de a pasos de 15 grados. */
const SNAP_DEGREES = 15

interface View {
  scale: number
  x: number
  y: number
}

interface CanvasStageProps {
  width: number
  height: number
  selectedPieceIds: string[]
  /** additive = el click fue con Ctrl/Cmd (agrega o quita de la seleccion). */
  onSelectPiece: (pieceId: string, additive: boolean) => void
  onClearSelection: () => void
}

export default function CanvasStage({
  width,
  height,
  selectedPieceIds,
  onSelectPiece,
  onClearSelection,
}: CanvasStageProps) {
  const { state, dispatch } = useApp()
  const { placedPieces, variants, designs, config } = state

  const images = useDesignImages(designs)
  const variantById = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants])

  // Problemas del layout (solapes, fuera de limites, separacion). Se miden
  // contra la FORMA real de cada diseno, no contra su rectangulo: asi dos
  // piezas pueden encastrar sin que se marque un error que no existe.
  const shapeOf = useShapeLookup()
  const issues = useMemo(
    () => validateLayout(placedPieces, config, shapeOf),
    [placedPieces, config, shapeOf],
  )

  const stageRef = useRef<Konva.Stage>(null)
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })

  // Set para preguntar "esta seleccionada?" sin recorrer el array por pieza.
  const selectedSet = useMemo(() => new Set(selectedPieceIds), [selectedPieceIds])

  // Angulo acumulado mientras se rota con el tirador. Vive solo aca (no en el
  // estado global) para que arrastrar no genere un paso de deshacer por cada
  // movimiento del mouse: se confirma una sola vez al soltar.
  const [rotationDelta, setRotationDelta] = useState<number | null>(null)
  const rotationStartAngle = useRef(0)

  // Que parte del archivo ocupa el dibujo de cada diseno, para dibujarlo
  // alineado al rectangulo de la pieza.
  const fractionByDesign = useMemo(() => {
    const map: Record<string, ReturnType<typeof designContentOf>> = {}
    for (const design of designs) map[design.id] = designContentOf(design)
    return map
  }, [designs])

  const selectedPieces = useMemo(
    () => placedPieces.filter((p) => selectedSet.has(p.id)),
    [placedPieces, selectedSet],
  )

  // Marco que encierra la seleccion. Se calcula con los angulos YA confirmados,
  // asi el tirador se queda quieto mientras arrastras en vez de perseguirte.
  const selectionBounds = useMemo(
    () => unionBounds(selectedPieces.map(pieceBounds)),
    [selectedPieces],
  )

  // Cartel del angulo mientras se rota. Con una sola pieza mostramos el angulo
  // FINAL (es el dato que al usuario le importa); con varias, cuanto giraron,
  // porque cada una parte de un angulo distinto.
  const rotationLabel =
    rotationDelta === null
      ? null
      : selectedPieces.length === 1
        ? `${Math.round(normalizeAngle(selectedPieces[0].rotation + rotationDelta))}°`
        : `${rotationDelta > 0 ? '+' : ''}${Math.round(rotationDelta)}°`

  /** Posicion del puntero en cm (deshace el zoom y el paneo del Stage). */
  function pointerInCm(): { xCm: number; yCm: number } | null {
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return null
    return {
      xCm: (pointer.x - view.x) / view.scale,
      yCm: (pointer.y - view.y) / view.scale,
    }
  }

  /** Centro del marco de la seleccion: es el eje desde el que medimos el angulo. */
  function selectionCenter() {
    if (!selectionBounds) return null
    return {
      xCm: selectionBounds.xCm + selectionBounds.widthCm / 2,
      yCm: selectionBounds.yCm + selectionBounds.heightCm / 2,
    }
  }

  function handleRotateStart() {
    const center = selectionCenter()
    const pointer = pointerInCm()
    if (!center || !pointer) return
    // Guardamos el angulo inicial del puntero para medir cuanto giro despues.
    rotationStartAngle.current = angleFromTo(center, pointer)
    setRotationDelta(0)
  }

  function handleRotateMove(e: Konva.KonvaEventObject<DragEvent>) {
    const center = selectionCenter()
    const pointer = pointerInCm()
    if (!center || !pointer) return
    let delta = angleFromTo(center, pointer) - rotationStartAngle.current
    if (e.evt.shiftKey) delta = Math.round(delta / SNAP_DEGREES) * SNAP_DEGREES
    setRotationDelta(delta)
  }

  function handleRotateEnd() {
    // Un giro de menos de medio grado es un click sin intencion: lo ignoramos
    // para no ensuciar el historial de deshacer.
    if (rotationDelta !== null && Math.abs(rotationDelta) >= 0.5) {
      dispatch({ type: 'ROTATE_PIECES', pieceIds: selectedPieceIds, deltaDegrees: rotationDelta })
    }
    setRotationDelta(null)
  }

  /**
   * Al soltar una pieza movemos TODA la seleccion con el mismo desplazamiento,
   * asi un grupo mantiene su distribucion relativa. Si la pieza arrastrada no
   * estaba seleccionada (no deberia pasar, porque el mousedown la selecciona),
   * movemos solo esa.
   */
  function handlePieceDragEnd(pieceId: string, dxCm: number, dyCm: number) {
    const pieceIds = selectedSet.has(pieceId) ? selectedPieceIds : [pieceId]
    dispatch({ type: 'MOVE_PIECES', pieceIds, dxCm, dyCm })
  }

  const lienzoW = config.widthCm
  const lienzoH = layoutHeightCm(placedPieces)

  // Fondo del lienzo: solo una ayuda visual para ver disenos de tinta blanca.
  // Es un color CSS cualquiera (hex), elegido con las muestras, la paleta o el
  // cuentagotas. El PNG exportado es transparente, no lleva este color.
  const lienzoFill = config.previewBackground

  // Encuadre automatico. Solo re-encuadra cuando cambian las dimensiones del
  // lienzo, no en cada resize ni cada vez que se mueve una pieza: asi no le
  // pisamos el zoom al usuario mientras edita.
  const lastFit = useRef('')
  useEffect(() => {
    if (width === 0 || height === 0 || lienzoH === 0) return
    const key = `${lienzoW}x${lienzoH}`
    if (lastFit.current === key) return
    lastFit.current = key

    const availW = Math.max(width - FIT_PADDING * 2, 10)
    const availH = Math.max(height - FIT_PADDING * 2, 10)
    const scale = Math.min(availW / lienzoW, availH / lienzoH)
    setView({
      scale,
      x: (width - lienzoW * scale) / 2,
      y: (height - lienzoH * scale) / 2,
    })
  }, [lienzoW, lienzoH, width, height])

  const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

  /** Zoom manteniendo fijo un punto de la pantalla (cursor o centro). */
  function zoomAround(focus: { x: number; y: number }, factor: number) {
    setView((v) => {
      const newScale = clamp(v.scale * factor)
      // Punto del lienzo que esta bajo `focus` antes de escalar.
      const point = { x: (focus.x - v.x) / v.scale, y: (focus.y - v.y) / v.scale }
      return {
        scale: newScale,
        x: focus.x - point.x * newScale,
        y: focus.y - point.y * newScale,
      }
    })
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault()
    const stage = stageRef.current
    const pointer = stage?.getPointerPosition()
    if (!pointer) return
    const factor = e.evt.deltaY > 0 ? 1 / 1.08 : 1.08
    zoomAround(pointer, factor)
  }

  /** Clickear el fondo o la hoja vacia deselecciona. */
  function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const clickedEmpty = e.target === e.target.getStage() || e.target.name() === 'lienzo'
    if (clickedEmpty) onClearSelection()
  }

  return (
    <>
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        scaleX={view.scale}
        scaleY={view.scale}
        x={view.x}
        y={view.y}
        draggable
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onTouchStart={handleStageMouseDown}
        onDragEnd={(e) => {
          // Solo nos interesa el arrastre DEL STAGE (paneo). Si lo que se
          // arrastro fue una pieza, su propio onDragEnd ya lo manejo.
          if (e.target === stageRef.current) {
            setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }))
          }
        }}
        style={{ cursor: 'grab' }}
      >
        <Layer>
          {/* Hoja del lienzo: blanca, del ancho fijo y el alto usado. */}
          <Rect
            name="lienzo"
            x={0}
            y={0}
            width={lienzoW}
            height={lienzoH}
            fill={lienzoFill}
            stroke="#c7ccd3"
            strokeWidth={1}
            strokeScaleEnabled={false}
          />

          {/* Piezas */}
          {placedPieces.map((piece) => {
            const variant = variantById.get(piece.variantId)
            if (!variant) return null
            return (
              <PieceShape
                key={piece.id}
                piece={piece}
                image={images[variant.designId]}
                contentFraction={fractionByDesign[variant.designId]?.fraction}
                selected={selectedSet.has(piece.id)}
                issues={issues[piece.id] ?? []}
                rotationPreviewDelta={
                  selectedSet.has(piece.id) ? rotationDelta ?? 0 : 0
                }
                onSelect={(additive) => onSelectPiece(piece.id, additive)}
                onDragEnd={(dxCm, dyCm) => handlePieceDragEnd(piece.id, dxCm, dyCm)}
              />
            )
          })}

          {/* Marco + tirador de rotacion, por encima de las piezas. */}
          {selectionBounds && (
            <SelectionOverlay
              bounds={selectionBounds}
              scale={view.scale}
              rotationLabel={rotationLabel}
              onRotateStart={handleRotateStart}
              onRotateMove={handleRotateMove}
              onRotateEnd={handleRotateEnd}
            />
          )}
        </Layer>
      </Stage>

      {/* Controles de zoom */}
      <div className="absolute bottom-4 right-4 flex flex-col overflow-hidden rounded-md border border-border bg-surface shadow-sm">
        <ZoomButton label="+" title="Acercar" onClick={() => zoomAround({ x: width / 2, y: height / 2 }, 1.2)} />
        <div className="h-px bg-border" />
        <ZoomButton label={'\u2212'} title="Alejar" onClick={() => zoomAround({ x: width / 2, y: height / 2 }, 1 / 1.2)} />
      </div>
    </>
  )
}

function ZoomButton({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center text-base text-muted transition-colors hover:bg-panel"
    >
      {label}
    </button>
  )
}
