import type { CanvasConfig, PlacedPiece } from '../types'
import { pieceBounds, type Bounds } from '../lib/geometry'
import { overlapsAt } from './raster/bitmask'
import type { PieceShape } from './raster/pieceMask'

/**
 * Validacion del layout (Fase 6).
 *
 * El packing automatico siempre produce un layout valido, pero en cuanto el
 * usuario mueve o rota piezas a mano puede romper las reglas. Esta funcion pura
 * revisa el layout y dice QUE pieza tiene QUE problema, para que la UI lo marque
 * en rojo/naranja. No corrige nada: avisa.
 *
 * Tres tipos de problema:
 *   outOfBounds -> la pieza se sale del lienzo (izquierda, derecha o arriba).
 *   overlap     -> dos piezas se pisan de verdad.
 *   tooClose    -> no se pisan, pero no respetan la separacion minima (gap).
 */

/**
 * Tolerancia: 0.01 cm = 0.1 mm. Absorbe el redondeo de las medidas (el packing
 * redondea a 3 decimales y los movimientos manuales a 0.01 cm) para no reportar
 * problemas falsos. A escala de impresion, 0.1 mm no es nada.
 */
const EPS = 0.01

export type IssueKind = 'outOfBounds' | 'overlap' | 'tooClose'

/**
 * Devuelve la forma rasterizada de una pieza, o null si hay que tratarla como
 * un rectangulo (porque todavia no se analizo el diseno, o porque esta rotada
 * un angulo que no es multiplo de 90).
 *
 * Se recibe como funcion y no como un mapa armado para que validateLayout siga
 * siendo pura y no sepa nada de como se cachean las mascaras.
 */
export type ShapeLookup = (piece: PlacedPiece) => PieceShape | null

/** Problemas por pieza: { pieceId -> ['overlap', ...] }. */
export type LayoutIssues = Record<string, IssueKind[]>

/**
 * @param shapeOf opcional. Sin esto, las colisiones se miden entre rectangulos
 *   delimitadores, que es como funciono siempre. Con esto, se miden contra la
 *   forma real: dos piezas pueden encastrar sin que se marque error.
 */
export function validateLayout(
  pieces: PlacedPiece[],
  config: CanvasConfig,
  shapeOf?: ShapeLookup,
): LayoutIssues {
  // Juntamos los problemas en Sets para no repetir el mismo tipo por pieza.
  const found = new Map<string, Set<IssueKind>>()
  const add = (pieceId: string, kind: IssueKind) => {
    const set = found.get(pieceId) ?? new Set<IssueKind>()
    set.add(kind)
    found.set(pieceId, set)
  }

  // Trabajamos con el espacio que cada pieza OCUPA (su bounding box), no con su
  // tamano propio: una pieza rotada ocupa mas que su ancho y alto.
  //
  // Para angulos que no son multiplos de 90 el bounding box es mas grande que
  // la pieza real, asi que la validacion queda CONSERVADORA: puede avisar que
  // dos piezas en diagonal estan muy juntas cuando todavia entrarian. Preferimos
  // avisar de mas antes que dejar pasar un solape; comparar rectangulos rotados
  // de verdad es bastante mas codigo y para el MVP no hace falta.
  const boxes: Boxed[] = pieces.map((piece) => ({
    id: piece.id,
    piece,
    bounds: pieceBounds(piece),
  }))

  // 1. Fuera de limites. El alto del lienzo es variable, asi que abajo no hay
  //    tope: solo controlamos los bordes izquierdo, derecho y superior.
  for (const { id, bounds } of boxes) {
    const seSale =
      bounds.xCm < -EPS ||
      bounds.yCm < -EPS ||
      bounds.xCm + bounds.widthCm > config.widthCm + EPS
    if (seSale) add(id, 'outOfBounds')
  }

  // 2. Solapamiento y separacion minima, comparando cada par una sola vez.
  const half = config.gapCm / 2
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]

      // NIVEL 1: descarte barato. Si ni siquiera los rectangulos inflados se
      // tocan, no hay nada que mirar. La mayoria de los pares muere aca.
      if (!rectsOverlap(a.bounds, b.bounds, half)) continue

      // NIVEL 2: ahora si, contra la forma real (si la tenemos).
      const kind = compare(a, b, shapeOf, config.cellCm)
      if (kind) {
        add(a.id, kind)
        add(b.id, kind)
      }
    }
  }

  const issues: LayoutIssues = {}
  for (const [pieceId, set] of found) issues[pieceId] = [...set]
  return issues
}

/**
 * Se solapan dos rectangulos, cada uno inflado `margin` cm por lado? Tocarse en
 * el borde no cuenta como solape (de ahi el EPS).
 */
function rectsOverlap(a: Bounds, b: Bounds, margin: number): boolean {
  const ax1 = a.xCm - margin
  const ay1 = a.yCm - margin
  const ax2 = a.xCm + a.widthCm + margin
  const ay2 = a.yCm + a.heightCm + margin

  const bx1 = b.xCm - margin
  const by1 = b.yCm - margin
  const bx2 = b.xCm + b.widthCm + margin
  const by2 = b.yCm + b.heightCm + margin

  return ax1 < bx2 - EPS && bx1 < ax2 - EPS && ay1 < by2 - EPS && by1 < ay2 - EPS
}

/** Cuenta total de piezas con al menos un problema. */
export function countPiecesWithIssues(issues: LayoutIssues): number {
  return Object.keys(issues).length
}

/** Una pieza con su rectangulo ya calculado, para no recalcularlo por par. */
interface Boxed {
  id: string
  piece: PlacedPiece
  bounds: Bounds
}

/**
 * Compara dos piezas que YA pasaron el descarte por rectangulo, y dice que
 * problema tienen (o ninguno).
 *
 * Si alguna de las dos no tiene forma rasterizada, se cae al rectangulo: es el
 * comportamiento de siempre y nunca deja pasar un solape, solo avisa de mas.
 */
function compare(
  a: Boxed,
  b: Boxed,
  shapeOf: ShapeLookup | undefined,
  cellCm: number,
): IssueKind | null {
  const shapeA = shapeOf?.(a.piece) ?? null
  const shapeB = shapeOf?.(b.piece) ?? null

  if (!shapeA || !shapeB) {
    if (rectsOverlap(a.bounds, b.bounds, 0)) return 'overlap'
    return 'tooClose'
  }

  // Posicion de cada mascara en la grilla del lienzo. La mascara cruda arranca
  // justo en la esquina del rectangulo; la dilatada, `padding` celdas antes.
  const colA = Math.round(a.bounds.xCm / cellCm)
  const rowA = Math.round(a.bounds.yCm / cellCm)
  const colB = Math.round(b.bounds.xCm / cellCm)
  const rowB = Math.round(b.bounds.yCm / cellCm)

  if (overlapsAt(shapeA.raw.bits, shapeB.raw.bits, colB - colA, rowB - rowA)) {
    return 'overlap'
  }

  const dilatedColA = colA - shapeA.dilated.padding
  const dilatedRowA = rowA - shapeA.dilated.padding
  const dilatedColB = colB - shapeB.dilated.padding
  const dilatedRowB = rowB - shapeB.dilated.padding

  if (
    overlapsAt(
      shapeA.dilated.bits,
      shapeB.dilated.bits,
      dilatedColB - dilatedColA,
      dilatedRowB - dilatedRowA,
    )
  ) {
    return 'tooClose'
  }

  // Las formas no se tocan: aunque sus rectangulos se crucen, esto esta bien.
  // Es justo lo que permite encastrar una pieza en la escotadura de otra.
  return null
}
