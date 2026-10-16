import type Konva from 'konva'
import { Circle, Group, Line, Rect, Text } from 'react-konva'
import type { Bounds } from '../../lib/geometry'

/**
 * Marco de la seleccion y tirador para rotar arrastrando el mouse.
 *
 * Es solo visual: recibe el rectangulo que encierra la seleccion y reenvia los
 * eventos del tirador. La matematica del angulo la hace CanvasStage, que es
 * quien conoce el zoom y el paneo.
 *
 * SOBRE LOS TAMANOS: la Layer esta escalada en `scale` pixeles por cm, asi que
 * todo lo que dibujamos aca se mediria en cm y crecería/encogería con el zoom.
 * Como el tirador tiene que medir siempre lo mismo en pantalla, dividimos los
 * tamanos en px por `scale` para pasarlos a cm.
 */

const COLOR_BRAND = '#1f7a63'

/** Medidas del tirador, en pixeles de pantalla. */
const HANDLE_RADIUS_PX = 6
const HANDLE_DISTANCE_PX = 26
const LABEL_WIDTH_PX = 44
const LABEL_HEIGHT_PX = 18
const LABEL_FONT_PX = 11

interface SelectionOverlayProps {
  bounds: Bounds
  /** Pixeles por cm (el zoom actual). */
  scale: number
  /** Texto del angulo a mostrar mientras se rota, o null si no se esta rotando. */
  rotationLabel: string | null
  onRotateStart: (e: Konva.KonvaEventObject<DragEvent>) => void
  onRotateMove: (e: Konva.KonvaEventObject<DragEvent>) => void
  onRotateEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
}

export default function SelectionOverlay({
  bounds,
  scale,
  rotationLabel,
  onRotateStart,
  onRotateMove,
  onRotateEnd,
}: SelectionOverlayProps) {
  const px = (value: number) => value / scale // px de pantalla -> cm

  const centerX = bounds.xCm + bounds.widthCm / 2
  const handleY = bounds.yCm - px(HANDLE_DISTANCE_PX)
  const rotating = rotationLabel !== null

  return (
    <Group>
      {/* Marco de la seleccion */}
      <Rect
        x={bounds.xCm}
        y={bounds.yCm}
        width={bounds.widthCm}
        height={bounds.heightCm}
        stroke={COLOR_BRAND}
        strokeWidth={1}
        strokeScaleEnabled={false}
        dash={[4, 3]}
        fillEnabled={false}
        listening={false}
      />

      {/* Vara que une el marco con el tirador */}
      <Line
        points={[centerX, bounds.yCm, centerX, handleY]}
        stroke={COLOR_BRAND}
        strokeWidth={1}
        strokeScaleEnabled={false}
        listening={false}
      />

      {/* Tirador: arrastralo para rotar. Es draggable para que Konva maneje el
          arrastre (y no dispare el paneo del lienzo); su posicion real no nos
          importa, el angulo se calcula desde el puntero. */}
      <Circle
        x={centerX}
        y={handleY}
        radius={px(HANDLE_RADIUS_PX)}
        fill="#ffffff"
        stroke={COLOR_BRAND}
        strokeWidth={2}
        strokeScaleEnabled={false}
        draggable
        onDragStart={onRotateStart}
        onDragMove={onRotateMove}
        onDragEnd={(e) => {
          // El tirador no queda donde lo soltaste: su lugar lo define el marco.
          e.target.position({ x: centerX, y: handleY })
          onRotateEnd(e)
        }}
        onMouseEnter={(e) => setCursor(e, 'grab')}
        onMouseLeave={(e) => setCursor(e, 'grab')}
      />

      {/* Angulo en vivo mientras se rota */}
      {rotating && (
        <Group listening={false}>
          <Rect
            x={centerX - px(LABEL_WIDTH_PX) / 2}
            y={handleY - px(HANDLE_DISTANCE_PX)}
            width={px(LABEL_WIDTH_PX)}
            height={px(LABEL_HEIGHT_PX)}
            fill={COLOR_BRAND}
            cornerRadius={px(4)}
          />
          <Text
            x={centerX - px(LABEL_WIDTH_PX) / 2}
            y={handleY - px(HANDLE_DISTANCE_PX) + px(4)}
            width={px(LABEL_WIDTH_PX)}
            align="center"
            text={rotationLabel}
            fontSize={px(LABEL_FONT_PX)}
            fontFamily="JetBrains Mono, monospace"
            fill="#ffffff"
          />
        </Group>
      )}
    </Group>
  )
}

function setCursor(e: Konva.KonvaEventObject<MouseEvent>, cursor: string) {
  const container = e.target.getStage()?.container()
  if (container) container.style.cursor = cursor
}
