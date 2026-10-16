import type { ProjectSnapshot } from './projectSnapshot'

/**
 * Guardado del trabajo en el navegador, con IndexedDB.
 *
 * POR QUE INDEXEDDB Y NO LOCALSTORAGE: las imagenes viajan como data URL dentro
 * del trabajo. Medido con los archivos reales del negocio, DOS disenos ya pesan
 * 1.51 MB, y localStorage tiene 5 MB contados en UTF-16 (o sea, cada caracter
 * cuenta doble). Al sexto diseno tira QuotaExceededError justo cuando mas
 * trabajo hay cargado. IndexedDB no tiene ese techo.
 *
 * De yapa, IndexedDB guarda el objeto tal cual (structured clone): no hace
 * falta pasarlo por JSON ni inflarlo a texto.
 *
 * Es lo UNICO de la persistencia que necesita navegador. Armar y validar el
 * trabajo es puro y vive en projectSnapshot.ts.
 */

const DB_NAME = 'nestprint'
const DB_VERSION = 1
const STORE = 'project'
/** Un solo trabajo a la vez. Varios proyectos con nombre serian otra funcion. */
const KEY = 'current'

/** Hay donde guardar? En modo incognito o navegadores viejos puede no haber. */
export function isStorageAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('No se pudo abrir el almacenamiento del navegador.'))
  })
}

/** Corre una operacion sobre el almacen y cierra la conexion al terminar. */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = run(transaction.objectStore(STORE))
      request.onsuccess = () => resolve(request.result as T)
      request.onerror = () => reject(request.error ?? new Error('Falló la operación.'))
    })
  } finally {
    db.close()
  }
}

/**
 * Devuelve lo guardado SIN validar: de eso se encarga fromSnapshot().
 * Si no hay nada o el almacenamiento falla, devuelve null y la app arranca
 * limpia: no poder leer un trabajo viejo nunca debe impedir abrir la app.
 */
export async function loadProject(): Promise<unknown | null> {
  if (!isStorageAvailable()) return null
  try {
    const stored = await withStore<unknown>('readonly', (store) => store.get(KEY))
    return stored ?? null
  } catch {
    return null
  }
}

/** Guarda el trabajo. Lanza si no se pudo, para que la UI pueda avisar. */
export async function saveProject(snapshot: ProjectSnapshot): Promise<void> {
  if (!isStorageAvailable()) {
    throw new Error('Este navegador no permite guardar el trabajo.')
  }
  await withStore<void>('readwrite', (store) => store.put(snapshot, KEY))
}

/** Borra el trabajo guardado, para empezar de cero. */
export async function clearProject(): Promise<void> {
  if (!isStorageAvailable()) return
  try {
    await withStore<void>('readwrite', (store) => store.delete(KEY))
  } catch {
    // Si no se puede borrar, el trabajo nuevo lo va a pisar igual.
  }
}
