/**
 * Utilidades de color para la UI.
 *
 * Solo manejamos colores hex de 6 digitos (#rrggbb), que es lo que devuelven el
 * input de color nativo y el cuentagotas. No hace falta un parser general.
 */

/**
 * El color es oscuro? Sirve para elegir si el texto encima va claro u oscuro y
 * que siempre se pueda leer, sea cual sea el fondo que elija el usuario.
 *
 * Usa la luminancia percibida: el ojo humano es mucho mas sensible al verde que
 * al azul, de ahi los pesos distintos (formula estandar de luminancia relativa).
 */
export function isDarkColor(hex: string): boolean {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  // Si no lo entendemos, asumimos claro: el texto oscuro por defecto es lo mas
  // seguro sobre el blanco, que es el fondo por defecto.
  if (!match) return false

  const value = parseInt(match[1], 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance < 0.5
}
