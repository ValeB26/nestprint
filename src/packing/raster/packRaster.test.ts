import { describe, it, expect } from 'vitest'
import type { CanvasConfig, DesignVariant, PlacedPiece } from '../../types'
import { DEFAULT_CONFIG } from '../../types'
import { createMask, type Mask } from '../../lib/mask'
import { pieceBounds } from '../../lib/geometry'
import { packRects } from '../pack'
import { validateLayout, type ShapeLookup } from '../validate'
import { buildPieceShape, quarterTurnsOf, type PieceShape } from './pieceMask'
import { packRaster, type VariantShapeLookup } from './packRaster'

function maskFrom(lines: string[]): Mask {
  const rows = lines.length
  const cols = lines[0].length
  const mask = createMask(cols, rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (lines[row][col] === '#') mask.cells[row * cols + col] = 1
    }
  }
  return mask
}

/**
 * Una banda diagonal, como el trazo de un lettering. Es la forma que mejor
 * muestra la ganancia: dos copias IGUALES encastran una contra otra, porque el
 * perfil de arriba de una sigue al perfil de abajo de la otra.
 */
function bandaDiagonal(size: number, grosor: number): Mask {
  const mask = createMask(size, size)
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (Math.abs(col - row) <= grosor) mask.cells[row * size + col] = 1
    }
  }
  return mask
}

function variant(over: Partial<DesignVariant> = {}): DesignVariant {
  return {
    id: 'v1',
    designId: 'd1',
    name: 'test',
    widthCm: 10,
    heightCm: 10,
    quantity: 1,
    allowRotation: false,
    ...over,
  }
}

/** Arma los dos buscadores de formas (para packing y para validar). */
function shapeLookups(shapes: Record<string, Mask>, variants: DesignVariant[], config: CanvasConfig) {
  const byId = new Map(variants.map((v) => [v.id, v]))
  const cache = new Map<string, PieceShape>()

  function build(variantId: string, turns: 0 | 1 | 2 | 3): PieceShape | null {
    const v = byId.get(variantId)
    const mask = shapes[variantId]
    if (!v || !mask) return null
    const key = variantId + ':' + turns
    let shape = cache.get(key)
    if (!shape) {
      shape = buildPieceShape(mask, v.widthCm, v.heightCm, turns, {
        cellCm: config.cellCm,
        gapCm: config.gapCm,
      })
      cache.set(key, shape)
    }
    return shape
  }

  const forPacking: VariantShapeLookup = (variantId, turns) => build(variantId, turns)
  const forValidation: ShapeLookup = (piece: PlacedPiece) => {
    const turns = quarterTurnsOf(piece.rotation)
    return turns === null ? null : build(piece.variantId, turns)
  }
  return { forPacking, forValidation }
}

/**
 * Celdas de 1 mm. Importa: el padding es ceil(gap/2 / cellCm) celdas, asi que
 * con celdas de 2 mm y gap de 2 mm daria 1 celda = 2 mm por lado, o sea el
 * DOBLE de la separacion pedida, y el metodo por formas arrancaria perdiendo.
 */
const CONFIG: CanvasConfig = { ...DEFAULT_CONFIG, nestingMode: 'shape', cellCm: 0.1 }

describe('packRaster', () => {
  it('coloca todas las piezas pedidas', () => {
    const v = variant({ quantity: 7, widthCm: 8, heightCm: 8 })
    const shapes = { v1: maskFrom(['##', '##']) }
    const { forPacking } = shapeLookups(shapes, [v], CONFIG)
    const result = packRaster([v], CONFIG, forPacking)

    expect(result.pieces).toHaveLength(7)
    expect(result.unplaced).toBe(0)
    expect(result.pieces.every((p) => p.variantId === 'v1')).toBe(true)
  })

  it('el resultado pasa la validacion por forma', () => {
    const v = variant({ quantity: 12, widthCm: 9, heightCm: 9 })
    const shapes = { v1: bandaDiagonal(32, 5) }
    const { forPacking, forValidation } = shapeLookups(shapes, [v], CONFIG)
    const result = packRaster([v], CONFIG, forPacking)

    expect(result.pieces).toHaveLength(12)
    expect(validateLayout(result.pieces, CONFIG, forValidation)).toEqual({})
  })

  it('nada se sale del lienzo', () => {
    const v = variant({ quantity: 20, widthCm: 11, heightCm: 6 })
    const shapes = { v1: maskFrom(['##', '##']) }
    const { forPacking } = shapeLookups(shapes, [v], CONFIG)
    for (const piece of packRaster([v], CONFIG, forPacking).pieces) {
      const b = pieceBounds(piece)
      expect(b.xCm).toBeGreaterThanOrEqual(0)
      expect(b.yCm).toBeGreaterThanOrEqual(0)
      expect(b.xCm + b.widthCm).toBeLessThanOrEqual(CONFIG.widthCm + 0.01)
    }
  })

  it('las piezas conservan su tamano fisico', () => {
    const v = variant({ quantity: 5, widthCm: 7.5, heightCm: 3.2, allowRotation: true })
    const shapes = { v1: maskFrom(['###', '###']) }
    const { forPacking } = shapeLookups(shapes, [v], CONFIG)
    for (const piece of packRaster([v], CONFIG, forPacking).pieces) {
      expect(piece.widthCm).toBeCloseTo(7.5)
      expect(piece.heightCm).toBeCloseTo(3.2)
      expect(piece.rotation === 0 || piece.rotation === 90).toBe(true)
    }
  })

  it('sin variantes devuelve vacio', () => {
    expect(packRaster([], CONFIG)).toEqual({ pieces: [], usedHeightCm: 0, unplaced: 0 })
  })

  it('una pieza mas ancha que el lienzo no entra', () => {
    const v = variant({ widthCm: 80, heightCm: 10 })
    const shapes = { v1: maskFrom(['##', '##']) }
    const { forPacking } = shapeLookups(shapes, [v], CONFIG)
    const result = packRaster([v], CONFIG, forPacking)
    expect(result.pieces).toHaveLength(0)
    expect(result.unplaced).toBe(1)
  })

  it('sin formas se comporta como rectangulos (respaldo)', () => {
    const v = variant({ quantity: 6, widthCm: 10, heightCm: 10 })
    // Sin lookup: cada pieza cae al rectangulo macizo.
    const result = packRaster([v], CONFIG)
    expect(result.pieces).toHaveLength(6)
    expect(result.unplaced).toBe(0)
  })
})

