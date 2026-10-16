import type { BackgroundMode, Design } from '../../types'
import { useApp } from '../../state/AppContext'
import type { DesignGeometry } from '../../lib/designMask'

/**
 * Tratamiento del fondo del PNG y anidado interior, para un diseno.
 *
 * POR QUE VA PLEGADO: son decisiones que se toman una vez al cargar el archivo
 * y casi nunca se vuelven a tocar, pero antes ocupaban cinco controles fijos en
 * cada tarjeta. Ahora se abre solo si hace falta.
 *
 * El encabezado SIEMPRE muestra el estado, asi que plegarlo no esconde nada
 * importante: si el PNG no tiene transparencia, se ve el aviso sin abrir nada.
 *
 * La idea de fondo no cambia: ninguna de las dos decisiones es a ciegas. Al lado
 * de cada una va el dato medido sobre el archivo real.
 */
interface DesignShapePanelProps {
  design: Design
  geometry: DesignGeometry | null
  /** Ancho de la primera variante, para expresar el hueco en cm. */
  referenceWidthCm: number
}

/** Resumen de una linea para el encabezado plegado. */
function summaryOf(design: Design, geometry: DesignGeometry): { text: string; warn: boolean } {
  if (geometry.isOpaque && design.backgroundMode === 'none') {
    return { text: 'Sin transparencia', warn: true }
  }
  const fondo =
    design.backgroundMode === 'white'
      ? 'Sin blanco'
      : design.backgroundMode === 'border'
        ? 'Sin fondo'
        : 'Archivo tal cual'
  const ocupa = Math.round(geometry.density * 100)
  return { text: ocupa < 98 ? `${fondo} · ocupa ${ocupa}%` : fondo, warn: false }
}

export default function DesignShapePanel({
  design,
  geometry,
  referenceWidthCm,
}: DesignShapePanelProps) {
  const { dispatch } = useApp()

  function update(changes: Partial<Design>) {
    dispatch({ type: 'UPDATE_DESIGN', designId: design.id, changes })
  }

  // Todavia no se analizo la forma: no mostramos controles que no podemos
  // respaldar con datos.
  if (!geometry) return null

  const holeCm = geometry.largestHoleFraction * referenceWidthCm
  const entraAlgo = holeCm >= 1
  const resumen = summaryOf(design, geometry)

  return (
    <details className="group border-t border-border">
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs transition-colors ${
          resumen.warn ? 'bg-warn/10 text-warn' : 'text-muted hover:bg-panel'
        }`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          aria-hidden="true"
          className="shrink-0 transition-transform group-open:rotate-90"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className="flex-1 font-medium">Forma y fondo</span>
        <span className={resumen.warn ? 'font-medium' : 'measure'}>{resumen.text}</span>
      </summary>

      <div className="px-3 pb-3 pt-1">
        {resumen.warn && (
          <p className="mb-2 text-xs leading-relaxed text-warn">
            Se imprimiría como un rectángulo con fondo, no como una calcomanía.
          </p>
        )}

        <div className="flex gap-1">
          <ModeButton mode="none" label="Dejar" current={design.backgroundMode} onSelect={update} />
          <ModeButton mode="border" label="Quitar borde" current={design.backgroundMode} onSelect={update} />
          <ModeButton mode="white" label="Quitar blanco" current={design.backgroundMode} onSelect={update} />
        </div>

        <p className="mt-1.5 text-xs text-faint">
          {design.backgroundMode === 'border' && 'Quita el fondo pegado al borde. Conserva los blancos interiores.'}
          {design.backgroundMode === 'white' && 'Quita todo el blanco. Ojo si el diseño tiene blanco a propósito.'}
          {design.backgroundMode === 'none' && 'El archivo se usa tal cual.'}
        </p>

        {/* Anidado interior, con la medida al lado para no decidir a ciegas */}
        <label
          className={`mt-2.5 flex select-none items-start gap-1.5 text-xs ${
            entraAlgo ? 'cursor-pointer text-muted' : 'cursor-not-allowed text-faint'
          }`}
        >
          <input
            type="checkbox"
            checked={design.allowInteriorNesting}
            disabled={!entraAlgo}
            onChange={(e) => update({ allowInteriorNesting: e.target.checked })}
            className="mt-0.5 h-3.5 w-3.5 accent-brand"
          />
          <span>
            Anidar piezas adentro
            <span className="measure block text-faint">
              {geometry.largestHoleFraction > 0
                ? `hueco de ${holeCm.toFixed(1)} cm${entraAlgo ? '' : ' — no entra nada'}`
                : 'sin huecos cerrados'}
            </span>
          </span>
        </label>
      </div>
    </details>
  )
}

function ModeButton({
  mode,
  label,
  current,
  onSelect,
}: {
  mode: BackgroundMode
  label: string
  current: BackgroundMode
  onSelect: (changes: { backgroundMode: BackgroundMode }) => void
}) {
  const selected = current === mode
  return (
    <button
      type="button"
      onClick={() => onSelect({ backgroundMode: mode })}
      aria-pressed={selected}
      className={`flex-1 rounded-md border px-1 py-1.5 text-[11px] leading-tight transition-colors ${
        selected
          ? 'border-brand bg-brand/10 font-semibold text-brand'
          : 'border-border bg-surface text-muted hover:bg-panel'
      }`}
    >
      {label}
    </button>
  )
}
