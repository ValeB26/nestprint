/**
 * Medidas del PNG a exportar y limites del navegador.
 *
 * Todo esto es PURO: se testea sin DOM. El render en si vive en exportPng.ts.
 */

/** Pulgada en centimetros. La conversion cm -> px pasa siempre por aca. */
const CM_PER_INCH = 2.54

/**
 * Lado maximo de un canvas. Chrome y Firefox cortan en 16384 px; mas alla el
 * canvas queda en blanco sin avisar, que es el peor fallo posible.
 */
export const MAX_CANVAS_SIDE = 16384

/**
 * Area maxima prudente, en pixeles.
 *
 * El limite duro de Chrome ronda los 268 millones, pero mucho antes de eso el
 * navegador se queda sin memoria: cada pixel son 4 bytes, asi que 100 millones
 * ya son 400 MB solo para el bitmap. Preferimos avisar con una sugerencia
 * concreta antes que fallar a mitad de camino.
 */
export const MAX_CANVAS_PIXELS = 100_000_000

export function cmToPx(cm: number, dpi: number): number {
  return (cm * dpi) / CM_PER_INCH
}

export function pxToCm(px: number, dpi: number): number {
  return (px * CM_PER_INCH) / dpi
}

export interface ExportSize {
  widthPx: number
  heightPx: number
  megapixels: number
}

export function exportSize(widthCm: number, heightCm: number, dpi: number): ExportSize {
  const widthPx = Math.max(1, Math.round(cmToPx(widthCm, dpi)))
  const heightPx = Math.max(1, Math.round(cmToPx(heightCm, dpi)))
  return {
    widthPx,
    heightPx,
    megapixels: Math.round((widthPx * heightPx) / 100_000) / 10,
  }
}

/**
 * El PNG mas grande que puede generar el navegador para este trabajo, en DPI.
 *
 * Se redondea hacia abajo a multiplos de 10 para poder sugerirlo como un numero
 * redondo, y nunca baja de 72 (por debajo de eso no sirve para imprimir).
 */
export function maxUsableDpi(widthCm: number, heightCm: number): number {
  if (widthCm <= 0 || heightCm <= 0) return 0

  // Por el lado mas largo.
  const porLado = (MAX_CANVAS_SIDE * CM_PER_INCH) / Math.max(widthCm, heightCm)
  // Por el area total.
  const porArea = CM_PER_INCH * Math.sqrt(MAX_CANVAS_PIXELS / (widthCm * heightCm))

  return Math.max(72, Math.floor(Math.min(porLado, porArea) / 10) * 10)
}

/** Por que no se puede exportar, o null si se puede. */
export function exportBlocker(
  widthCm: number,
  heightCm: number,
  dpi: number,
): string | null {
  if (heightCm <= 0) return 'No hay piezas para exportar.'

  const { widthPx, heightPx, megapixels } = exportSize(widthCm, heightCm, dpi)
  const sugerido = maxUsableDpi(widthCm, heightCm)

  if (widthPx > MAX_CANVAS_SIDE || heightPx > MAX_CANVAS_SIDE) {
    return (
      `A ${dpi} DPI el PNG mediría ${widthPx} × ${heightPx} px, y el navegador no ` +
      `soporta lados de más de ${MAX_CANVAS_SIDE} px. Probá con ${sugerido} DPI.`
    )
  }

  if (widthPx * heightPx > MAX_CANVAS_PIXELS) {
    return (
      `A ${dpi} DPI el PNG mediría ${widthPx} × ${heightPx} px (${megapixels} MP), ` +
      `demasiado para el navegador. Probá con ${sugerido} DPI.`
    )
  }

  return null
}

/** Nombre de archivo que dice de un vistazo qué es. */
export function exportFileName(widthCm: number, heightCm: number, dpi: number): string {
  const alto = Math.round(heightCm)
  return `nestprint-${Math.round(widthCm)}x${alto}cm-${dpi}dpi.png`
}
