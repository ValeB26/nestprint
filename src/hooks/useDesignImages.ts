import { useEffect, useState } from 'react'
import type { Design } from '../types'
import { renderWithoutBackground } from '../lib/imageSample'
import { getProcessedUrl, setProcessedUrl } from '../lib/designCache'

/**
 * Carga las imagenes de los disenos como HTMLImageElement, que es lo que Konva
 * necesita para dibujarlas (no le alcanza con la data URL en texto).
 *
 * Devuelve un objeto { designId -> HTMLImageElement } que se va completando a
 * medida que cada imagen termina de cargar. Mientras una imagen no esta lista,
 * la pieza se dibuja con un relleno gris de placeholder.
 */
export function useDesignImages(designs: Design[]): Record<string, HTMLImageElement> {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({})

  useEffect(() => {
    let cancelled = false

    async function load(design: Design) {
      // El lienzo tiene que mostrar el diseno CON el fondo ya quitado, igual
      // que como se va a exportar. Si el modo es 'none', renderWithoutBackground
      // devuelve el original sin trabajar de mas.
      let url = getProcessedUrl(design)
      if (!url) {
        try {
          url = await renderWithoutBackground(design.imageDataUrl, design.backgroundMode)
          setProcessedUrl(design, url)
        } catch {
          url = design.imageDataUrl
        }
      }
      if (cancelled) return

      const img = new Image()
      img.onload = () => {
        if (!cancelled) setImages((prev) => ({ ...prev, [design.id]: img }))
      }
      img.src = url
    }

    for (const design of designs) void load(design)

    // Si el componente se desmonta antes de que carguen, evitamos setState.
    return () => {
      cancelled = true
    }
  }, [designs])

  return images
}
