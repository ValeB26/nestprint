import { describe, it, expect } from 'vitest'
import { createMask, erode, countOccupied, type Mask } from './mask'
import { reachableBackground, MAX_RESCUED_SHARE } from './designMask'

/**
 * Tests del blanco SELLADO: el que queda atrapado detras de una barrera fina.
 *
 * El caso real: en el logo de una polleria, los contornos negros de la "L" y
 * la "A" casi se tocan y dejan una cuña blanca encerrada. El relleno desde el
 * borde no llega, asi que "Quitar borde" la conservaba: se veia sobre lienzo
 * oscuro y se habria impreso como tinta blanca.
 */

/** Mascara a partir de un dibujo con texto. '#' = ocupado. */
function mascara(filas: string[]): Mask {
  const m = createMask(filas[0].length, filas.length)
  filas.forEach((fila, row) => {
    for (let col = 0; col < fila.length; col++) {
      m.cells[row * m.cols + col] = fila[col] === '#' ? 1 : 0
    }
  })
  return m
}

/** Dibuja que celdas quedaron marcadas como fondo, para leer el fallo. */
function dibujar(cells: Uint8Array, cols: number, rows: number): string[] {
  const out: string[] = []
  for (let row = 0; row < rows; row++) {
    let linea = ''
    for (let col = 0; col < cols; col++) linea += cells[row * cols + col] === 1 ? 'o' : '.'
    out.push(linea)
  }
  return out
}

describe('erode', () => {
  it('se come el borde: un bloque macizo encoge por los cuatro lados', () => {
    const lleno = mascara(['#####', '#####', '#####', '#####', '#####'])
    const chico = erode(lleno, 1)
    expect(dibujar(chico.cells, 5, 5)).toEqual([
      '.....',
      '.ooo.',
      '.ooo.',
      '.ooo.',
      '.....',
    ])
  })

  it('una barrera mas fina que el radio desaparece entera', () => {
    const linea = mascara(['.....', '.....', '#####', '.....', '.....'])
    expect(countOccupied(erode(linea, 1))).toBe(0)
  })

  it('una barrera gruesa sobrevive', () => {
    const gruesa = mascara(['#####', '#####', '#####', '#####', '#####'])
    expect(countOccupied(erode(gruesa, 1))).toBeGreaterThan(0)
  })

  it('con radio 0 no cambia nada', () => {
    const m = mascara(['#.#', '.#.', '#.#'])
    expect(Array.from(erode(m, 0).cells)).toEqual(Array.from(m.cells))
  })

  it('no toca la mascara original', () => {
    const m = mascara(['###', '###', '###'])
    const antes = Array.from(m.cells)
    erode(m, 1)
    expect(Array.from(m.cells)).toEqual(antes)
  })
})

describe('reachableBackground', () => {
  /**
   * Un diseño con DOS blancos encerrados, en la proporcion del caso real:
   *  - a la izquierda, uno grande con pared GRUESA (el relleno de una insignia,
   *    el cuerpo del pollo): tiene que quedarse
   *  - a la derecha, uno chico sellado por una pared de UNA celda (la cuña
   *    atrapada entre dos letras): tiene que irse
   *
   * Las proporciones importan: la bolsa sellada es el 12% del blanco encerrado,
   * por debajo de la guarda. Si fuera la mayoria, el rescate no se aplicaria —
   * eso lo cubre el test del dibujo de linea fina.
   */
  const dibujo = [
    '........................',
    '.##############.........',
    '.##############.........',
    '.##############.........',
    '.###........###..#####..',
    '.###........###..#...#..',
    '.###........###..#...#..',
    '.###........###..#...#..',
    '.###........###..#####..',
    '.###........###.........',
    '.###........###.........',
    '.###........###.........',
    '.##############.........',
    '.##############.........',
    '.##############.........',
    '........................',
  ]

  const solido = mascara(dibujo)
  // Es blanco todo lo que no es trazo.
  const esBlanco = (i: number) => solido.cells[i] === 0

  it('rescata el blanco sellado por una pared fina', () => {
    const fondo = reachableBackground(solido, esBlanco)
    // La bolsa de la derecha (paredes de 1 celda) pasa a ser fondo.
    expect(fondo[6 * solido.cols + 19]).toBe(1)
  })

  it('conserva el blanco encerrado por una pared gruesa', () => {
    const fondo = reachableBackground(solido, esBlanco)
    // El hueco de la izquierda (paredes de 3 celdas) sigue siendo contenido.
    expect(fondo[7 * solido.cols + 8]).toBe(0)
  })

  it('nunca marca un trazo como fondo', () => {
    const fondo = reachableBackground(solido, esBlanco)
    for (let i = 0; i < solido.cells.length; i++) {
      if (solido.cells[i] === 1) expect(fondo[i]).toBe(0)
    }
  })

  it('no quita nada si no hay blanco sellado', () => {
    // Un cuadrado macizo: todo el blanco es exterior, no hay nada que rescatar.
    const simple = mascara([
      '......',
      '.####.',
      '.####.',
      '.####.',
      '......',
    ])
    const fondo = reachableBackground(simple, (i) => simple.cells[i] === 0)
    expect(dibujar(fondo, simple.cols, simple.rows)).toEqual([
      'oooooo',
      'o....o',
      'o....o',
      'o....o',
      'oooooo',
    ])
  })

  it('la guarda frena el rescate cuando se llevaria casi todo', () => {
    // Dibujo de linea fina: trazos de 1 celda con relleno blanco adentro.
    // Adelgazar atravesaria TODOS los trazos y vaciaria los rellenos, que es
    // justo lo que "Quitar borde" existe para evitar. Preferimos no tocar nada.
    const lineArt = mascara([
      '.............',
      '.###.###.###.',
      '.#.#.#.#.#.#.',
      '.###.###.###.',
      '.............',
    ])
    const blancoLineArt = (i: number) => lineArt.cells[i] === 0
    const fondo = reachableBackground(lineArt, blancoLineArt)

    // Los tres rellenos interiores siguen siendo contenido.
    for (const col of [2, 6, 10]) {
      expect(fondo[2 * lineArt.cols + col]).toBe(0)
    }
  })

  it('el umbral de la guarda es una porcion, no un valor absoluto', () => {
    expect(MAX_RESCUED_SHARE).toBeGreaterThan(0)
    expect(MAX_RESCUED_SHARE).toBeLessThan(1)
  })
})
