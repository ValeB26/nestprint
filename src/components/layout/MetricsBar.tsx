import { useMemo } from 'react'
import { useApp } from '../../state/AppContext'
import { layoutHeightCm, utilizationPercent } from '../../lib/metrics'
import { countPiecesWithIssues, validateLayout } from '../../packing/validate'
import { useShapeLookup } from '../../hooks/useShapeLookup'

/**
 * Barra inferior de metricas.
 *
 * JERARQUIA: el alto usado va primero y grande porque ES el material gastado, o
 * sea la plata del trabajo. Antes compartia peso visual con el ancho del lienzo,
 * que es un dato fijo que nunca cambia.
 *
 * Y cuando el acomodado por formas le gano al rectangular, se muestra cuanto se
 * ahorro: es la razon de ser de la app y no aparecia en ningun lado.
 *
 * Todo se calcula a partir de las piezas (ver lib/metrics.ts), asi que se
 * actualiza solo cuando el usuario mueve o elimina algo a mano.
 */
const DASH = '—'

export default function MetricsBar() {
  const { state } = useApp()
  const { placedPieces, variants, config, baselineHeightCm } = state

  const totalPieces = variants.reduce((sum, v) => sum + v.quantity, 0)
  const usedHeightCm = layoutHeightCm(placedPieces)
  const utilization = utilizationPercent(placedPieces, config.widthCm)

  const shapeOf = useShapeLookup()
  const issues = useMemo(
    () => validateLayout(placedPieces, config, shapeOf),
    [placedPieces, config, shapeOf],
  )
  const problemCount = countPiecesWithIssues(issues)

  // Ahorro contra el acomodado por rectangulos. Se recalcula contra el alto
  // ACTUAL, asi que si el usuario mejora el layout a mano, el ahorro sube.
  const savedCm = baselineHeightCm !== null ? baselineHeightCm - usedHeightCm : 0
  const savedPercent = baselineHeightCm ? Math.round((savedCm / baselineHeightCm) * 100) : 0
  const showSaving = savedCm >= 0.1

  return (
    <footer className="flex h-14 shrink-0 items-center gap-5 border-t border-border bg-surface px-5">
      {/* Lo que importa: cuanto material se gasta */}
      <div className="flex items-baseline gap-2">
        <span className="measure text-2xl font-semibold tracking-tight text-ink">
          {usedHeightCm > 0 ? `${usedHeightCm} cm` : DASH}
        </span>
        <span className="text-xs text-muted">de material</span>
      </div>

      {showSaving && (
        <span className="flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
          <CheckIcon />
          Ahorrás {savedCm.toFixed(1)} cm ({savedPercent}%) acomodando por formas
        </span>
      )}

      {problemCount > 0 && (
        <span className="flex items-center gap-1.5 rounded-full bg-invalid/10 px-3 py-1 text-xs font-medium text-invalid">
          <span aria-hidden="true">&#9888;</span>
          {problemCount} {problemCount === 1 ? 'pieza con problemas' : 'piezas con problemas'}
        </span>
      )}

      {/* Contexto, en segundo plano */}
      <div className="ml-auto flex items-center gap-5 text-xs text-muted">
        <Metric label="Ancho" value={`${config.widthCm} cm`} />
        <Metric
          label="Aprovechamiento"
          value={utilization !== null ? `${utilization}%` : DASH}
        />
        <Metric label="Piezas" value={`${placedPieces.length} / ${totalPieces}`} />
      </div>
    </footer>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      {label}
      <span className="measure font-medium text-ink">{value}</span>
    </span>
  )
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <path d="M5 13l5 5L20 7" />
    </svg>
  )
}
