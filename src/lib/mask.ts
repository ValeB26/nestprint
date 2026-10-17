/**
 * Mascaras: grillas booleanas que representan QUE parte de un diseno esta
 * ocupada. Son la base del nesting por forma real (en vez de por rectangulo).
 *
 * De cada diseno salen DOS mascaras distintas, y no hay que confundirlas:
 *
 *   - Mascara de TINTA: lo que efectivamente se imprime. Es la que manda al
 *     exportar el PNG.
 *   - HUELLA: el espacio fisico que ocupa la pieza. Normalmente es la tinta con
 *     los huecos interiores rellenados, porque una pieza metida adentro del aro
 *     de una insignia no se puede separar al cortar. Es la que manda al acomodar
 *     y al medir la separacion.
 *
 * Todo lo de este archivo es PURO: recibe y devuelve datos planos, no sabe de
 * React ni del DOM. Por eso se testea sin navegador.
 *
 * Nota de rendimiento: por ahora usamos un byte por celda (Uint8Array), que es
 * simple de leer y alcanza de sobra para analizar un diseno. Cuando llegue la
 * deteccion de colisiones pieza-contra-pieza vamos a necesitar bitsets, porque
 * ahi se comparan millones de celdas por optimizacion.
 */

/** Grilla de celdas ocupadas, row-major. 1 = ocupado, 0 = libre. */
export interface Mask {
  cols: number
  rows: number
  cells: Uint8Array
}

/** Rectangulo en celdas, dentro de una mascara. */
export interface MaskBox {
  col: number
  row: number
  cols: number
  rows: number
}

export function createMask(cols: number, rows: number): Mask {
  return { cols, rows, cells: new Uint8Array(cols * rows) }
}

export function isOccupied(mask: Mask, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= mask.cols || row >= mask.rows) return false
  return mask.cells[row * mask.cols + col] === 1
}

export function countOccupied(mask: Mask): number {
  let n = 0
  for (let i = 0; i < mask.cells.length; i++) n += mask.cells[i]
  return n
}

/**
 * Rectangulo mas chico que contiene todo lo ocupado: el "content box".
 * Devuelve null si la mascara esta vacia.
 */
export function contentBox(mask: Mask): MaskBox | null {
  let minCol = mask.cols
  let minRow = mask.rows
  let maxCol = -1
  let maxRow = -1

  for (let row = 0; row < mask.rows; row++) {
    for (let col = 0; col < mask.cols; col++) {
      if (mask.cells[row * mask.cols + col] !== 1) continue
      if (col < minCol) minCol = col
      if (row < minRow) minRow = row
      if (col > maxCol) maxCol = col
      if (row > maxRow) maxRow = row
    }
  }

  if (maxCol < 0) return null
  return { col: minCol, row: minRow, cols: maxCol - minCol + 1, rows: maxRow - minRow + 1 }
}

/** Recorta una mascara a un rectangulo. */
export function cropMask(mask: Mask, box: MaskBox): Mask {
  const out = createMask(box.cols, box.rows)
  for (let row = 0; row < box.rows; row++) {
    for (let col = 0; col < box.cols; col++) {
      const src = (box.row + row) * mask.cols + (box.col + col)
      out.cells[row * box.cols + col] = mask.cells[src]
    }
  }
  return out
}

/**
 * Marca las celdas LIBRES que se pueden alcanzar desde el borde, es decir el
 * "afuera" del diseno. Lo que queda libre pero sin marcar son los huecos
 * encerrados (el interior de un aro, el agujero de una "O").
 *
 * Es un relleno por inundacion con pila explicita: nada de recursion, que con
 * imagenes grandes revienta el stack.
 */
export function outsideRegion(mask: Mask): Uint8Array {
  const { cols, rows, cells } = mask
  const outside = new Uint8Array(cols * rows)
  const stack: number[] = []

  const push = (col: number, row: number) => {
    if (col < 0 || row < 0 || col >= cols || row >= rows) return
    stack.push(row * cols + col)
  }

  for (let col = 0; col < cols; col++) {
    push(col, 0)
    push(col, rows - 1)
  }
  for (let row = 0; row < rows; row++) {
    push(0, row)
    push(cols - 1, row)
  }

  while (stack.length > 0) {
    const i = stack.pop() as number
    if (outside[i] === 1 || cells[i] === 1) continue
    outside[i] = 1
    const col = i % cols
    const row = (i - col) / cols
    push(col + 1, row)
    push(col - 1, row)
    push(col, row + 1)
    push(col, row - 1)
  }

  return outside
}

/**
 * Rellena los huecos encerrados: devuelve la HUELLA del diseno.
 *
 * Por que: el interior del aro de una insignia no se imprime, pero si metemos
 * otra pieza ahi adentro no la vamos a poder separar al cortar. Salvo que el
 * usuario lo habilite a proposito, ese espacio se considera ocupado.
 */
