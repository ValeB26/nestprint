/**
 * Marca del estudio.
 *
 * Es el isotipo "CO CO/" solo, sin la palabra STUDIO del logo completo: a los
 * 22 px de la barra, esa palabra mediria 2 px —ilegible— y ademas achicaria el
 * bloque que si se lee. El logo completo se sigue usando donde haya lugar.
 *
 * `size` es el ALTO. El ancho sale solo porque el bloque es mas ancho que
 * alto (559 x 468 en el original): encajarlo en un cuadrado desperdiciaria
 * ancho y lo dejaria mas chico de lo necesario.
 *
 * El archivo vive en public/ y no en src/assets/ porque el favicon lo necesita
 * en una URL fija de todos modos; tenerlo en dos lados seria duplicarlo.
 */
export default function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <img
      src="/logo.png"
      alt=""
      aria-hidden="true"
      height={size}
      style={{ height: size, width: 'auto' }}
      draggable={false}
    />
  )
}
