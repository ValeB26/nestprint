import type { CanvasConfig, DesignVariant, PlacedPiece } from '../../types'
import { newId } from '../../lib/id'
import { pieceBounds } from '../../lib/geometry'
import { createMask } from '../../lib/mask'
import { createBitMask, getBit, overlapsAt, setBit, type BitMask } from './bitmask'
import { buildPieceShape, type PieceShape } from './pieceMask'
import type { PackingResult } from '../pack'

/**
 * Packing por FORMA real, sobre una grilla de celdas.
 *
 * COMO FUNCIONA
 * -------------
 * Mantenemos un "perfil" del lienzo: para cada columna, la primera fila libre
 * por debajo de todo lo ya colocado. Para probar una pieza en una columna x
 * alcanza con mirar su perfil superior contra ese perfil del lienzo:
 *
 *   y = max sobre las columnas c de ( perfilLienzo[x+c] - perfilPieza[c] )
 *
 * Ese y es la fila mas alta donde la pieza seguro no choca: todas sus celdas
 * quedan por debajo de todo lo ocupado en su misma columna. Y como el perfil de
 * la pieza sigue su contorno, una forma curva se ACOMODA sobre otra en vez de
 * apoyarse en su rectangulo. Eso es toda la ganancia.
 *
 * Cuesta O(ancho de la pieza) por posicion probada, asi que es muy barato: no
 * hace falta comparar mascara contra mascara ni una sola vez.
 *
 * LAS CUEVAS
 * -----------
 * El perfil solo recuerda la fila mas baja ocupada de cada columna, asi que no
 * ve los huecos que quedan ARRIBA de algo ya colocado: el espacio entre dos
 * discos, el de adentro de una curva. Son reales y grandes.
 *
 * Por eso, ademas del perfil, mantenemos la ocupacion en bits y, cuando colocar
 * una pieza en el lugar que dice el perfil HARIA CRECER el lienzo, buscamos
 * antes un hueco mas arriba. Esa condicion es la clave: buscar siempre seria
 * carisimo, pero solo importa cuando esta en juego el alto final, que es
 * justamente lo que queremos minimizar.
 *
 * La busqueda va de arriba hacia abajo con pasos gruesos y despues afina. No es
 * exhaustiva a proposito: si no encuentra nada, se usa el lugar del perfil, que
 * siempre es valido. Nunca puede dar un layout invalido, solo uno menos bueno.
 *
 * La separacion ya viene adentro de las mascaras (dilatadas en gap/2), asi que
 * aca no hay que volver a sumarla.
 */

/** Devuelve la forma de una variante en una rotacion, o null si no se analizo. */
export type VariantShapeLookup = (
  variantId: string,
  quarterTurns: 0 | 1 | 2 | 3,
) => PieceShape | null

/** Primera y ultima fila ocupada de cada columna. -1 = columna vacia. */
interface ColumnProfile {
  top: Int32Array
  bottom: Int32Array
}

function columnProfile(bits: BitMask): ColumnProfile {
  const top = new Int32Array(bits.cols).fill(-1)
  const bottom = new Int32Array(bits.cols).fill(-1)
  for (let col = 0; col < bits.cols; col++) {
    for (let row = 0; row < bits.rows; row++) {
      if (!getBit(bits, col, row)) continue
      if (top[col] < 0) top[col] = row
      bottom[col] = row
    }
  }
  return { top, bottom }
}

/** Una orientacion posible de una pieza, con su perfil ya calculado. */
interface Candidate {
  turns: 0 | 1 | 2 | 3
  shape: PieceShape
  profile: ColumnProfile
}

interface Placement {
  x: number
  y: number
  candidate: Candidate
}

/**
 * Mejor lugar para una pieza: lo mas arriba posible, y a igualdad de altura, lo
 * mas a la izquierda. Prueba cada orientacion permitida.
 */
function bestPlacement(
  heights: Int32Array,
  cols: number,
  candidates: Candidate[],
): Placement | null {
  let best: Placement | null = null

  for (const candidate of candidates) {
    const mask = candidate.shape.dilated.bits
    const maxX = cols - mask.cols
    if (maxX < 0) continue // ni rotada entra a lo ancho del lienzo

    for (let x = 0; x <= maxX; x++) {
      let y = 0
      for (let c = 0; c < mask.cols; c++) {
        const top = candidate.profile.top[c]
        if (top < 0) continue // columna vacia de la pieza: no apoya en nada
        const needed = heights[x + c] - top
        if (needed > y) y = needed
      }
      if (best === null || y < best.y || (y === best.y && x < best.x)) {
        best = { x, y, candidate }
      }
    }
  }

  return best
}

/** Marca en el perfil del lienzo el lugar que acaba de ocupar una pieza. */
function stamp(heights: Int32Array, placement: Placement): void {
  const { x, y, candidate } = placement
  const { bottom } = candidate.profile
  for (let c = 0; c < bottom.length; c++) {
    if (bottom[c] < 0) continue
    const nuevoFondo = y + bottom[c] + 1
    if (nuevoFondo > heights[x + c]) heights[x + c] = nuevoFondo
  }
}

