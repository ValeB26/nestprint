import {
  DEFAULT_CONFIG,
  type BackgroundMode,
  type CanvasConfig,
  type Design,
  type DesignVariant,
  type PlacedPiece,
} from '../types'
import type { AppState } from '../state/appReducer'

/**
 * Serializacion del trabajo: del estado a algo guardable, y de vuelta.
 *
 * Todo aca es PURO: no sabe si se guarda en IndexedDB, en un archivo o en la
 * nube. Por eso se testea sin navegador. El almacenamiento vive en
 * projectStore.ts.
 *
 * POR QUE VALIDAR TAN EN SERIO AL LEER: lo guardado puede venir de una version
 * vieja de la app (el modelo de datos cambio bastante: la rotacion paso de ser
 * 0 o 90 a cualquier angulo), de un guardado a medias, o de algo que alguien
 * toco a mano. Si cargamos basura, la app rompe de formas rarisimas. Ante la
 * menor duda, se descarta todo y se arranca limpio: perder un trabajo es malo,
 * pero una app que no abre es peor.
 */

/** Sube cuando el formato cambia de forma incompatible. */
export const SNAPSHOT_VERSION = 1

export interface ProjectSnapshot {
  version: number
  /** Cuando se guardo, en ISO. Util para mostrarlo y para diagnosticar. */
  savedAt: string
  designs: Design[]
  variants: DesignVariant[]
  placedPieces: PlacedPiece[]
  baselineHeightCm: number | null
  config: CanvasConfig
}

/** Lo que se guarda del estado. El historial de deshacer NO se guarda. */
export function toSnapshot(state: AppState): ProjectSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    designs: state.designs,
    variants: state.variants,
    placedPieces: state.placedPieces,
    baselineHeightCm: state.baselineHeightCm,
    config: state.config,
  }
}

/** Hay algo que valga la pena guardar? Sin disenos no hay trabajo. */
export function hasWork(state: Pick<AppState, 'designs'>): boolean {
  return state.designs.length > 0
}

// ---------------------------------------------------------------------------
// Lectura con validacion
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

const BACKGROUND_MODES: BackgroundMode[] = ['none', 'border', 'white']

function readDesign(raw: unknown): Design | null {
  if (!isObject(raw)) return null
  if (!isText(raw.id) || !isText(raw.imageDataUrl)) return null
  if (!isNumber(raw.originalWidthPx) || !isNumber(raw.originalHeightPx)) return null

  return {
    id: raw.id,
    name: isText(raw.name) ? raw.name : 'Diseño',
    imageDataUrl: raw.imageDataUrl,
    originalWidthPx: raw.originalWidthPx,
    originalHeightPx: raw.originalHeightPx,
    // Campos agregados despues: si faltan, se cae al valor por defecto en vez
    // de descartar un trabajo entero por un ajuste que no existia.
    backgroundMode: BACKGROUND_MODES.includes(raw.backgroundMode as BackgroundMode)
      ? (raw.backgroundMode as BackgroundMode)
      : 'none',
    allowInteriorNesting: raw.allowInteriorNesting === true,
  }
}

function readVariant(raw: unknown): DesignVariant | null {
  if (!isObject(raw)) return null
  if (!isText(raw.id) || !isText(raw.designId)) return null
  if (!isNumber(raw.widthCm) || !isNumber(raw.heightCm) || !isNumber(raw.quantity)) return null
  if (raw.widthCm <= 0 || raw.heightCm <= 0 || raw.quantity < 1) return null

  return {
    id: raw.id,
    designId: raw.designId,
    name: isText(raw.name) ? raw.name : 'Variante',
    widthCm: raw.widthCm,
    heightCm: raw.heightCm,
    quantity: Math.round(raw.quantity),
    allowRotation: raw.allowRotation !== false,
  }
}

function readPiece(raw: unknown): PlacedPiece | null {
  if (!isObject(raw)) return null
  if (!isText(raw.id) || !isText(raw.variantId)) return null
  if (!isNumber(raw.xCm) || !isNumber(raw.yCm)) return null
  if (!isNumber(raw.widthCm) || !isNumber(raw.heightCm)) return null
  if (raw.widthCm <= 0 || raw.heightCm <= 0) return null

  return {
    id: raw.id,
    variantId: raw.variantId,
    xCm: raw.xCm,
    yCm: raw.yCm,
    widthCm: raw.widthCm,
    heightCm: raw.heightCm,
    rotation: isNumber(raw.rotation) ? raw.rotation : 0,
  }
}

/** La config se mezcla sobre los valores por defecto: tolera campos nuevos. */
function readConfig(raw: unknown): CanvasConfig {
  if (!isObject(raw)) return DEFAULT_CONFIG
  return {
    ...DEFAULT_CONFIG,
    gapCm: isNumber(raw.gapCm) && raw.gapCm >= 0 ? raw.gapCm : DEFAULT_CONFIG.gapCm,
    dpi: isNumber(raw.dpi) && raw.dpi > 0 ? raw.dpi : DEFAULT_CONFIG.dpi,
    cellCm: isNumber(raw.cellCm) && raw.cellCm > 0 ? raw.cellCm : DEFAULT_CONFIG.cellCm,
    nestingMode: raw.nestingMode === 'shape' ? 'shape' : 'rect',
    previewBackground: isText(raw.previewBackground)
      ? raw.previewBackground
      : DEFAULT_CONFIG.previewBackground,
  }
}

/** Lo que se recupera de un trabajo guardado. */
export type RestoredProject = Pick<
  AppState,
  'designs' | 'variants' | 'placedPieces' | 'baselineHeightCm' | 'config'
>

/**
 * Lee un trabajo guardado. Devuelve null si no se puede confiar en el dato.
 *
 * Ademas de validar cada registro, chequea que las referencias cierren: una
 * variante que apunta a un diseno que no existe, o una pieza que apunta a una
 * variante que no existe, dejarian la app en un estado imposible (piezas que no
 * se pueden dibujar, paneles vacios). Se descarta el trabajo entero.
 */
export function fromSnapshot(raw: unknown): RestoredProject | null {
  if (!isObject(raw)) return null
  if (raw.version !== SNAPSHOT_VERSION) return null
  if (!Array.isArray(raw.designs) || !Array.isArray(raw.variants)) return null
  if (!Array.isArray(raw.placedPieces)) return null

  const designs: Design[] = []
  for (const item of raw.designs) {
    const design = readDesign(item)
    if (!design) return null
    designs.push(design)
  }

  const variants: DesignVariant[] = []
  for (const item of raw.variants) {
    const variant = readVariant(item)
    if (!variant) return null
    variants.push(variant)
  }

  const placedPieces: PlacedPiece[] = []
  for (const item of raw.placedPieces) {
    const piece = readPiece(item)
    if (!piece) return null
    placedPieces.push(piece)
  }

  // Integridad referencial: todo tiene que apuntar a algo que exista.
  const designIds = new Set(designs.map((d) => d.id))
  if (variants.some((v) => !designIds.has(v.designId))) return null

  const variantIds = new Set(variants.map((v) => v.id))
  if (placedPieces.some((p) => !variantIds.has(p.variantId))) return null

  return {
    designs,
    variants,
    placedPieces,
    baselineHeightCm: isNumber(raw.baselineHeightCm) ? raw.baselineHeightCm : null,
    config: readConfig(raw.config),
  }
}
