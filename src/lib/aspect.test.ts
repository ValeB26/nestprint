import { describe, it, expect } from 'vitest'
import type { Design } from '../types'
import { CANVAS_WIDTH_CM } from '../types'
import { aspectRatioOf, sizeFromWidth, sizeFromHeight, type VariantSize } from './aspect'
import { createVariant } from './createVariant'

/**
 * Tests de la proporcion automatica: que escribir una medida nunca deforme el
 * logo.
 *
 * El caso que motivo estos tests: un PNG CUADRADO con un logo alto adentro
 * (margen transparente arriba y abajo). La proporcion del archivo es 1, pero lo
 * que se dibuja es el contenido, que es alto. Tomando la del archivo, escribir
 * 25 cm de ancho daba 25 cm de alto y el logo salia achatado.
 */

/** Diseno de prueba: solo importan los px del archivo. */
function design(widthPx: number, heightPx: number): Design {
  return {
    id: 'd1',
    name: 'logo.png',
    imageDataUrl: 'data:image/png;base64,',
    originalWidthPx: widthPx,
    originalHeightPx: heightPx,
    backgroundMode: 'none',
    allowInteriorNesting: false,
  }
}

/**
 * Media unidad de redondeo: lo maximo que puede desviarse una medida derivada.
 *
 * El epsilon absorbe el error binario del float. Un ancho de 1 cm con
 * proporcion 0.25 da un alto exacto de 0.25, que redondea a 0.3; esa
 * diferencia de exactamente 0.05 se representa como 0.050000000000000044.
 */
const TOPE_REDONDEO = 0.05 + 1e-9

/** Redondeo a 1 mm, reimplementado aca a proposito para no testear contra si mismo. */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * La medida derivada es exactamente la cuenta, redondeada a 1 mm.
 *
 * POR QUE SE CHEQUEA ASI Y NO COMPARANDO PROPORCIONES: el redondeo cae sobre
 * UNA de las dos medidas, y reconstruir la otra a partir de ella multiplica ese
 * error por la proporcion (con un diseno 4 veces mas alto que ancho, medio
 * milimetro de redondeo se vuelve 2 mm). Comparar contra la medida derivada no
 * tiene ese problema y ademas es exacto: no hace falta elegir una tolerancia.
 */
function esperarAltoDerivado(size: VariantSize, ratio: number) {
  expect(size.heightCm).toBe(round1(size.widthCm * ratio))
}

function esperarAnchoDerivado(size: VariantSize, ratio: number) {
  expect(size.widthCm).toBe(round1(size.heightCm / ratio))
}

describe('aspectRatioOf', () => {
  it('prefiere la proporcion del contenido antes que la del archivo', () => {
    // Archivo cuadrado, contenido alto: manda el contenido.
    expect(aspectRatioOf(design(1000, 1000), 1.25)).toBe(1.25)
  })

  it('cae a la proporcion del archivo cuando la forma no se analizo', () => {
    expect(aspectRatioOf(design(400, 500))).toBeCloseTo(1.25, 10)
  })

  it('ignora una proporcion de contenido invalida y usa la del archivo', () => {
    for (const invalida of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(aspectRatioOf(design(400, 500), invalida)).toBeCloseTo(1.25, 10)
    }
  })

  it('devuelve null cuando no hay ninguna proporcion utilizable', () => {
    expect(aspectRatioOf(design(0, 500))).toBeNull()
    expect(aspectRatioOf(design(400, 0))).toBeNull()
  })
})

describe('el caso reportado: PNG cuadrado con un logo alto adentro', () => {
  // Archivo 1000x1000 con el logo ocupando 760x940: proporcion real 1.2368.
  const archivo = design(1000, 1000)
  const contenido = 940 / 760

  it('con la proporcion del ARCHIVO el logo sale cuadrado (el bug)', () => {
    const malo = aspectRatioOf(archivo)!
    expect(sizeFromWidth(25, malo, CANVAS_WIDTH_CM)).toEqual({ widthCm: 25, heightCm: 25 })
  })

  it('con la proporcion del CONTENIDO conserva la forma', () => {
    const bueno = aspectRatioOf(archivo, contenido)!
    const size = sizeFromWidth(25, bueno, CANVAS_WIDTH_CM)

    expect(size.widthCm).toBe(25)
    expect(size.heightCm).toBeCloseTo(30.9, 1)
    esperarAltoDerivado(size, contenido)
  })

  it('escribir el ancho o escribir el alto dan la misma forma', () => {
    const ratio = aspectRatioOf(archivo, contenido)!
    const porAncho = sizeFromWidth(25, ratio, CANVAS_WIDTH_CM)
    const porAlto = sizeFromHeight(porAncho.heightCm, ratio, CANVAS_WIDTH_CM)

    // Volver por el otro camino tiene que devolver la misma pieza.
    expect(porAlto.widthCm).toBeCloseTo(25, 1)
    esperarAnchoDerivado(porAlto, ratio)
  })
})

describe('sizeFromWidth', () => {
  it('deriva el alto manteniendo la proporcion', () => {
    expect(sizeFromWidth(10, 1.5, CANVAS_WIDTH_CM)).toEqual({ widthCm: 10, heightCm: 15 })
  })

  it('topea el ancho al lienzo y achica el alto con el', () => {
    const size = sizeFromWidth(80, 1.5, CANVAS_WIDTH_CM)
    expect(size.widthCm).toBe(CANVAS_WIDTH_CM)
    expect(size.heightCm).toBe(87)
    esperarAltoDerivado(size, 1.5)
  })

  it('maneja diseños mas anchos que altos', () => {
    const size = sizeFromWidth(30, 0.4, CANVAS_WIDTH_CM)
    expect(size).toEqual({ widthCm: 30, heightCm: 12 })
  })
})

