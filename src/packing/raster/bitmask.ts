import { createMask, type Mask } from '../../lib/mask'

/**
 * Mascara empaquetada en bits: 32 celdas por palabra de 32 bits.
 *
 * POR QUE: durante el packing hay que preguntar millones de veces "esta pieza
 * entra en esta posicion?". Con un byte por celda, una pieza de 10x7 cm a 1 mm
 * son 7000 comparaciones por posicion probada; empaquetada en bits son 280
 * operaciones de palabra. Para un trabajo de 100 piezas la diferencia es entre
 * decenas de milisegundos y varios segundos.
 *
 * Por eso aca los bitsets NO son optimizacion prematura: son el requisito que
 * hace viable el nesting por forma. En cambio todo lo que se hace UNA vez por
 * diseno (recortar, rotar, dilatar) se queda en el `Mask` de un byte por celda,
 * que es muchisimo mas facil de leer y de testear.
 *
 * Convencion de bits: el bit `i` de la palabra `w` de una fila es la columna
 * `w * 32 + i`.
 */
export interface BitMask {
  cols: number
  rows: number
  /** Palabras de 32 bits por fila. */
  stride: number
  words: Uint32Array
}

export function createBitMask(cols: number, rows: number): BitMask {
  const stride = Math.ceil(cols / 32)
  return { cols, rows, stride, words: new Uint32Array(stride * rows) }
}

export function setBit(mask: BitMask, col: number, row: number): void {
  if (col < 0 || row < 0 || col >= mask.cols || row >= mask.rows) return
  mask.words[row * mask.stride + (col >>> 5)] |= 1 << (col & 31)
}

export function getBit(mask: BitMask, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= mask.cols || row >= mask.rows) return false
  return (mask.words[row * mask.stride + (col >>> 5)] & (1 << (col & 31))) !== 0
}

export function countBits(mask: BitMask): number {
  let n = 0
  for (let i = 0; i < mask.words.length; i++) {
    // Conteo de bits encendidos de a uno: esto corre en tests y diagnosticos,
    // no en el camino caliente del packing.
    let w = mask.words[i]
    while (w !== 0) {
      w &= w - 1
      n++
    }
  }
  return n
}

/** Empaqueta una mascara de un byte por celda. */
export function packMask(mask: Mask): BitMask {
  const out = createBitMask(mask.cols, mask.rows)
  for (let row = 0; row < mask.rows; row++) {
    for (let col = 0; col < mask.cols; col++) {
      if (mask.cells[row * mask.cols + col] === 1) setBit(out, col, row)
    }
  }
  return out
}

/** Desempaqueta a un byte por celda. Sirve para tests y para depurar. */
export function unpackMask(bits: BitMask): Mask {
  const out = createMask(bits.cols, bits.rows)
  for (let row = 0; row < bits.rows; row++) {
    for (let col = 0; col < bits.cols; col++) {
      if (getBit(bits, col, row)) out.cells[row * bits.cols + col] = 1
    }
  }
  return out
}

/**
 * Se pisan `a` y `b`, estando `b` corrida a (colOffset, rowOffset) respecto del
 * origen de `a`?
 *
 * Lo que queda fuera de `a` NO cuenta como choque: los limites del lienzo se
 * controlan aparte. Aca solo se pregunta por celdas ocupadas contra celdas
 * ocupadas.
 *
 * El truco esta en que las columnas de `b` casi nunca caen alineadas con las
 * palabras de `a`: hay que tomar 32 bits de `a` empezando en una columna
 * cualquiera, y eso se arma combinando dos palabras consecutivas con un
 * corrimiento.
 */
export function overlapsAt(
  a: BitMask,
  b: BitMask,
  colOffset: number,
  rowOffset: number,
): boolean {
  // El desfasaje dentro de la palabra es el mismo para toda la mascara: la
  // palabra w de `b` arranca en la columna colOffset + w*32, y sumar multiplos
  // de 32 no cambia el resto. Asi que se calcula una sola vez, no por palabra.
  const baseWordIndex = Math.floor(colOffset / 32)
  const bitOffset = colOffset - baseWordIndex * 32
  const shiftBack = 32 - bitOffset

  for (let row = 0; row < b.rows; row++) {
    const rowInA = rowOffset + row
    if (rowInA < 0 || rowInA >= a.rows) continue

    const baseB = row * b.stride
    const baseA = rowInA * a.stride

    for (let w = 0; w < b.stride; w++) {
      const wordB = b.words[baseB + w]
      if (wordB === 0) continue

      const wordIndex = baseWordIndex + w
      const low = wordIndex >= 0 && wordIndex < a.stride ? a.words[baseA + wordIndex] : 0
      const highIndex = wordIndex + 1
      const high = highIndex >= 0 && highIndex < a.stride ? a.words[baseA + highIndex] : 0

      // Los 32 bits de `a` que arrancan en startCol. Si el corrimiento es 0 no
      // hay que combinar nada: en JavaScript, correr 32 lugares no hace nada
      // (el contador se toma modulo 32) y daria un resultado incorrecto.
      const bitsOfA = bitOffset === 0 ? low : (low >>> bitOffset) | (high << shiftBack)

      if ((bitsOfA & wordB) !== 0) return true
    }
  }
  return false
}
