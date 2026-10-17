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

/**
 * Formatos que aceptamos.
 *
 * Todo lo que viene despues (muestrear la forma, quitar el fondo, dibujar,
 * exportar) pasa por canvas, al que no le importa el formato de origen, y la
 * exportacion genera PNG siempre. Asi que aceptar JPG o WebP no pide ninguna
 * conversion: alcanza con dejarlos entrar.
 *
 * Lo que un JPG NO trae es transparencia, y pasarlo a PNG tampoco se la da. Eso
 * lo resuelve el tratamiento de fondo ("Quitar borde"), no el formato.
 */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export function readImageFile(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
      reject(new Error(`"${file.name}" no es una imagen PNG, JPG ni WebP.`))
      return
    }

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
