import type { Design, DesignVariant } from '../types'
import { CANVAS_WIDTH_CM } from '../types'
import { aspectRatioOf, sizeFromWidth } from './aspect'
import { newId } from './id'

/** Ancho por defecto de una variante nueva, en cm. */
const DEFAULT_WIDTH_CM = 10

/**
 * Crea una variante nueva para un diseno con valores por defecto sensatos.
 *
 * El alto se calcula para respetar la proporcion del diseno: asi la primera
 * previsualizacion no se ve deformada y el usuario solo ajusta el ancho. Es
 * "automatizacion primero, ajuste humano despues".
 *
 * @param heightOverWidth proporcion del CONTENIDO visible, si ya se analizo la
 *   forma del diseno. Sin esto cae a la proporcion del archivo entero, que es
 *   peor cuando el PNG trae margen transparente o fondo blanco.
 */
export function createVariant(
  design: Design,
  nameIndex: number,
  heightOverWidth?: number,
): DesignVariant {
  // La MISMA cuenta que usa VariantRow al escribir una medida. Si cada uno
  // calculara la suya, la variante cambiaria de forma apenas se la edita: es
  // justo el bug del logo que salia cuadrado.
  const ratio = aspectRatioOf(design, heightOverWidth)
  const { widthCm, heightCm } = ratio
    ? sizeFromWidth(DEFAULT_WIDTH_CM, ratio, CANVAS_WIDTH_CM)
    : { widthCm: DEFAULT_WIDTH_CM, heightCm: DEFAULT_WIDTH_CM } // sin proporcion, cuadrado

  return {
    id: newId(),
    designId: design.id,
    name: `Variante ${nameIndex}`,
    widthCm,
    heightCm,
    quantity: 1,
    allowRotation: true, // rotacion habilitada por defecto (configurable por variante)
  }
}
