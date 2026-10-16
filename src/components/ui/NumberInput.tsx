import { useState } from 'react'

/**
 * Input numerico controlado pero "amable" de editar.
 *
 * Problema: si el input lee directo un numero del estado, borrar el contenido
 * para reescribirlo se vuelve molesto (el campo salta, no deja quedar vacio).
 * Solucion: guardamos lo que el usuario tipea como texto local mientras edita y
 * recien confirmamos el valor al salir del campo (blur) o apretar Enter. Ahi
 * parseamos, aplicamos minimo/maximo y, si quedo invalido, volvemos al valor
 * anterior.
 */
interface NumberInputProps {
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** Si es true, redondea a entero al confirmar (ej: cantidades). */
  integer?: boolean
  className?: string
  id?: string
  'aria-label'?: string
}

export default function NumberInput({
  value,
  onCommit,
  min,
  max,
  step,
  integer,
  className,
  id,
  'aria-label': ariaLabel,
}: NumberInputProps) {
  const [text, setText] = useState(String(value))

  // Si el valor del estado cambia desde afuera (otra edicion, un reset),
  // re-sincronizamos el texto. Es el patron de React para "ajustar estado
  // cuando cambia una prop": se hace durante el render comparando con el valor
  // anterior, sin useEffect (evita un render extra).
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setText(String(value))
  }

  function commit() {
    const parsed = Number(text)
    if (!Number.isFinite(parsed)) {
      setText(String(value)) // revertir: lo tipeado no es un numero
      return
    }
    let next = integer ? Math.round(parsed) : parsed
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    setText(String(next))
    if (next !== value) onCommit(next)
  }

  return (
    <input
      type="number"
      id={id}
      aria-label={ariaLabel}
      value={text}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      className={className}
    />
  )
}