describe('formas contra rectangulos', () => {
  it('con formas que encastran, el alto baja de verdad', () => {
    // Piezas anchas: entra una sola por fila, asi lo unico que puede bajar el
    // alto es que una se meta sobre la otra.
    const v = variant({ quantity: 5, widthCm: 30, heightCm: 30, allowRotation: false })
    const shapes = { v1: bandaDiagonal(60, 9) }
    const { forPacking, forValidation } = shapeLookups(shapes, [v], CONFIG)

    const porRectangulo = packRects([v], CONFIG)
    const porForma = packRaster([v], CONFIG, forPacking)

    // Las dos colocan todo.
    expect(porForma.pieces).toHaveLength(5)
    expect(porRectangulo.pieces).toHaveLength(5)

    // El layout por forma es valido: nada se pisa ni queda demasiado cerca.
    expect(validateLayout(porForma.pieces, CONFIG, forValidation)).toEqual({})

    // Y gasta bastante menos material.
    expect(porForma.usedHeightCm).toBeLessThan(porRectangulo.usedHeightCm * 0.8)
  })

  it('con formas macizas da practicamente lo mismo', () => {
    // Sin huecos que aprovechar no hay nada que ganar: lo que importa es que
    // tampoco se pierda mucho por culpa de la grilla.
    const v = variant({ quantity: 8, widthCm: 12, heightCm: 12 })
    const shapes = { v1: maskFrom(['##', '##']) }
    const { forPacking } = shapeLookups(shapes, [v], CONFIG)

    const porRectangulo = packRects([v], CONFIG)
    const porForma = packRaster([v], CONFIG, forPacking)
    expect(porForma.usedHeightCm).toBeLessThanOrEqual(porRectangulo.usedHeightCm * 1.05)
  })
})

describe('aprovecha los huecos que dejan las piezas grandes', () => {
  /** Un disco: entre varios quedan huecos grandes que el perfil no ve. */
  function disco(size: number): Mask {
    const m = createMask(size, size)
    const r = size / 2
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const dx = col + 0.5 - r
        const dy = row + 0.5 - r
        if (dx * dx + dy * dy <= r * r) m.cells[row * size + col] = 1
      }
    }
    return m
  }

  const grandes = variant({
    id: 'grande',
    widthCm: 14,
    heightCm: 14,
    quantity: 14,
    allowRotation: true,
  })
  const chicas = variant({
    id: 'chica',
    designId: 'd2',
    widthCm: 5,
    heightCm: 5,
    quantity: 7,
    allowRotation: true,
  })
  const solido = maskFrom(['##', '##'])

  /**
   * El caso que reporto el usuario: 14 piezas de 14x14 y 7 de 5x5. Las chicas
   * tienen que meterse en los huecos entre los discos, no debajo de todo.
   */
  it('las piezas chicas entran en los huecos sin estirar el lienzo', () => {
    const shapes = { grande: disco(140), chica: solido }
    const { forPacking, forValidation } = shapeLookups(shapes, [grandes, chicas], CONFIG)

    const soloGrandes = packRaster([grandes], CONFIG, forPacking)
    const conChicas = packRaster([grandes, chicas], CONFIG, forPacking)

    expect(conChicas.pieces).toHaveLength(21)
    expect(conChicas.unplaced).toBe(0)

    // Lo importante: sumar las chicas NO hace crecer el lienzo.
    expect(conChicas.usedHeightCm).toBeCloseTo(soloGrandes.usedHeightCm, 1)

    // Y el layout sigue siendo valido: nada se pisa ni queda demasiado cerca.
    expect(validateLayout(conChicas.pieces, CONFIG, forValidation)).toEqual({})
  })

  it('alguna pieza chica queda arriba, entre las grandes', () => {
    const shapes = { grande: disco(140), chica: solido }
    const { forPacking } = shapeLookups(shapes, [grandes, chicas], CONFIG)
    const result = packRaster([grandes, chicas], CONFIG, forPacking)

    const alturas = result.pieces
      .filter((p) => p.variantId === 'chica')
      .map((p) => pieceBounds(p).yCm)

    // Si se amontonaran abajo, la primera estaria cerca del final del lienzo.
    expect(Math.min(...alturas)).toBeLessThan(result.usedHeightCm / 2)
  })

  it('le gana al acomodado por rectangulos en este caso', () => {
    const shapes = { grande: disco(140), chica: solido }
    const { forPacking } = shapeLookups(shapes, [grandes, chicas], CONFIG)
    const porForma = packRaster([grandes, chicas], CONFIG, forPacking)
    const porRectangulo = packRects([grandes, chicas], CONFIG)
    expect(porForma.usedHeightCm).toBeLessThan(porRectangulo.usedHeightCm)
  })
})
