/**
 * Modelo de datos de NestPrint.
 *
 * Tres niveles acordados en el analisis tecnico (Fase 1):
 *
 *   Design   -> el archivo visual original (se sube una vez).
 *   Variant  -> un uso concreto de ese diseno con tamano + cantidad.
 *   Piece    -> una instancia individual ya posicionada (resultado del packing).
 *
 * Regla clave: la imagen vive solo en el Design. Las variantes la referencian
 * por designId y NUNCA la duplican. Todas las medidas de dominio estan en cm;
 * la conversion a px ocurre unicamente al exportar.
 */

/**
 * Que hacer con el fondo del PNG al analizar su forma.
 *
 *   none   -> respetar el archivo tal cual (por defecto).
 *   border -> quitar solo el blanco PEGADO AL BORDE. Seguro: conserva los
 *             blancos interiores, asi un disco con relleno blanco queda entero.
 *   white  -> quitar TODO el blanco. Es lo que necesita un line art donde el
 *             blanco no se imprime, pero borra blancos intencionales (base
 *             blanca para telas oscuras, texto blanco). Siempre con preview.
 */
export type BackgroundMode = 'none' | 'border' | 'white'

/**
 * Que parte del archivo ocupa el dibujo visible, de 0 a 1.
 *
 * Si el PNG trae margen transparente (o se le quito el fondo), el dibujo NO
 * llena la imagen. Para que la pieza mida lo que dice medir, hay que escalar y
 * correr la imagen con estos numeros. Lo usan el canvas Y la exportacion: tiene
 * que ser el mismo calculo en los dos lados.
 */
export interface ContentFraction {
  x: number
  y: number
  width: number
  height: number
}

/** Estrategia de acomodado. */
export type NestingMode = 'rect' | 'shape'

/** El archivo visual original. */
export interface Design {
  id: string
  name: string
  /** Imagen como data URL, en memoria del navegador. SIEMPRE el original: el
   *  tratamiento de fondo se guarda como parametro y se recalcula, nunca se
   *  pisa el archivo. */
  imageDataUrl: string
  /** Dimensiones del archivo original en px (para validar resolucion a futuro). */
  originalWidthPx: number
  originalHeightPx: number
  /** Tratamiento del fondo. Afecta a la forma Y al PNG exportado. */
  backgroundMode: BackgroundMode
  /**
   * Permitir que otras piezas se metan en los huecos ENCERRADOS de este diseno
   * (el interior de un aro). Apagado por defecto: una pieza encerrada no se
   * puede separar al cortar sin recortar el interior.
   */
  allowInteriorNesting: boolean
}

/** Un uso concreto de un diseno: un tamano y una cantidad. */
export interface DesignVariant {
  id: string
  designId: string
  name: string
  widthCm: number
  heightCm: number
  quantity: number
  /** Si la pieza puede rotarse 90 grados durante el packing. */
  allowRotation: boolean
}

/**
 * Una instancia individual ya posicionada en el lienzo.
 *
 * IMPORTANTE: widthCm/heightCm son el tamano PROPIO de la pieza (lo que mide el
 * sticker), y xCm/yCm la esquina superior izquierda de ESE rectangulo. La
 * rotacion se aplica alrededor del centro de la pieza, y puede ser cualquier
 * angulo. El espacio que la pieza ocupa en el lienzo cuando esta rotada se
 * calcula con pieceBounds() (ver src/lib/geometry.ts).
 */
export interface PlacedPiece {
  id: string
  variantId: string
  xCm: number
  yCm: number
  widthCm: number
  heightCm: number
  /** Angulo en grados, en [0, 360). El packing solo genera 0 o 90; el usuario
   *  puede poner cualquier angulo a mano. */
  rotation: number
}

/**
 * Colores de fondo predefinidos del lienzo. El fondo se guarda como un color
 * CSS cualquiera (hex), asi que ademas de estos el usuario puede elegir uno
 * personalizado con la paleta o el cuentagotas.
 */
export const BACKGROUND_PRESETS = {
  white: '#ffffff',
  black: '#000000',
} as const

/** Configuracion global del trabajo. */
export interface CanvasConfig {
  /**
   * Ancho del lienzo en cm. FIJO en 58 cm: es el ancho del material que usa el
   * proveedor, asi que no se edita desde la UI. Sigue siendo un campo de la
   * config (y no una constante suelta) porque el motor de packing lo recibe
   * como parametro y a futuro puede haber otros anchos.
   */
  widthCm: number
  /** Separacion minima entre piezas en cm. */
  gapCm: number
  /** Resolucion de exportacion en puntos por pulgada. */
  dpi: number
  /**
   * Lado de la celda de la grilla que usa el nesting por forma, en cm.
   * Es la perilla precision/velocidad: mas chico detecta mejor las formas pero
   * cuesta mas. Con 0.1 (1 mm), el lienzo de 58 cm tiene 580 columnas.
   *
   * Ojo: como las celdas se redondean hacia afuera, la separacion real entre
   * piezas queda >= gapCm, y hasta gapCm + 2 celdas en el peor caso.
   */
  cellCm: number
  /**
   * Como acomodar las piezas.
   *   rect  -> por rectangulo delimitador (el metodo original).
   *   shape -> por la forma real del diseno.
   * Arranca en 'rect' a proposito: el metodo nuevo no reemplaza al viejo hasta
   * que la comparacion demuestre que rinde mejor.
   */
  nestingMode: NestingMode
  /**
   * Color de fondo del lienzo EN PANTALLA (hex). Es solo una ayuda visual: el
   * PNG que se exporta siempre tiene fondo transparente. Sirve para ver los
   * disenos de tinta blanca, que sobre fondo blanco son invisibles.
   */
  previewBackground: string
}

/** Ancho del material en cm. No configurable (ver CanvasConfig.widthCm). */
export const CANVAS_WIDTH_CM = 58

/** Valores por defecto confirmados con el usuario del negocio. */
export const DEFAULT_CONFIG: CanvasConfig = {
  widthCm: CANVAS_WIDTH_CM,
  gapCm: 0.2, // 2 mm
  dpi: 300,
  cellCm: 0.1, // 1 mm
  nestingMode: 'rect',
  previewBackground: BACKGROUND_PRESETS.white,
}
