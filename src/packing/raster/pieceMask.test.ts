import { describe, it, expect } from 'vitest'
import { createMask, type Mask } from '../../lib/mask'
import { overlapsAt, unpackMask } from './bitmask'
import { buildPieceMask, pieceCells } from './pieceMask'

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

/** Un diseno macizo, el caso mas simple: ocupa todo su rectangulo. */
const MACIZO = maskFrom(['##', '##'])

describe('tamano de la mascara', () => {
  it('traduce centimetros a celdas y suma la dilatacion', () => {
    // 2 x 2 cm con celdas de 1 mm = 20 x 20 celdas.
    // gap 2 mm -> dilata 1 mm por lado = 1 celda -> 22 x 22.
    const pm = buildPieceMask(MACIZO, 2, 2, 0, { cellCm: 0.1, gapCm: 0.2 })
    expect(pieceCells(pm)).toEqual({ cols: 20, rows: 20 })
    expect(pm.padding).toBe(1)
    expect(pm.bits.cols).toBe(22)
    expect(pm.bits.rows).toBe(22)
  })

  it('sin separacion no dilata nada', () => {
    const pm = buildPieceMask(MACIZO, 2, 2, 0, { cellCm: 0.1, gapCm: 0 })
    expect(pm.padding).toBe(0)
    expect(pm.bits.cols).toBe(20)
  })

  it('redondea las celdas hacia arriba: nunca de menos', () => {
    // 2.05 cm con celdas de 1 mm no da entero: tiene que dar 21, no 20.
    const pm = buildPieceMask(MACIZO, 2.05, 1, 0, { cellCm: 0.1, gapCm: 0 })
    expect(pieceCells(pm).cols).toBe(21)
  })

  it('rotar un cuarto intercambia ancho y alto', () => {
    const pm = buildPieceMask(MACIZO, 4, 1, 1, { cellCm: 0.5, gapCm: 0 })
    expect(pieceCells(pm)).toEqual({ cols: 2, rows: 8 })
  })
})

describe('la separacion queda representada en la forma', () => {
  /**
   * La propiedad que sostiene todo el metodo: si dos piezas dilatadas en gap/2
   * no se pisan, entre sus formas REALES queda la separacion pedida.
   */
  it('la primera posicion sin choque deja exactamente el gap', () => {
    const cellCm = 0.1
    const gapCm = 0.2
    const a = buildPieceMask(MACIZO, 2, 2, 0, { cellCm, gapCm })
    const b = buildPieceMask(MACIZO, 2, 2, 0, { cellCm, gapCm })

    // Corremos b hacia la derecha hasta que deje de pisar a a.
    let offset = 0
    while (overlapsAt(a.bits, b.bits, offset, 0)) offset++

    // Separacion entre los bordes VISIBLES, descontando la dilatacion.
    const visibleCols = pieceCells(a).cols
    const separacionEnCeldas = offset - visibleCols
    expect(separacionEnCeldas * cellCm).toBeCloseTo(gapCm)
  })

  it('una celda mas cerca, se pisan', () => {
    const a = buildPieceMask(MACIZO, 2, 2, 0, { cellCm: 0.1, gapCm: 0.2 })
    expect(overlapsAt(a.bits, a.bits, 22, 0)).toBe(false)
    expect(overlapsAt(a.bits, a.bits, 21, 0)).toBe(true)
  })

  it('vale igual en vertical', () => {
    const cellCm = 0.1
    const gapCm = 0.4
    const a = buildPieceMask(MACIZO, 1, 1, 0, { cellCm, gapCm })
    let offset = 0
    while (overlapsAt(a.bits, a.bits, 0, offset)) offset++
    expect((offset - pieceCells(a).rows) * cellCm).toBeCloseTo(gapCm)
  })
})

