import { useEffect, useState } from 'react'
import type { Design } from '../types'
import { renderWithoutBackground } from '../lib/imageSample'
import { getProcessedUrl, setProcessedUrl } from '../lib/designCache'

/**
 * Data URL del diseno con el fondo ya quitado, para mostrar en pantalla.
 *
 * Mientras se procesa (o si falla) devuelve el PNG original, asi nunca se ve un
 * hueco. El resultado se guarda en cache por diseno + modo, para no rehacer el
 * trabajo cada vez que se vuelve a montar el componente.
 *
 * Los resultados listos se guardan en un objeto indexado por clave en vez de en
 * una sola variable: asi, al cambiar el modo de fondo, no queda colgada la URL
 * del modo anterior ni hace falta limpiarla a mano.
 */
export function useProcessedUrl(design: Design): string {
  const key = design.id + ':' + design.backgroundMode
  const [ready, setReady] = useState<Record<string, string>>({})

  const cached = getProcessedUrl(design)

  useEffect(() => {
    if (cached) return // ya estaba calculado

    let cancelled = false
    renderWithoutBackground(design.imageDataUrl, design.backgroundMode)
      .then((url) => {
        setProcessedUrl(design, url)
        if (!cancelled) setReady((prev) => ({ ...prev, [key]: url }))
      })
      .catch(() => {
        // Si no se pudo procesar, se sigue mostrando el original.
      })

    return () => {
      cancelled = true
    }
    // Dependemos de la clave (diseno + modo) y no del objeto `design` entero:
    // lo que importa es que diseno es y con que modo se lo esta mirando.
  }, [key, cached, design])

  return cached ?? ready[key] ?? design.imageDataUrl
}
