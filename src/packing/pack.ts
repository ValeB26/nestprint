import type { CanvasConfig, DesignVariant, PlacedPiece } from '../types'
import { newId } from '../lib/id'
import { pieceBounds } from '../lib/geometry'
import { MaxRectsBin } from './maxRects'

/**
 * Packing por RECTANGULOS: el metodo original, que trata cada diseno como su
 * rectangulo delimitador. Sigue siendo el modo por defecto.
 *
 * Capa de dominio del packing. Traduce el mundo de NestPrint (variantes en cm,
 * separacion, rotacion permitida) al algoritmo generico de MaxRects, y vuelve a
 * traducir el resultado a PlacedPiece.
 *
 * `pack()` es una FUNCION PURA: con las mismas variantes y config devuelve
 * siempre el mismo resultado y no toca nada fuera de ella. Por eso se puede
 * testear con JSON aislado (Fase 4) sin necesitar React ni el DOM.
 */

export interface PackingResult {
  /** Piezas ya posicionadas, listas para dibujar o exportar. */
  pieces: PlacedPiece[]
  /** Alto total de material usado en cm (del borde superior al mas bajo). */
  usedHeightCm: number
  /** Cantidad de piezas que no entraron (mas anchas que el lienzo aun rotadas). */
  unplaced: number
  /**
   * Alto que habria usado el acomodado por rectangulos, cuando se acomodo por
   * formas. Sirve para mostrarle al usuario cuanto material se ahorro, que es
   * la razon de ser de la app. No se puede derivar de las piezas: hay que
   * correr el otro algoritmo, asi que viaja con el resultado.
   */
  baselineHeightCm?: number
}

/** Redondeo a 3 decimales para evitar ruido de punto flotante en las medidas. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

export function packRects(variants: DesignVariant[], config: CanvasConfig): PackingResult {
  const gap = config.gapCm
  const canvasWidth = config.widthCm

  // 1. Expandir variantes a piezas individuales: una variante con quantity 10
  //    genera 10 items a colocar, cada uno recordando su variantId de origen.
  interface Item {
    variantId: string
    widthCm: number
    heightCm: number
    allowRotation: boolean
  }
  const items: Item[] = []
  for (const v of variants) {
    for (let i = 0; i < v.quantity; i++) {
      items.push({
        variantId: v.id,
        widthCm: v.widthCm,
        heightCm: v.heightCm,
        allowRotation: v.allowRotation,
      })
    }
  }

  if (items.length === 0) return { pieces: [], usedHeightCm: 0, unplaced: 0 }

  // 2. Ordenar de mayor a menor (por area, desempatando por alto). Colocar
  //    primero las piezas grandes es lo que hace rendir a MaxRects: las chicas
  //    rellenan despues los huecos.
  items.sort((a, b) => b.widthCm * b.heightCm - a.widthCm * a.heightCm || b.heightCm - a.heightCm)

  // 3. Alto del lienzo para el algoritmo. Apilar todo en una sola columna
  //    (tomando el lado mayor por si algo entra rotado) es una cota superior del
  //    alto que podria llegar a usarse. Le sumamos el ancho del lienzo como
  //    margen: asi el lienzo siempre es mas alto que ancho y la heuristica BSSF
  //    prefiere llenar filas antes que apilar en columna (si el alto fuese
  //    menor que el ancho, "sobraria menos" apilando y el packing saldria mal).
  //    El alto real usado se mide despues, a partir de las piezas colocadas.
  const columnStack = items.reduce((sum, it) => sum + Math.max(it.widthCm, it.heightCm) + gap, 0)
  const binHeight = columnStack + canvasWidth

  const bin = new MaxRectsBin(canvasWidth, binHeight)
  const pieces: PlacedPiece[] = []
  let unplaced = 0

  for (const it of items) {
    // Inflamos la pieza en gap/2 por lado: ocupa (w+gap) x (h+gap). Asi, cuando
    // dos piezas quedan pegadas, entre sus bordes visuales queda exactamente el
    // gap pedido.
    const placement = bin.insert(it.widthCm + gap, it.heightCm + gap, it.allowRotation)
    if (!placement) {
      unplaced++
      continue
    }

    // El hueco que ocupa la pieza, ya sin el inflado: lo corremos gap/2 hacia
    // adentro por cada lado. Si la pieza quedo rotada, este hueco tiene el
    // ancho y el alto intercambiados respecto de la pieza.
    const slotWidth = placement.width - gap
    const slotHeight = placement.height - gap

    // La pieza se guarda con su tamano PROPIO y rota alrededor de su centro,
    // asi que la ubicamos centrada en el hueco. Sin rotar, esto da exactamente
    // la esquina del hueco; rotada 90 grados, su rectangulo propio queda
    // "cruzado" respecto del hueco, que es justo lo que corresponde.
    const centerX = placement.x + gap / 2 + slotWidth / 2
    const centerY = placement.y + gap / 2 + slotHeight / 2

    pieces.push({
      id: newId(),
      variantId: it.variantId,
      xCm: round(centerX - it.widthCm / 2),
      yCm: round(centerY - it.heightCm / 2),
      widthCm: round(it.widthCm),
      heightCm: round(it.heightCm),
      rotation: placement.rotated ? 90 : 0,
    })
  }

  // Alto usado = borde inferior de la pieza mas baja (desde el tope del lienzo).
  // Se mide con el bounding box: una pieza rotada ocupa mas que su alto propio.
  let usedHeightCm = 0
  for (const piece of pieces) {
    const bounds = pieceBounds(piece)
    usedHeightCm = Math.max(usedHeightCm, bounds.yCm + bounds.heightCm)
  }

  return { pieces, usedHeightCm: round(usedHeightCm), unplaced }
}
