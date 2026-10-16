/**
 * Lectura de archivos de imagen a data URL.
 *
 * Como la app es 100% client-side, no subimos la imagen a ningun servidor:
 * la leemos en el navegador y la guardamos como data URL (texto base64) dentro
 * del estado. Ademas necesitamos sus dimensiones originales en px para, a
 * futuro, poder avisar si la resolucion no alcanza para el tamano pedido.
 */
export interface LoadedImage {
  dataUrl: string
  widthPx: number
  heightPx: number
}

export function readImageFile(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    reader.onload = () => {
      const dataUrl = reader.result as string
      // Cargamos la imagen para conocer su tamano real en pixeles.
      const img = new Image()
      img.onerror = () => reject(new Error('El archivo no es una imagen valida.'))
      img.onload = () =>
        resolve({ dataUrl, widthPx: img.naturalWidth, heightPx: img.naturalHeight })
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}
