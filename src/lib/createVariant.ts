import type { Design, DesignVariant } from '../types'
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
  const ratio = heightOverWidth ?? design.originalHeightPx / design.originalWidthPx
  const widthCm = DEFAULT_WIDTH_CM
  // Si por algun motivo no hay proporcion valida, caemos a un cuadrado.
  const heightCm = Number.isFinite(ratio) && ratio > 0
    ? Math.round(widthCm * ratio * 10) / 10
    : DEFAULT_WIDTH_CM

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
