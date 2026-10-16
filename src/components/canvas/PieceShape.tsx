import type Konva from 'konva'
import { Group, Rect, Image as KonvaImage } from 'react-konva'
import type { PlacedPiece } from '../../types'
import type { IssueKind } from '../../packing/validate'
import { contentDrawRect, normalizeAngle, pieceCenter } from '../../lib/geometry'
import type { ContentFraction } from '../../types'

/**
 * Dibuja una pieza posicionada: su imagen (rotada el angulo que tenga), un
 * borde que comunica su estado y, si esta seleccionada, un resaltado.
 *
 * Todo se dibuja en cm; la Layer de Konva aplica la escala cm->px (ver
 * CanvasStage), asi que aca usamos directamente las medidas de dominio.
 *
 * SOBRE LA ROTACION
 * -----------------
 * El Group se posiciona en el CENTRO de la pieza y se le da un `offset` de medio
 * ancho y medio alto. Eso hace dos cosas de una: los hijos se pueden dibujar en
 * coordenadas locales (0,0)-(ancho,alto) como si nada, y la rotacion de Konva
 * gira alrededor del centro, que es exactamente el modelo que guardamos en el
 * estado. Asi cualquier angulo funciona igual, sin casos especiales.
 */

// Colores del tema (ver src/index.css). Konva no entiende clases de Tailwind,
// necesita valores concretos.
const COLOR_BRAND = '#1f7a63'
const COLOR_INVALID = '#dc2626'
const COLOR_WARN = '#d97706'
const COLOR_PLACEHOLDER = '#dfe3e8'

interface PieceShapeProps {
  piece: PlacedPiece
  image?: HTMLImageElement
  selected: boolean
  issues: IssueKind[]
  /**
   * Grados a sumar SOLO para dibujar, mientras se rota con el tirador. No esta
   * en el estado todavia: se confirma al soltar el mouse, para que rotar sea un
   * unico paso de deshacer en vez de uno por cada movimiento del mouse.
   */
  rotationPreviewDelta?: number
  /**
   * Que parte del archivo ocupa el dibujo visible. Si el PNG trae margen
   * transparente (o se le quito el fondo), el dibujo NO llena la imagen, y hay
   * que escalarla y correrla para que el dibujo calce justo en el rectangulo
   * de la pieza. Sin esto, se ve mas chico de lo que mide y la validacion por
   * forma no coincide con lo que se ve.
   */
  contentFraction?: ContentFraction
  /** Se llama con `additive` en true cuando el click fue con Ctrl/Cmd. */
  onSelect: (additive: boolean) => void
  /** Desplazamiento en cm respecto de donde estaba la pieza. */
  onDragEnd: (dxCm: number, dyCm: number) => void
}

export default function PieceShape({
  piece,
  image,
  selected,
  issues,
  rotationPreviewDelta = 0,
  contentFraction,
  onSelect,
  onDragEnd,
}: PieceShapeProps) {
  // Solaparse o salirse del lienzo es un error (rojo); estar demasiado junto es
  // un aviso (naranja): el trabajo igual se puede imprimir, pero sin el margen
  // de seguridad pedido.
  const hasError = issues.includes('overlap') || issues.includes('outOfBounds')
  const hasWarning = issues.includes('tooClose')

  const strokeColor = hasError ? COLOR_INVALID : hasWarning ? COLOR_WARN : COLOR_BRAND
  const strokeWidth = selected ? 2.5 : hasError || hasWarning ? 2 : 1

  const center = pieceCenter(piece)

  // Donde dibujar la imagen para que el contenido calce en el rectangulo de la
  // pieza. Es la MISMA funcion que usa la exportacion, para que el PNG salga
  // igual a lo que se ve.
  const draw = contentDrawRect(piece.widthCm, piece.heightCm, contentFraction)

  /** Cambia el cursor para que se note que la pieza se puede arrastrar. */
  function setCursor(e: Konva.KonvaEventObject<MouseEvent>, cursor: string) {
    const container = e.target.getStage()?.container()
    if (container) container.style.cursor = cursor
  }

  /** Ctrl (o Cmd en Mac) agrega/quita de la seleccion en vez de reemplazarla. */
  function handlePointerDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const evt = e.evt as MouseEvent
    onSelect(Boolean(evt.ctrlKey || evt.metaKey))
  }

  return (
    <Group
      x={center.xCm}
      y={center.yCm}
      offsetX={piece.widthCm / 2}
      offsetY={piece.heightCm / 2}
      rotation={normalizeAngle(piece.rotation + rotationPreviewDelta)}
      draggable
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
      // El drag informa cuanto se movio, no la posicion final: asi se pueden
      // arrastrar varias piezas seleccionadas juntas aplicando el mismo delta.
      onDragEnd={(e) => onDragEnd(e.target.x() - center.xCm, e.target.y() - center.yCm)}
      onMouseEnter={(e) => setCursor(e, 'move')}
      onMouseLeave={(e) => setCursor(e, 'grab')}
    >
      {image ? (
        <KonvaImage
          image={image}
          x={draw.xCm}
          y={draw.yCm}
          width={draw.widthCm}
          height={draw.heightCm}
          listening={false}
        />
      ) : (
        // Placeholder mientras la imagen carga.
        <Rect
          width={piece.widthCm}
          height={piece.heightCm}
          fill={COLOR_PLACEHOLDER}
          listening={false}
        />
      )}

      {/* Resaltado de seleccion: un velo del color de marca sobre la pieza. */}
      {selected && (
        <Rect
          width={piece.widthCm}
          height={piece.heightCm}
          fill={COLOR_BRAND}
          opacity={0.18}
          listening={false}
        />
      )}

      {/* Borde de la pieza. strokeScaleEnabled=false lo mantiene fino a
          cualquier nivel de zoom, en vez de engordar al acercar. */}
      <Rect
        width={piece.widthCm}
        height={piece.heightCm}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeScaleEnabled={false}
        dash={hasWarning && !selected ? [6, 4] : undefined}
        fillEnabled={false}
        listening={false}
      />

      {/* Zona transparente que recibe los clicks y el arrastre en TODA la pieza,
          incluso donde el PNG no tiene nada dibujado. */}
      <Rect width={piece.widthCm} height={piece.heightCm} fill="transparent" />
    </Group>
  )
}
