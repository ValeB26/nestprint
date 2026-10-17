import { describe, it, expect } from 'vitest'
import type { CanvasConfig, Design, DesignVariant } from './types'
import { CANVAS_WIDTH_CM, DEFAULT_CONFIG } from './types'
import { createVariant } from './lib/createVariant'
import { aspectRatioOf, sizeFromWidth } from './lib/aspect'
import { resolutionIssue } from './lib/resolution'
import { layoutHeightCm, utilizationPercent } from './lib/metrics'
import { pieceBounds } from './lib/geometry'
import { pack } from './packing'
import { validateLayout } from './packing/validate'
import { exportBlocker, exportFileName, exportSize, maxUsableDpi } from './export/exportSize'
import { appReducer, initialState, type AppState } from './state/appReducer'
import { createHistory, historyReducer } from './state/history'
import { fromSnapshot, hasWork, toSnapshot } from './storage/projectSnapshot'

/**
 * Tests de INTEGRACION: un trabajo realista recorriendo todas las capas puras,
 * en el mismo orden en que las usa la app.
 *
 * Los tests de cada modulo prueban su pieza. Estos prueban que las piezas
 * encajen: que el alto que calcula el packing sea el que mide metrics, que lo
 * que sale del packing pase la validacion, que lo que se guarda se pueda
 * volver a leer igual.
 *
 * NO cubren lo que toca el DOM (leer la imagen, quitar el fondo sobre canvas,
 * dibujar con Konva, bajar el PNG): eso necesita un navegador. Si se agrega
 * alguna vez, va aparte.
 */

let n = 0
function design(widthPx: number, heightPx: number, name = 'logo'): Design {
  n++
  return {
    id: `d${n}`,
    name: `${name}${n}`,
    imageDataUrl: 'data:image/png;base64,',
    originalWidthPx: widthPx,
    originalHeightPx: heightPx,
    backgroundMode: 'border',
    allowInteriorNesting: false,
  }
}

/** Un trabajo de taller: tres diseños distintos con varias medidas cada uno. */
function trabajoReal() {
  const insignia = design(1000, 1000, 'insignia') // cuadrado
  const lettering = design(2400, 800, 'lettering') // apaisado
  const vertical = design(600, 1500, 'vertical') // alto

  const variants: DesignVariant[] = [
    { ...createVariant(insignia, 1), widthCm: 10, heightCm: 10, quantity: 12 },
    { ...createVariant(insignia, 2), widthCm: 5, heightCm: 5, quantity: 20 },
    { ...createVariant(lettering, 1), widthCm: 24, heightCm: 8, quantity: 6 },
    { ...createVariant(vertical, 1), widthCm: 8, heightCm: 20, quantity: 8 },
  ]

  return { designs: [insignia, lettering, vertical], variants }
}

const config: CanvasConfig = { ...DEFAULT_CONFIG, widthCm: CANVAS_WIDTH_CM }

describe('un trabajo completo, de las variantes al PNG', () => {
  const { variants } = trabajoReal()
  const totalPiezas = variants.reduce((s, v) => s + v.quantity, 0)

  it('el packing coloca todas las piezas, sin dejar ninguna afuera', () => {
    const r = pack(variants, config)
    expect(r.unplaced).toBe(0)
    expect(r.pieces).toHaveLength(totalPiezas)
  })

  it('respeta la cantidad pedida de cada variante', () => {
    const r = pack(variants, config)
    for (const v of variants) {
      expect(r.pieces.filter((p) => p.variantId === v.id)).toHaveLength(v.quantity)
    }
  })

  it('lo que sale del packing pasa la validacion sin un solo problema', () => {
    const r = pack(variants, config)
    expect(validateLayout(r.pieces, config)).toEqual({})
  })

  it('el alto que informa el packing es el que mide metrics', () => {
    const r = pack(variants, config)
    expect(layoutHeightCm(r.pieces)).toBeCloseTo(r.usedHeightCm, 1)
  })

  it('el aprovechamiento es un porcentaje creible', () => {
    const r = pack(variants, config)
    const u = utilizationPercent(r.pieces, config.widthCm)
    expect(u).not.toBeNull()
    expect(u!).toBeGreaterThan(40)
    expect(u!).toBeLessThanOrEqual(100)
  })

  it('ninguna pieza se sale del lienzo', () => {
    // Se mide con pieceBounds, NO con xCm + widthCm: en una pieza rotada 90°
    // el rectangulo propio queda cruzado respecto del espacio que ocupa, asi
    // que xCm + widthCm puede pasarse de 58 con la pieza entera adentro.
    const r = pack(variants, config)
    for (const p of r.pieces) {
      const b = pieceBounds(p)
      expect(b.xCm).toBeGreaterThanOrEqual(-0.01)
      expect(b.xCm + b.widthCm).toBeLessThanOrEqual(config.widthCm + 0.01)
      expect(b.yCm).toBeGreaterThanOrEqual(-0.01)
    }
  })

  it('hay piezas rotadas: el trabajo ejercita el camino de la rotacion', () => {
    const r = pack(variants, config)
    expect(r.pieces.some((p) => p.rotation === 90)).toBe(true)
  })

  it('el trabajo entra en un PNG a 300 DPI y el nombre dice la medida', () => {
    const r = pack(variants, config)
    expect(exportBlocker(config.widthCm, r.usedHeightCm, config.dpi)).toBeNull()

    const { widthPx } = exportSize(config.widthCm, r.usedHeightCm, config.dpi)
    expect(widthPx).toBe(6850) // 58 cm a 300 DPI
    expect(exportFileName(config.widthCm, r.usedHeightCm, config.dpi)).toContain('58')
  })
})

