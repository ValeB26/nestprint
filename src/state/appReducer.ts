import type {
  CanvasConfig,
  Design,
  DesignVariant,
  PlacedPiece,
} from '../types'
import { DEFAULT_CONFIG } from '../types'
import { normalizeAngle } from '../lib/geometry'
import type { RestoredProject } from '../storage/projectSnapshot'

/**
 * Estado global de la app. Es la "fuente de verdad" unica: la UI solo lee de
 * aca y despacha acciones para cambiarlo.
 *
 * Campos:
 *   designs      -> archivos subidos (la imagen vive aca y en ningun otro lado).
 *   variants     -> usos concretos de un diseno (tamano + cantidad).
 *   placedPieces -> piezas posicionadas: las pone el packing y las puede mover
 *                   el usuario a mano (Fase 6).
 *   config       -> ancho del lienzo, separacion y DPI de exportacion.
 *
 * El alto usado y el aprovechamiento NO se guardan aca: se calculan a partir de
 * placedPieces con los helpers de lib/metrics.ts. Guardar un dato que se puede
 * derivar es pedirle a alguien que se acuerde de recalcularlo (y se va a
 * desincronizar la primera vez que el usuario mueva una pieza a mano).
 */
export interface AppState {
  designs: Design[]
  variants: DesignVariant[]
  placedPieces: PlacedPiece[]
  /**
   * Alto que habria usado el acomodado por rectangulos en el ultimo Optimizar,
   * o null si no corresponde. Es el punto de comparacion para mostrar cuanto
   * material se ahorra; no se deriva de las piezas, sale del optimizador.
   */
  baselineHeightCm: number | null
  config: CanvasConfig
}

export const initialState: AppState = {
  designs: [],
  variants: [],
  placedPieces: [],
  baselineHeightCm: null,
  config: DEFAULT_CONFIG,
}

