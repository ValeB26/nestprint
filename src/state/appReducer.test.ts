import { describe, it, expect } from 'vitest'
import type { PlacedPiece } from '../types'
import { appReducer, initialState, type AppState } from './appReducer'

/**
 * Tests de las acciones de edicion manual sobre varias piezas a la vez
 * (seleccion multiple con Ctrl+clic) y de la rotacion libre.
 */

function piece(id: string, overrides: Partial<PlacedPiece> = {}): PlacedPiece {
  return {
    id,
    variantId: 'v1',
    xCm: 10,
    yCm: 20,
    widthCm: 8,
    heightCm: 4,
    rotation: 0,
    ...overrides,
  }
}

/** Estado con las piezas dadas ya colocadas. */
function stateWith(pieces: PlacedPiece[]): AppState {
  return { ...initialState, placedPieces: pieces }
}

const byId = (state: AppState, id: string) => state.placedPieces.find((p) => p.id === id)!

describe('MOVE_PIECES', () => {
  it('mueve todas las piezas indicadas con el mismo desplazamiento', () => {
    const before = stateWith([piece('a'), piece('b', { xCm: 30, yCm: 40 })])
    const after = appReducer(before, {
      type: 'MOVE_PIECES',
      pieceIds: ['a', 'b'],
      dxCm: 5,
      dyCm: -2,
    })
    expect(byId(after, 'a')).toMatchObject({ xCm: 15, yCm: 18 })
    expect(byId(after, 'b')).toMatchObject({ xCm: 35, yCm: 38 })
  })

  it('no toca las piezas que no estan en la seleccion', () => {
    const before = stateWith([piece('a'), piece('b')])
    const after = appReducer(before, { type: 'MOVE_PIECES', pieceIds: ['a'], dxCm: 5, dyCm: 0 })
    expect(byId(after, 'b')).toMatchObject({ xCm: 10, yCm: 20 })
  })
})

describe('ROTATE_PIECES', () => {
  it('suma el angulo a cada pieza seleccionada', () => {
    const before = stateWith([piece('a'), piece('b', { rotation: 45 })])
    const after = appReducer(before, {
      type: 'ROTATE_PIECES',
      pieceIds: ['a', 'b'],
      deltaDegrees: 90,
    })
    expect(byId(after, 'a').rotation).toBe(90)
    expect(byId(after, 'b').rotation).toBe(135)
  })

  it('da la vuelta al pasar de 360 grados', () => {
    const before = stateWith([piece('a', { rotation: 270 })])
    const after = appReducer(before, { type: 'ROTATE_PIECES', pieceIds: ['a'], deltaDegrees: 180 })
    expect(byId(after, 'a').rotation).toBe(90)
  })

  it('acepta rotar en sentido contrario', () => {
    const before = stateWith([piece('a', { rotation: 0 })])
    const after = appReducer(before, { type: 'ROTATE_PIECES', pieceIds: ['a'], deltaDegrees: -90 })
    expect(byId(after, 'a').rotation).toBe(270)
  })

  it('rotar no mueve ni cambia el tamano propio de la pieza', () => {
    const before = stateWith([piece('a')])
    const after = appReducer(before, { type: 'ROTATE_PIECES', pieceIds: ['a'], deltaDegrees: 90 })
    // La rotacion es alrededor del centro: el rectangulo propio queda igual.
    expect(byId(after, 'a')).toMatchObject({ xCm: 10, yCm: 20, widthCm: 8, heightCm: 4 })
  })
})

describe('SET_PIECES_ROTATION', () => {
  it('pone el mismo angulo exacto en todas', () => {
    const before = stateWith([piece('a', { rotation: 10 }), piece('b', { rotation: 200 })])
    const after = appReducer(before, {
      type: 'SET_PIECES_ROTATION',
      pieceIds: ['a', 'b'],
      degrees: 37,
    })
    expect(byId(after, 'a').rotation).toBe(37)
    expect(byId(after, 'b').rotation).toBe(37)
  })

  it('normaliza angulos fuera de rango', () => {
    const before = stateWith([piece('a')])
    const after = appReducer(before, { type: 'SET_PIECES_ROTATION', pieceIds: ['a'], degrees: -45 })
    expect(byId(after, 'a').rotation).toBe(315)
  })
})

