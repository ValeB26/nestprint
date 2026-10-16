import type { CanvasConfig, DesignVariant } from '../types'
import { packRects, type PackingResult } from './pack'
import { packRaster, type RasterOptions, type VariantShapeLookup } from './raster/packRaster'

/**
 * Estrategias que se prueban en modo 'shape'.
 *
 * Ninguna gana siempre: medido sobre tres trabajos distintos, en uno gano
 * 'maxSide' buscando huecos siempre, y en otros 'area'. Como cada corrida son
 * unos 40 ms, probarlas todas y quedarse con la mejor sale mas barato que
 * elegir mal.
 */
const STRATEGIES: RasterOptions[] = [
  { order: 'area', alwaysProbe: false },
  { order: 'height', alwaysProbe: false },
  { order: 'maxSide', alwaysProbe: true },
]

/** Mejor resultado: primero el que coloca mas piezas, despues el mas bajo. */
function mejor(a: PackingResult, b: PackingResult): PackingResult {
  if (b.unplaced !== a.unplaced) return b.unplaced < a.unplaced ? b : a
  return b.usedHeightCm < a.usedHeightCm ? b : a
}

/**
 * Punto de entrada del motor de packing.
 *
 * En modo 'rect' usa el acomodado por rectangulos de siempre. En modo 'shape'
 * corre varias estrategias por forma Y TAMBIEN la rectangular, y devuelve la
 * que gasta menos material.
 *
 * Incluir la rectangular entre las candidatas no es redundante: medido, con
 * formas macizas y alargadas el acomodado por forma puede perder contra
 * MaxRects. Teniendola de candidata, el modo Formas nunca da un resultado peor
 * que el metodo de siempre.
 */
export function pack(
  variants: DesignVariant[],
  config: CanvasConfig,
  shapeOf?: VariantShapeLookup,
): PackingResult {
  const porRectangulo = packRects(variants, config)
  if (config.nestingMode !== 'shape') return porRectangulo

  const best = STRATEGIES.reduce(
    (elegido, options) => mejor(elegido, packRaster(variants, config, shapeOf, options)),
    porRectangulo,
  )

  // Guardamos contra que se comparo, para poder mostrar el ahorro.
  return { ...best, baselineHeightCm: porRectangulo.usedHeightCm }
}

export { packRects, packRaster }
export type { PackingResult, VariantShapeLookup, RasterOptions }
