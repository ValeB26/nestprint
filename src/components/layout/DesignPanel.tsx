import { useRef, useState } from 'react'
import { useApp } from '../../state/AppContext'
import { readImageFile } from '../../lib/image'
import { sampleImage } from '../../lib/imageSample'
import { setSample } from '../../lib/designCache'
import { analyzeDesign } from '../../lib/designMask'
import { createVariant } from '../../lib/createVariant'
import { newId } from '../../lib/id'
import type { Design } from '../../types'
import DesignCard from '../designs/DesignCard'

/**
 * Panel izquierdo: los disenos cargados y sus medidas.
 *
 * Tiene UNA sola cosa a proposito. Los ajustes del trabajo (separacion, DPI,
 * acomodado, fondo) se mudaron al popover de la barra superior: se tocan una vez
 * y despues no se miran mas, mientras que las medidas y cantidades se editan
 * todo el tiempo. Mezclarlos hacia que todo pesara lo mismo.
 *
 * El panel orquesta la carga de archivos; el detalle de cada diseno y sus
 * variantes vive en DesignCard.
 */
export default function DesignPanel() {
  const { state, dispatch } = useApp()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  /** Lee los archivos elegidos y crea un diseno (con su primera variante) por cada uno. */
  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setError(null)
    for (const file of Array.from(fileList)) {
      try {
        const { dataUrl, widthPx, heightPx } = await readImageFile(file)
        const design: Design = {
          id: newId(),
          name: file.name.replace(/\.[^.]+$/, ''), // nombre sin extension
          imageDataUrl: dataUrl,
          originalWidthPx: widthPx,
          originalHeightPx: heightPx,
          backgroundMode: 'none',
          allowInteriorNesting: false,
        }
        // Analizamos la forma ahora, una sola vez. Con la muestra en mano, el
        // alto de la primera variante respeta la proporcion del DIBUJO y no la
        // del archivo, que puede traer margen transparente de sobra.
        const sample = await sampleImage(dataUrl)
        setSample(design.id, sample)
        const geometry = analyzeDesign(sample, {
          background: design.backgroundMode,
          allowInteriorNesting: design.allowInteriorNesting,
        })

        // Cada diseno nace con una variante lista para ajustar.
        dispatch({
          type: 'ADD_DESIGN',
          design,
          variant: createVariant(design, 1, geometry.heightOverWidth),
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo cargar el archivo.')
      }
    }
    // Reseteamos el input para poder volver a elegir el mismo archivo si hace falta.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-panel">
      {/* Cabecera Disenos */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold">Diseños</h2>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md bg-surface px-2 py-1 text-xs font-medium text-ink shadow-sm ring-1 ring-border transition-colors hover:bg-panel"
        >
          + Agregar
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <p className="mx-4 mb-2 rounded-md bg-invalid/10 px-2 py-1 text-xs text-invalid">
          {error}
        </p>
      )}

      {/* Lista de disenos */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {state.designs.length === 0 ? (
          <EmptyDesigns onAdd={() => fileInputRef.current?.click()} />
        ) : (
          state.designs.map((design) => <DesignCard key={design.id} design={design} />)
        )}
      </div>
    </aside>
  )
}

function EmptyDesigns({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-border bg-surface/50 px-4 py-8 text-center">
      <p className="text-sm font-medium text-ink">Todavía no hay diseños</p>
      <p className="mt-1 text-xs text-muted">
        Agregá un archivo PNG para empezar a crear variantes.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-hover"
      >
        Subir PNG
      </button>
    </div>
  )
}