export function fillInteriorHoles(mask: Mask): Mask {
  const outside = outsideRegion(mask)
  const out = createMask(mask.cols, mask.rows)
  for (let i = 0; i < mask.cells.length; i++) {
    out.cells[i] = mask.cells[i] === 1 || outside[i] === 0 ? 1 : 0
  }
  return out
}

/**
 * Devuelve una mascara donde lo LIBRE son unicamente los huecos interiores: la
 * tinta y el exterior quedan marcados como ocupados.
 *
 * Sirve para medir cuanto espacio aprovechable hay de verdad adentro de un
 * diseno, y mostrarselo al usuario antes de que decida si quiere anidar ahi.
 */
export function interiorHoleSpace(mask: Mask): Mask {
  const outside = outsideRegion(mask)
  const out = createMask(mask.cols, mask.rows)
  for (let i = 0; i < mask.cells.length; i++) {
    const esHuecoInterior = mask.cells[i] === 0 && outside[i] === 0
    out.cells[i] = esHuecoInterior ? 0 : 1
  }
  return out
}

/**
 * Lado del cuadrado libre mas grande que entra en la mascara, en celdas.
 *
 * Por que un cuadrado y no un rectangulo: el rectangulo de mayor AREA suele ser
 * una tira finisima e inutil (en la insignia daba 6.6 x 0.3 cm). El cuadrado
 * mas grande responde mejor a la pregunta que importa: "entra una pieza real?".
 *
 * Programacion dinamica clasica: en cada celda guardamos el lado del cuadrado
 * mas grande que termina ahi abajo a la derecha.
 */
export function largestEmptySquare(mask: Mask): { side: number; col: number; row: number } {
  const { cols, rows, cells } = mask
  const dp = new Int32Array(cols * rows)
  let best = 0
  let bestCol = 0
  let bestRow = 0

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col
      if (cells[i] === 1) {
        dp[i] = 0
        continue
      }
      dp[i] =
        row === 0 || col === 0
          ? 1
          : Math.min(dp[i - 1], dp[i - cols], dp[i - cols - 1]) + 1
      if (dp[i] > best) {
        best = dp[i]
        bestCol = col
        bestRow = row
      }
    }
  }

  // Guardamos la esquina inferior derecha; devolvemos la superior izquierda,
  // que es como se ubican los rectangulos en el resto de la app.
  return { side: best, col: bestCol - best + 1, row: bestRow - best + 1 }
}

/**
 * Lleva una mascara a una grilla de otro tamano.
 *
 * Una celda del destino queda ocupada si CUALQUIER celda del origen que le
 * corresponde lo esta. Es a proposito: redondear hacia afuera nunca subestima
 * la forma, y subestimarla seria permitir que dos piezas se toquen.
 *
 * Funciona tanto achicando como agrandando: el rango de origen siempre incluye
 * al menos una celda, asi al agrandar no quedan agujeros.
 */
export function resample(mask: Mask, cols: number, rows: number): Mask {
  const out = createMask(cols, rows)
  if (mask.cols === 0 || mask.rows === 0) return out

  for (let row = 0; row < rows; row++) {
    const srcRowStart = Math.floor((row * mask.rows) / rows)
    const srcRowEnd = Math.max(srcRowStart + 1, Math.ceil(((row + 1) * mask.rows) / rows))

    for (let col = 0; col < cols; col++) {
      const srcColStart = Math.floor((col * mask.cols) / cols)
      const srcColEnd = Math.max(srcColStart + 1, Math.ceil(((col + 1) * mask.cols) / cols))

      let ocupada = 0
      for (let sr = srcRowStart; sr < srcRowEnd && ocupada === 0; sr++) {
        if (sr >= mask.rows) break
        for (let sc = srcColStart; sc < srcColEnd; sc++) {
          if (sc >= mask.cols) break
          if (mask.cells[sr * mask.cols + sc] === 1) {
            ocupada = 1
            break
          }
        }
      }
      out.cells[row * cols + col] = ocupada
    }
  }
  return out
}

/**
 * Rota la mascara en cuartos de vuelta, en sentido horario (el mismo sentido
 * que usa Konva). Con 1 o 3 cuartos, ancho y alto quedan intercambiados.
 *
 * Solo multiplos de 90 grados: son un remapeo exacto de indices, sin perdida.
 * Un angulo libre habria que volver a rasterizarlo con interpolacion, y el
 * packing automatico no lo necesita (solo prueba 0 y 90).
 */
export function rotateQuarterTurns(mask: Mask, turns: number): Mask {
  const t = ((turns % 4) + 4) % 4
  if (t === 0) return { cols: mask.cols, rows: mask.rows, cells: new Uint8Array(mask.cells) }

  const intercambia = t === 1 || t === 3
  const cols = intercambia ? mask.rows : mask.cols
  const rows = intercambia ? mask.cols : mask.rows
  const out = createMask(cols, rows)

  for (let row = 0; row < mask.rows; row++) {
    for (let col = 0; col < mask.cols; col++) {
      if (mask.cells[row * mask.cols + col] !== 1) continue
      let destCol: number
      let destRow: number
      if (t === 1) {
        destCol = mask.rows - 1 - row
        destRow = col
      } else if (t === 2) {
        destCol = mask.cols - 1 - col
        destRow = mask.rows - 1 - row
      } else {
        destCol = row
        destRow = mask.cols - 1 - col
      }
      out.cells[destRow * cols + destCol] = 1
    }
  }
  return out
}

