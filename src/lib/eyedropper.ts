/**
 * Cuentagotas: permite tomar un color de cualquier parte de la pantalla.
 *
 * Usa la EyeDropper API del navegador, que no necesita ninguna dependencia pero
 * solo existe en navegadores basados en Chromium (Chrome, Edge). Por eso
 * exponemos isEyedropperAvailable(): si no esta, la UI esconde el boton y queda
 * la paleta nativa del input de color, que igual alcanza.
 *
 * La API todavia no viene en los tipos de TypeScript, asi que la declaramos
 * nosotros con lo minimo que usamos.
 */
interface EyeDropperResult {
  sRGBHex: string
}

interface EyeDropperInstance {
  open: () => Promise<EyeDropperResult>
}

type EyeDropperConstructor = new () => EyeDropperInstance

function getEyeDropper(): EyeDropperConstructor | undefined {
  return (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper
}

export function isEyedropperAvailable(): boolean {
  return typeof window !== 'undefined' && getEyeDropper() !== undefined
}

/**
 * Abre el cuentagotas y devuelve el color elegido en hex, o null si el usuario
 * lo cancelo (cancelar hace que la promesa falle, y eso no es un error).
 */
export async function pickColorWithEyedropper(): Promise<string | null> {
  const EyeDropperCtor = getEyeDropper()
  if (!EyeDropperCtor) return null
  try {
    const result = await new EyeDropperCtor().open()
    return result.sRGBHex
  } catch {
    return null
  }
}