/** Redondeo a 3 decimales, igual que el packing por rectangulos. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

/**
 * Forma de respaldo cuando un diseno todavia no tiene mascara: un rectangulo
 * macizo. Asi el algoritmo es uno solo y esa pieza se comporta como antes, en
 * vez de quedar sin colocar.
 */
function solidShape(
  widthCm: number,
  heightCm: number,
  turns: 0 | 1 | 2 | 3,
  options: { cellCm: number; gapCm: number },
): PieceShape {
  const solido = createMask(1, 1)
  solido.cells[0] = 1
  return buildPieceShape(solido, widthCm, heightCm, turns, options)
}

/**
 * Variantes de la heuristica. No hay una que gane siempre: en un trabajo mixto
 * gano 'maxSide' buscando siempre, y en otros 'area'. Por eso pack() prueba
 * varias y se queda con la mejor (ver packing/index.ts).
 */
export interface RasterOptions {
  /**
   * Buscar huecos SIEMPRE, no solo cuando la pieza haria crecer el lienzo.
   * Cuesta mas y no siempre conviene: con orden 'height' empeoro el resultado.
   */
  alwaysProbe?: boolean
  maxProbes?: number
  /** Criterio para ordenar las piezas de mayor a menor. */
  order?: 'area' | 'height' | 'maxSide'
  /**
   * En cuantos pasos se divide la pieza al barrer posiciones. MEDIDO: 4 es el
   * punto justo; afinar mas (8, 16) cuesta el doble y empeora, porque agota el
   * presupuesto antes de recorrer el lienzo.
   */
  stepDivisor?: number
}

export function packRaster(
  variants: DesignVariant[],
  config: CanvasConfig,
  shapeOf?: VariantShapeLookup,
  options: RasterOptions = {},
): PackingResult {
  const alwaysProbe = options.alwaysProbe ?? false
  const budget = options.maxProbes ?? MAX_PROBES
  const order = options.order ?? 'area'
  const stepDivisor = options.stepDivisor ?? 4
  const { cellCm, gapCm, widthCm: canvasWidthCm } = config
  const cols = Math.max(1, Math.floor(canvasWidthCm / cellCm))

  // Orientaciones de cada variante, calculadas una sola vez aunque la variante
  // pida muchas copias.
  const candidatesByVariant = new Map<string, Candidate[]>()
  function candidatesFor(variant: DesignVariant): Candidate[] {
    const cached = candidatesByVariant.get(variant.id)
    if (cached) return cached

    const turnsToTry: (0 | 1 | 2 | 3)[] = variant.allowRotation ? [0, 1] : [0]
    const list = turnsToTry.map((turns) => {
      const shape =
        shapeOf?.(variant.id, turns) ??
        solidShape(variant.widthCm, variant.heightCm, turns, { cellCm, gapCm })
      return { turns, shape, profile: columnProfile(shape.dilated.bits) }
    })

    candidatesByVariant.set(variant.id, list)
    return list
  }

  // Expandir variantes a piezas y ordenar de mayor a menor, igual que el
  // packing por rectangulos: las grandes primero, las chicas rellenan.
  const items = variants.flatMap((variant) =>
    Array.from({ length: variant.quantity }, () => variant),
  )
  const peso = (v: DesignVariant) =>
    order === 'height'
      ? v.heightCm
      : order === 'maxSide'
        ? Math.max(v.widthCm, v.heightCm)
        : v.widthCm * v.heightCm
  items.sort((a, b) => peso(b) - peso(a) || b.heightCm - a.heightCm)

  if (items.length === 0) return { pieces: [], usedHeightCm: 0, unplaced: 0 }

  // Perfil del lienzo: primera fila libre de cada columna. Arranca todo en 0.
  const heights = new Int32Array(cols)

  // Ocupacion real, para poder ver las cuevas que el perfil no ve. El alto se
  // acota apilando todo en una columna, que nunca se queda corto.
  const maxRows = items.reduce(
    (sum, v) => sum + Math.ceil((Math.max(v.widthCm, v.heightCm) + gapCm) / cellCm),
    1,
  )
  const occupancy = createBitMask(cols, maxRows)

  const pieces: PlacedPiece[] = []
  let unplaced = 0
  /** Hasta donde llega lo ya colocado, en filas. */
  let usedRows = 0

  for (const variant of items) {
    const byProfile = bestPlacement(heights, cols, candidatesFor(variant))
    if (!byProfile) {
      unplaced++
      continue
    }

    // Si ponerla donde dice el perfil haria crecer el lienzo, primero buscamos
    // un hueco mas arriba. Solo ahi vale la pena: es cuando esta en juego el
    // alto final, que es lo unico que queremos minimizar.
    let placement = byProfile
    const creceria = byProfile.y + byProfile.candidate.shape.dilated.bits.rows > usedRows
    if (alwaysProbe || creceria) {
      const enCueva = probeAbove(occupancy, cols, candidatesFor(variant), byProfile.y, budget, stepDivisor)
      if (enCueva) placement = enCueva
    }

    stamp(heights, placement)
    stampOccupancy(occupancy, placement)
    usedRows = Math.max(usedRows, placement.y + placement.candidate.shape.dilated.bits.rows)

    const { x, y, candidate } = placement
    const { padding } = candidate.shape.dilated

    // La mascara dilatada sobresale `padding` celdas: el dibujo real arranca
    // adentro de ese margen.
    const bboxX = (x + padding) * cellCm
    const bboxY = (y + padding) * cellCm

    // El alto y ancho del hueco salen de los cm, no de las celdas: las celdas
    // estan redondeadas hacia arriba y correrian el centro.
    const rotada = candidate.turns === 1 || candidate.turns === 3
    const bboxWidth = rotada ? variant.heightCm : variant.widthCm
    const bboxHeight = rotada ? variant.widthCm : variant.heightCm

    // La pieza se guarda con su tamano propio, centrada en su hueco (ver el
    // modelo de datos: la rotacion gira alrededor del centro).
    const centerX = bboxX + bboxWidth / 2
    const centerY = bboxY + bboxHeight / 2

    pieces.push({
      id: newId(),
      variantId: variant.id,
      xCm: round(centerX - variant.widthCm / 2),
      yCm: round(centerY - variant.heightCm / 2),
      widthCm: round(variant.widthCm),
      heightCm: round(variant.heightCm),
      rotation: candidate.turns * 90,
    })
  }

  let usedHeightCm = 0
  for (const piece of pieces) {
    const bounds = pieceBounds(piece)
    usedHeightCm = Math.max(usedHeightCm, bounds.yCm + bounds.heightCm)
  }

  return { pieces, usedHeightCm: round(usedHeightCm), unplaced }
}