describe('colision por forma, no por rectangulo', () => {
  /**
   * Esto es lo que justifica todo: una pieza chica entra en la escotadura de
   * una forma en L, aunque caiga DENTRO de su rectangulo delimitador.
   */
  const L = maskFrom([
    '####',
    '#...',
    '#...',
    '#...',
  ])

  it('una pieza chica entra en la escotadura', () => {
    const grande = buildPieceMask(L, 4, 4, 0, { cellCm: 1, gapCm: 0 })
    const chica = buildPieceMask(maskFrom(['#']), 1, 1, 0, { cellCm: 1, gapCm: 0 })

    // (2,2) cae dentro del rectangulo de la L, pero en su parte vacia.
    expect(overlapsAt(grande.bits, chica.bits, 2, 2)).toBe(false)
    // Sobre el brazo izquierdo si choca.
    expect(overlapsAt(grande.bits, chica.bits, 0, 2)).toBe(true)
    // Sobre la barra de arriba tambien.
    expect(overlapsAt(grande.bits, chica.bits, 2, 0)).toBe(true)
  })

  it('con separacion, la pieza chica ya no entra tan cerca del brazo', () => {
    const grande = buildPieceMask(L, 4, 4, 1, { cellCm: 1, gapCm: 2 })
    const chica = buildPieceMask(maskFrom(['#']), 1, 1, 1, { cellCm: 1, gapCm: 2 })
    // Dilatadas una celda cada una, la escotadura se achica y el hueco de
    // antes deja de alcanzar.
    expect(overlapsAt(grande.bits, chica.bits, 2 + grande.padding, 2 + grande.padding)).toBe(true)
  })

  it('la forma sobrevive al viaje a celdas y bits', () => {
    const pm = buildPieceMask(L, 4, 4, 0, { cellCm: 1, gapCm: 0 })
    expect(toLines(unpackMask(pm.bits))).toEqual(['####', '#...', '#...', '#...'])
  })
})

describe('contra la medicion real de la insignia', () => {
  /** Un disco macizo en una grilla cuadrada, como la insignia del negocio. */
  function disco(size: number): Mask {
    const mask = createMask(size, size)
    const r = size / 2
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const dx = col + 0.5 - r
        const dy = row + 0.5 - r
        if (dx * dx + dy * dy <= r * r) mask.cells[row * size + col] = 1
      }
    }
    return mask
  }

  it('un disco ocupa alrededor de pi/4 de su caja (lo medido: 77.6%)', () => {
    const pm = buildPieceMask(disco(128), 10, 10, 0, { cellCm: 0.1, gapCm: 0 })
    const celdas = unpackMask(pm.bits)
    let ocupadas = 0
    for (let i = 0; i < celdas.cells.length; i++) ocupadas += celdas.cells[i]
    const densidad = ocupadas / (celdas.cols * celdas.rows)

    // pi/4 = 0.785. El remuestreo redondea hacia afuera, asi que da un poco mas
    // (nunca menos: subestimar la forma permitiria que dos piezas se toquen).
    expect(densidad).toBeGreaterThanOrEqual(Math.PI / 4)
    expect(densidad).toBeLessThan(Math.PI / 4 + 0.03)
  })

  it('las esquinas del disco quedan libres: eso es lo que se gana', () => {
    const pm = buildPieceMask(disco(128), 10, 10, 0, { cellCm: 0.1, gapCm: 0 })
    const celdas = unpackMask(pm.bits)
    const ultima = celdas.cols - 1
    expect(celdas.cells[0]).toBe(0) // esquina superior izquierda
    expect(celdas.cells[ultima]).toBe(0) // superior derecha
    expect(celdas.cells[(celdas.rows - 1) * celdas.cols]).toBe(0) // inferior izquierda
    // Y el centro, obviamente, ocupado.
    const medio = Math.floor(celdas.rows / 2) * celdas.cols + Math.floor(celdas.cols / 2)
    expect(celdas.cells[medio]).toBe(1)
  })
})
