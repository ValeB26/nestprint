import { describe, it, expect } from 'vitest'
import { createMask, type Mask } from '../../lib/mask'
import {
  countBits,
  createBitMask,
  getBit,
  overlapsAt,
  packMask,
  setBit,
  unpackMask,
} from './bitmask'

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

/** Una mascara ancha, para que cruce el limite de 32 bits de una palabra. */
function wideMask(cols: number, occupiedCols: number[]): Mask {
  const mask = createMask(cols, 1)
  for (const col of occupiedCols) mask.cells[col] = 1
  return mask
}

describe('empaquetado', () => {
  it('ida y vuelta no pierde nada', () => {
    const original = ['#.#.', '.##.', '....', '###.']
    expect(toLines(unpackMask(packMask(maskFrom(original))))).toEqual(original)
  })

  it('funciona con mas de 32 columnas (varias palabras por fila)', () => {
    const cols = 100
    const ocupadas = [0, 31, 32, 33, 63, 64, 99]
    const bits = packMask(wideMask(cols, ocupadas))
    expect(bits.stride).toBe(4)
    for (const col of ocupadas) expect(getBit(bits, col, 0)).toBe(true)
    expect(getBit(bits, 1, 0)).toBe(false)
    expect(getBit(bits, 98, 0)).toBe(false)
    expect(countBits(bits)).toBe(ocupadas.length)
  })

  it('leer o escribir fuera de la grilla no rompe', () => {
    const bits = createBitMask(4, 2)
    setBit(bits, 10, 0)
    setBit(bits, -1, 0)
    expect(countBits(bits)).toBe(0)
    expect(getBit(bits, 10, 0)).toBe(false)
  })

  it('el bit 31 (el del signo) se maneja bien', () => {
    const bits = createBitMask(32, 1)
    setBit(bits, 31, 0)
    expect(getBit(bits, 31, 0)).toBe(true)
    expect(countBits(bits)).toBe(1)
  })
})

describe('overlapsAt', () => {
  const cuadrado = packMask(maskFrom(['##', '##']))

  it('encimadas se pisan', () => {
    expect(overlapsAt(cuadrado, cuadrado, 0, 0)).toBe(true)
  })

  it('pegadas pero sin encimarse, no', () => {
    expect(overlapsAt(cuadrado, cuadrado, 2, 0)).toBe(false)
    expect(overlapsAt(cuadrado, cuadrado, 0, 2)).toBe(false)
  })

  it('corridas una celda, si', () => {
    expect(overlapsAt(cuadrado, cuadrado, 1, 0)).toBe(true)
    expect(overlapsAt(cuadrado, cuadrado, 1, 1)).toBe(true)
  })

  it('lo que cae afuera de la grilla no cuenta como choque', () => {
    expect(overlapsAt(cuadrado, cuadrado, -5, 0)).toBe(false)
    expect(overlapsAt(cuadrado, cuadrado, 0, 50)).toBe(false)
  })

  it('acepta desplazamientos negativos', () => {
    expect(overlapsAt(cuadrado, cuadrado, -1, 0)).toBe(true)
    expect(overlapsAt(cuadrado, cuadrado, -2, 0)).toBe(false)
  })

  it('detecta bien cruzando el limite de palabra', () => {
    // Una sola celda ocupada en la columna 40 de un tablero ancho.
    const tablero = packMask(wideMask(200, [40]))
    const punto = packMask(wideMask(1, [0]))

    // Probamos TODOS los desplazamientos: si el corrimiento de bits estuviera
    // mal, fallaria justo al cruzar de una palabra a la siguiente.
    for (let offset = 0; offset < 200; offset++) {
      expect(overlapsAt(tablero, punto, offset, 0)).toBe(offset === 40)
    }
  })

  it('detecta bien una pieza ancha cruzando varias palabras', () => {
    const tablero = packMask(wideMask(200, [70]))
    const barra = packMask(wideMask(40, [0, 39]))
    // La barra toca en 70 si su inicio esta en 70, o si su otra punta cae ahi.
    expect(overlapsAt(tablero, barra, 70, 0)).toBe(true)
    expect(overlapsAt(tablero, barra, 31, 0)).toBe(true)
    expect(overlapsAt(tablero, barra, 50, 0)).toBe(false)
  })
})
