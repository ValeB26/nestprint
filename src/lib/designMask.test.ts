import { describe, it, expect } from 'vitest'
import { analyzeDesign, type ImageSample } from './designMask'
import { countOccupied, type Mask } from './mask'

/**
 * Las muestras se arman desde texto, donde cada letra es un color:
 *   '.' transparente   'B' blanco opaco   'K' negro (tinta)   'C' color
 * Asi los casos se leen como un dibujo y no hace falta ninguna imagen real.
 */
const COLORS: Record<string, [number, number, number, number]> = {
  '.': [0, 0, 0, 0],
  B: [255, 255, 255, 255],
  K: [0, 0, 0, 255],
  C: [40, 120, 200, 255],
}

function sampleFrom(lines: string[]): ImageSample {
  const rows = lines.length
  const cols = lines[0].length
  const rgba = new Uint8ClampedArray(cols * rows * 4)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const [r, g, b, a] = COLORS[lines[row][col]]
      const o = (row * cols + col) * 4
      rgba[o] = r
      rgba[o + 1] = g
      rgba[o + 2] = b
      rgba[o + 3] = a
    }
  }
  return { cols, rows, rgba, sourceWidthPx: cols, sourceHeightPx: rows }
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

/**
 * La insignia: un aro negro sobre fondo blanco OPACO, con el interior blanco
 * tambien. Es el caso real de la imagen 1 que medimos.
 */
const INSIGNIA = [
  'BBBBBBB',
  'BBKKKBB',
  'BBKBKBB',
  'BBKKKBB',
  'BBBBBBB',
]

const SIN_NESTING = { allowInteriorNesting: false }

describe('PNG sin transparencia (la insignia)', () => {
  it('lo detecta como opaco y avisa cuanto blanco tiene', () => {
    const g = analyzeDesign(sampleFrom(INSIGNIA), { background: 'none', ...SIN_NESTING })
    expect(g.isOpaque).toBe(true)
    expect(g.whiteFraction).toBeGreaterThan(0.5)
  })

  it('sin tratar el fondo, ocupa el archivo entero (el bug actual)', () => {
    const g = analyzeDesign(sampleFrom(INSIGNIA), { background: 'none', ...SIN_NESTING })
    expect(g.box).toEqual({ col: 0, row: 0, cols: 7, rows: 5 })
    expect(g.density).toBe(1)
  })

  it('modo "border" conserva el blanco interior: queda el disco entero', () => {
    const g = analyzeDesign(sampleFrom(INSIGNIA), { background: 'border', ...SIN_NESTING })
    // El fondo de afuera se fue; el aro y su relleno blanco quedan.
    expect(toLines(g.ink)).toEqual([
      '.......',
      '..###..',
      '..###..',
      '..###..',
      '.......',
    ])
    expect(g.box).toEqual({ col: 2, row: 1, cols: 3, rows: 3 })
  })

  it('modo "white" deja solo la tinta, pero la HUELLA sigue siendo el disco', () => {
    const g = analyzeDesign(sampleFrom(INSIGNIA), { background: 'white', ...SIN_NESTING })
    // Lo que se imprime: solo el aro negro, con el centro transparente.
    expect(toLines(g.ink)).toEqual([
      '.......',
      '..###..',
      '..#.#..',
      '..###..',
      '.......',
    ])
    // Lo que ocupa: el centro se rellena para poder separar al cortar.
    expect(countOccupied(g.footprint)).toBe(9)
    expect(g.density).toBe(1)
  })

  it('habilitando el anidado, el hueco del aro queda disponible', () => {
    const g = analyzeDesign(sampleFrom(INSIGNIA), {
      background: 'white',
      allowInteriorNesting: true,
    })
    expect(countOccupied(g.footprint)).toBe(8) // el centro queda libre
    expect(g.density).toBeLessThan(1)
  })

  it('mide el hueco interior para poder mostrarselo al usuario', () => {
    const g = analyzeDesign(sampleFrom(INSIGNIA), { background: 'white', ...SIN_NESTING })
    // Hueco de 1 celda sobre un content box de 3 de ancho.
    expect(g.largestHoleFraction).toBeCloseTo(1 / 3)
  })
})

