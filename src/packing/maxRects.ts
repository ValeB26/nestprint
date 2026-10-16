/**
 * Algoritmo MaxRects (Maximal Rectangles) con heuristica Best Short Side Fit.
 *
 * Trabaja con rectangulos abstractos (sin saber de disenos ni de cm): su unica
 * responsabilidad es, dado un lienzo de ancho fijo y alto grande, ir ubicando
 * rectangulos sin que se solapen y aprovechando bien el espacio.
 *
 * IDEA DEL ALGORITMO
 * ------------------
 * Mantenemos una lista de "huecos libres": rectangulos maximales donde todavia
 * se puede colocar algo. Al principio hay un unico hueco = todo el lienzo.
 * Para cada pieza:
 *   1. Buscamos en que hueco entra mejor (heuristica BSSF, ver abajo).
 *   2. La colocamos ahi y "partimos" todos los huecos que esa pieza invadio en
 *      los pedazos que quedan libres alrededor.
 *   3. Limpiamos huecos que quedaron contenidos dentro de otros (redundantes).
 *
 * BSSF (Best Short Side Fit): entre todos los huecos donde la pieza entra,
 * elegimos el que deja el menor "lado corto sobrante". Tiende a dejar los
 * recortes mas aprovechables. Desempata por el lado largo sobrante.
 */

/** Tolerancia para comparaciones con decimales (las medidas estan en cm). */
const EPS = 1e-6

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Ubicacion elegida para una pieza, incluyendo si se uso rotada 90 grados. */
export interface Placement {
  x: number
  y: number
  width: number
  height: number
  rotated: boolean
}

export class MaxRectsBin {
  /** Huecos libres donde todavia se puede colocar. */
  private free: Rect[]

  constructor(width: number, height: number) {
    this.free = [{ x: 0, y: 0, width, height }]
  }

  /**
   * Intenta colocar un rectangulo de w x h. Si allowRotation es true, tambien
   * prueba la orientacion rotada 90 grados y se queda con la mejor. Devuelve la
   * ubicacion elegida, o null si no entra en ningun hueco.
   */
  insert(w: number, h: number, allowRotation: boolean): Placement | null {
    const best = this.findBestPosition(w, h, allowRotation)
    if (!best) return null
    this.placeRect(best)
    return best
  }

  /** Busca la mejor ubicacion segun BSSF, sin modificar el estado. */
  private findBestPosition(w: number, h: number, allowRotation: boolean): Placement | null {
    let best: Placement | null = null
    let bestShort = Infinity
    let bestLong = Infinity

    for (const fr of this.free) {
      // Probamos orientacion original y, si se permite, la rotada.
      const orientations: Array<{ rw: number; rh: number; rotated: boolean }> = [
        { rw: w, rh: h, rotated: false },
      ]
      if (allowRotation) orientations.push({ rw: h, rh: w, rotated: true })

      for (const { rw, rh, rotated } of orientations) {
        // Entra en este hueco?
        if (rw > fr.width + EPS || rh > fr.height + EPS) continue

        const leftoverH = fr.width - rw
        const leftoverV = fr.height - rh
        const shortSide = Math.min(leftoverH, leftoverV)
        const longSide = Math.max(leftoverH, leftoverV)

        const mejora =
          shortSide < bestShort - EPS ||
          (Math.abs(shortSide - bestShort) <= EPS && longSide < bestLong - EPS)

        if (mejora) {
          best = { x: fr.x, y: fr.y, width: rw, height: rh, rotated }
          bestShort = shortSide
          bestLong = longSide
        }
      }
    }

    return best
  }

  /** Coloca el rectangulo: parte los huecos invadidos y limpia los redundantes. */
  private placeRect(p: Placement): void {
    const used: Rect = { x: p.x, y: p.y, width: p.width, height: p.height }

    const next: Rect[] = []
    for (const fr of this.free) {
      next.push(...splitFreeRect(fr, used))
    }
    // Descartamos huecos sin area util (quedaron con ancho/alto ~0).
    this.free = next.filter((r) => r.width > EPS && r.height > EPS)
    this.pruneRedundant()
  }

  /** Elimina huecos que estan completamente contenidos dentro de otro. */
  private pruneRedundant(): void {
    const f = this.free
    for (let i = 0; i < f.length; i++) {
      for (let j = i + 1; j < f.length; j++) {
        if (contains(f[j], f[i])) {
          f.splice(i, 1)
          i--
          break
        }
        if (contains(f[i], f[j])) {
          f.splice(j, 1)
          j--
        }
      }
    }
  }
}

/**
 * Parte un hueco libre `fr` por el rectangulo ocupado `used`. Si no se tocan,
 * el hueco queda intacto. Si se solapan, devuelve hasta 4 franjas (arriba,
 * abajo, izquierda, derecha) que son las partes del hueco que siguen libres.
 * Estas franjas pueden solaparse entre si: es la naturaleza de los rectangulos
 * maximales; los redundantes se limpian despues con pruneRedundant().
 */
function splitFreeRect(fr: Rect, used: Rect): Rect[] {
  // Sin interseccion -> el hueco no se toca.
  const sinInterseccion =
    used.x >= fr.x + fr.width - EPS ||
    used.x + used.width <= fr.x + EPS ||
    used.y >= fr.y + fr.height - EPS ||
    used.y + used.height <= fr.y + EPS
  if (sinInterseccion) return [fr]

  const result: Rect[] = []

  // Franja de arriba (lo que queda sobre la pieza).
  if (used.y > fr.y + EPS) {
    result.push({ x: fr.x, y: fr.y, width: fr.width, height: used.y - fr.y })
  }
  // Franja de abajo.
  const usedBottom = used.y + used.height
  if (usedBottom < fr.y + fr.height - EPS) {
    result.push({ x: fr.x, y: usedBottom, width: fr.width, height: fr.y + fr.height - usedBottom })
  }
  // Franja de la izquierda.
  if (used.x > fr.x + EPS) {
    result.push({ x: fr.x, y: fr.y, width: used.x - fr.x, height: fr.height })
  }
  // Franja de la derecha.
  const usedRight = used.x + used.width
  if (usedRight < fr.x + fr.width - EPS) {
    result.push({ x: usedRight, y: fr.y, width: fr.x + fr.width - usedRight, height: fr.height })
  }

  return result
}

/** Devuelve true si el rectangulo `a` contiene por completo al rectangulo `b`. */
function contains(a: Rect, b: Rect): boolean {
  return (
    b.x >= a.x - EPS &&
    b.y >= a.y - EPS &&
    b.x + b.width <= a.x + a.width + EPS &&
    b.y + b.height <= a.y + a.height + EPS
  )
}