/**
 * Dilatacion morfologica con elemento cuadrado: cada celda ocupada se expande
 * `radius` celdas en todas las direcciones. La mascara resultante CRECE
 * `radius` celdas por cada lado.
 *
 * Para que sirve: es como se representa la separacion minima entre formas. Si
 * dilatamos cada pieza en gap/2 y exigimos que no se toquen, la distancia real
 * entre sus formas queda >= gap. Es el mismo razonamiento que inflar los
 * rectangulos en el packing actual, pero aplicado a la forma real.
 *
 * Es separable: una pasada horizontal y otra vertical dan el mismo resultado
 * que un cuadrado, y cuesta O(celdas * radius) en vez de O(celdas * radius^2).
 *
 * Usamos un cuadrado y no un circulo porque es mas simple y queda un poco mas
 * conservador (dilata de mas en las diagonales), que es el lado seguro.
 */
export function dilate(mask: Mask, radius: number): Mask {
  if (radius <= 0) {
    return { cols: mask.cols, rows: mask.rows, cells: new Uint8Array(mask.cells) }
  }

  const cols = mask.cols + radius * 2
  const rows = mask.rows + radius * 2

  // Copia centrada en una grilla mas grande, para que la dilatacion tenga lugar.
  const padded = createMask(cols, rows)
  for (let row = 0; row < mask.rows; row++) {
    for (let col = 0; col < mask.cols; col++) {
      if (mask.cells[row * mask.cols + col] === 1) {
        padded.cells[(row + radius) * cols + (col + radius)] = 1
      }
    }
  }

  const horizontal = createMask(cols, rows)
  for (let row = 0; row < rows; row++) {
    const base = row * cols
    for (let col = 0; col < cols; col++) {
      let on = 0
      for (let k = -radius; k <= radius; k++) {
        const c = col + k
        if (c >= 0 && c < cols && padded.cells[base + c] === 1) {
          on = 1
          break
        }
      }
      horizontal.cells[base + col] = on
    }
  }

  const out = createMask(cols, rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let on = 0
      for (let k = -radius; k <= radius; k++) {
        const r = row + k
        if (r >= 0 && r < rows && horizontal.cells[r * cols + col] === 1) {
          on = 1
          break
        }
      }
      out.cells[row * cols + col] = on
    }
  }
  return out
}

/**
 * Encoge una mascara: una celda sobrevive solo si TODAS las que estan a
 * `radius` o menos (distancia de rey) tambien estaban ocupadas.
 *
 * Es el dual de dilate(), con una diferencia importante: NO agranda la grilla.
 * Lo que queda fuera cuenta como vacio, asi que el borde tambien se come. Eso
 * es lo que queremos donde se usa: adelgazar la barrera que encierra al fondo.
 *
 * Se calcula con una transformada de distancia de dos pasadas en vez de mirar
 * la vecindad celda por celda: el costo no depende del radio.
 */
export function erode(mask: Mask, radius: number): Mask {
  const { cols, rows, cells } = mask
  if (radius <= 0) return { cols, rows, cells: new Uint8Array(cells) }

  const lejos = cols + rows
  const dist = new Int32Array(cols * rows)

  // Pasada 1: desde arriba-izquierda. La distancia al vacio mas cercano mirando
  // solo hacia atras, contando el afuera de la grilla como vacio.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col
      if (cells[i] !== 1) continue
      let d = Math.min(Math.min(row, col) + 1, lejos)
      if (row > 0) d = Math.min(d, dist[i - cols] + 1)
      if (col > 0) d = Math.min(d, dist[i - 1] + 1)
      if (row > 0 && col > 0) d = Math.min(d, dist[i - cols - 1] + 1)
      if (row > 0 && col < cols - 1) d = Math.min(d, dist[i - cols + 1] + 1)
      dist[i] = d
    }
  }

  // Pasada 2: desde abajo-derecha, completando la distancia real.
  for (let row = rows - 1; row >= 0; row--) {
    for (let col = cols - 1; col >= 0; col--) {
      const i = row * cols + col
      if (cells[i] !== 1) continue
      let d = Math.min(dist[i], Math.min(rows - 1 - row, cols - 1 - col) + 1)
      if (row < rows - 1) d = Math.min(d, dist[i + cols] + 1)
      if (col < cols - 1) d = Math.min(d, dist[i + 1] + 1)
      if (row < rows - 1 && col < cols - 1) d = Math.min(d, dist[i + cols + 1] + 1)
      if (row < rows - 1 && col > 0) d = Math.min(d, dist[i + cols - 1] + 1)
      dist[i] = d
    }
  }

  const out = createMask(cols, rows)
  for (let i = 0; i < out.cells.length; i++) out.cells[i] = dist[i] > radius ? 1 : 0
  return out
}
