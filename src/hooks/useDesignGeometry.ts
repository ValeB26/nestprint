import { useMemo } from 'react'
import type { Design } from '../types'
import { analyzeDesign, type DesignGeometry } from '../lib/designMask'
import { getSample } from '../lib/designCache'

/**
 * Analiza la forma de un diseno a partir de la muestra que se saco al subirlo.
 *
 * Devuelve null si todavia no hay muestra (por ejemplo si el analisis fallo).
 * Quien lo use tiene que seguir funcionando con el rectangulo de siempre.
 *
 * El analisis es puro y barato, asi que se recalcula con useMemo cada vez que
 * cambia el modo de fondo o el anidado: no hace falta volver a leer la imagen.
 */
export function useDesignGeometry(design: Design): DesignGeometry | null {
  return useMemo(() => {
    const sample = getSample(design.id)
    if (!sample) return null
    return analyzeDesign(sample, {
      background: design.backgroundMode,
      allowInteriorNesting: design.allowInteriorNesting,
    })
  }, [design.id, design.backgroundMode, design.allowInteriorNesting])
}
