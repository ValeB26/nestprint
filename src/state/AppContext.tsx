import { createContext, useContext, useReducer, type ReactNode } from 'react'
import { initialState, type AppState } from './appReducer'
import { createHistory, historyReducer, type HistoryAction } from './history'

/**
 * Capa de estado con Context + useReducer.
 *
 * QUE: un unico store global accesible desde cualquier componente.
 * POR QUE: el estado (disenos, variantes, piezas) lo tocan el panel, el canvas
 *   y las metricas a la vez; pasarlo por props entre todos seria fragil. El
 *   reducer concentra toda la logica de cambios en un solo lugar testeable.
 * ALTERNATIVA DESCARTADA: una libreria como Redux o Zustand. Para un estado de
 *   este tamano es sobreingenieria; Context + useReducer ya viene en React y
 *   alcanza de sobra. Si el estado creciera mucho, se puede migrar despues.
 *
 * El reducer real es `historyReducer`, que envuelve al appReducer para dar
 * undo/redo (Fase 6). Hacia afuera exponemos solo el estado presente, asi los
 * componentes no se enteran de que existe un historial.
 */
interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<HistoryAction>
  canUndo: boolean
  canRedo: boolean
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [history, dispatch] = useReducer(historyReducer, initialState, createHistory)

  return (
    <AppContext.Provider
      value={{
        state: history.present,
        dispatch,
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

/**
 * Hook de acceso al estado. Lanza un error claro si se usa fuera del Provider,
 * asi el fallo aparece en desarrollo y no como un bug silencioso.
 */
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp debe usarse dentro de <AppProvider>')
  return ctx
}