describe('REMOVE_PIECES', () => {
  it('elimina todas las piezas indicadas de una sola vez', () => {
    const before = stateWith([piece('a'), piece('b'), piece('c')])
    const after = appReducer(before, { type: 'REMOVE_PIECES', pieceIds: ['a', 'c'] })
    expect(after.placedPieces.map((p) => p.id)).toEqual(['b'])
  })
})

describe('DUPLICATE_PIECES', () => {
  it('crea una copia corrida de cada pieza, con el id nuevo', () => {
    const before = stateWith([piece('a', { rotation: 45 })])
    const after = appReducer(before, {
      type: 'DUPLICATE_PIECES',
      items: [{ pieceId: 'a', newId: 'a-copia' }],
    })
    expect(after.placedPieces).toHaveLength(2)
    const copy = byId(after, 'a-copia')
    expect(copy).toMatchObject({ xCm: 11, yCm: 21, widthCm: 8, heightCm: 4, rotation: 45 })
    expect(copy.variantId).toBe('v1')
  })

  it('duplica varias de una sola vez', () => {
    const before = stateWith([piece('a'), piece('b')])
    const after = appReducer(before, {
      type: 'DUPLICATE_PIECES',
      items: [
        { pieceId: 'a', newId: 'a2' },
        { pieceId: 'b', newId: 'b2' },
      ],
    })
    expect(after.placedPieces.map((p) => p.id)).toEqual(['a', 'b', 'a2', 'b2'])
  })

  it('ignora ids que no existen y no toca el estado si no hay nada que copiar', () => {
    const before = stateWith([piece('a')])
    const after = appReducer(before, {
      type: 'DUPLICATE_PIECES',
      items: [{ pieceId: 'fantasma', newId: 'x' }],
    })
    expect(after).toBe(before)
  })
})

describe('retomar y descartar un trabajo', () => {
  const proyecto = {
    designs: [
      {
        id: 'd1',
        name: 'Insignia',
        imageDataUrl: 'data:image/png;base64,AAAA',
        originalWidthPx: 685,
        originalHeightPx: 663,
        backgroundMode: 'white' as const,
        allowInteriorNesting: false,
      },
    ],
    variants: [
      {
        id: 'v1',
        designId: 'd1',
        name: 'Variante 1',
        widthCm: 14,
        heightCm: 14,
        quantity: 14,
        allowRotation: true,
      },
    ],
    placedPieces: [piece('p1')],
    baselineHeightCm: 56.7,
    config: { ...initialState.config, dpi: 150 },
  }

  it('RESTORE_PROJECT reemplaza todo de una', () => {
    const after = appReducer(initialState, { type: 'RESTORE_PROJECT', project: proyecto })
    expect(after.designs).toHaveLength(1)
    expect(after.variants).toHaveLength(1)
    expect(after.placedPieces).toHaveLength(1)
    expect(after.baselineHeightCm).toBe(56.7)
    expect(after.config.dpi).toBe(150)
  })

  it('RESET_PROJECT deja el trabajo vacio', () => {
    const conTrabajo = appReducer(initialState, { type: 'RESTORE_PROJECT', project: proyecto })
    const limpio = appReducer(conTrabajo, { type: 'RESET_PROJECT' })
    expect(limpio.designs).toHaveLength(0)
    expect(limpio.variants).toHaveLength(0)
    expect(limpio.placedPieces).toHaveLength(0)
    expect(limpio.baselineHeightCm).toBeNull()
  })

  /**
   * La config son preferencias del usuario (su DPI, su separacion, su modo de
   * acomodado), no parte del trabajo: descartar un trabajo no tiene por que
   * hacerle volver a configurar la app.
   */
  it('RESET_PROJECT conserva la configuracion', () => {
    const conTrabajo = appReducer(initialState, { type: 'RESTORE_PROJECT', project: proyecto })
    const limpio = appReducer(conTrabajo, { type: 'RESET_PROJECT' })
    expect(limpio.config.dpi).toBe(150)
  })
})
