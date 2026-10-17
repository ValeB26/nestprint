import type { ContentFraction, Design } from '../types'

/**
 * Resolucion real con la que se va a imprimir una variante.
 *
 * QUE PROBLEMA RESUELVE: un cliente manda el logo en 1025 px. Impreso a 10 cm
 * sale a 260 DPI y se ve bien; a 25 cm sale a 104 DPI y se ve pixelado. El
 * archivo es el mismo: lo que cambia es el tamano al que se imprime. Hoy eso se
 * descubre con el material ya gastado.
 *
 * POR QUE AVISAR Y NO ESCALAR: agrandar por interpolacion no agrega detalle,
 * solo lo hace mas grande y borroso — es exactamente lo que ya hace la
 * impresora. Escalar de verdad pide un modelo de IA, que o manda los logos de
 * los clientes a un tercero o mete decenas de MB en el navegador. El aviso
 * cuesta nada y da una accion concreta: pedir el archivo bueno, o imprimirlo
 * mas chico.
 */

/** Una pulgada en centimetros. */
const CM_POR_PULGADA = 2.54

/**
 * Debajo de este DPI avisamos.
 *
 * 300 es lo ideal (y el default de exportacion). Entre 150 y 300 se nota en el
 * detalle fino pero sigue siendo usable para una calcomania que se mira de
 * lejos. Por debajo de 150 se ven los dientes.
 */
export const MIN_PRINT_DPI = 150

export interface ResolutionIssue {
  /** DPI real al que saldria esta variante. */
  dpi: number
  /** Ancho maximo, en cm, que todavia llega al minimo. */
  maxWidthCm: number
}

/**
 * Pixeles del archivo que caen dentro del dibujo visible.
 *
 * Es el ancho del archivo recortado al content box: el margen transparente (o
 * el fondo que se quita) no aporta resolucion. Sin analisis de forma usamos el
 * archivo entero, que es optimista pero nunca inventa pixeles de mas.
 */
export function contentWidthPx(design: Design, fraction?: ContentFraction): number {
  const ancho = design.originalWidthPx
  if (!Number.isFinite(ancho) || ancho <= 0) return 0
  if (!fraction || !Number.isFinite(fraction.width) || fraction.width <= 0) return ancho
  return ancho * fraction.width
}

/** DPI al que sale un ancho dado de pixeles impreso a cierta medida. */
export function effectiveDpi(contentPx: number, widthCm: number): number {
  if (widthCm <= 0) return 0
  return contentPx / (widthCm / CM_POR_PULGADA)
}

/** Ancho maximo, en cm, que todavia alcanza el DPI pedido. */
export function maxWidthCmFor(contentPx: number, dpi: number): number {
  if (dpi <= 0) return 0
  // Redondeamos para ABAJO: prometer 17.5 cm cuando el limite es 17.46 seria
  // prometer de mas, justo en el dato que el usuario va a usar para decidir.
  return Math.floor((contentPx / dpi) * CM_POR_PULGADA * 10) / 10
}

/**
 * Chequea si a esta variante le falta resolucion. Devuelve null si alcanza.
 *
 * @param fraction content box del diseno, si la forma ya se analizo.
 */
export function resolutionIssue(
  design: Design,
  widthCm: number,
  fraction?: ContentFraction,
  minDpi: number = MIN_PRINT_DPI,
): ResolutionIssue | null {
  const contentPx = contentWidthPx(design, fraction)
  // Sin pixeles o sin medida no hay nada que chequear; no inventamos un aviso.
  if (contentPx <= 0 || widthCm <= 0) return null

  const dpi = effectiveDpi(contentPx, widthCm)
  if (dpi >= minDpi) return null

  return {
    dpi: Math.round(dpi),
    maxWidthCm: maxWidthCmFor(contentPx, minDpi),
  }
}
