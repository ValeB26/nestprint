import type { Design } from '../types'
import type { ImageSample } from './designMask'

/**
 * Cache de datos DERIVADOS de cada diseno: la muestra de pixeles y la imagen ya
 * procesada que se muestra en pantalla.
 *
 * Vive FUERA del estado a proposito. Son datos que siempre se pueden volver a
 * calcular desde el PNG original, y son voluminosos: meterlos en el reducer los
 * metería ademas en cada snapshot del historial de deshacer.
 *
 * Consecuencia: todo lo que lea de aca tiene que seguir funcionando si la cache
 * esta vacia. Nunca puede romper por una cache fria.
 */
const samples = new Map<string, ImageSample>()
const processedUrls = new Map<string, string>()

/** La imagen procesada depende del diseno Y del modo de fondo elegido. */
function processedKey(design: Design): string {
  return design.id + ':' + design.backgroundMode
}

export function setSample(designId: string, sample: ImageSample): void {
  samples.set(designId, sample)
}

export function getSample(designId: string): ImageSample | undefined {
  return samples.get(designId)
}

export function setProcessedUrl(design: Design, url: string): void {
  processedUrls.set(processedKey(design), url)
}

export function getProcessedUrl(design: Design): string | undefined {
  return processedUrls.get(processedKey(design))
}

/** Libera todo lo derivado de un diseno que se elimino. */
export function forgetDesign(designId: string): void {
  samples.delete(designId)
  for (const key of processedUrls.keys()) {
    if (key.startsWith(designId + ':')) processedUrls.delete(key)
  }
}
