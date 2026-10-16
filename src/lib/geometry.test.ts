import { describe, it, expect } from 'vitest'
import type { PlacedPiece } from '../types'
import {
  angleFromTo,
  contentDrawRect,
  normalizeAngle,
  pieceBounds,
  pieceCenter,
  unionBounds,
} from './geometry'

function piece(overrides: Partial<PlacedPiece> = {}): PlacedPiece {
  return {
    id: 'p1',
    variantId: 'v1',
    xCm: 10,
    yCm: 20,
    widthCm: 8,
    heightCm: 4,
    rotation: 0,
    ...overrides,
  }
}

describe('normalizeAngle', () => {
  it('deja los angulos en [0, 360)', () => {
    expect(normalizeAngle(0)).toBe(0)
    expect(normalizeAngle(360)).toBe(0)
    expect(normalizeAngle(450)).toBe(90)
    expect(normalizeAngle(-90)).toBe(270)
    expect(normalizeAngle(-450)).toBe(270)
  })
})

describe('pieceBounds', () => {
  it('sin rotacion, el bounding box es la pieza misma', () => {
    expect(pieceBounds(piece())).toEqual({ xCm: 10, yCm: 20, widthCm: 8, heightCm: 4 })
  })

  it('a 180 grados ocupa lo mismo que sin rotar', () => {
    expect(pieceBounds(piece({ rotation: 180 }))).toEqual({
      xCm: 10,
      yCm: 20,
      widthCm: 8,
      heightCm: 4,
    })
  })

  it('a 90 grados intercambia ancho y alto, manteniendo el centro', () => {
    const p = piece({ rotation: 90 })
    const bounds = pieceBounds(p)
    // Ancho y alto exactos (sin ruido de punto flotante).
    expect(bounds.widthCm).toBe(4)
    expect(bounds.heightCm).toBe(8)
    // El centro no se mueve al rotar.
    const center = pieceCenter(p)
    expect(bounds.xCm + bounds.widthCm / 2).toBe(center.xCm)
    expect(bounds.yCm + bounds.heightCm / 2).toBe(center.yCm)
  })

  it('a 270 grados se comporta como a 90', () => {
    expect(pieceBounds(piece({ rotation: 270 }))).toEqual(pieceBounds(piece({ rotation: 90 })))
  })

  it('con un angulo libre el bounding box es mas grande que la pieza', () => {
    const bounds = pieceBounds(piece({ rotation: 45 }))
    // Un 8x4 a 45 grados: (8+4)/raiz(2) = 8.485 de lado.
    expect(bounds.widthCm).toBeCloseTo(8.485, 3)
    expect(bounds.heightCm).toBeCloseTo(8.485, 3)
    expect(bounds.widthCm).toBeGreaterThan(8)
  })

  it('el centro se mantiene con cualquier angulo', () => {
    const p = piece({ rotation: 37 })
    const bounds = pieceBounds(p)
    const center = pieceCenter(p)
    expect(bounds.xCm + bounds.widthCm / 2).toBeCloseTo(center.xCm)
    expect(bounds.yCm + bounds.heightCm / 2).toBeCloseTo(center.yCm)
  })
})

describe('angleFromTo', () => {
  const origin = { xCm: 10, yCm: 10 }

  it('mide 0 grados hacia la derecha y crece en sentido horario', () => {
    expect(angleFromTo(origin, { xCm: 20, yCm: 10 })).toBeCloseTo(0)
    // En pantalla el eje Y va hacia abajo: "abajo" es +90.
    expect(angleFromTo(origin, { xCm: 10, yCm: 20 })).toBeCloseTo(90)
    expect(angleFromTo(origin, { xCm: 0, yCm: 10 })).toBeCloseTo(180)
    // "Arriba" da -90 (equivale a 270 una vez normalizado).
    expect(normalizeAngle(angleFromTo(origin, { xCm: 10, yCm: 0 }))).toBeCloseTo(270)
  })

  it('mide las diagonales', () => {
    expect(angleFromTo(origin, { xCm: 20, yCm: 20 })).toBeCloseTo(45)
  })
})

describe('unionBounds', () => {
  it('devuelve null si no hay nada', () => {
    expect(unionBounds([])).toBeNull()
  })

  it('con un solo rectangulo devuelve ese mismo', () => {
    const only = { xCm: 5, yCm: 5, widthCm: 10, heightCm: 2 }
    expect(unionBounds([only])).toEqual(only)
  })

  it('encierra a todos los rectangulos', () => {
    expect(
      unionBounds([
        { xCm: 0, yCm: 0, widthCm: 10, heightCm: 10 },
        { xCm: 20, yCm: 5, widthCm: 10, heightCm: 10 },
      ]),
    ).toEqual({ xCm: 0, yCm: 0, widthCm: 30, heightCm: 15 })
  })
})

describe('contentDrawRect', () => {
  it('sin recorte, la imagen se dibuja sobre la pieza tal cual', () => {
    expect(contentDrawRect(10, 5)).toEqual({ xCm: 0, yCm: 0, widthCm: 10, heightCm: 5 })
  })

  /**
   * LA invariante: donde sea que esté el dibujo dentro del archivo, tiene que
   * terminar calzando exactamente sobre (0,0)-(ancho,alto) de la pieza.
   *
   * Es lo que se rompió una vez: el canvas dibujaba la imagen entera y el disco
   * de una insignia de 10 cm salía de 7.47. Ahora esta función la usan el canvas
   * y la exportación, así que si falla, falla en los dos lados a la vez.
   */
  it('el contenido calza exactamente sobre el rectangulo de la pieza', () => {
    const fraction = { x: 0.2, y: 0.1, width: 0.5, height: 0.6 }
    const draw = contentDrawRect(10, 6, fraction)

    const izquierda = draw.xCm + fraction.x * draw.widthCm
    const arriba = draw.yCm + fraction.y * draw.heightCm
    const derecha = izquierda + fraction.width * draw.widthCm
    const abajo = arriba + fraction.height * draw.heightCm

    expect(izquierda).toBeCloseTo(0)
    expect(arriba).toBeCloseTo(0)
    expect(derecha).toBeCloseTo(10)
    expect(abajo).toBeCloseTo(6)
  })

  it('si el dibujo ocupa poco del archivo, la imagen se dibuja mas grande', () => {
    // La insignia real: el disco ocupa el 74.7% del ancho del archivo.
    const draw = contentDrawRect(10, 10, { x: 0.117, y: 0.1, width: 0.747, height: 0.78 })
    expect(draw.widthCm).toBeGreaterThan(10)
    // Y arranca antes del origen, porque el margen queda afuera de la pieza.
    expect(draw.xCm).toBeLessThan(0)
  })
})