describe('PNG con transparencia (el lettering)', () => {
  const LETTERING = [
    '..CC..',
    '.CCCC.',
    '..CC..',
    '......',
  ]

  it('no lo marca como opaco', () => {
    const g = analyzeDesign(sampleFrom(LETTERING), { background: 'none', ...SIN_NESTING })
    expect(g.isOpaque).toBe(false)
    expect(g.whiteFraction).toBe(0)
  })

  it('quitar el blanco no lo altera: no tiene un solo pixel blanco', () => {
    const base = analyzeDesign(sampleFrom(LETTERING), { background: 'none', ...SIN_NESTING })
    const sinBlanco = analyzeDesign(sampleFrom(LETTERING), { background: 'white', ...SIN_NESTING })
    expect(toLines(sinBlanco.ink)).toEqual(toLines(base.ink))
  })

  it('recorta el margen transparente y da la proporcion del dibujo', () => {
    const g = analyzeDesign(sampleFrom(LETTERING), { background: 'none', ...SIN_NESTING })
    expect(g.box).toEqual({ col: 1, row: 0, cols: 4, rows: 3 })
    expect(g.heightOverWidth).toBeCloseTo(3 / 4)
  })

  it('una concavidad abierta no se rellena: ahi si se puede anidar', () => {
    const u = analyzeDesign(sampleFrom(['C.C', 'C.C', 'CCC']), {
      background: 'none',
      ...SIN_NESTING,
    })
    expect(toLines(u.footprint)).toEqual(['#.#', '#.#', '###'])
    expect(u.largestHoleFraction).toBe(0) // no hay hueco ENCERRADO
  })
})

describe('caso borde', () => {
  it('una muestra vacia no rompe nada', () => {
    const g = analyzeDesign(sampleFrom(['..', '..']), { background: 'none', ...SIN_NESTING })
    expect(g.box).toBeNull()
    expect(g.density).toBe(0)
    expect(g.heightOverWidth).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Rampa de blanco y fraccion del contenido
// ---------------------------------------------------------------------------

import { whiteness, DEFAULT_WHITE_THRESHOLD, DEFAULT_WHITE_SOFTNESS } from './designMask'

const T = DEFAULT_WHITE_THRESHOLD
const S = DEFAULT_WHITE_SOFTNESS

describe('whiteness', () => {
  it('el blanco puro es fondo del todo y el negro no es nada', () => {
    expect(whiteness(255, 255, 255, T, S)).toBe(1)
    expect(whiteness(0, 0, 0, T, S)).toBe(0)
  })

  it('los casi blancos se descuentan en forma gradual', () => {
    // Justo en el umbral: fondo completo.
    expect(whiteness(T, T, T, T, S)).toBe(1)
    // En el medio de la rampa: a medias.
    expect(whiteness(T - S / 2, T - S / 2, T - S / 2, T, S)).toBeCloseTo(0.5)
    // Por debajo de la rampa: contenido intacto.
    expect(whiteness(T - S, T - S, T - S, T, S)).toBe(0)
  })

  it('mira el canal mas oscuro: un color saturado no es blanco', () => {
    // Casi blanco en rojo y verde, pero oscuro en azul: no es fondo.
    expect(whiteness(255, 255, 10, T, S)).toBe(0)
  })

  it('esto es lo que saca el halo de pixeles casi blancos', () => {
    // Un borde suavizado a 240 sobrevivia entero con el umbral duro.
    const borde = whiteness(240, 240, 240, T, S)
    expect(borde).toBeGreaterThan(0)
    expect(borde).toBeLessThan(1)
    // Lo que le queda de opacidad es poco: se ve desvanecido, no blanco.
    expect(255 * (1 - borde)) .toBeLessThan(100)
  })
})

describe('contentFraction', () => {
  it('dice que parte del archivo ocupa el dibujo', () => {
    // La insignia mide 7 x 5 y su disco va de (2,1) a (4,3).
    const g = analyzeDesign(sampleFrom(INSIGNIA), { background: 'border', ...SIN_NESTING })
    expect(g.contentFraction.x).toBeCloseTo(2 / 7)
    expect(g.contentFraction.y).toBeCloseTo(1 / 5)
    expect(g.contentFraction.width).toBeCloseTo(3 / 7)
    expect(g.contentFraction.height).toBeCloseTo(3 / 5)
  })

  it('sin recorte, el dibujo es toda la imagen', () => {
    const lleno = analyzeDesign(sampleFrom(['KK', 'KK']), { background: 'none', ...SIN_NESTING })
    expect(lleno.contentFraction).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })

  it('una muestra vacia no rompe el calculo', () => {
    const vacio = analyzeDesign(sampleFrom(['..', '..']), { background: 'none', ...SIN_NESTING })
    expect(vacio.contentFraction).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })
})
