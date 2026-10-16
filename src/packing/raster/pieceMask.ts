import { dilate, resample, rotateQuarterTurns, type Mask } from '../../lib/mask'
import { packMask, type BitMask } from './bitmask'

/**
 * Traduce la forma de un diseno a la mascara que usa el packing: en la grilla
 * en centimetros, rotada, dilatada por la separacion y empaquetada en bits.
 *
 * Es la frontera entre el mundo del dominio (cm, gap, rotacion) y el mundo del
 * algoritmo (celdas y bits). Funcion pura: se testea sin navegador.
 */

export interface PieceMaskOptions {
  /** Lado de la celda de la grilla, en cm. Es la perilla precision/velocidad. */
  cellCm: number
  /** Separacion minima entre piezas, en cm. */
  gapCm: number
}

export interface PieceMask {
  /** Mascara YA dilatada, lista para el test de colision. */
  bits: BitMask
  /**
   * Celdas que la dilatacion agrega por cada lado. La pieza visible arranca en
   * (padding, padding) dentro de la mascara: quien la coloque tiene que
   * descontarlo para saber donde cae el dibujo de verdad.
   */
  padding: number
  cellCm: number
}

/** Cuantas celdas mide algo de `cm`, redondeando hacia arriba (nunca de menos). */
function cells(cm: number, cellCm: number): number {
  return Math.max(1, Math.ceil(cm / cellCm))
}

/**
 * Construye la mascara de una pieza.
 *
 * @param content forma del diseno YA recortada a su content box (la huella, no
 *   la tinta: lo que importa es el espacio que ocupa, no lo que se imprime).
 * @param widthCm ancho del contenido en cm, sin rotar.
 * @param heightCm alto del contenido en cm, sin rotar.
 * @param quarterTurns 0, 1, 2 o 3 cuartos de vuelta en sentido horario.
 */
export function buildPieceMask(
  content: Mask,
  widthCm: number,
  heightCm: number,
  quarterTurns: 0 | 1 | 2 | 3,
  options: PieceMaskOptions,
): PieceMask {
  const { cellCm, gapCm } = options

  // 1. A la grilla en cm, en la orientacion propia de la pieza.
  const enCeldas = resample(content, cells(widthCm, cellCm), cells(heightCm, cellCm))

  // 2. Rotar. Con 1 o 3 cuartos quedan intercambiados ancho y alto, que es
  //    justo lo que ocupa la pieza rotada.
  const rotada = rotateQuarterTurns(enCeldas, quarterTurns)

  // 3. Dilatar media separacion. Si las dos piezas de un par estan dilatadas en
  //    gap/2 y no se tocan, entre sus formas reales queda gap o mas.
  const padding = Math.ceil(gapCm / 2 / cellCm)
  const dilatada = dilate(rotada, padding)

  return { bits: packMask(dilatada), padding, cellCm }
}

/** Tamano que ocupa la pieza (sin contar la dilatacion), en celdas. */
export function pieceCells(mask: PieceMask): { cols: number; rows: number } {
  return {
    cols: mask.bits.cols - mask.padding * 2,
    rows: mask.bits.rows - mask.padding * 2,
  }
}

/**
 * Las DOS formas que necesita la validacion de un layout.
 *
 * Por que dos y no una: "pisarse" y "estar demasiado cerca" son problemas
 * distintos y se miden distinto. El solape se mide contra la forma real; la
 * separacion insuficiente, contra la forma inflada media separacion.
 */
export interface PieceShape {
  /** Forma real, sin dilatar (padding 0). Detecta solapes de verdad. */
  raw: PieceMask
  /** Forma dilatada en gap/2. Detecta separacion insuficiente. */
  dilated: PieceMask
}

export function buildPieceShape(
  content: Mask,
  widthCm: number,
  heightCm: number,
  quarterTurns: 0 | 1 | 2 | 3,
  options: PieceMaskOptions,
): PieceShape {
  return {
    raw: buildPieceMask(content, widthCm, heightCm, quarterTurns, {
      cellCm: options.cellCm,
      gapCm: 0,
    }),
    dilated: buildPieceMask(content, widthCm, heightCm, quarterTurns, options),
  }
}

/**
 * Cuartos de vuelta equivalentes a un angulo, o null si no es multiplo de 90.
 *
 * El packing automatico solo genera 0 y 90, pero el usuario puede rotar a mano
 * cualquier angulo. Rotar una mascara un angulo libre obligaria a rasterizarla
 * de nuevo con interpolacion; en vez de eso, quien reciba null vuelve al
 * rectangulo delimitador, que es conservador y ya esta implementado.
 */
export function quarterTurnsOf(rotationDegrees: number): 0 | 1 | 2 | 3 | null {
  const angle = ((rotationDegrees % 360) + 360) % 360
  if (angle % 90 !== 0) return null
  return (angle / 90) as 0 | 1 | 2 | 3
}
