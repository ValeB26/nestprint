import { useRef, useState } from 'react'
import { useApp } from '../../state/AppContext'
import { BACKGROUND_PRESETS, type NestingMode } from '../../types'
import { isEyedropperAvailable, pickColorWithEyedropper } from '../../lib/eyedropper'
import NumberInput from '../ui/NumberInput'

/**
 * Ajustes del trabajo: separacion, resolucion, estrategia de acomodado y color
 * de fondo del lienzo.
 *
 * POR QUE VIVE EN UN POPOVER Y NO EN EL PANEL: son decisiones que se toman una
 * vez por trabajo y despues no se miran mas, pero ocupaban el pie del panel
 * izquierdo de forma permanente, compitiendo por espacio con los disenos y las
 * medidas, que son lo que de verdad se toca todo el tiempo.
 *
 * El ancho del lienzo se muestra pero NO se edita: son 58 cm, el ancho del
 * material del proveedor. Mostrarlo igual sirve de referencia al cargar medidas.
 *
 * Nota de unidades: el estado guarda la separacion en cm (gapCm), pero el
 * usuario del negocio piensa en milimetros ("2 mm"), asi que el campo se
 * muestra en mm y convertimos al leer/escribir (1 cm = 10 mm).
 */
const fieldClass =
  'measure w-20 rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-brand'

/** Color de la muestra "Personalizado" cuando todavia no se eligio ninguno. */
const CUSTOM_HINT_COLOR = '#8b5cf6'

interface ConfigFormProps {
  /** Descarta el trabajo actual y lo borra de lo guardado. */
  onReset: () => void
}