describe('modo Formas contra modo Rectangulos', () => {
  const { variants } = trabajoReal()

  it('Formas nunca sale peor que Rectangulos', () => {
    const rect = pack(variants, { ...config, nestingMode: 'rect' })
    const forma = pack(variants, { ...config, nestingMode: 'shape' })
    expect(forma.usedHeightCm).toBeLessThanOrEqual(rect.usedHeightCm + 0.01)
  })

  it('Formas devuelve el punto de comparacion para mostrar el ahorro', () => {
    const forma = pack(variants, { ...config, nestingMode: 'shape' })
    const rect = pack(variants, { ...config, nestingMode: 'rect' })
    expect(forma.baselineHeightCm).toBeCloseTo(rect.usedHeightCm, 1)
  })

  it('Rectangulos no informa ahorro, porque no hay con que compararlo', () => {
    expect(pack(variants, { ...config, nestingMode: 'rect' }).baselineHeightCm).toBeUndefined()
  })

  it('los dos modos colocan la misma cantidad de piezas y los dos validan', () => {
    for (const nestingMode of ['rect', 'shape'] as const) {
      const r = pack(variants, { ...config, nestingMode })
      expect(r.pieces).toHaveLength(46)
      expect(validateLayout(r.pieces, { ...config, nestingMode })).toEqual({})
    }
  })
})

describe('el ciclo que hace el usuario, a traves del reducer', () => {
  function cargar(): AppState {
    const { designs, variants } = trabajoReal()
    let state = initialState
    designs.forEach((d, i) => {
      state = appReducer(state, { type: 'ADD_DESIGN', design: d, variant: variants[i] })
    })
    // La cuarta variante es una medida extra del primer diseño.
    return appReducer(state, { type: 'ADD_VARIANT', variant: variants[3] })
  }

  it('cargar, optimizar, mover y deshacer deja el trabajo coherente', () => {
    let h = createHistory(cargar())
    expect(hasWork(h.present)).toBe(true)

    const r = pack(h.present.variants, h.present.config)
    h = historyReducer(h, {
      type: 'SET_PACKING_RESULT',
      pieces: r.pieces,
      baselineHeightCm: r.baselineHeightCm,
    })
    const antes = h.present.placedPieces[0].xCm

    h = historyReducer(h, {
      type: 'MOVE_PIECES',
      pieceIds: [h.present.placedPieces[0].id],
      dxCm: 3,
      dyCm: 2,
    })
    expect(h.present.placedPieces[0].xCm).toBeCloseTo(antes + 3, 1)

    h = historyReducer(h, { type: 'UNDO' })
    expect(h.present.placedPieces[0].xCm).toBeCloseTo(antes, 1)

    h = historyReducer(h, { type: 'REDO' })
    expect(h.present.placedPieces[0].xCm).toBeCloseTo(antes + 3, 1)
  })

  it('borrar un diseño se lleva sus variantes y sus piezas', () => {
    let state = cargar()
    const r = pack(state.variants, state.config)
    state = appReducer(state, { type: 'SET_PACKING_RESULT', pieces: r.pieces })

    const victima = state.designs[0].id
    const huerfanas = new Set(
      state.variants.filter((v) => v.designId === victima).map((v) => v.id),
    )
    expect(huerfanas.size).toBeGreaterThan(0)

    state = appReducer(state, { type: 'REMOVE_DESIGN', designId: victima })
    expect(state.designs.some((d) => d.id === victima)).toBe(false)
    expect(state.variants.some((v) => v.designId === victima)).toBe(false)
    expect(state.placedPieces.some((p) => huerfanas.has(p.variantId))).toBe(false)
  })

  it('empezar de cero vacia el trabajo pero conserva los ajustes', () => {
    let state = cargar()
    state = appReducer(state, { type: 'UPDATE_CONFIG', changes: { dpi: 150 } })
    state = appReducer(state, { type: 'RESET_PROJECT' })

    expect(state.designs).toHaveLength(0)
    expect(state.variants).toHaveLength(0)
    expect(state.config.dpi).toBe(150)
  })
})

