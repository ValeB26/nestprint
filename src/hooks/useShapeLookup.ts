import { useMemo } from 'react'
import type { ContentFraction, Design } from '../types'

export type { ContentFraction }
import { useApp } from '../state/AppContext'
import { getSample } from '../lib/designCache'
import { analyzeDesign } from '../lib/designMask'
import { cropMask, type Mask } from '../lib/mask'
import { buildPieceShape, quarterTurnsOf, type PieceShape } from '../packing/raster/pieceMask'
import type { ShapeLookup } from '../packing/validate'
import type { VariantShapeLookup } from '../packing/raster/packRaster'

/**
 * Arma el buscador de formas que consume validateLayout.
 *
 * Las mascaras se cachean a nivel de MODULO y no dentro del hook porque el
 * lienzo y la barra de metricas validan por separado: si cada uno tuviera su
 * cache, se construiria todo dos veces.
 *
 * La clave incluye todo lo que cambia la forma (tamano, rotacion, precision,
 * separacion, tratamiento del fondo), asi que se invalida sola: nunca hay que
 * acordarse de limpiarla cuando algo cambia.
 */
/** Forma del diseno recortada a su contenido, mas donde estaba ese contenido. */
interface DesignContent {
  mask: Mask
  fraction: ContentFraction
}

const shapeCache = new Map<string, PieceShape>()
const contentCache = new Map<string, DesignContent | null>()

/** Tope de entradas. Al pasarse, se vacia: es una cache, no un deposito. */
const MAX_CACHE = 400

function remember<T>(cache: Map<string, T>, key: string, build: () => T): T {
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  if (cache.size >= MAX_CACHE) cache.clear()
  const value = build()
  cache.set(key, value)
  return value
}

/**
 * Forma del diseno recortada a su contenido, con la fraccion del archivo que
 * ese contenido ocupa.
 *
 * Se exporta porque el canvas necesita la misma fraccion para dibujar: la
 * mascara supone que el dibujo llena el rectangulo de la pieza, asi que el
 * canvas tiene que dibujarlo asi. Si cada uno usara su criterio, la pieza se
 * veria de un tamano y se validaria con otro.
 */
export function designContentOf(design: Design): DesignContent | null {
  const key = [design.id, design.backgroundMode, design.allowInteriorNesting].join(':')
  return remember(contentCache, key, () => {
    const sample = getSample(design.id)
    if (!sample) return null
    const geometry = analyzeDesign(sample, {
      background: design.backgroundMode,
      allowInteriorNesting: design.allowInteriorNesting,
    })
    if (!geometry.box) return null
    // Usamos la HUELLA, no la tinta: lo que importa para chocar es el espacio
    // que ocupa la pieza, no lo que se imprime.
    return {
      mask: cropMask(geometry.footprint, geometry.box),
      fraction: geometry.contentFraction,
    }
  })
}

export function useShapeLookup(): ShapeLookup {
  const { state } = useApp()
  const { designs, variants, config } = state

  return useMemo(() => {
    const designById = new Map(designs.map((d) => [d.id, d]))
    const variantById = new Map(variants.map((v) => [v.id, v]))

    return (piece) => {
      const variant = variantById.get(piece.variantId)
      if (!variant) return null
      const design = designById.get(variant.designId)
      if (!design) return null

      // Angulo libre: no hay mascara, que use el rectangulo delimitador.
      const turns = quarterTurnsOf(piece.rotation)
      if (turns === null) return null

      // El tamano sale de la PIEZA y no de la variante: si la variante se
      // edito despues de optimizar, las piezas en el lienzo siguen con el
      // tamano que tenian.
      const key = [
        design.id,
        design.backgroundMode,
        design.allowInteriorNesting,
        piece.widthCm,
        piece.heightCm,
        turns,
        config.cellCm,
        config.gapCm,
      ].join(':')

      const content = designContentOf(design)
      if (!content) return null

      return remember(shapeCache, key, () =>
        buildPieceShape(content.mask, piece.widthCm, piece.heightCm, turns, {
          cellCm: config.cellCm,
          gapCm: config.gapCm,
        }),
      )
    }
  }, [designs, variants, config])
}

/**
 * Variante del buscador para el OPTIMIZADOR.
 *
 * Se diferencia del de validacion en de donde saca el tamano: el packing
 * todavia no creo las piezas, asi que usa el de la VARIANTE. El de validacion
 * usa el de la pieza, que puede ser distinto si la variante se edito despues
 * de optimizar.
 */
export function useVariantShapeLookup(): VariantShapeLookup {
  const { state } = useApp()
  const { designs, variants, config } = state

  return useMemo(() => {
    const designById = new Map(designs.map((d) => [d.id, d]))
    const variantById = new Map(variants.map((v) => [v.id, v]))

    return (variantId, turns) => {
      const variant = variantById.get(variantId)
      if (!variant) return null
      const design = designById.get(variant.designId)
      if (!design) return null

      const key = [
        design.id,
        design.backgroundMode,
        design.allowInteriorNesting,
        variant.widthCm,
        variant.heightCm,
        turns,
        config.cellCm,
        config.gapCm,
      ].join(':')

      const content = designContentOf(design)
      if (!content) return null

      return remember(shapeCache, key, () =>
        buildPieceShape(content.mask, variant.widthCm, variant.heightCm, turns, {
          cellCm: config.cellCm,
          gapCm: config.gapCm,
        }),
      )
    }
  }, [designs, variants, config])
}