export default function ConfigForm({ onReset }: ConfigFormProps) {
  const { state, dispatch } = useApp()
  const { config } = state
  // Input de color nativo, oculto: lo abrimos desde el boton "Personalizado".
  const colorInputRef = useRef<HTMLInputElement>(null)

  // El borrado pide confirmacion en el mismo boton: es destructivo y no tiene
  // deshacer (el historial no cubre retomar ni descartar un trabajo).
  const [confirming, setConfirming] = useState(false)

  const background = config.previewBackground
  const isPreset =
    background === BACKGROUND_PRESETS.white || background === BACKGROUND_PRESETS.black

  function setBackground(previewBackground: string) {
    dispatch({ type: 'UPDATE_CONFIG', changes: { previewBackground } })
  }

  async function handleEyedropper() {
    const color = await pickColorWithEyedropper()
    if (color) setBackground(color)
  }

  return (
    <div className="w-72 p-4">
      <h2 className="mb-3 text-sm font-semibold">Ajustes del trabajo</h2>

      <dl className="space-y-2.5 text-sm">
        {/* Ancho: fijo, solo informativo. */}
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted">Ancho del lienzo</dt>
          <dd className="flex items-center gap-1.5">
            <span className="measure w-20 px-2 py-1 text-right text-ink">{config.widthCm}</span>
            <span className="w-8 text-xs text-faint">cm</span>
          </dd>
        </div>

        <Row label="Separación" unit="mm">
          <NumberInput
            value={Math.round(config.gapCm * 10 * 10) / 10}
            onCommit={(gapMm) =>
              dispatch({ type: 'UPDATE_CONFIG', changes: { gapCm: gapMm / 10 } })
            }
            min={0}
            step={0.5}
            className={fieldClass}
            aria-label="Separación entre piezas en milímetros"
          />
        </Row>

        <Row label="Resolución" unit="DPI">
          <NumberInput
            value={config.dpi}
            onCommit={(dpi) => dispatch({ type: 'UPDATE_CONFIG', changes: { dpi } })}
            min={72}
            step={10}
            integer
            className={fieldClass}
            aria-label="Resolución de exportación en DPI"
          />
        </Row>
      </dl>

      {/* Estrategia de acomodado */}
      <Section label="Acomodado">
        <div className="flex gap-1.5">
          <ModeButton
            mode="rect"
            label="Rectángulos"
            current={config.nestingMode}
            onSelect={(nestingMode) => dispatch({ type: 'UPDATE_CONFIG', changes: { nestingMode } })}
          />
          <ModeButton
            mode="shape"
            label="Formas"
            current={config.nestingMode}
            onSelect={(nestingMode) => dispatch({ type: 'UPDATE_CONFIG', changes: { nestingMode } })}
          />
        </div>
        <p className="mt-1.5 text-xs text-faint">
          {config.nestingMode === 'shape'
            ? 'Acomoda según la forma real de cada diseño y aprovecha los huecos.'
            : 'Acomoda cada diseño como un rectángulo. Es el método probado.'}
        </p>
      </Section>

      {/* Fondo del lienzo: ayuda visual para ver disenos de tinta blanca. */}
      <Section label="Fondo del lienzo">
        <div className="flex flex-wrap items-center gap-1.5">
          <Swatch
            color={BACKGROUND_PRESETS.white}
            label="Blanco"
            selected={background === BACKGROUND_PRESETS.white}
            onClick={() => setBackground(BACKGROUND_PRESETS.white)}
          />
          <Swatch
            color={BACKGROUND_PRESETS.black}
            label="Negro"
            selected={background === BACKGROUND_PRESETS.black}
            onClick={() => setBackground(BACKGROUND_PRESETS.black)}
          />
          <Swatch
            color={isPreset ? CUSTOM_HINT_COLOR : background}
            label="Personalizado"
            selected={!isPreset}
            onClick={() => colorInputRef.current?.click()}
          />
          {isEyedropperAvailable() && (
            <button
              type="button"
              onClick={handleEyedropper}
              title="Tomar un color de cualquier parte de la pantalla"
              className="flex h-[26px] items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs text-muted transition-colors hover:bg-panel"
            >
              <span aria-hidden="true">&#9679;</span>
              Cuentagotas
            </button>
          )}
        </div>

        {/* El input nativo de color trae la paleta del sistema (y en Chrome, su
            propio cuentagotas). Lo mantenemos oculto y lo disparamos desde el
            boton, para no romper el estilo del panel. */}
        <input
          ref={colorInputRef}
          type="color"
          value={isPreset ? BACKGROUND_PRESETS.white : background}
          onChange={(e) => setBackground(e.target.value)}
          className="sr-only"
          aria-label="Color de fondo personalizado"
          tabIndex={-1}
        />

        <p className="mt-1.5 text-xs text-faint">
          {isPreset ? (
            'Solo para ver en pantalla. El PNG se exporta transparente.'
          ) : (
            <span className="measure">{background.toUpperCase()}</span>
          )}
        </p>
      </Section>

      {/* Empezar de cero */}
      <div className="mt-3 border-t border-border pt-3">
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs text-ink">¿Descartar este trabajo?</span>
            <button
              type="button"
              onClick={() => {
                onReset()
                setConfirming(false)
              }}
              className="rounded-md bg-invalid px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:opacity-90"
            >
              Sí, borrar
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-panel"
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-xs font-medium text-muted transition-colors hover:text-invalid"
          >
            Empezar un trabajo nuevo
          </button>
        )}
      </div>
    </div>
  )
}

/** Bloque con su titulito, separado del anterior por una linea. */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      {children}
    </div>
  )
}

/** Boton de estrategia de acomodado. */
function ModeButton({
  mode,
  label,
  current,
  onSelect,
}: {
  mode: NestingMode
  label: string
  current: NestingMode
  onSelect: (mode: NestingMode) => void
}) {
  const selected = current === mode
  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      aria-pressed={selected}
      className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${
        selected
          ? 'border-brand bg-brand/10 font-semibold text-brand'
          : 'border-border bg-surface text-muted hover:bg-panel'
      }`}
    >
      {label}
    </button>
  )
}

/** Muestra de color con su nombre. */
function Swatch({
  color,
  label,
  selected,
  onClick,
}: {
  color: string
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={label}
      className={`flex h-[26px] items-center gap-1.5 rounded-md border px-2 text-xs transition-colors ${
        selected
          ? 'border-brand bg-brand/10 font-medium text-brand'
          : 'border-border bg-surface text-muted hover:bg-panel'
      }`}
    >
      <span
        aria-hidden="true"
        className="h-3 w-3 shrink-0 rounded-full ring-1 ring-border"
        style={{ background: color }}
      />
      {label}
    </button>
  )
}

function Row({
  label,
  unit,
  children,
}: {
  label: string
  unit: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="flex items-center gap-1.5">
        {children}
        <span className="w-8 text-xs text-faint">{unit}</span>
      </dd>
    </div>
  )
}
