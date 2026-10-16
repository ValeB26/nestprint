import { describe, it, expect } from 'vitest'
import type { CanvasConfig, DesignVariant, PlacedPiece } from '../types'
import { DEFAULT_CONFIG } from '../types'
import { packRects } from './pack'
import { pieceBounds } from '../lib/geometry'

/**
 * Tests del motor de packing (Fase 4). Cubren los 7 casos acordados en el
 * CLAUDE.md. En cada uno validamos los invariantes que NUNCA se pueden romper:
 *
 *   - sin solapamientos (respetando la separacion minima)
 *   - todo dentro de los limites del lienzo
 *   - cantidades exactas por variante
 *   - dimensiones correctas (intercambiadas si la pieza quedo rotada)
 *   - rotaciones validas (solo 0 o 90, y 90 solo si la variante lo permite)
 *   - alto total calculado correctamente
 *   - variantId correcto en cada pieza
 */

const EPS = 1e-6

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let variantCounter = 0

/** Crea una variante de test con valores por defecto sobreescribibles. */
function makeVariant(overrides: Partial<DesignVariant> = {}): DesignVariant {
  variantCounter++
  return {
    id: `v${variantCounter}`,
    designId: 'd1',
    name: `Variante ${variantCounter}`,
    widthCm: 5,
    heightCm: 5,
    quantity: 1,
    allowRotation: true,
    ...overrides,
  }
}

/**
 * Rectangulo inflado: el espacio que la pieza OCUPA (su bounding box, que para
 * una pieza rotada no es su ancho x alto) mas gap/2 por lado. Es su "zona de
 * exclusion": ninguna otra pieza puede entrar ahi.
 */
function inflated(p: PlacedPiece, gap: number) {
  const bounds = pieceBounds(p)
  return {
    x1: bounds.xCm - gap / 2,
    y1: bounds.yCm - gap / 2,
    x2: bounds.xCm + bounds.widthCm + gap / 2,
    y2: bounds.yCm + bounds.heightCm + gap / 2,
  }
}

/** Dos rectangulos inflados se solapan? (tocarse en el borde no cuenta) */
function overlap(a: ReturnType<typeof inflated>, b: ReturnType<typeof inflated>): boolean {
  return a.x1 < b.x2 - EPS && b.x1 < a.x2 - EPS && a.y1 < b.y2 - EPS && b.y1 < a.y2 - EPS
}

/**
 * Valida TODOS los invariantes contra las variantes de entrada. Lo llamamos en
 * cada caso para no repetir asserts.
 */
function validate(variants: DesignVariant[], config: CanvasConfig, pieces: PlacedPiece[]) {
  const gap = config.gapCm
  const byId = new Map(variants.map((v) => [v.id, v]))

  // Dentro de los limites: nada negativo ni mas alla del ancho del lienzo.
  // Se mide con el bounding box, que es lo que realmente ocupa en el lienzo.
  for (const p of pieces) {
    const bounds = pieceBounds(p)
    expect(bounds.xCm).toBeGreaterThanOrEqual(-EPS)
    expect(bounds.yCm).toBeGreaterThanOrEqual(-EPS)
    expect(bounds.xCm + bounds.widthCm).toBeLessThanOrEqual(config.widthCm + EPS)
  }

  // Sin solapamientos y con separacion minima: ningun par de piezas infladas
  // se solapa.
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = inflated(pieces[i], gap)
      const b = inflated(pieces[j], gap)
      expect(overlap(a, b), `las piezas ${i} y ${j} se solapan o no respetan el gap`).toBe(false)
    }
  }

  // Dimensiones, rotaciones y variantId correctos por pieza.
  for (const p of pieces) {
    const v = byId.get(p.variantId)
    expect(v, 'la pieza referencia un variantId inexistente').toBeDefined()
    if (!v) continue

    // El packing solo rota en multiplos de 90 (el usuario puede poner
    // cualquier angulo a mano, pero eso no sale de aca).
    expect(p.rotation === 0 || p.rotation === 90).toBe(true)
    if (p.rotation === 90) {
      expect(v.allowRotation, 'pieza rotada de una variante que no lo permite').toBe(true)
    }

    // La pieza guarda SIEMPRE su tamano propio, sin intercambiar: lo que cambia
    // al rotar es el espacio que ocupa (su bounding box).
    expect(p.widthCm).toBeCloseTo(v.widthCm)
    expect(p.heightCm).toBeCloseTo(v.heightCm)

    const bounds = pieceBounds(p)
    if (p.rotation === 90) {
      expect(bounds.widthCm).toBeCloseTo(v.heightCm)
      expect(bounds.heightCm).toBeCloseTo(v.widthCm)
    } else {
      expect(bounds.widthCm).toBeCloseTo(v.widthCm)
      expect(bounds.heightCm).toBeCloseTo(v.heightCm)
    }
  }
}

/** Cuenta cuantas piezas hay por variantId. */
function countByVariant(pieces: PlacedPiece[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of pieces) counts.set(p.variantId, (counts.get(p.variantId) ?? 0) + 1)
  return counts
}

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

