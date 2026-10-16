import { useEffect, useState } from 'react'
import { useApp } from '../state/AppContext'
import { getSample, setSample } from '../lib/designCache'
import { sampleImage } from '../lib/imageSample'
import { fromSnapshot, hasWork, toSnapshot } from '../storage/projectSnapshot'
import { clearProject, isStorageAvailable, loadProject, saveProject } from '../storage/projectStore'

/**
 * Retomar el trabajo donde quedo, y guardarlo solo mientras se trabaja.
 *
 * DOS DETALLES QUE SON LA DIFERENCIA ENTRE QUE FUNCIONE Y QUE NO:
 *
 * 1. No se guarda NADA hasta terminar de restaurar. Si no, el estado vacio del
 *    arranque pisaria el trabajo guardado antes de poder leerlo.
 *
 * 2. Las formas de los disenos se vuelven a analizar ANTES de meterlos en el
 *    estado. El analisis vive en una cache fuera de React, asi que al retomar
 *    esta vacia; si los disenos entraran primero, el acomodado por formas y el
 *    panel de forma se quedarian sin datos hasta volver a subir el archivo.
 */

/** Cuanto esperar despues del ultimo cambio antes de guardar. */
const SAVE_DELAY_MS = 800

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'unavailable'

export interface ProjectPersistence {
  /** Ya se termino de intentar retomar el trabajo? */
  ready: boolean
  status: SaveStatus
  /** Descarta el trabajo actual y lo borrado guardado. */
  reset: () => void
}

export function useProjectPersistence(): ProjectPersistence {
  const { state, dispatch } = useApp()
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<SaveStatus>(() =>
    isStorageAvailable() ? 'idle' : 'unavailable',
  )

  // Retomar, una sola vez al arrancar.
  useEffect(() => {
    let cancelled = false

    async function restore() {
      const stored = await loadProject()
      const project = stored ? fromSnapshot(stored) : null

      if (project) {
        // Re-analizar las formas antes de publicar los disenos en el estado.
        await Promise.all(
          project.designs.map(async (design) => {
            if (getSample(design.id)) return
            try {
              setSample(design.id, await sampleImage(design.imageDataUrl))
            } catch {
              // Sin muestra, ese diseno se acomoda como rectangulo. No es
              // motivo para no abrir el trabajo.
            }
          }),
        )
        if (!cancelled) dispatch({ type: 'RESTORE_PROJECT', project })
      }

      if (!cancelled) setReady(true)
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [dispatch])

  // Autoguardado, con una pausa para no escribir en cada tecla o arrastre.
  //
  // OJO con las dependencias: este efecto CAMBIA el status, asi que no puede
  // depender de el. Si lo hiciera, cada guardado dispararia otro guardado y
  // quedaria escribiendo para siempre. Por eso se consulta la disponibilidad
  // del almacenamiento directo, que no es un valor reactivo.
  useEffect(() => {
    if (!ready || !isStorageAvailable()) return

    const timer = setTimeout(() => {
      if (!hasWork(state)) {
        // Si no quedan disenos, tampoco debe quedar nada guardado.
        void clearProject()
        setStatus('idle')
        return
      }
      setStatus('saving')
      saveProject(toSnapshot(state))
        .then(() => setStatus('saved'))
        .catch(() => setStatus('error'))
    }, SAVE_DELAY_MS)

    return () => clearTimeout(timer)
  }, [ready, state])

  function reset() {
    void clearProject()
    dispatch({ type: 'RESET_PROJECT' })
    setStatus('idle')
  }

  return { ready, status, reset }
}
