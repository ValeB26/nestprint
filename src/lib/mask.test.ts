import { describe, it, expect } from 'vitest'
import {
  contentBox,
  countOccupied,
  createMask,
  cropMask,
  fillInteriorHoles,
  interiorHoleSpace,
  isOccupied,
  largestEmptySquare,
  outsideRegion,
  type Mask,
} from './mask'

/**
 * Las mascaras se arman a mano desde texto, asi los tests se leen como un
 * dibujo: '#' es tinta, '.' es vacio. Nada de DOM ni de imagenes.
 */
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

/** Vuelve a texto, para comparar contra un dibujo esperado. */
function maskToLines(mask: Mask): string[] {
  const out: string[] = []
  for (let row = 0; row < mask.rows; row++) {
    let line = ''
    for (let col = 0; col < mask.cols; col++) {
      line += mask.cells[row * mask.cols + col] === 1 ? '#' : '.'
    }
    out.push(line)
  }
  return out
}

/** Un aro: borde cerrado con el interior vacio. Como la insignia. */
const ARO = [
  '.....',
  '.###.',
  '.#.#.',
  '.###.',
  '.....',
]

describe('contentBox', () => {
  it('encuentra el rectangulo que contiene a la tinta', () => {
    expect(contentBox(maskFrom(ARO))).toEqual({ col: 1, row: 1, cols: 3, rows: 3 })
  })

  it('devuelve null si no hay nada', () => {
    expect(contentBox(maskFrom(['...', '...']))).toBeNull()
  })

  it('con la tinta pegada a los bordes, el box es todo el diseno', () => {
    const mask = maskFrom(['#..', '..#'])
    expect(contentBox(mask)).toEqual({ col: 0, row: 0, cols: 3, rows: 2 })
  })
})

describe('cropMask', () => {
  it('recorta al content box sin perder tinta', () => {
    const mask = maskFrom(ARO)
    const box = contentBox(mask)!
    const cropped = cropMask(mask, box)
    expect(maskToLines(cropped)).toEqual(['###', '#.#', '###'])
    expect(countOccupied(cropped)).toBe(countOccupied(mask))
  })
})

describe('outsideRegion', () => {
  it('separa el afuera del hueco encerrado', () => {
    const mask = maskFrom(ARO)
    const outside = outsideRegion(mask)
    // La esquina de arriba a la izquierda es afuera.
    expect(outside[0]).toBe(1)
    // El centro del aro NO es afuera: esta encerrado.
    expect(outside[2 * 5 + 2]).toBe(0)
  })

  it('un hueco que toca el borde no es interior', () => {
    // El aro abierto por abajo: el centro se comunica con el exterior.
    const abierto = maskFrom([
      '.....',
      '.###.',
      '.#.#.',
      '.#.#.',
      '.....',
    ])
    const outside = outsideRegion(abierto)
    expect(outside[2 * 5 + 2]).toBe(1)
  })
})

describe('fillInteriorHoles', () => {
  it('rellena el interior del aro (la huella de la insignia)', () => {
    expect(maskToLines(fillInteriorHoles(maskFrom(ARO)))).toEqual([
      '.....',
      '.###.',
      '.###.',
      '.###.',
      '.....',
    ])
  })

  it('no toca una forma sin huecos', () => {
    const solido = maskFrom(['.##.', '.##.'])
    expect(maskToLines(fillInteriorHoles(solido))).toEqual(['.##.', '.##.'])
  })

  it('no rellena concavidades abiertas: ahi SI se puede anidar', () => {
    // Una "U": el hueco de arriba se alcanza desde afuera.
    const u = maskFrom([
      '#.#',
      '#.#',
      '###',
    ])
    expect(maskToLines(fillInteriorHoles(u))).toEqual(['#.#', '#.#', '###'])
  })
})

describe('interiorHoleSpace', () => {
  it('deja libre solo el hueco de adentro', () => {
    expect(maskToLines(interiorHoleSpace(maskFrom(ARO)))).toEqual([
      '#####',
      '#####',
      '##.##',
      '#####',
      '#####',
    ])
  })
})

describe('largestEmptySquare', () => {
  it('mide el hueco interior de un aro', () => {
    const hueco = interiorHoleSpace(maskFrom(ARO))
    const sq = largestEmptySquare(hueco)
    expect(sq.side).toBe(1)
    expect(sq.col).toBe(2)
    expect(sq.row).toBe(2)
  })

  it('encuentra el cuadrado mas grande, no la tira mas larga', () => {
    // Una tira de 6 de ancho por 1 de alto, y un cuadrado de 2x2.
    const mask = maskFrom([
      '......##',
      '######..',
      '######..',
    ])
    expect(largestEmptySquare(mask).side).toBe(2)
  })

  it('devuelve 0 si no hay lugar', () => {
    expect(largestEmptySquare(maskFrom(['##', '##'])).side).toBe(0)
  })
})

describe('isOccupied', () => {
  it('fuera de la grilla cuenta como libre', () => {
    const mask = maskFrom(['#'])
    expect(isOccupied(mask, 0, 0)).toBe(true)
    expect(isOccupied(mask, 5, 5)).toBe(false)
    expect(isOccupied(mask, -1, 0)).toBe(false)
  })
})
