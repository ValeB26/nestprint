import { appReducer, type AppAction, type AppState } from './appReducer'

/**
 * Undo / redo por SNAPSHOTS de estado inmutable.
 *
 * QUE: envolvemos el appReducer en otro reducer que guarda el estado anterior
 *   en una pila `past` antes de cada cambio importante. Deshacer es sacar el
 *   ultimo snapshot de `past`; rehacer, sacarlo de `future`.
 * POR QUE: es muchisimo mas simple que la alternativa. Como el estado es
 *   inmutable, un "snapshot" es solo una referencia: los arrays y objetos que
 *   no cambiaron se comparten entre snapshots (structural sharing), asi que
 *   guardar 50 estados NO duplica las imagenes ni la memoria.
 * ALTERNATIVA DESCARTADA: comandos invertibles (guardar "movi la pieza X de A a
 *   B" y saber deshacer cada tipo de accion). Es mas eficiente en memoria pero
 *   hay que escribir y mantener el inverso de CADA accion, y cualquier olvido
 *   es un bug silencioso que corrompe el estado.
 */

export interface HistoryState {
  past: AppState[]
  present: AppState
  future: AppState[]
}

export type HistoryAction = AppAction | { type: 'UNDO' } | { type: 'REDO' }

/** Tope de snapshots guardados, para que el historial no crezca sin limite. */
const MAX_HISTORY = 50

/**
 * Acciones que generan un punto de retorno. Quedan afuera a proposito las
 * ediciones "continuas" (UPDATE_VARIANT, UPDATE_CONFIG): si cada tecla tipeada
 * en un input creara un snapshot, deshacer una vez no haria nada visible y el
 * historial se llenaria de basura.
 */
const UNDOABLE = new Set<AppAction['type']>([
  'ADD_DESIGN',
  'REMOVE_DESIGN',
  'ADD_VARIANT',
  'REMOVE_VARIANT',
  'SET_PACKING_RESULT',
  'MOVE_PIECES',
  'ROTATE_PIECES',
  'SET_PIECES_ROTATION',
  'REMOVE_PIECES',
  'DUPLICATE_PIECES',
])

export function createHistory(present: AppState): HistoryState {
  return { past: [], present, future: [] }
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state
    const previous = state.past[state.past.length - 1]
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future],
    }
  }

  if (action.type === 'REDO') {
    if (state.future.length === 0) return state
    const [next, ...rest] = state.future
    return {
      past: [...state.past, state.present],
      present: next,
      future: rest,
    }
  }

  const present = appReducer(state.present, action)

  // Si el estado no cambio, no ensuciamos el historial.
  if (present === state.present) return state

  if (!UNDOABLE.has(action.type)) return { ...state, present }

  return {
    // slice(-MAX_HISTORY) descarta los snapshots mas viejos al pasarse del tope.
    past: [...state.past, state.present].slice(-MAX_HISTORY),
    present,
    // Cualquier cambio nuevo invalida el "rehacer" pendiente.
    future: [],
  }
}
