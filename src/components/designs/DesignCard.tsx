import type { Design } from '../../types'
import { useApp } from '../../state/AppContext'
import { createVariant } from '../../lib/createVariant'
import { forgetDesign } from '../../lib/designCache'
import { useDesignGeometry } from '../../hooks/useDesignGeometry'
import { useProcessedUrl } from '../../hooks/useProcessedUrl'
import VariantRow from './VariantRow'
import DesignShapePanel from './DesignShapePanel'

/**
 * Tarjeta de un diseno: miniatura + nombre, sus medidas, y el tratamiento de
 * forma plegado al pie.
 *
 * ORDEN POR FRECUENCIA DE USO: arriba y con mas peso va lo que se toca todo el
 * tiempo (las medidas y las cantidades); abajo y plegado, lo que se define una
 * vez al cargar el archivo (fondo, anidado). Antes todo pesaba igual y la
 * tarjeta era un muro de controles.
 *
 * Recorda: la imagen vive solo en el Design; las variantes la referencian por
 * designId.
 */
export default function DesignCard({ design }: { design: Design }) {
  const { state, dispatch } = useApp()

  // Variantes que pertenecen a este diseno.
  const variants = state.variants.filter((v) => v.designId === design.id)
  const pieceCount = variants.reduce((sum, v) => sum + v.quantity, 0)

  // Forma del diseno y miniatura con el fondo ya tratado, para que lo que se ve
  // aca sea lo mismo que se va a acomodar y exportar.
  const geometry = useDesignGeometry(design)
  const thumbnailUrl = useProcessedUrl(design)

  function addVariant() {
    dispatch({
      type: 'ADD_VARIANT',
      variant: createVariant(design, variants.length + 1, geometry?.heightOverWidth),
    })
  }

  function removeDesign() {
    dispatch({ type: 'REMOVE_DESIGN', designId: design.id })
    forgetDesign(design.id) // liberamos muestra e imagen procesada
  }

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-border bg-surface">
      {/* Cabecera: miniatura + nombre + eliminar */}
      <div className="flex items-center gap-3 px-3 pb-2.5 pt-3">
        <img
          src={thumbnailUrl}
          alt={design.name}
          className="h-11 w-11 shrink-0 rounded-lg bg-canvas object-contain ring-1 ring-border"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink" title={design.name}>
            {design.name}
          </p>
          <p className="measure text-xs text-muted">
            {pieceCount} {pieceCount === 1 ? 'pieza' : 'piezas'} en el lienzo
          </p>
        </div>
        <button
          type="button"
          onClick={removeDesign}
          title="Eliminar diseño"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel hover:text-invalid"
        >
          <span className="text-lg leading-none">&times;</span>
        </button>
      </div>

      {/* Lo que se toca todo el tiempo */}
      <div className="px-3 pb-3">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Medidas
        </h3>

        <div className="space-y-1.5">
          {/* La geometria baja entera: da la proporcion del CONTENIDO (la misma
              que usa createVariant, para que editar una medida no cambie la
              forma) y los pixeles utiles, para avisar si falta resolucion. */}
          {variants.map((variant) => (
            <VariantRow
              key={variant.id}
              variant={variant}
              design={design}
              geometry={geometry}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addVariant}
          className="mt-2 w-full rounded-md border border-dashed border-border py-1.5 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-brand"
        >
          + Agregar medida
        </button>
      </div>

      {/* Lo que se define una vez: plegado, pero con su estado a la vista */}
      <DesignShapePanel
        design={design}
        geometry={geometry}
        referenceWidthCm={variants[0]?.widthCm ?? 10}
      />
    </div>
  )
}
