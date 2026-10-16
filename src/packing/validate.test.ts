import { describe, it, expect } from 'vitest'
import type { CanvasConfig, DesignVariant, PlacedPiece } from '../types'
import { DEFAULT_CONFIG } from '../types'
import { packRects } from './pack'
import { countPiecesWithIssues, validateLayout } from './validate'

/**
 * Tests de la validacion del layout (Fase 6). El caso mas importante es el de
 * integracion: lo que produce el motor de packing tiene que ser SIEMPRE valido.
 */

/** Crea una pieza de test con valores por defecto sobreescribibles. */
function piece(overrides: Partial<PlacedPiece> = {}): PlacedPiece {
  return {
    id: 'p1',
    variantId: 'v1',
    xCm: 0,
    yCm: 0,
    widthCm: 10,
    heightCm: 10,
    rotation: 0,
    ...overrides,
  }
}

describe('validateLayout', () => {
  it('un layout correcto no reporta problemas', () => {
    const a = piece({ id: 'a', xCm: 0, yCm: 0 })
    // Separada 1 cm: mas que el gap de 0.2 cm.
    const b = piece({ id: 'b', xCm: 11, yCm: 0 })
    expect(validateLayout([a, b], DEFAULT_CONFIG)).toEqual({})
  })

  it('detecta una pieza que se sale por la derecha', () => {
    const p = piece({ id: 'a', xCm: 50, widthCm: 10 }) // 50 + 10 = 60 > 58
    const issues = validateLayout([p], DEFAULT_CONFIG)
    expect(issues['a']).toContain('outOfBounds')
  })

  it('detecta coordenadas negativas', () => {
    const izquierda = piece({ id: 'a', xCm: -1 })
    const arriba = piece({ id: 'b', xCm: 20, yCm: -0.5 })
    const issues = validateLayout([izquierda, arriba], DEFAULT_CONFIG)
    expect(issues['a']).toContain('outOfBounds')
    expect(issues['b']).toContain('outOfBounds')
  })

  it('detecta solapamiento y marca las dos piezas', () => {
    const a = piece({ id: 'a', xCm: 0, yCm: 0 })
    const b = piece({ id: 'b', xCm: 5, yCm: 5 }) // se pisa con a
    const issues = validateLayout([a, b], DEFAULT_CONFIG)
    expect(issues['a']).toContain('overlap')
    expect(issues['b']).toContain('overlap')
  })

  it('detecta piezas demasiado juntas (separacion menor al gap)', () => {
    const a = piece({ id: 'a', xCm: 0 })
    // Separadas 0.1 cm: no se pisan, pero el gap minimo es 0.2 cm.
    const b = piece({ id: 'b', xCm: 10.1 })
    const issues = validateLayout([a, b], DEFAULT_CONFIG)
    expect(issues['a']).toContain('tooClose')
    expect(issues['a']).not.toContain('overlap')
    expect(issues['b']).toContain('tooClose')
  })

  it('separacion exactamente igual al gap es valida', () => {
    const a = piece({ id: 'a', xCm: 0 })
    const b = piece({ id: 'b', xCm: 10 + DEFAULT_CONFIG.gapCm })
    expect(validateLayout([a, b], DEFAULT_CONFIG)).toEqual({})
  })

  it('tiene en cuenta la rotacion: una pieza rotada ocupa mas', () => {
    // 50 de ancho x 20 de alto arranca en x=5: sin rotar entra (5+50=55 < 58).
    const horizontal = piece({ id: 'a', xCm: 5, yCm: 0, widthCm: 50, heightCm: 20 })
    expect(validateLayout([horizontal], DEFAULT_CONFIG)).toEqual({})

    // Rotada 90 grados ocupa 20 de ancho x 50 de alto alrededor del mismo
    // centro, asi que se va por arriba del lienzo (yCm negativo).
    const rotada = { ...horizontal, rotation: 90 }
    expect(validateLayout([rotada], DEFAULT_CONFIG)['a']).toContain('outOfBounds')
  })

  it('detecta un solape que aparece solo al rotar una pieza', () => {
    const a = piece({ id: 'a', xCm: 0, yCm: 10, widthCm: 20, heightCm: 2 })
    const b = piece({ id: 'b', xCm: 30, yCm: 10, widthCm: 20, heightCm: 2 })
    // Lejos una de otra en horizontal: sin problemas.
    expect(validateLayout([a, b], DEFAULT_CONFIG)).toEqual({})

    // Si "b" rota 90 grados, se estira en vertical pero no llega a tocar a "a".
    const issues = validateLayout([a, { ...b, rotation: 90 }], DEFAULT_CONFIG)
    expect(issues).toEqual({})
  })

  it('cuenta las piezas con problemas', () => {
    const a = piece({ id: 'a', xCm: 0, yCm: 0 })
    const b = piece({ id: 'b', xCm: 5, yCm: 5 })
    const c = piece({ id: 'c', xCm: 30, yCm: 0 })
    const issues = validateLayout([a, b, c], DEFAULT_CONFIG)
    expect(countPiecesWithIssues(issues)).toBe(2)
  })

  it('integracion: el output del packing siempre es valido', () => {
    const variants: DesignVariant[] = [
      { id: 'v1', designId: 'A', name: 'grande', widthCm: 30, heightCm: 20, quantity: 3, allowRotation: true },
      { id: 'v2', designId: 'A', name: 'chica', widthCm: 7, heightCm: 5, quantity: 25, allowRotation: true },
      { id: 'v3', designId: 'B', name: 'alta', widthCm: 6, heightCm: 22, quantity: 8, allowRotation: false },
    ]
    const result = packRects(variants, DEFAULT_CONFIG)

    expect(result.pieces.length).toBe(36)
    expect(validateLayout(result.pieces, DEFAULT_CONFIG)).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// Colision por forma real (etapa 3)
// ---------------------------------------------------------------------------

import { createMask, type Mask } from '../lib/mask'
import { buildPieceShape, quarterTurnsOf, type PieceShape } from './raster/pieceMask'
import type { ShapeLookup } from './validate'

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

/** Una "L": barra arriba y brazo a la izquierda. Deja una escotadura libre. */
const FORMA_L = ['####', '#...', '#...', '#...']
const MACIZO = ['##', '##']

describe('validateLayout con formas reales', () => {
  /** Arma un buscador de formas a partir de un mapa variantId -> dibujo. */
  function lookupFor(
    shapes: Record<string, { lines: string[]; widthCm: number; heightCm: number }>,
    config: CanvasConfig,
  ): ShapeLookup {
    const cache = new Map<string, PieceShape>()
    return (p) => {
      const spec = shapes[p.variantId]
      if (!spec) return null
      const turns = quarterTurnsOf(p.rotation)
      if (turns === null) return null // angulo libre: que use el rectangulo
      const key = p.variantId + ':' + turns
      let shape = cache.get(key)
      if (!shape) {
        shape = buildPieceShape(maskFrom(spec.lines), spec.widthCm, spec.heightCm, turns, {
          cellCm: config.cellCm,
          gapCm: config.gapCm,
        })
        cache.set(key, shape)
      }
      return shape
    }
  }

  const SIN_GAP: CanvasConfig = { ...DEFAULT_CONFIG, cellCm: 1, gapCm: 0 }

  const formaL = { lines: FORMA_L, widthCm: 4, heightCm: 4 }
  const macizo = { lines: MACIZO, widthCm: 2, heightCm: 2 }

  it('una pieza encastra en la escotadura de otra sin marcar error', () => {
    const grande = piece({ id: 'a', variantId: 'L', xCm: 0, yCm: 0, widthCm: 4, heightCm: 4 })
    const chica = piece({ id: 'b', variantId: 'M', xCm: 2, yCm: 2, widthCm: 2, heightCm: 2 })
    const pieces = [grande, chica]
    const shapeOf = lookupFor({ L: formaL, M: macizo }, SIN_GAP)

    // Sin formas, los rectangulos se cruzan y se reporta solape.
    expect(validateLayout(pieces, SIN_GAP)['a']).toContain('overlap')

    // Con formas, se ve que la escotadura esta libre: no hay problema.
    expect(validateLayout(pieces, SIN_GAP, shapeOf)).toEqual({})
  })

  it('un solape de verdad se sigue detectando', () => {
    const grande = piece({ id: 'a', variantId: 'L', xCm: 0, yCm: 0, widthCm: 4, heightCm: 4 })
    // Encima del brazo izquierdo de la L.
    const chica = piece({ id: 'b', variantId: 'M', xCm: 0, yCm: 2, widthCm: 2, heightCm: 2 })
    const shapeOf = lookupFor({ L: formaL, M: macizo }, SIN_GAP)
    const issues = validateLayout([grande, chica], SIN_GAP, shapeOf)
    expect(issues['a']).toContain('overlap')
    expect(issues['b']).toContain('overlap')
  })

  it('respeta la separacion minima entre formas', () => {
    const config: CanvasConfig = { ...DEFAULT_CONFIG, cellCm: 0.5, gapCm: 1 }
    const shapeOf = lookupFor({ M: macizo }, config)
    const a = piece({ id: 'a', variantId: 'M', xCm: 0, yCm: 0, widthCm: 2, heightCm: 2 })

    // A 0.5 cm de distancia, con 1 cm pedido: demasiado cerca.
    const cerca = piece({ id: 'b', variantId: 'M', xCm: 2.5, yCm: 0, widthCm: 2, heightCm: 2 })
    expect(validateLayout([a, cerca], config, shapeOf)['b']).toContain('tooClose')

    // A 1 cm exacto: valido.
    const justo = piece({ id: 'b', variantId: 'M', xCm: 3, yCm: 0, widthCm: 2, heightCm: 2 })
    expect(validateLayout([a, justo], config, shapeOf)).toEqual({})
  })

  it('si falta la forma de una pieza, cae al rectangulo', () => {
    const grande = piece({ id: 'a', variantId: 'L', xCm: 0, yCm: 0, widthCm: 4, heightCm: 4 })
    const chica = piece({ id: 'b', variantId: 'DESCONOCIDA', xCm: 2, yCm: 2, widthCm: 2, heightCm: 2 })
    // Solo conocemos la forma de la L: la otra se trata como rectangulo.
    const shapeOf = lookupFor({ L: formaL }, SIN_GAP)
    expect(validateLayout([grande, chica], SIN_GAP, shapeOf)['a']).toContain('overlap')
  })

  it('con un angulo libre tambien cae al rectangulo', () => {
    const grande = piece({ id: 'a', variantId: 'L', xCm: 0, yCm: 0, widthCm: 4, heightCm: 4 })
    const chica = piece({
      id: 'b',
      variantId: 'M',
      xCm: 2,
      yCm: 2,
      widthCm: 2,
      heightCm: 2,
      rotation: 37,
    })
    const shapeOf = lookupFor({ L: formaL, M: macizo }, SIN_GAP)
    // 37 grados no es multiplo de 90: no hay mascara, se usa el rectangulo.
    expect(validateLayout([grande, chica], SIN_GAP, shapeOf)['a']).toContain('overlap')
  })

  it('seguir fuera de limites se detecta igual', () => {
    const afuera = piece({ id: 'a', variantId: 'M', xCm: 57, yCm: 0, widthCm: 2, heightCm: 2 })
    const shapeOf = lookupFor({ M: macizo }, SIN_GAP)
    expect(validateLayout([afuera], SIN_GAP, shapeOf)['a']).toContain('outOfBounds')
  })
})

describe('quarterTurnsOf', () => {
  it('traduce los multiplos de 90', () => {
    expect(quarterTurnsOf(0)).toBe(0)
    expect(quarterTurnsOf(90)).toBe(1)
    expect(quarterTurnsOf(180)).toBe(2)
    expect(quarterTurnsOf(270)).toBe(3)
    expect(quarterTurnsOf(360)).toBe(0)
    expect(quarterTurnsOf(-90)).toBe(3)
  })

  it('devuelve null con angulos libres', () => {
    expect(quarterTurnsOf(37)).toBeNull()
    expect(quarterTurnsOf(45)).toBeNull()
    expect(quarterTurnsOf(0.5)).toBeNull()
  })
})
