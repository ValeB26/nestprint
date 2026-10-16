import { describe, it, expect } from 'vitest'
import { isDarkColor } from './color'

describe('isDarkColor', () => {
  it('reconoce los extremos', () => {
    expect(isDarkColor('#000000')).toBe(true)
    expect(isDarkColor('#ffffff')).toBe(false)
  })

  it('pesa el verde mas que el azul (luminancia percibida)', () => {
    // Mismo valor de canal, pero el azul puro se ve mucho mas oscuro.
    expect(isDarkColor('#0000ff')).toBe(true)
    expect(isDarkColor('#00ff00')).toBe(false)
  })

  it('funciona con o sin el numeral y en mayusculas', () => {
    expect(isDarkColor('1f7a63')).toBe(true)
    expect(isDarkColor('#1F7A63')).toBe(true)
  })

  it('ante un valor que no entiende, asume color claro', () => {
    expect(isDarkColor('rgb(0,0,0)')).toBe(false)
    expect(isDarkColor('')).toBe(false)
  })
})
