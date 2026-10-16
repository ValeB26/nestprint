import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG, type Design, type DesignVariant, type PlacedPiece } from '../types'
import { initialState } from '../state/appReducer'
import { fromSnapshot, hasWork, toSnapshot, SNAPSHOT_VERSION } from './projectSnapshot'

/**
 * Tests de la serializacion del trabajo. Lo que mas importa no es el camino
 * feliz sino el defensivo: un guardado viejo, corrupto o a medias NO puede
 * dejar la app en un estado imposible.
 */

function design(over: Partial<Design> = {}): Design {
  return {
    id: 'd1',
    name: 'Insignia',
    imageDataUrl: 'data:image/png;base64,AAAA',
    originalWidthPx: 685,
    originalHeightPx: 663,
    backgroundMode: 'white',
    allowInteriorNesting: false,
    ...over,
  }
}

function variant(over: Partial<DesignVariant> = {}): DesignVariant {
  return {
    id: 'v1',
    designId: 'd1',
    name: 'Variante 1',
    widthCm: 14,
    heightCm: 14,
    quantity: 14,
    allowRotation: true,
    ...over,
  }
}

function piece(over: Partial<PlacedPiece> = {}): PlacedPiece {
  return {
    id: 'p1',
    variantId: 'v1',
    xCm: 0.1,
    yCm: 0.1,
    widthCm: 14,
    heightCm: 14,
    rotation: 0,
    ...over,
  }
}

const trabajo = {
  ...initialState,
  designs: [design()],
  variants: [variant()],
  placedPieces: [piece()],
  baselineHeightCm: 56.7,
}

describe('ida y vuelta', () => {
  it('un trabajo guardado se recupera igual', () => {
    const recuperado = fromSnapshot(toSnapshot(trabajo))
    expect(recuperado).not.toBeNull()
    expect(recuperado!.designs).toEqual(trabajo.designs)
    expect(recuperado!.variants).toEqual(trabajo.variants)
    expect(recuperado!.placedPieces).toEqual(trabajo.placedPieces)
    expect(recuperado!.baselineHeightCm).toBe(56.7)
    expect(recuperado!.config).toEqual(trabajo.config)
  })

  it('guarda cuando se guardo', () => {
    expect(toSnapshot(trabajo).savedAt).toContain('T')
  })

  it('el historial de deshacer NO se guarda', () => {
    expect(Object.keys(toSnapshot(trabajo))).not.toContain('past')
  })

  it('conserva angulos libres', () => {
    const conAngulo = { ...trabajo, placedPieces: [piece({ rotation: 37.5 })] }
    expect(fromSnapshot(toSnapshot(conAngulo))!.placedPieces[0].rotation).toBe(37.5)
  })
})

describe('hasWork', () => {
  it('sin disenos no hay nada que guardar', () => {
    expect(hasWork(initialState)).toBe(false)
    expect(hasWork(trabajo)).toBe(true)
  })
})

describe('rechaza lo que no se puede confiar', () => {
  it('cualquier cosa que no sea un trabajo', () => {
    expect(fromSnapshot(null)).toBeNull()
    expect(fromSnapshot('hola')).toBeNull()
    expect(fromSnapshot([])).toBeNull()
    expect(fromSnapshot({})).toBeNull()
  })

  it('una version distinta del formato', () => {
    const viejo = { ...toSnapshot(trabajo), version: SNAPSHOT_VERSION + 1 }
    expect(fromSnapshot(viejo)).toBeNull()
  })

  it('un diseno sin imagen', () => {
    const roto = toSnapshot({ ...trabajo, designs: [{ ...design(), imageDataUrl: '' }] })
    expect(fromSnapshot(roto)).toBeNull()
  })

  it('medidas invalidas', () => {
    const cero = toSnapshot({ ...trabajo, variants: [variant({ widthCm: 0 })] })
    expect(fromSnapshot(cero)).toBeNull()

    const nan = toSnapshot({ ...trabajo, placedPieces: [piece({ xCm: NaN })] })
    expect(fromSnapshot(nan)).toBeNull()
  })

  /**
   * El caso mas valioso: datos que por separado son validos pero no cierran
   * entre si. Dejarian piezas imposibles de dibujar y paneles vacios.
   */
  it('una variante que apunta a un diseno que no existe', () => {
    const huerfana = toSnapshot({ ...trabajo, variants: [variant({ designId: 'fantasma' })] })
    expect(fromSnapshot(huerfana)).toBeNull()
  })

  it('una pieza que apunta a una variante que no existe', () => {
    const huerfana = toSnapshot({ ...trabajo, placedPieces: [piece({ variantId: 'fantasma' })] })
    expect(fromSnapshot(huerfana)).toBeNull()
  })
})

describe('tolera lo que puede', () => {
  it('un diseno guardado antes de que existiera el tratamiento de fondo', () => {
    const viejo = {
      version: SNAPSHOT_VERSION,
      savedAt: '2026-01-01T00:00:00Z',
      designs: [
        {
          id: 'd1',
          name: 'Viejo',
          imageDataUrl: 'data:image/png;base64,AAAA',
          originalWidthPx: 100,
          originalHeightPx: 100,
        },
      ],
      variants: [],
      placedPieces: [],
      config: {},
    }
    const recuperado = fromSnapshot(viejo)
    expect(recuperado).not.toBeNull()
    expect(recuperado!.designs[0].backgroundMode).toBe('none')
    expect(recuperado!.designs[0].allowInteriorNesting).toBe(false)
  })

  it('una config incompleta cae a los valores por defecto', () => {
    const parcial = { ...toSnapshot(trabajo), config: { dpi: 150 } }
    const recuperado = fromSnapshot(parcial)
    expect(recuperado!.config.dpi).toBe(150)
    expect(recuperado!.config.widthCm).toBe(DEFAULT_CONFIG.widthCm)
    expect(recuperado!.config.gapCm).toBe(DEFAULT_CONFIG.gapCm)
  })

  it('un modo de acomodado desconocido cae a rectangulos', () => {
    const raro = { ...toSnapshot(trabajo), config: { nestingMode: 'magia' } }
    expect(fromSnapshot(raro)!.config.nestingMode).toBe('rect')
  })
})
