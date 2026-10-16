import {
  contentBox,
  countOccupied,
  createMask,
  fillInteriorHoles,
  interiorHoleSpace,
  largestEmptySquare,
  outsideRegion,
  type Mask,
  type MaskBox,
} from './mask'
import type { BackgroundMode, ContentFraction } from '../types'

export type { BackgroundMode }

/**
 * Analisis de la forma de un diseno: de una muestra de pixeles a las dos
 * mascaras que usa el resto de la app (tinta y huella).
 *
 * Todo aca es PURO. La unica parte que necesita navegador es conseguir la
 * muestra de pixeles (ver imageSample.ts); una vez que la tenemos, cambiar el
 * modo de fondo es un recalculo instantaneo y testeable sin DOM.
 */

/** Por debajo de este alfa, el pixel se considera vacio. */
export const ALPHA_MIN = 8

/** Por encima de esto en los tres canales, el pixel es blanco del todo. */
export const DEFAULT_WHITE_THRESHOLD = 245

/**
 * Ancho de la rampa por debajo del umbral, en niveles de color.
 *
 * Sin rampa, quitar el fondo deja un halo de pixeles casi blancos alrededor de
 * cada trazo: los bordes suavizados del PNG valen 230 o 240 y no llegan al
 * umbral, asi que sobreviven y se ven como suciedad blanca. Con la rampa, esos
 * pixeles se vuelven parcialmente transparentes en vez de quedarse enteros.
 */
export const DEFAULT_WHITE_SOFTNESS = 30

/**
 * Cuanto de "fondo blanco" tiene un pixel, de 0 (nada) a 1 (blanco del todo).
 *
 * Mira el canal MAS OSCURO: un pixel es blanco solo si lo son los tres.
 *
 * La MISMA funcion decide la forma (designMask) y lo que se dibuja y exporta
 * (imageSample). Si cada uno usara su criterio, la mascara y la imagen dirian
 * cosas distintas sobre el mismo pixel.
 */
export function whiteness(
  r: number,
  g: number,
  b: number,
  threshold: number,
  softness: number,
): number {
  const level = Math.min(r, g, b)
  if (level >= threshold) return 1
  const floor = threshold - softness
  if (level <= floor) return 0
  return (level - floor) / softness
}

/** Muestra de una imagen a baja resolucion: lo justo para analizar su forma. */
export interface ImageSample {
  cols: number
  rows: number
  /** RGBA por celda, 4 bytes cada una. */
  rgba: Uint8ClampedArray
  /** Tamano real del archivo, para traducir celdas a px originales. */
  sourceWidthPx: number
  sourceHeightPx: number
}

export interface DesignGeometryOptions {
  background: BackgroundMode
  /** Si se permite meter otras piezas en los huecos encerrados del diseno. */
  allowInteriorNesting: boolean
  whiteThreshold?: number
  whiteSoftness?: number
}

export interface DesignGeometry {
  /** Lo que se imprime. Manda al exportar. */
  ink: Mask
  /** El espacio que ocupa. Manda al acomodar y al medir la separacion. */
  footprint: Mask
  /** Rectangulo del contenido visible, en celdas de la muestra. */
  box: MaskBox | null
  /** Proporcion alto/ancho del contenido (para crear variantes sin deformar). */
  heightOverWidth: number
  /** Cuanto del content box ocupa la huella, de 0 a 1. */
  density: number
  /** Lado del hueco interior aprovechable mas grande, como fraccion del ancho. */
  largestHoleFraction: number
  /** El PNG no trae transparencia en absoluto. */
  isOpaque: boolean
  /** Proporcion de pixeles visibles que son casi blancos. */
  whiteFraction: number
  /**
   * Content box como fraccion de la imagen (0..1). Lo necesita el canvas para
   * dibujar el CONTENIDO alineado al rectangulo de la pieza: si dibujara la
   * imagen entera, el dibujo saldria mas chico que lo que mide la pieza y la
   * validacion por forma no coincidiria con lo que se ve.
   */
  contentFraction: ContentFraction
}

export function analyzeDesign(
  sample: ImageSample,
  options: DesignGeometryOptions,
): DesignGeometry {
  const { cols, rows, rgba } = sample
  const whiteThreshold = options.whiteThreshold ?? DEFAULT_WHITE_THRESHOLD
  const whiteSoftness = options.whiteSoftness ?? DEFAULT_WHITE_SOFTNESS
  const total = cols * rows

  // 1. Clasificar cada celda: se ve? cuanto tiene de fondo blanco?
  const visible = new Uint8Array(total)
  const white = new Float32Array(total)
  let visibleCount = 0
  let whiteCount = 0
  let transparentCount = 0

  for (let i = 0; i < total; i++) {
    const o = i * 4
    if (rgba[o + 3] < ALPHA_MIN) {
      transparentCount++
      continue
    }
    visible[i] = 1
    visibleCount++
    white[i] = whiteness(rgba[o], rgba[o + 1], rgba[o + 2], whiteThreshold, whiteSoftness)
    if (white[i] >= 1) whiteCount++
  }

  /** Alfa que le queda al pixel si se le descuenta el fondo. */
  const sinFondo = (i: number) => rgba[i * 4 + 3] * (1 - white[i])

  // 2. Mascara de tinta, segun el modo de fondo.
  const ink = createMask(cols, rows)

  if (options.background === 'border') {
    // Lo que PUEDE ser fondo: transparente o con algo de blanco. Marcamos como
    // solido lo que seguro es contenido y preguntamos que fondo se alcanza
    // desde el borde: eso es el fondo de verdad; los blancos encerrados quedan.
    const solido = createMask(cols, rows)
    for (let i = 0; i < total; i++) {
      solido.cells[i] = visible[i] === 1 && white[i] === 0 ? 1 : 0
    }
    const alcanzado = outsideRegion(solido)
    for (let i = 0; i < total; i++) {
      const alfa = alcanzado[i] === 1 ? sinFondo(i) : rgba[i * 4 + 3]
      ink.cells[i] = alfa >= ALPHA_MIN ? 1 : 0
    }
  } else if (options.background === 'white') {
    for (let i = 0; i < total; i++) {
      ink.cells[i] = sinFondo(i) >= ALPHA_MIN ? 1 : 0
    }
  } else {
    ink.cells.set(visible)
  }

  // 3. Huella: la tinta con los huecos encerrados rellenados, salvo que el
  //    usuario haya habilitado anidar piezas adentro de este diseno.
  const footprint = options.allowInteriorNesting ? ink : fillInteriorHoles(ink)

  // 4. Medidas derivadas.
  const box = contentBox(footprint)
  const boxCells = box ? box.cols * box.rows : 0
  const density = boxCells > 0 ? countOccupied(footprint) / boxCells : 0
  const heightOverWidth = box && box.cols > 0 ? box.rows / box.cols : 1

  // El hueco se mide sobre la TINTA: es el espacio que se liberaria si el
  // usuario habilitara el anidado, aunque hoy la huella lo tenga tapado.
  const hueco = largestEmptySquare(interiorHoleSpace(ink))
  const largestHoleFraction = box && box.cols > 0 ? hueco.side / box.cols : 0

  return {
    ink,
    footprint,
    box,
    heightOverWidth,
    density,
    largestHoleFraction,
    isOpaque: transparentCount === 0,
    whiteFraction: visibleCount > 0 ? whiteCount / visibleCount : 0,
    contentFraction: box
      ? {
          x: box.col / cols,
          y: box.row / rows,
          width: box.cols / cols,
          height: box.rows / rows,
        }
      : { x: 0, y: 0, width: 1, height: 1 },
  }
}