describe('guardar y retomar el trabajo', () => {
  it('lo que se guarda se vuelve a leer igual, pasando por JSON', () => {
    const { designs, variants } = trabajoReal()
    let state = initialState
    designs.forEach((d, i) => {
      state = appReducer(state, { type: 'ADD_DESIGN', design: d, variant: variants[i] })
    })
    const r = pack(state.variants, state.config)
    state = appReducer(state, {
      type: 'SET_PACKING_RESULT',
      pieces: r.pieces,
      baselineHeightCm: r.baselineHeightCm,
    })

    // El viaje real: objeto -> IndexedDB -> objeto.
    const vuelta = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(state))))

    expect(vuelta).not.toBeNull()
    expect(vuelta!.designs).toEqual(state.designs)
    expect(vuelta!.variants).toEqual(state.variants)
    expect(vuelta!.placedPieces).toEqual(state.placedPieces)
    expect(vuelta!.config).toEqual(state.config)
  })

  it('el trabajo retomado se puede seguir usando sin reoptimizar', () => {
    const { designs, variants } = trabajoReal()
    let state = initialState
    designs.forEach((d, i) => {
      state = appReducer(state, { type: 'ADD_DESIGN', design: d, variant: variants[i] })
    })
    const r = pack(state.variants, state.config)
    state = appReducer(state, { type: 'SET_PACKING_RESULT', pieces: r.pieces })

    const vuelta = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(state))))!
    const restaurado = appReducer(initialState, { type: 'RESTORE_PROJECT', project: vuelta })

    // Lo retomado sigue siendo un layout valido y exportable.
    expect(validateLayout(restaurado.placedPieces, restaurado.config)).toEqual({})
    expect(layoutHeightCm(restaurado.placedPieces)).toBeCloseTo(r.usedHeightCm, 1)
  })

  it('un guardado corrupto se descarta en vez de romper la app', () => {
    expect(fromSnapshot(null)).toBeNull()
    expect(fromSnapshot({ version: 999, designs: [], variants: [], placedPieces: [] })).toBeNull()
    expect(fromSnapshot('{}')).toBeNull()
  })
})

describe('los avisos que ve el usuario', () => {
  it('un archivo chico impreso grande dispara el aviso de resolucion', () => {
    const chico = design(600, 600, 'whatsapp')
    expect(resolutionIssue(chico, 8)).toBeNull() // 190 DPI, alcanza
    const problema = resolutionIssue(chico, 30)
    expect(problema).not.toBeNull()
    expect(problema!.dpi).toBe(51)
    // Y la medida que sugiere ya no vuelve a avisar.
    expect(resolutionIssue(chico, problema!.maxWidthCm)).toBeNull()
  })

  it('un trabajo muy alto se frena antes de intentar, con una salida concreta', () => {
    const motivo = exportBlocker(CANVAS_WIDTH_CM, 135, 300)
    expect(motivo).not.toBeNull()
    expect(motivo).toMatch(/DPI/)

    // El DPI que sugiere tiene que entrar de verdad.
    const sugerido = maxUsableDpi(CANVAS_WIDTH_CM, 135)
    expect(exportBlocker(CANVAS_WIDTH_CM, 135, sugerido)).toBeNull()
  })

  it('una variante nace proporcionada y se mantiene al editarla', () => {
    const d = design(1000, 400, 'apaisado')
    const v = createVariant(d, 1, 0.4)
    const ratio = aspectRatioOf(d, 0.4)!

    expect(v.heightCm).toBeCloseTo(v.widthCm * ratio, 1)

    const nueva = sizeFromWidth(30, ratio, CANVAS_WIDTH_CM)
    expect(nueva.heightCm).toBeCloseTo(12, 1)
  })
})
