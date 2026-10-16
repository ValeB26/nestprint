import { createMask, outsideRegion } from './mask'
import {
  ALPHA_MIN,
  DEFAULT_WHITE_SOFTNESS,
  DEFAULT_WHITE_THRESHOLD,
  whiteness,
  type BackgroundMode,
  type ImageSample,
} from './designMask'

/**
 * Lo unico de todo el analisis de formas que necesita el navegador: leer los
 * pixeles de una imagen. Usa un canvas fuera de pantalla.
 *
 * Se separa del analisis a proposito. Aca se saca UNA muestra por diseno (caro,
 * asincronico); de ahi en adelante, cambiar el modo de fondo es recalcular
 * sobre esa muestra, que es instantaneo y puro.
 */

/** Lado maximo de la muestra para analisis geometrico, en celdas. */
const SAMPLE_MAX_CELLS = 512

/** Lado maximo de la imagen procesada que se muestra en pantalla. */
const DISPLAY_MAX_PX = 2000

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    img.src = dataUrl
  })
}

/** Escala para que el lado mayor no pase de `max`, sin agrandar nunca. */
function fit(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function drawToContext(img: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('No se pudo crear el canvas de analisis.')
  ctx.drawImage(img, 0, 0, width, height)
  return { canvas, ctx }
}

/**
 * Saca una muestra de pixeles a baja resolucion para analizar la forma.
 *
 * Dejamos el suavizado del navegador activado a proposito: al achicar, una
 * linea fina se atenua pero sobrevive, mientras que sin suavizado podria
 * desaparecer del todo. Y como un borde suavizado conserva algo de alfa, la
 * mascara queda apenas mas GRANDE que la forma real, que es el lado seguro.
 */
export async function sampleImage(dataUrl: string): Promise<ImageSample> {
  const img = await loadImage(dataUrl)
  const { width, height } = fit(img.naturalWidth, img.naturalHeight, SAMPLE_MAX_CELLS)
  const { ctx } = drawToContext(img, width, height)
  const data = ctx.getImageData(0, 0, width, height)

  return {
    cols: width,
    rows: height,
    rgba: data.data,
    sourceWidthPx: img.naturalWidth,
    sourceHeightPx: img.naturalHeight,
  }
}

/**
 * Devuelve una data URL con el fondo quitado, para mostrar en pantalla.
 *
 * NO toca el archivo original: el Design sigue guardando el PNG tal cual, y esto
 * es una copia derivada que se puede volver a generar en cualquier momento. Al
 * exportar (Fase 7) hay que rehacer esto a resolucion completa.
 *
 * Si el modo es 'none' devuelve la misma data URL sin trabajar de mas.
 *
 * `maxPx` acota el lado mayor. Para pantalla alcanza con DISPLAY_MAX_PX; la
 * exportacion pide la resolucion que necesita para imprimir, que es mayor. Nunca
 * agranda la imagen por encima de su tamano original.
 */
export async function renderWithoutBackground(
  dataUrl: string,
  mode: BackgroundMode,
  whiteThreshold: number = DEFAULT_WHITE_THRESHOLD,
  whiteSoftness: number = DEFAULT_WHITE_SOFTNESS,
  maxPx: number = DISPLAY_MAX_PX,
): Promise<string> {
  if (mode === 'none') return dataUrl

  const img = await loadImage(dataUrl)
  const { width, height } = fit(img.naturalWidth, img.naturalHeight, maxPx)
  const { canvas, ctx } = drawToContext(img, width, height)
  const data = ctx.getImageData(0, 0, width, height)
  const px = data.data
  const total = width * height

  /**
   * Cuanto de fondo tiene el pixel, de 0 a 1. Es la MISMA funcion que usa el
   * analisis de forma: asi la imagen y la mascara nunca se contradicen.
   *
   * Al descontarlo de forma gradual, los bordes suavizados del dibujo se
   * desvanecen en vez de quedar como un halo de pixeles casi blancos.
   */
  const fondo = (i: number) => {
    const o = i * 4
    if (px[o + 3] < ALPHA_MIN) return 0
    return whiteness(px[o], px[o + 1], px[o + 2], whiteThreshold, whiteSoftness)
  }

  if (mode === 'white') {
    for (let i = 0; i < total; i++) {
      const w = fondo(i)
      if (w > 0) px[i * 4 + 3] = Math.round(px[i * 4 + 3] * (1 - w))
    }
  } else {
    // 'border': marcamos como solido lo que seguro es contenido y preguntamos
    // que fondo se alcanza desde el borde. Solo eso se descuenta, asi un disco
    // con relleno blanco queda entero.
    const solido = createMask(width, height)
    for (let i = 0; i < total; i++) {
      solido.cells[i] = px[i * 4 + 3] >= ALPHA_MIN && fondo(i) === 0 ? 1 : 0
    }
    const alcanzado = outsideRegion(solido)
    for (let i = 0; i < total; i++) {
      if (alcanzado[i] !== 1) continue
      const w = fondo(i)
      if (w > 0) px[i * 4 + 3] = Math.round(px[i * 4 + 3] * (1 - w))
    }
  }

  ctx.putImageData(data, 0, 0)
  return canvas.toDataURL('image/png')
}
