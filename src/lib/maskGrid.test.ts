import { describe, it, expect } from 'vitest'
import { createMask, dilate, resample, rotateQuarterTurns, type Mask } from './mask'

/** Igual que en mask.test.ts: '#' ocupado, '.' libre. */
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

function toLines(mask: Mask): string[] {
  const out: string[] = []
  for (let row = 0; row < mask.rows; row++) {
    let line = ''
    for (let col = 0; col < mask.cols; col++) line += mask.cells[row * mask.cols + col] === 1 ? '#' : '.'
    out.push(line)
  }
  return out
}

describe('resample', () => {
  it('al achicar marca la celda si CUALQUIER origen estaba ocupado', () => {
    // 4x2 con una sola celda ocupada -> al bajar a 2x1 esa mitad queda ocupada.
    const r = resample(maskFrom(['#...', '....']), 2, 1)
    expect(toLines(r)).toEqual(['#.'])
  })

  it('al agrandar no deja agujeros', () => {
    const r = resample(maskFrom(['#.']), 4, 2)
    expect(toLines(r)).toEqual(['##..', '##..'])
  })

  it('mantener el tamano no cambia nada', () => {
    const original = ['#.#', '.#.']
    expect(toLines(resample(maskFrom(original), 3, 2))).toEqual(original)
  })
})

describe('rotateQuarterTurns', () => {
  it('90 grados en sentido horario intercambia ancho y alto', () => {
    const r = rotateQuarterTurns(maskFrom(['##.']), 1)
    expect(r.cols).toBe(1)
    expect(r.rows).toBe(3)
    expect(toLines(r)).toEqual(['#', '#', '.'])
  })

  it('180 grados da vuelta la figura sin cambiar el tamano', () => {
    expect(toLines(rotateQuarterTurns(maskFrom(['#..', '...']), 2))).toEqual(['...', '..#'])
  })

  it('cuatro cuartos vuelven al original', () => {
    const original = ['#.#', '..#', '.#.']
    let m = maskFrom(original)
    for (let i = 0; i < 4; i++) m = rotateQuarterTurns(m, 1)
    expect(toLines(m)).toEqual(original)
  })

  it('270 es lo mismo que tres veces 90', () => {
    const base = maskFrom(['##.', '#..'])
    const tresVeces = rotateQuarterTurns(rotateQuarterTurns(rotateQuarterTurns(base, 1), 1), 1)
    expect(toLines(rotateQuarterTurns(base, 3))).toEqual(toLines(tresVeces))
  })
})

describe('dilate', () => {
  it('una celda sola se vuelve un cuadrado de 3x3', () => {
    const d = dilate(maskFrom(['#']), 1)
    expect(d.cols).toBe(3)
    expect(d.rows).toBe(3)
    expect(toLines(d)).toEqual(['###', '###', '###'])
  })

  it('la mascara crece radius por cada lado', () => {
    const d = dilate(maskFrom(['##', '##']), 2)
    expect(d.cols).toBe(6)
    expect(d.rows).toBe(6)
  })

  it('radio 0 devuelve una copia igual', () => {
    const original = ['#.', '.#']
    expect(toLines(dilate(maskFrom(original), 0))).toEqual(original)
  })

  it('rellena el hueco entre dos celdas vecinas', () => {
    // Dos celdas separadas por una vacia: al dilatar 1, el medio se une.
    const d = dilate(maskFrom(['#.#']), 1)
    expect(toLines(d)[1]).toBe('#####')
  })

  it('no pierde nada de lo que ya estaba ocupado', () => {
    const base = maskFrom(['.#.', '###', '.#.'])
    const d = dilate(base, 1)
    for (let row = 0; row < base.rows; row++) {
      for (let col = 0; col < base.cols; col++) {
        if (base.cells[row * base.cols + col] === 1) {
          expect(d.cells[(row + 1) * d.cols + (col + 1)]).toBe(1)
        }
      }
    }
  })
})
