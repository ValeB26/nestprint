import { useState } from 'react'
import { useApp } from '../../state/AppContext'
import { pack } from '../../packing'
import { useVariantShapeLookup } from '../../hooks/useShapeLookup'
import { downloadBlob, exportLayoutToPng } from '../../export/exportPng'
import Popover from '../ui/Popover'
import LogoMark from '../ui/LogoMark'
import ConfigForm from '../config/ConfigForm'
import type { SaveStatus } from '../../hooks/useProjectPersistence'

/**
 * Barra superior. Agrupa la marca a la izquierda y las acciones del trabajo
 * a la derecha: Optimizar (primaria), Deshacer/Rehacer y Exportar.
 *
 * Los ajustes del trabajo (separacion, DPI, acomodado, fondo) viven en un
 * popover de esta barra y no en el panel izquierdo: se tocan una vez por trabajo
 * y despues no se miran mas, pero ocupaban espacio permanente compitiendo con
 * los disenos y las medidas, que son lo que de verdad se usa todo el tiempo.
 *
 * Exportar puede tardar unos segundos con trabajos grandes (hay que quitar el
 * fondo a resolucion de impresion y generar un PNG de varios megapixeles), por
 * eso el boton avisa mientras trabaja y los errores se muestran con una
 * sugerencia concreta en vez de fallar en silencio.
 */
interface ToolbarProps {
  saveStatus: SaveStatus
  onReset: () => void
}

export default function Toolbar({ saveStatus, onReset }: ToolbarProps) {
  const { state, dispatch, canUndo, canRedo } = useApp()
  // Formas de los disenos. El optimizador las usa solo si el modo es 'shape';
  // si no, las ignora y acomoda por rectangulos como siempre.
  const shapeOf = useVariantShapeLookup()

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const totalPieces = state.variants.reduce((sum, v) => sum + v.quantity, 0)
  const hasLayout = state.placedPieces.length > 0

  function handleOptimize() {
    const result = pack(state.variants, state.config, shapeOf)
    dispatch({
      type: 'SET_PACKING_RESULT',
      pieces: result.pieces,
      baselineHeightCm: result.baselineHeightCm,
    })

    if (result.unplaced > 0) {
      console.warn(
        `[NestPrint] ${result.unplaced} pieza(s) no entraron: son mas anchas que el lienzo.`,
      )
    }
  }

  async function handleExport() {
    setExportError(null)
    setExporting(true)
    try {
      const result = await exportLayoutToPng({
        pieces: state.placedPieces,
        variants: state.variants,
        designs: state.designs,
        config: state.config,
      })
      downloadBlob(result.blob, result.fileName)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo exportar el PNG.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <span className="text-[15px] font-semibold tracking-tight">NestPrint</span>
        <SaveIndicator status={saveStatus} />
      </div>

      <div className="flex items-center gap-2">
        <IconButton
          label={'\u21BA'}
          title="Deshacer (Ctrl+Z)"
          disabled={!canUndo}
          onClick={() => dispatch({ type: 'UNDO' })}
        />
        <IconButton
          label={'\u21BB'}
          title="Rehacer (Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={() => dispatch({ type: 'REDO' })}
        />

        <div className="mx-1 h-5 w-px bg-border" />

        <Popover label="Ajustes" title="Ajustes del trabajo">
          <ConfigForm onReset={onReset} />
        </Popover>

        <button
          type="button"
          onClick={handleExport}
          disabled={!hasLayout || exporting}
          title={hasLayout ? 'Descargar el PNG transparente' : 'Primero optimizá el lienzo'}
          className="h-8 rounded-md border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-panel disabled:opacity-40"
        >
          {exporting ? 'Exportando…' : 'Exportar PNG'}
        </button>
        <button
          type="button"
          onClick={handleOptimize}
          disabled={totalPieces === 0}
          title={totalPieces === 0 ? 'Agregá al menos una pieza para optimizar' : undefined}
          className="h-8 rounded-md bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-40"
        >
          Optimizar
        </button>
      </div>

      {/* El error cuelga de la barra para no empujar el layout. */}
      {exportError && (
        <div className="absolute right-4 top-full z-20 mt-1 flex max-w-sm items-start gap-2 rounded-md border border-invalid/30 bg-surface px-3 py-2 text-xs text-invalid shadow-lg">
          <span className="flex-1">{exportError}</span>
          <button
            type="button"
            onClick={() => setExportError(null)}
            title="Cerrar"
            className="shrink-0 text-sm leading-none text-muted hover:text-ink"
          >
            &times;
          </button>
        </div>
      )}
    </header>
  )
}

function IconButton({
  label,
  title,
  disabled,
  onClick,
}: {
  label: string
  title: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <span className="text-base leading-none">{label}</span>
    </button>
  )
}

/**
 * Estado del guardado automatico. Discreto a proposito: el usuario no tiene que
 * pensar en guardar, solo necesita saber que su trabajo esta a salvo. Solo
 * levanta la voz cuando algo salio mal.
 */
function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null

  if (status === 'error' || status === 'unavailable') {
    return (
      <span
        className="ml-1 rounded-md bg-invalid/10 px-2 py-0.5 text-xs font-medium text-invalid"
        title={
          status === 'unavailable'
            ? 'Este navegador no permite guardar el trabajo (puede ser el modo incógnito).'
            : 'No se pudo guardar el trabajo.'
        }
      >
        Sin guardar
      </span>
    )
  }

  return (
    <span className="ml-1 text-xs text-faint">
      {status === 'saving' ? 'Guardando…' : 'Guardado'}
    </span>
  )
}
