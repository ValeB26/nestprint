import { describe, it, expect } from 'vitest'
import type { ContentFraction, Design } from '../types'
import {
  MIN_PRINT_DPI,
  contentWidthPx,
  effectiveDpi,
  maxWidthCmFor,
  resolutionIssue,
} from './resolution'

/**
 * Tests del aviso de resolucion.
 *
 * El caso de referencia es un logo real de cliente: 1025 px de ancho. A 10 cm
 * sale a 260 DPI (bien) y a 25 cm a 104 DPI (pixelado). El tope a 150 DPI son
 * 17.3 cm.
 */
function design(widthPx: number, heightPx = widthPx): Design {
  return {
    id: 'd1',
    name: 'logo',
    imageDataUrl: 'data:image/jpeg;base64,',
    originalWidthPx: widthPx,
    originalHeightPx: heightPx,
    backgroundMode: 'border',
    allowInteriorNesting: false,
  }
}

/** El dibujo ocupa la mitad del ancho del archivo. */
const mitad: ContentFraction = { x: 0.25, y: 0, width: 0.5, height: 1 }

describe('contentWidthPx', () => {
  it('sin analisis de forma usa el archivo entero', () => {
    expect(contentWidthPx(design(1025))).toBe(1025)
  })

  it('descuenta el margen que no se dibuja', () => {
    // Si el dibujo ocupa la mitad del archivo, solo esa mitad aporta pixeles.
    expect(contentWidthPx(design(1000), mitad)).toBe(500)
  })

  it('ignora una fraccion invalida en vez de devolver cero pixeles', () => {
    const rota: ContentFraction = { x: 0, y: 0, width: 0, height: 1 }
    expect(contentWidthPx(design(1000), rota)).toBe(1000)
  })

  it('devuelve 0 si el archivo no tiene ancho utilizable', () => {
    expect(contentWidthPx(design(0))).toBe(0)
  })
})

describe('effectiveDpi', () => {
  it('calcula el DPI real del logo de referencia', () => {
    expect(Math.round(effectiveDpi(1025, 10))).toBe(260)
    expect(Math.round(effectiveDpi(1025, 25))).toBe(104)
  })

  it('una pulgada de ancho da tantos DPI como pixeles', () => {
    expect(effectiveDpi(300, 2.54)).toBeCloseTo(300, 6)
  })

  it('no divide por cero', () => {
    expect(effectiveDpi(1025, 0)).toBe(0)
  })
})

describe('maxWidthCmFor', () => {
  it('da el ancho maximo que todavia llega al DPI pedido', () => {
    // 1025 px / 150 dpi = 6.833 pulgadas = 17.36 cm
    expect(maxWidthCmFor(1025, 150)).toBe(17.3)
  })

  it('redondea para abajo, nunca promete de mas', () => {
    const maximo = maxWidthCmFor(1025, 150)
    expect(effectiveDpi(1025, maximo)).toBeGreaterThanOrEqual(150)
  })

  it('no divide por cero', () => {
    expect(maxWidthCmFor(1025, 0)).toBe(0)
  })
})

describe('resolutionIssue', () => {
  const logo = design(1025, 957)

  it('no avisa cuando la resolucion alcanza', () => {
    expect(resolutionIssue(logo, 10)).toBeNull()
    expect(resolutionIssue(logo, 17)).toBeNull()
  })

  it('avisa con el DPI real y el ancho maximo', () => {
    expect(resolutionIssue(logo, 25)).toEqual({ dpi: 104, maxWidthCm: 17.3 })
  })

  it('el ancho maximo que sugiere no vuelve a disparar el aviso', () => {
    // Si sugerimos 17.3 cm, 17.3 cm tiene que estar bien. Si no, el usuario
    // haria el cambio y le volveria a aparecer el mismo cartel.
    for (const px of [300, 512, 1025, 2000, 3000]) {
      const d = design(px)
      const issue = resolutionIssue(d, 58)
      if (!issue) continue
      expect(resolutionIssue(d, issue.maxWidthCm)).toBeNull()
    }
  })

  it('tiene en cuenta el margen que no se imprime', () => {
    // El mismo archivo a 15 cm: entero da 169 DPI y alcanza; si la mitad es
    // margen que no se imprime, quedan 500 px utiles y son 85 DPI.
    expect(resolutionIssue(design(1000), 15)).toBeNull()
    expect(resolutionIssue(design(1000), 15, mitad)).toEqual({ dpi: 85, maxWidthCm: 8.4 })
  })

  it('no inventa avisos sin datos', () => {
    expect(resolutionIssue(design(0), 25)).toBeNull()
    expect(resolutionIssue(design(1025), 0)).toBeNull()
  })

  it('respeta un minimo distinto', () => {
    // A 300 DPI el mismo logo que pasaba a 150 ya no alcanza.
    expect(resolutionIssue(logo, 10, undefined, MIN_PRINT_DPI)).toBeNull()
    expect(resolutionIssue(logo, 10, undefined, 300)).not.toBeNull()
  })
})
