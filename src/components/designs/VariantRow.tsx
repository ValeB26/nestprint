import { useState } from 'react'
import type { Design, DesignVariant } from '../../types'
import { useApp } from '../../state/AppContext'
import NumberInput from '../ui/NumberInput'

/**
 * Fila editable de una variante. Todo se edita en el lugar (sin formularios ni
 * popups): cada cambio despacha UPDATE_VARIANT al estado global.
 *
 * PROPORCION AUTOMATICA
 * ---------------------
 * Con "Mantener proporcion" activado (por defecto), al cambiar el ancho se
 * recalcula el alto -y al revés- usando la proporcion real del archivo
 * (originalHeightPx / originalWidthPx). Asi el diseno nunca sale deformado y el
 * usuario solo piensa en una medida.
 *
 * Se puede desactivar porque sigue siendo configurable: a veces hace falta una
 * medida exacta que no respeta la proporcion del archivo.
 *
 * El ancho se limita al ancho del lienzo: una pieza mas ancha que el lienzo no
 * podria entrar nunca, asi que el tope ayuda a no cargar datos imposibles.
 */
const numberFieldClass =
  'measure w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-brand'

/** Redondeo a 1 decimal (1 mm): la precision con la que se piensan las medidas. */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export default function VariantRow({
  variant,
  design,
}: {
  variant: DesignVariant
  design: Design
}) {
  const { state, dispatch } = useApp()
  const canvasWidthCm = state.config.widthCm

  // Proporcion del archivo original: alto / ancho.
  const ratio = design.originalHeightPx / design.originalWidthPx
  const hasRatio = Number.isFinite(ratio) && ratio > 0

  const [keepAspect, setKeepAspect] = useState(true)
  const linked = keepAspect && hasRatio

  function update(changes: Partial<Omit<DesignVariant, 'id' | 'designId'>>) {
    dispatch({ type: 'UPDATE_VARIANT', variantId: variant.id, changes })
  }

  function commitWidth(widthCm: number) {
    if (!linked) return update({ widthCm })
    update({ widthCm, heightCm: round1(widthCm * ratio) })
  }

  function commitHeight(heightCm: number) {
    if (!linked) return update({ heightCm })
    let widthCm = round1(heightCm / ratio)
    // El ancho no puede pasar el ancho del lienzo. Si se pasa, lo topeamos y
    // recalculamos el alto, para respetar la proporcion sin salirse del material.
    if (widthCm > canvasWidthCm) {
      widthCm = canvasWidthCm
      heightCm = round1(widthCm * ratio)
    }
    update({ widthCm, heightCm })
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-2.5">
      {/* Nombre + eliminar */}
      <div className="mb-2 flex items-center gap-2">
        <input
          type="text"
          value={variant.name}
          aria-label="Nombre de la variante"
          onChange={(e) => update({ name: e.target.value })}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-ink outline-none hover:border-border focus:border-brand"
        />
        <button
          type="button"
          onClick={() => dispatch({ type: 'REMOVE_VARIANT', variantId: variant.id })}
          title="Eliminar variante"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-panel hover:text-invalid"
        >
          <span className="text-base leading-none">&times;</span>
        </button>
      </div>

      {/* Medidas */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Ancho (cm)">
          <NumberInput
            value={variant.widthCm}
            onCommit={commitWidth}
            min={0.1}
            max={canvasWidthCm}
            step={0.5}
            className={numberFieldClass}
            aria-label="Ancho en centimetros"
          />
        </Field>
        <Field label="Alto (cm)">
          <NumberInput
            value={variant.heightCm}
            onCommit={commitHeight}
            min={0.1}
            step={0.5}
            className={numberFieldClass}
            aria-label="Alto en centimetros"
          />
        </Field>
      </div>

      <Check
        label="Mantener proporción"
        checked={keepAspect}
        disabled={!hasRatio}
        onChange={setKeepAspect}
        className="mt-1.5"
      />

      {/* Cantidad + rotacion */}
      <div className="mt-2 flex items-end justify-between gap-2">
        <Field label="Cantidad">
          <NumberInput
            value={variant.quantity}
            onCommit={(quantity) => update({ quantity })}
            min={1}
            step={1}
            integer
            className={`${numberFieldClass} w-20`}
            aria-label="Cantidad"
          />
        </Field>
        <Check
          label="Permitir rotar"
          checked={variant.allowRotation}
          onChange={(allowRotation) => update({ allowRotation })}
          className="pb-1"
        />
      </div>
    </div>
  )
}

/** Campo con etiqueta chica arriba del control. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  )
}

/** Checkbox con etiqueta al lado. */
function Check({
  label,
  checked,
  onChange,
  disabled,
  className = '',
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <label
      className={`flex select-none items-center gap-1.5 text-xs text-muted ${
        disabled ? 'opacity-50' : 'cursor-pointer'
      } ${className}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-brand"
      />
      {label}
    </label>
  )
}
