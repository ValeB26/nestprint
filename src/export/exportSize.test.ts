import { describe, it, expect } from 'vitest'
import {
  cmToPx,
  exportBlocker,
  exportFileName,
  exportSize,
  maxUsableDpi,
  pxToCm,
  MAX_CANVAS_SIDE,
} from './exportSize'

describe('conversion cm <-> px', () => {
  it('una pulgada son 2.54 cm', () => {
    expect(cmToPx(2.54, 300)).toBeCloseTo(300)
    expect(pxToCm(300, 300)).toBeCloseTo(2.54)
  })

  it('el ancho del lienzo a 300 DPI da 6850 px', () => {
    // El numero que ya figuraba en los parametros del negocio.
    expect(Math.round(cmToPx(58, 300))).toBe(6850)
  })

  it('ida y vuelta no pierde nada', () => {
    expect(pxToCm(cmToPx(37.5, 150), 150)).toBeCloseTo(37.5)
  })
})

describe('exportSize', () => {
  it('calcula el tamano del PNG', () => {
    const size = exportSize(58, 50, 300)
    expect(size.widthPx).toBe(6850)
    expect(size.heightPx).toBe(5906)
    expect(size.megapixels).toBeCloseTo(40.5, 0)
  })

  it('nunca devuelve cero', () => {
    expect(exportSize(58, 0.001, 72).heightPx).toBeGreaterThanOrEqual(1)
  })
})

describe('limites del navegador', () => {
  it('un trabajo normal se puede exportar', () => {
    expect(exportBlocker(58, 50, 300)).toBeNull()
  })

  it('sin piezas avisa en vez de exportar vacio', () => {
    expect(exportBlocker(58, 0, 300)).toContain('No hay piezas')
  })

  /**
   * El caso real: un trabajo de 82 piezas da 135 cm de alto. A 300 DPI eso son
   * 15945 px de alto y 109 MP, mas de lo que aguanta el navegador.
   */
  it('avisa cuando el trabajo es demasiado grande, con una sugerencia', () => {
    const aviso = exportBlocker(58, 135, 300)
    expect(aviso).not.toBeNull()
    expect(aviso).toContain('DPI')
    // La sugerencia tiene que ser un DPI que SI entre.
    const sugerido = maxUsableDpi(58, 135)
    expect(exportBlocker(58, 135, sugerido)).toBeNull()
  })

  it('el lado maximo del canvas se respeta', () => {
    // Un trabajo larguisimo: lo que manda es el lado, no el area.
    const dpi = maxUsableDpi(58, 400)
    expect(exportSize(58, 400, dpi).heightPx).toBeLessThanOrEqual(MAX_CANVAS_SIDE)
    expect(exportBlocker(58, 400, dpi)).toBeNull()
  })

  it('un DPI apenas mayor al sugerido ya no entra', () => {
    const sugerido = maxUsableDpi(58, 200)
    expect(exportBlocker(58, 200, sugerido)).toBeNull()
    expect(exportBlocker(58, 200, sugerido + 30)).not.toBeNull()
  })

  it('nunca sugiere menos de 72 DPI', () => {
    expect(maxUsableDpi(58, 10000)).toBe(72)
  })

  it('sin alto no hay DPI que calcular', () => {
    expect(maxUsableDpi(58, 0)).toBe(0)
  })
})

describe('exportFileName', () => {
  it('dice de un vistazo que es', () => {
    expect(exportFileName(58, 135.4, 300)).toBe('nestprint-58x135cm-300dpi.png')
  })
})
