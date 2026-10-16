/**
 * Generador de ids unicos. Lo centralizamos en un solo lugar para que, si
 * manana queremos cambiar la estrategia (ej: ids cortos legibles), toquemos
 * un unico archivo.
 *
 * crypto.randomUUID() viene en el navegador y funciona en localhost/https,
 * que es donde corre esta app. No necesitamos ninguna dependencia externa.
 */
export function newId(): string {
  return crypto.randomUUID()
}