/** Redondeo a 0.01 cm (0.1 mm): precision de sobra, sin ruido de decimales. */
function round(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Acciones que puede recibir el reducer. Cada una describe un cambio concreto;
 * el reducer es la unica funcion que sabe COMO aplicarlo. Mantener este set
 * chico y explicito nos deja razonar sobre todos los cambios posibles.
 */
export type AppAction =
  // ADD_DESIGN llega con su primera variante ya creada: subir un archivo y que
  // aparezca una variante lista para ajustar es menos friccion que subir y
  // despues tener que crear la variante a mano.
  | { type: 'ADD_DESIGN'; design: Design; variant: DesignVariant }
  | { type: 'REMOVE_DESIGN'; designId: string }
  // Retomar un trabajo guardado. Reemplaza todo de una. Queda FUERA del
  // historial: no tiene sentido "deshacer" el haber abierto la app.
  | { type: 'RESTORE_PROJECT'; project: RestoredProject }
  // Empezar de cero: descarta el trabajo actual.
  | { type: 'RESET_PROJECT' }
  // Ajustes de forma del diseno (tratamiento del fondo, anidado interior).
  // Queda FUERA del historial, igual que UPDATE_CONFIG: es una preferencia de
  // como interpretar el archivo, no una edicion del trabajo.
  | {
      type: 'UPDATE_DESIGN'
      designId: string
      changes: Partial<Omit<Design, 'id' | 'imageDataUrl'>>
    }
  | { type: 'ADD_VARIANT'; variant: DesignVariant }
  | {
      type: 'UPDATE_VARIANT'
      variantId: string
      changes: Partial<Omit<DesignVariant, 'id' | 'designId'>>
    }
  | { type: 'REMOVE_VARIANT'; variantId: string }
  | { type: 'UPDATE_CONFIG'; changes: Partial<CanvasConfig> }
  // Resultado del motor de packing: reemplaza todas las piezas.
  | { type: 'SET_PACKING_RESULT'; pieces: PlacedPiece[]; baselineHeightCm?: number }
  // Edicion manual (Fase 6). Todas operan sobre un CONJUNTO de piezas porque se
  // puede seleccionar mas de una (Ctrl+clic): si despacharamos una accion por
  // pieza, deshacer un cambio sobre 10 piezas pediria 10 Ctrl+Z.
  //
  // DUPLICATE_PIECES recibe los ids nuevos desde la UI para que el reducer siga
  // siendo una funcion pura (generar ids al azar adentro lo volveria
  // impredecible y no se podria testear).
  | { type: 'MOVE_PIECES'; pieceIds: string[]; dxCm: number; dyCm: number }
  | { type: 'ROTATE_PIECES'; pieceIds: string[]; deltaDegrees: number }
  | { type: 'SET_PIECES_ROTATION'; pieceIds: string[]; degrees: number }
  | { type: 'REMOVE_PIECES'; pieceIds: string[] }
  | { type: 'DUPLICATE_PIECES'; items: { pieceId: string; newId: string }[] }

/** Cuanto se corre la copia respecto del original al duplicar, en cm. */
const DUPLICATE_OFFSET_CM = 1

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'RESTORE_PROJECT':
      return { ...state, ...action.project }

    case 'RESET_PROJECT':
      // La config se conserva: son preferencias del usuario, no del trabajo.
      return { ...initialState, config: state.config }

    case 'ADD_DESIGN':
      return {
        ...state,
        designs: [...state.designs, action.design],
        variants: [...state.variants, action.variant],
      }

    case 'REMOVE_DESIGN': {
      // Al borrar un diseno se van tambien sus variantes y las piezas de esas
      // variantes. Calculamos que variantIds desaparecen para limpiar todo y
      // no dejar datos huerfanos.
      const removedVariantIds = new Set(
        state.variants
          .filter((v) => v.designId === action.designId)
          .map((v) => v.id),
      )
      return {
        ...state,
        designs: state.designs.filter((d) => d.id !== action.designId),
        variants: state.variants.filter((v) => v.designId !== action.designId),
        placedPieces: state.placedPieces.filter(
          (p) => !removedVariantIds.has(p.variantId),
        ),
      }
    }

    case 'UPDATE_DESIGN':
      return {
        ...state,
        designs: state.designs.map((d) =>
          d.id === action.designId ? { ...d, ...action.changes } : d,
        ),
      }

    case 'ADD_VARIANT':
      return { ...state, variants: [...state.variants, action.variant] }

    case 'UPDATE_VARIANT':
      return {
        ...state,
        variants: state.variants.map((v) =>
          v.id === action.variantId ? { ...v, ...action.changes } : v,
        ),
      }

    case 'REMOVE_VARIANT':
      return {
        ...state,
        variants: state.variants.filter((v) => v.id !== action.variantId),
        placedPieces: state.placedPieces.filter(
          (p) => p.variantId !== action.variantId,
        ),
      }

    case 'UPDATE_CONFIG':
      return { ...state, config: { ...state.config, ...action.changes } }

    case 'SET_PACKING_RESULT':
      return {
        ...state,
        placedPieces: action.pieces,
        baselineHeightCm: action.baselineHeightCm ?? null,
      }

    case 'MOVE_PIECES': {
      // Movemos por DESPLAZAMIENTO (no a una posicion absoluta) para que varias
      // piezas seleccionadas se puedan arrastrar juntas manteniendo su
      // distribucion relativa.
      const ids = new Set(action.pieceIds)
      return {
        ...state,
        placedPieces: state.placedPieces.map((p) =>
          ids.has(p.id)
            ? { ...p, xCm: round(p.xCm + action.dxCm), yCm: round(p.yCm + action.dyCm) }
            : p,
        ),
      }
    }

    case 'ROTATE_PIECES': {
      // La rotacion gira alrededor del centro de la pieza, y su rectangulo
      // propio no se mueve: por eso solo cambia el angulo. El espacio que pasa
      // a ocupar lo calcula pieceBounds() cuando hace falta.
      const ids = new Set(action.pieceIds)
      return {
        ...state,
        placedPieces: state.placedPieces.map((p) =>
          ids.has(p.id) ? { ...p, rotation: normalizeAngle(p.rotation + action.deltaDegrees) } : p,
        ),
      }
    }

    case 'SET_PIECES_ROTATION': {
      const ids = new Set(action.pieceIds)
      const rotation = normalizeAngle(action.degrees)
      return {
        ...state,
        placedPieces: state.placedPieces.map((p) => (ids.has(p.id) ? { ...p, rotation } : p)),
      }
    }

    case 'REMOVE_PIECES': {
      const ids = new Set(action.pieceIds)
      return { ...state, placedPieces: state.placedPieces.filter((p) => !ids.has(p.id)) }
    }

    case 'DUPLICATE_PIECES': {
      const byId = new Map(state.placedPieces.map((p) => [p.id, p]))
      const copies: PlacedPiece[] = []
      for (const { pieceId, newId } of action.items) {
        const original = byId.get(pieceId)
        if (!original) continue
        // La copia queda corrida en diagonal para que se vea que son dos.
        copies.push({
          ...original,
          id: newId,
          xCm: round(original.xCm + DUPLICATE_OFFSET_CM),
          yCm: round(original.yCm + DUPLICATE_OFFSET_CM),
        })
      }
      if (copies.length === 0) return state
      return { ...state, placedPieces: [...state.placedPieces, ...copies] }
    }

    default:
      return state
  }
}
