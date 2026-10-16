import { describe, it, expect } from 'vitest'
import type { PlacedPiece } from '../types'
import { initialState } from './appReducer'
import { createHistory, historyReducer } from './history'

/** Tests del undo/redo por snapshots (Fase 6). */

function piece(id: string, xCm = 0): PlacedPiece {
  return { id, variantId: 'v1', xCm, yCm: 0, widthCm: 10, heightCm: 10, rotation: 0 }
}

/** Estado de partida con una pieza ya colocada. */
function withOnePiece() {
  return historyReducer(createHistory(initialState), {
    type: 'SET_PACKING_RESULT',
    pieces: [piece('a')],
  })
}

describe('historyReducer', () => {
  it('arranca sin nada para deshacer ni rehacer', () => {
    const h = createHistory(initialState)
    expect(h.past).toHaveLength(0)
    expect(h.future).toHaveLength(0)
  })

  it('una accion undoable guarda un snapshot', () => {
    const h = withOnePiece()
    expect(h.present.placedPieces).toHaveLength(1)
    expect(h.past).toHaveLength(1)
    expect(h.past[0].placedPieces).toHaveLength(0)
  })

  it('UNDO vuelve al estado anterior y REDO lo recupera', () => {
    const packed = withOnePiece()
    const moved = historyReducer(packed, {
      type: 'MOVE_PIECES',
      pieceIds: ['a'],
      dxCm: 20,
      dyCm: 5,
    })
    expect(moved.present.placedPieces[0].xCm).toBe(20)

    const undone = historyReducer(moved, { type: 'UNDO' })
    expect(undone.present.placedPieces[0].xCm).toBe(0)
    expect(undone.future).toHaveLength(1)

    const redone = historyReducer(undone, { type: 'REDO' })
    expect(redone.present.placedPieces[0].xCm).toBe(20)
    expect(redone.future).toHaveLength(0)
  })

  it('UNDO y REDO sin historial no hacen nada', () => {
    const h = createHistory(initialState)
    expect(historyReducer(h, { type: 'UNDO' })).toBe(h)
    expect(historyReducer(h, { type: 'REDO' })).toBe(h)
  })

  it('editar config no ensucia el historial', () => {
    const h = historyReducer(createHistory(initialState), {
      type: 'UPDATE_CONFIG',
      changes: { dpi: 150 },
    })
    expect(h.present.config.dpi).toBe(150)
    expect(h.past).toHaveLength(0)
  })

  it('una accion nueva despues de UNDO descarta el rehacer', () => {
    const moved = historyReducer(withOnePiece(), {
      type: 'MOVE_PIECES',
      pieceIds: ['a'],
      dxCm: 20,
      dyCm: 5,
    })
    const undone = historyReducer(moved, { type: 'UNDO' })
    expect(undone.future).toHaveLength(1)

    const rotated = historyReducer(undone, {
      type: 'ROTATE_PIECES',
      pieceIds: ['a'],
      deltaDegrees: 90,
    })
    expect(rotated.future).toHaveLength(0)
  })

  it('el historial no crece sin limite', () => {
    let h = withOnePiece()
    for (let i = 0; i < 80; i++) {
      h = historyReducer(h, { type: 'MOVE_PIECES', pieceIds: ['a'], dxCm: 1, dyCm: 0 })
    }
    expect(h.past.length).toBeLessThanOrEqual(50)
    // El estado presente acumula los 80 movimientos de 1 cm.
    expect(h.present.placedPieces[0].xCm).toBe(80)
  })
})
