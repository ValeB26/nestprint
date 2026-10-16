import { useEffect, useRef, useState } from 'react'

/**
 * Mide el tamano (en px) de un elemento del DOM y se actualiza cuando cambia.
 *
 * Konva necesita un ancho/alto en pixeles concretos para su <Stage>, pero el
 * area del canvas es flexible (flex-1). Con un ResizeObserver seguimos el tamano
 * real del contenedor y se lo pasamos al Stage.
 *
 * Se usa como: const [ref, size] = useElementSize(); <div ref={ref}>...
 */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}
