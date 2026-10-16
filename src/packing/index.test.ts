import { describe, it, expect } from 'vitest'
import type { CanvasConfig, DesignVariant } from '../types'
import { DEFAULT_CONFIG } from '../types'
import { createMask, type Mask } from '../lib/mask'
import { pack, packRects } from './index'
import { buildPieceShape, type PieceShape } from './raster/pieceMask'
import type { VariantShapeLookup } from './raster/packRaster'
import { validateLayout, type ShapeLookup } from './validate'
import { quarterTurnsOf } from './raster/pieceMask'

/**
 * Tests del despachador: elige estrategia y, en modo formas, prueba varias y se
 * queda con la mejor.
 */

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

function solido(): Mask {
  const m = createMask(2, 2)
  m.cells.fill(1)
  return m
}

const CONFIG: CanvasConfig = { ...DEFAULT_CONFIG, nestingMode: 'shape', cellCm: 0.1 }

function lookups(variants: DesignVariant[], formas: Record<string, Mask>) {
  const cache = new Map<string, PieceShape>()
  const build = (id: string, turns: 0 | 1 | 2 | 3) => {
    const v = variants.find((x) => x.id === id)
    if (!v || !formas[id]) return null
    const key = id + ':' + turns
    let s = cache.get(key)
    if (!s) {
      s = buildPieceShape(formas[id], v.widthCm, v.heightCm, turns, {
        cellCm: CONFIG.cellCm,
        gapCm: CONFIG.gapCm,
      })
      cache.set(key, s)
    }
    return s
  }
  const forPacking: VariantShapeLookup = (id, turns) => build(id, turns)
  const forValidation: ShapeLookup = (piece) => {
    const turns = quarterTurnsOf(piece.rotation)
    return turns === null ? null : build(piece.variantId, turns)
  }
  return { forPacking, forValidation }
}

/** Tres trabajos con perfiles distintos: ninguna estrategia gana en los tres. */
const TRABAJOS: { nombre: string; variants: DesignVariant[]; formas: Record<string, Mask> }[] = [
  {
    nombre: 'mixto',
    variants: [
      { id: 'a1', designId: 'A', name: '', widthCm: 18, heightCm: 18, quantity: 6, allowRotation: true },
      { id: 'a2', designId: 'A', name: '', widthCm: 11, heightCm: 11, quantity: 10, allowRotation: true },
      { id: 'b1', designId: 'B', name: '', widthCm: 7, heightCm: 3, quantity: 14, allowRotation: true },
      { id: 'c1', designId: 'C', name: '', widthCm: 6, heightCm: 6, quantity: 12, allowRotation: true },
    ],
    formas: { a1: disco(180), a2: disco(110), b1: solido(), c1: disco(60) },
  },
  {
    nombre: 'discos grandes y chicos',
    variants: [
      { id: 'd1', designId: 'D', name: '', widthCm: 16, heightCm: 16, quantity: 12, allowRotation: true },
      { id: 'd2', designId: 'D', name: '', widthCm: 5, heightCm: 5, quantity: 14, allowRotation: true },
    ],
    formas: { d1: disco(160), d2: solido() },
  },
  {
    nombre: 'alargados macizos',
    variants: [
      { id: 'e1', designId: 'E', name: '', widthCm: 40, heightCm: 7, quantity: 8, allowRotation: true },
      { id: 'e2', designId: 'E', name: '', widthCm: 12, heightCm: 4, quantity: 16, allowRotation: true },
      { id: 'e3', designId: 'E', name: '', widthCm: 4, heightCm: 4, quantity: 20, allowRotation: true },
    ],
    formas: { e1: solido(), e2: solido(), e3: solido() },
  },
]

describe('pack (despachador)', () => {
  it('en modo rect usa el acomodado por rectangulos tal cual', () => {
    const { variants, formas } = TRABAJOS[0]
    const { forPacking } = lookups(variants, formas)
    const porDespachador = pack(variants, { ...CONFIG, nestingMode: 'rect' }, forPacking)
    const directo = packRects(variants, CONFIG)
    expect(porDespachador.usedHeightCm).toBe(directo.usedHeightCm)
  })

  /**
   * La propiedad que mas importa: con formas macizas el acomodado por forma
   * puede perder contra MaxRects, asi que el rectangular va de candidato. El
   * modo Formas NUNCA puede dar un resultado peor que el metodo de siempre.
   */
  it.each(TRABAJOS)('nunca es peor que rectangulos: $nombre', ({ variants, formas }) => {
    const { forPacking } = lookups(variants, formas)
    const porForma = pack(variants, CONFIG, forPacking)
    const porRectangulo = packRects(variants, CONFIG)

    expect(porForma.unplaced).toBeLessThanOrEqual(porRectangulo.unplaced)
    expect(porForma.usedHeightCm).toBeLessThanOrEqual(porRectangulo.usedHeightCm)
  })

  it.each(TRABAJOS)('coloca todas las piezas y el layout es valido: $nombre', ({ variants, formas }) => {
    const { forPacking, forValidation } = lookups(variants, formas)
    const result = pack(variants, CONFIG, forPacking)
    const total = variants.reduce((n, v) => n + v.quantity, 0)

    expect(result.pieces).toHaveLength(total)
    expect(result.unplaced).toBe(0)
    expect(validateLayout(result.pieces, CONFIG, forValidation)).toEqual({})
  })

  it('aprovecha las formas cuando hay algo que ganar', () => {
    // Discos: hay huecos entre ellos, asi que tiene que ganarle a rectangulos.
    const { variants, formas } = TRABAJOS[1]
    const { forPacking } = lookups(variants, formas)
    const porForma = pack(variants, CONFIG, forPacking)
    const porRectangulo = packRects(variants, CONFIG)
    expect(porForma.usedHeightCm).toBeLessThan(porRectangulo.usedHeightCm * 0.95)
  })
})

describe('referencia para mostrar el ahorro', () => {
  it('en modo formas devuelve contra que se comparo', () => {
    const { variants, formas } = TRABAJOS[1]
    const { forPacking } = lookups(variants, formas)
    const result = pack(variants, CONFIG, forPacking)
    const porRectangulo = packRects(variants, CONFIG)

    expect(result.baselineHeightCm).toBeCloseTo(porRectangulo.usedHeightCm)
    // Y como en este trabajo las formas ganan, hay ahorro que mostrar.
    expect(result.baselineHeightCm! - result.usedHeightCm).toBeGreaterThan(0)
  })

  it('en modo rectangulos no hay con que comparar', () => {
    const { variants, formas } = TRABAJOS[0]
    const { forPacking } = lookups(variants, formas)
    const result = pack(variants, { ...CONFIG, nestingMode: 'rect' }, forPacking)
    expect(result.baselineHeightCm).toBeUndefined()
  })

  it('nunca reporta un ahorro negativo', () => {
    // En formas macizas el rectangular puede ganar; como es candidato, el
    // resultado lo iguala y el ahorro queda en cero, nunca en negativo.
    const { variants, formas } = TRABAJOS[2]
    const { forPacking } = lookups(variants, formas)
    const result = pack(variants, CONFIG, forPacking)
    expect(result.baselineHeightCm! - result.usedHeightCm).toBeGreaterThanOrEqual(0)
  })
})
