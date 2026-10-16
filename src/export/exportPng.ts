import type { CanvasConfig, Design, DesignVariant, PlacedPiece } from '../types'
import { contentDrawRect, pieceCenter } from '../lib/geometry'
import { layoutHeightCm } from '../lib/metrics'
import { analyzeDesign } from '../lib/designMask'
import { getSample } from '../lib/designCache'
import { renderWithoutBackground } from '../lib/imageSample'
import { cmToPx, exportBlocker, exportFileName, exportSize } from './exportSize'

/**
 * Exportacion a PNG: toma las piezas ya acomodadas y arma el archivo que se
 * manda al proveedor de impresion.
 *
 * TRES REGLAS QUE NO SE ROMPEN
 * ----------------------------
 * 1. El PNG sale TRANSPARENTE. El color de fondo del lienzo es solo una ayuda
 *    para ver en pantalla; nunca se dibuja.
 * 2. Se dibuja igual que en el canvas: trasladar al centro de la pieza, rotar y
 *    dibujar centrado, usando la MISMA contentDrawRect(). Por eso el PNG
 *    coincide con lo que se ve.
 * 3. El fondo de cada diseno se vuelve a quitar a la resolucion que haga falta
 *    para imprimir, no a la de pantalla.
 */

export interface ExportInput {
  pieces: PlacedPiece[]
  variants: DesignVariant[]
  designs: Design[]
  config: CanvasConfig
}

export interface ExportOutput {
  blob: Blob
  fileName: string
  widthPx: number
  heightPx: number
  heightCm: number
}

/** La exportacion no pudo hacerse, con un motivo que el usuario puede accionar. */
export class ExportError extends Error {}

/**
 * Prepara la imagen de cada diseno con el fondo ya quitado, a la resolucion
 * justa que pide la pieza mas grande que lo usa.
 *
 * Procesar siempre a resolucion completa seria tirar trabajo: si un archivo de
 * 3000 px se imprime a 10 cm y 300 DPI, solo hacen falta 1181 px.
 */
async function prepareImages(
  input: ExportInput,
  pxPerCm: number,
): Promise<Record<string, HTMLImageElement>> {
  const variantById = new Map(input.variants.map((v) => [v.id, v]))

  // Resolucion necesaria por diseno: el mayor lado dibujado entre sus piezas.
  const needed = new Map<string, number>()
  for (const piece of input.pieces) {
    const variant = variantById.get(piece.variantId)
    if (!variant) continue
    const fraction = contentFractionOf(input.designs, variant.designId)
    const draw = contentDrawRect(piece.widthCm, piece.heightCm, fraction)
    const lado = Math.max(draw.widthCm, draw.heightCm) * pxPerCm
    needed.set(variant.designId, Math.max(needed.get(variant.designId) ?? 0, lado))
  }

  const images: Record<string, HTMLImageElement> = {}
  await Promise.all(
    input.designs.map(async (design) => {
      const maxPx = Math.ceil(needed.get(design.id) ?? 0)
      if (maxPx <= 0) return // ningun pieza usa este diseno
      const url = await renderWithoutBackground(
        design.imageDataUrl,
        design.backgroundMode,
        undefined,
        undefined,
        maxPx,
      )
      images[design.id] = await loadImage(url)
    }),
  )
  return images
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new ExportError('No se pudo preparar una de las imágenes.'))
    img.src = dataUrl
  })
}

/** Que parte del archivo ocupa el dibujo de un diseno. */
function contentFractionOf(designs: Design[], designId: string) {
  const design = designs.find((d) => d.id === designId)
  if (!design) return undefined
  const sample = getSample(design.id)
  if (!sample) return undefined
  return analyzeDesign(sample, {
    background: design.backgroundMode,
    allowInteriorNesting: design.allowInteriorNesting,
  }).contentFraction
}

export async function exportLayoutToPng(input: ExportInput): Promise<ExportOutput> {
  const { config, pieces, variants, designs } = input
  const heightCm = layoutHeightCm(pieces)

  const blocker = exportBlocker(config.widthCm, heightCm, config.dpi)
  if (blocker) throw new ExportError(blocker)

  const { widthPx, heightPx } = exportSize(config.widthCm, heightCm, config.dpi)
  const pxPerCm = cmToPx(1, config.dpi)

  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ExportError('El navegador no pudo crear el lienzo de exportación.')

  // Nada de pintar el fondo: queda transparente, que es lo que se exporta.
  ctx.imageSmoothingQuality = 'high'

  const images = await prepareImages(input, pxPerCm)
  const variantById = new Map(variants.map((v) => [v.id, v]))

  for (const piece of pieces) {
    const variant = variantById.get(piece.variantId)
    if (!variant) continue
    const image = images[variant.designId]
    if (!image) continue

    const fraction = contentFractionOf(designs, variant.designId)
    const draw = contentDrawRect(piece.widthCm, piece.heightCm, fraction)
    const center = pieceCenter(piece)

    // Mismo orden que en el canvas: al centro, rotar, y dibujar centrado.
    ctx.save()
    ctx.translate(center.xCm * pxPerCm, center.yCm * pxPerCm)
    ctx.rotate((piece.rotation * Math.PI) / 180)
    ctx.drawImage(
      image,
      (draw.xCm - piece.widthCm / 2) * pxPerCm,
      (draw.yCm - piece.heightCm / 2) * pxPerCm,
      draw.widthCm * pxPerCm,
      draw.heightCm * pxPerCm,
    )
    ctx.restore()
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  )
  if (!blob) {
    throw new ExportError(
      'El navegador no pudo generar el PNG, probablemente por su tamaño. Probá con menos DPI.',
    )
  }

  return {
    blob,
    fileName: exportFileName(config.widthCm, heightCm, config.dpi),
    widthPx,
    heightPx,
    heightCm,
  }
}

/** Dispara la descarga de un blob ya generado. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Revocar en el acto cancela la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
