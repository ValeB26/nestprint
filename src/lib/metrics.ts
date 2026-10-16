import type { PlacedPiece } from '../types'
import { pieceBounds } from './geometry'

/**
 * Metricas derivadas del layout.
 *
 * Son funciones puras que se calculan A PARTIR de las piezas, en vez de
 * guardarse en el estado. Asi no puede haber desincronizacion: si el usuario
 * mueve o elimina una pieza a mano (Fase 6), el alto y el aprovechamiento se
 * actualizan solos sin que nadie tenga que recordar recalcularlos.
 */

/**
 * Alto de material usado en cm: el borde inferior de la pieza mas baja. Se mide
 * con el bounding box porque una pieza rotada ocupa mas que su alto propio.
 */
export function layoutHeightCm(pieces: PlacedPiece[]): number {
  let max = 0
  for (const piece of pieces) {
    const bounds = pieceBounds(piece)
    max = Math.max(max, bounds.yCm + bounds.heightCm)
  }
  return Math.round(max * 1000) / 1000
}

/**
 * Aprovechamiento en %: cuanto del material usado ocupan realmente las piezas.
 * El resto es recorte. Devuelve null si todavia no hay nada que medir.
 */
export function utilizationPercent(pieces: PlacedPiece[], canvasWidthCm: number): number | null {
  const heightCm = layoutHeightCm(pieces)
  const canvasArea = canvasWidthCm * heightCm
  if (canvasArea <= 0) return null
  const piecesArea = pieces.reduce((sum, p) => sum + p.widthCm * p.heightCm, 0)
  return Math.round((piecesArea / canvasArea) * 100)
}
