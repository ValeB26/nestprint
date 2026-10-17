import type { Design } from '../types'

/**
 * Proporcion de un diseno y medidas derivadas.
 *
 * POR QUE ESTO VIVE ACA Y NO EN EL COMPONENTE
 * -------------------------------------------
 * Esta cuenta estaba adentro de VariantRow, y por eso no tenia tests y se
 * desincronizo de createVariant: cada uno usaba una proporcion distinta. Es
 * logica de dominio (define si un logo sale deformado), asi que va en un modulo
 * puro y testeado, como el packing o la geometria.
 *
 * CUAL ES LA PROPORCION CORRECTA
 * ------------------------------
 * El rectangulo de una pieza (widthCm x heightCm) ES el content box: lo que se
 * dibuja. contentDrawRect() agranda la imagen para que la parte visible llene
 * ese rectangulo exacto, asi que el margen transparente del PNG no se dibuja y
 * no cuenta para la proporcion.
 *
 * Por eso la unica proporcion que NO deforma es la del CONTENIDO
 * (geometry.heightOverWidth), no la del archivo. Un PNG cuadrado con un logo
 * alto adentro tiene proporcion 1 pero se dibuja alto: tomar la del archivo lo
 * achata hasta volverlo cuadrado.
 */

/** Medidas de una variante, en cm. */
export interface VariantSize {
  widthCm: number
  heightCm: number
}

/** Redondeo a 1 decimal (1 mm): la precision con la que se piensan las medidas. */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function esProporcionValida(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

/**
 * Proporcion (alto / ancho) con la que hay que escalar un diseno para que no
 * salga deformado, o null si no se puede saber.
 *
 * @param heightOverWidth proporcion del CONTENIDO, si la forma ya se analizo.
 *   Sin ella caemos a la del archivo entero, que es la correcta solo cuando el
 *   PNG viene al ras. Es una red de seguridad, no el camino bueno.
 */
export function aspectRatioOf(design: Design, heightOverWidth?: number): number | null {
  if (esProporcionValida(heightOverWidth)) return heightOverWidth

  const delArchivo = design.originalHeightPx / design.originalWidthPx
  return esProporcionValida(delArchivo) ? delArchivo : null
}

/**
 * Medidas proporcionales a partir de un ancho nuevo.
 *
 * El ancho se topea al del lienzo: una pieza mas ancha que el material no
 * podria entrar nunca, ni rotada.
 */
export function sizeFromWidth(
  widthCm: number,
  ratio: number,
  canvasWidthCm: number,
): VariantSize {
  const ancho = Math.min(widthCm, canvasWidthCm)
  return { widthCm: ancho, heightCm: round1(ancho * ratio) }
}

/**
 * Medidas proporcionales a partir de un alto nuevo.
 *
 * Si el ancho que sale se pasa del lienzo, se topea y se recalcula el alto:
 * preferimos achicar la pieza antes que romper la proporcion.
 */
export function sizeFromHeight(
  heightCm: number,
  ratio: number,
  canvasWidthCm: number,
): VariantSize {
  const anchoExacto = heightCm / ratio
  if (anchoExacto > canvasWidthCm) {
    return { widthCm: canvasWidthCm, heightCm: round1(canvasWidthCm * ratio) }
  }
  return { widthCm: round1(anchoExacto), heightCm }
}