describe('sizeFromHeight', () => {
  it('deriva el ancho manteniendo la proporcion', () => {
    expect(sizeFromHeight(15, 1.5, CANVAS_WIDTH_CM)).toEqual({ widthCm: 10, heightCm: 15 })
  })

  it('cuando el ancho derivado no entra, topea y recalcula el alto', () => {
    // Un diseno ancho (ratio 0.5) de 40 cm de alto pediria 80 cm de ancho.
    const size = sizeFromHeight(40, 0.5, CANVAS_WIDTH_CM)
    expect(size.widthCm).toBe(CANVAS_WIDTH_CM)
    expect(size.heightCm).toBe(29)
    // Al topear, el que se recalcula es el alto.
    esperarAltoDerivado(size, 0.5)
  })
})

describe('la proporcion se mantiene en todo el rango de uso', () => {
  // Proporciones reales: logos altos, cuadrados, apaisados y extremos.
  const ratios = [0.25, 0.4, 0.75, 1, 1.1267, 1.2368, 2, 4]
  const medidas = [0.5, 1, 2.5, 5, 10, 17.3, 25, 40, 58]

  it('escribiendo el ancho', () => {
    for (const ratio of ratios) {
      for (const ancho of medidas) {
        esperarAltoDerivado(sizeFromWidth(ancho, ratio, CANVAS_WIDTH_CM), ratio)
      }
    }
  })

  it('escribiendo el alto', () => {
    for (const ratio of ratios) {
      for (const alto of medidas) {
        const size = sizeFromHeight(alto, ratio, CANVAS_WIDTH_CM)
        // Si hubo tope, el que se recalculo es el alto; si no, el ancho.
        if (size.widthCm === CANVAS_WIDTH_CM) esperarAltoDerivado(size, ratio)
        else esperarAnchoDerivado(size, ratio)
      }
    }
  })

  it('la deformacion nunca pasa de medio milimetro', () => {
    // La garantia en terminos del taller: la medida que calcula la app nunca se
    // aparta mas de 0.05 cm de la proporcion exacta. Es el redondeo a 1 mm y
    // nada mas.
    //
    // Se mide sobre la medida DERIVADA, no sobre la proporcion: en un diseno
    // apaisado de 5 cm de ancho el alto da 1.25 y se guarda 1.3, que es medio
    // milimetro pero un 4% de 1.25. El milimetro es lo que se corta; el
    // porcentaje sobre una medida chica exagera el mismo error.
    for (const ratio of ratios) {
      for (const medida of medidas) {
        const porAncho = sizeFromWidth(medida, ratio, CANVAS_WIDTH_CM)
        expect(Math.abs(porAncho.heightCm - porAncho.widthCm * ratio)).toBeLessThanOrEqual(TOPE_REDONDEO)

        // Al escribir el alto se deriva el ancho, salvo que haya tope: ahi se
        // fija el ancho en 58 y el que se deriva pasa a ser el alto.
        const porAlto = sizeFromHeight(medida, ratio, CANVAS_WIDTH_CM)
        const error = porAlto.widthCm === CANVAS_WIDTH_CM
          ? Math.abs(porAlto.heightCm - porAlto.widthCm * ratio)
          : Math.abs(porAlto.widthCm - porAlto.heightCm / ratio)
        expect(error).toBeLessThanOrEqual(TOPE_REDONDEO)
      }
    }
  })

  it('nunca deja una pieza mas ancha que el lienzo', () => {
    for (const ratio of ratios) {
      for (const medida of [...medidas, 100, 500]) {
        expect(sizeFromWidth(medida, ratio, CANVAS_WIDTH_CM).widthCm)
          .toBeLessThanOrEqual(CANVAS_WIDTH_CM)
        expect(sizeFromHeight(medida, ratio, CANVAS_WIDTH_CM).widthCm)
          .toBeLessThanOrEqual(CANVAS_WIDTH_CM)
      }
    }
  })
})

describe('createVariant usa la misma proporcion', () => {
  it('respeta la proporcion del contenido, no la del archivo', () => {
    const contenido = 940 / 760
    const variant = createVariant(design(1000, 1000), 1, contenido)

    expect(variant.widthCm).toBe(10)
    esperarAltoDerivado(variant, contenido)
    // Y no el cuadrado que daria la proporcion del archivo.
    expect(variant.heightCm).not.toBe(10)
  })

  it('la variante nace con la misma forma que deja escribir una medida', () => {
    const d = design(442, 498)
    const variant = createVariant(d, 1)
    const ratio = aspectRatioOf(d)!

    expect(sizeFromWidth(variant.widthCm, ratio, CANVAS_WIDTH_CM)).toEqual({
      widthCm: variant.widthCm,
      heightCm: variant.heightCm,
    })
  })

  it('cae a un cuadrado si el archivo no tiene medidas utilizables', () => {
    const variant = createVariant(design(0, 0), 1)
    expect(variant.widthCm).toBe(variant.heightCm)
  })
})
