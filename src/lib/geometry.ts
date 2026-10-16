import type { ContentFraction, PlacedPiece } from '../types'

/**
 * Geometria de las piezas.
 *
 * Una pieza se guarda como su rectangulo PROPIO (xCm, yCm, widthCm, heightCm)
 * mas un angulo `rotation` que se aplica ALREDEDOR DE SU CENTRO. Es decir:
 * widthCm/heightCm son el tamano real del sticker, no el espacio que ocupa.
 *
 * Cuando la pieza esta rotada, el espacio que ocupa en el lienzo es su
 * "bounding box": el rectangulo alineado a los ejes que la contiene. Eso es lo
 * que le importa al packing, a la validacion de solapes y al alto usado, y se
 * calcula con pieceBounds().
 *
 * POR QUE ASI: guardar el tamano ya rotado solo funciona con multiplos de 90
 * grados (ahi rotar es intercambiar ancho y alto). Con un angulo libre no se
 * podria recuperar el tamano real de la pieza para dibujarla.
 */

/** Rectangulo alineado a los ejes, en cm. */
export interface Bounds {
  xCm: number
  yCm: number
  widthCm: number
  heightCm: number
}

/** Normaliza un angulo a [0, 360). */
export function normalizeAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/** Centro de la pieza, en cm. La rotacion gira alrededor de este punto. */
export function pieceCenter(piece: PlacedPiece): { xCm: number; yCm: number } {
  return {
    xCm: piece.xCm + piece.widthCm / 2,
    yCm: piece.yCm + piece.heightCm / 2,
  }
}

/**
 * Rectangulo alineado a los ejes que contiene a la pieza ya rotada: el espacio
 * que realmente ocupa en el lienzo.
 */
export function pieceBounds(piece: PlacedPiece): Bounds {
  const angle = normalizeAngle(piece.rotation)
  const center = pieceCenter(piece)

  let widthCm: number
  let heightCm: number

  if (angle % 90 === 0) {
    // Caso comun (0, 90, 180, 270): rotar es, como maximo, intercambiar ancho y
    // alto. Lo tratamos aparte para que el resultado sea EXACTO: Math.cos(90°)
    // no da 0 justo, y ese error se arrastraria a las medidas del packing.
    const intercambia = angle % 180 !== 0
    widthCm = intercambia ? piece.heightCm : piece.widthCm
    heightCm = intercambia ? piece.widthCm : piece.heightCm
  } else {
    // Angulo libre: proyectamos los lados sobre los ejes.
    const rad = (angle * Math.PI) / 180
    const cos = Math.abs(Math.cos(rad))
    const sin = Math.abs(Math.sin(rad))
    widthCm = piece.widthCm * cos + piece.heightCm * sin
    heightCm = piece.widthCm * sin + piece.heightCm * cos
  }

  return {
    xCm: center.xCm - widthCm / 2,
    yCm: center.yCm - heightCm / 2,
    widthCm,
    heightCm,
  }
}

/**
 * Angulo en grados del vector que va de `from` a `to`.
 *
 * Usa el mismo criterio que Konva: 0 grados apunta a la derecha y el angulo
 * crece en sentido horario (en pantalla el eje Y va hacia abajo, asi que
 * Math.atan2 ya da el sentido correcto sin invertir nada).
 */
export function angleFromTo(
  from: { xCm: number; yCm: number },
  to: { xCm: number; yCm: number },
): number {
  return (Math.atan2(to.yCm - from.yCm, to.xCm - from.xCm) * 180) / Math.PI
}

/**
 * Rectangulo mas chico que contiene a todos los dados. Sirve para enmarcar una
 * seleccion de varias piezas. Devuelve null si la lista esta vacia.
 */
export function unionBounds(list: Bounds[]): Bounds | null {
  if (list.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const b of list) {
    minX = Math.min(minX, b.xCm)
    minY = Math.min(minY, b.yCm)
    maxX = Math.max(maxX, b.xCm + b.widthCm)
    maxY = Math.max(maxY, b.yCm + b.heightCm)
  }

  return { xCm: minX, yCm: minY, widthCm: maxX - minX, heightCm: maxY - minY }
}

/**
 * Rectangulo donde hay que dibujar la IMAGEN de un diseno para que su contenido
 * visible calce exactamente sobre el rectangulo de la pieza.
 *
 * Las coordenadas son locales a la pieza: (0,0) es su esquina superior
 * izquierda y (widthCm, heightCm) la inferior derecha.
 *
 * POR QUE EXISTE: la pieza mide lo que mide el DIBUJO, no el archivo. Si el PNG
 * trae margen transparente (o se le quito el fondo), dibujar la imagen entera
 * sobre el rectangulo de la pieza deja el dibujo mas chico de lo que dice medir.
 * Eso ya causo un bug: en una insignia de 10 cm el desfasaje era de 2.53 cm, y
 * las piezas se marcaban en rojo aunque se vieran separadas.
 *
 * La usan el canvas (PieceShape) Y la exportacion. Que sea una sola funcion es
 * lo que garantiza que el PNG salga igual a lo que se ve en pantalla.
 */
export function contentDrawRect(
  widthCm: number,
  heightCm: number,
  fraction?: ContentFraction,
): Bounds {
  const f = fraction ?? { x: 0, y: 0, width: 1, height: 1 }
  const drawWidth = widthCm / f.width
  const drawHeight = heightCm / f.height
  return {
    xCm: sinCeroNegativo(-f.x * drawWidth),
    yCm: sinCeroNegativo(-f.y * drawHeight),
    widthCm: drawWidth,
    heightCm: drawHeight,
  }
}

/**
 * JavaScript distingue el 0 del -0, y negar un 0 da -0. Para dibujar da lo
 * mismo, pero sorprende al comparar, asi que lo normalizamos aca.
 */
function sinCeroNegativo(n: number): number {
  return n === 0 ? 0 : n
}