/**
 * Tope de pruebas de colision por pieza al buscar cuevas.
 *
 * MEDIDO: con 4000 el presupuesto se agotaba y se perdian huecos. Subirlo a
 * 40000 bajo un trabajo de 82 piezas de 143.2 a 137.9 cm SIN costar mas tiempo
 * (incluso menos: acomodar mejor acorta las busquedas siguientes). Mas alla de
 * ahi no mejora.
 *
 * Si se agota sin encontrar nada, se usa el lugar del perfil, que siempre vale.
 */
const MAX_PROBES = 40000

/** Marca la ocupacion real de una pieza en la grilla de bits. */
function stampOccupancy(occupancy: BitMask, placement: Placement): void {
  const mask = placement.candidate.shape.dilated.bits
  for (let row = 0; row < mask.rows; row++) {
    for (let col = 0; col < mask.cols; col++) {
      if (getBit(mask, col, row)) setBit(occupancy, placement.x + col, placement.y + row)
    }
  }
}

/**
 * Afina una posicion encontrada con pasos gruesos: la empuja lo mas arriba y a
 * la izquierda que pueda, sin pasarse del paso con el que se la encontro.
 */
function refine(
  occupancy: BitMask,
  mask: BitMask,
  x: number,
  y: number,
  xStep: number,
  yStep: number,
): { x: number; y: number } {
  let bestX = x
  let bestY = y

  for (let candidateY = y - 1; candidateY >= 0 && candidateY > y - yStep; candidateY--) {
    if (overlapsAt(occupancy, mask, bestX, candidateY)) break
    bestY = candidateY
  }
  for (let candidateX = bestX - 1; candidateX >= 0 && candidateX > x - xStep; candidateX--) {
    if (overlapsAt(occupancy, mask, candidateX, bestY)) break
    bestX = candidateX
  }

  return { x: bestX, y: bestY }
}

/**
 * Busca un hueco por ENCIMA de `limitY`, probando contra la ocupacion real.
 *
 * Recorre de arriba hacia abajo para quedarse con el hueco mas alto. Usa pasos
 * gruesos (un cuarto de la pieza) y despues afina: con pasos de a una celda
 * seria exacto pero demasiado caro, y perderse una cueva solo cuesta un layout
 * un poco peor, nunca uno invalido.
 */
function probeAbove(
  occupancy: BitMask,
  cols: number,
  candidates: Candidate[],
  limitY: number,
  budget: number,
  stepDivisor: number,
): Placement | null {
  if (limitY <= 0) return null

  let probes = 0
  const yStep = Math.max(1, Math.floor(Math.min(...candidates.map((c) => c.shape.dilated.bits.rows)) / stepDivisor))

  for (let y = 0; y < limitY; y += yStep) {
    for (const candidate of candidates) {
      const mask = candidate.shape.dilated.bits
      const maxX = cols - mask.cols
      if (maxX < 0) continue
      const xStep = Math.max(1, Math.floor(mask.cols / stepDivisor))

      for (let x = 0; x <= maxX; x += xStep) {
        if (probes++ > budget) return null
        if (overlapsAt(occupancy, mask, x, y)) continue
        const fino = refine(occupancy, mask, x, y, xStep, yStep)
        return { x: fino.x, y: fino.y, candidate }
      }
    }
  }

  return null
}