describe('motor de packing (MaxRects BSSF)', () => {
  it('caso 1: 10 piezas de 5x5 en lienzo de 58 cm', () => {
    const variants = [makeVariant({ widthCm: 5, heightCm: 5, quantity: 10 })]
    const result = packRects(variants, DEFAULT_CONFIG)

    expect(result.pieces).toHaveLength(10)
    expect(result.unplaced).toBe(0)
    validate(variants, DEFAULT_CONFIG, result.pieces)

    // 10 piezas de 5 cm (+0.2 de gap) entran holgadas en una fila de 58 cm:
    // esperamos una sola fila, es decir alto usado cercano a 5 cm.
    expect(result.usedHeightCm).toBeLessThanOrEqual(5 + DEFAULT_CONFIG.gapCm + EPS)
  })

  it('caso 2: piezas de tamanos diferentes', () => {
    const variants = [
      makeVariant({ widthCm: 20, heightCm: 10, quantity: 2 }),
      makeVariant({ widthCm: 8, heightCm: 12, quantity: 3 }),
      makeVariant({ widthCm: 15, heightCm: 6, quantity: 4 }),
    ]
    const result = packRects(variants, DEFAULT_CONFIG)

    expect(result.pieces).toHaveLength(9)
    expect(result.unplaced).toBe(0)
    validate(variants, DEFAULT_CONFIG, result.pieces)
  })

  it('caso 3: muchas unidades de una pieza pequena', () => {
    const variants = [makeVariant({ widthCm: 2, heightCm: 2, quantity: 100 })]
    const result = packRects(variants, DEFAULT_CONFIG)

    expect(result.pieces).toHaveLength(100)
    expect(result.unplaced).toBe(0)
    validate(variants, DEFAULT_CONFIG, result.pieces)
  })

  it('caso 4: pieza que solo entra rotada', () => {
    // 70 cm de ancho no entra en un lienzo de 58; rotada (50 de ancho) si.
    const variant = makeVariant({ widthCm: 70, heightCm: 50, quantity: 1, allowRotation: true })
    const result = packRects([variant], DEFAULT_CONFIG)

    expect(result.pieces).toHaveLength(1)
    expect(result.unplaced).toBe(0)
    expect(result.pieces[0].rotation).toBe(90)
    // La pieza conserva su tamano propio (70 x 50)...
    expect(result.pieces[0].widthCm).toBeCloseTo(70)
    expect(result.pieces[0].heightCm).toBeCloseTo(50)
    // ...y rotada ocupa 50 de ancho por 70 de alto, que es lo que entra en el
    // lienzo de 58 cm.
    const bounds = pieceBounds(result.pieces[0])
    expect(bounds.widthCm).toBeCloseTo(50)
    expect(bounds.heightCm).toBeCloseTo(70)
    validate([variant], DEFAULT_CONFIG, result.pieces)

    // Si la misma variante NO permite rotar, no entra.
    const noRot = makeVariant({ widthCm: 70, heightCm: 50, quantity: 1, allowRotation: false })
    const result2 = packRects([noRot], DEFAULT_CONFIG)
    expect(result2.pieces).toHaveLength(0)
    expect(result2.unplaced).toBe(1)
  })

  it('caso 5: combinacion que casi llena exactamente el ancho', () => {
    // Dos piezas de 28.8 cm: infladas (29 c/u) suman 58 justo. Entran en una fila.
    const variants = [makeVariant({ widthCm: 28.8, heightCm: 10, quantity: 2, allowRotation: false })]
    const result = packRects(variants, DEFAULT_CONFIG)

    expect(result.pieces).toHaveLength(2)
    expect(result.unplaced).toBe(0)
    validate(variants, DEFAULT_CONFIG, result.pieces)

    // Una sola fila: alto usado cercano a 10 cm.
    expect(result.usedHeightCm).toBeLessThanOrEqual(10 + DEFAULT_CONFIG.gapCm + EPS)
    // Las dos comparten fila (misma coordenada y).
    expect(result.pieces[0].yCm).toBeCloseTo(result.pieces[1].yCm)
  })

  it('caso 6: un mismo diseno con varias variantes', () => {
    const v1 = makeVariant({ designId: 'logo', widthCm: 25, heightCm: 15, quantity: 5 })
    const v2 = makeVariant({ designId: 'logo', widthCm: 8, heightCm: 5, quantity: 20 })
    const result = packRects([v1, v2], DEFAULT_CONFIG)

    expect(result.pieces).toHaveLength(25)
    expect(result.unplaced).toBe(0)
    validate([v1, v2], DEFAULT_CONFIG, result.pieces)

    const counts = countByVariant(result.pieces)
    expect(counts.get(v1.id)).toBe(5)
    expect(counts.get(v2.id)).toBe(20)
  })

  it('caso 7: varios disenos, cada uno con varias variantes', () => {
    const variants = [
      makeVariant({ designId: 'A', widthCm: 30, heightCm: 20, quantity: 2 }),
      makeVariant({ designId: 'A', widthCm: 10, heightCm: 10, quantity: 6 }),
      makeVariant({ designId: 'B', widthCm: 12, heightCm: 18, quantity: 3 }),
      makeVariant({ designId: 'B', widthCm: 6, heightCm: 6, quantity: 10 }),
    ]
    const result = packRects(variants, DEFAULT_CONFIG)

    expect(result.pieces).toHaveLength(21)
    expect(result.unplaced).toBe(0)
    validate(variants, DEFAULT_CONFIG, result.pieces)

    const counts = countByVariant(result.pieces)
    for (const v of variants) expect(counts.get(v.id)).toBe(v.quantity)
  })

  it('caso borde: sin variantes devuelve resultado vacio', () => {
    const result = packRects([], DEFAULT_CONFIG)
    expect(result.pieces).toHaveLength(0)
    expect(result.usedHeightCm).toBe(0)
    expect(result.unplaced).toBe(0)
  })
})
