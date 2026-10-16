# NestPrint

Herramienta web para acomodar diseños en un lienzo de ancho fijo (58 cm) y
exportar un PNG transparente listo para impresión. Automatiza el nesting 2D que
hoy se hace a mano en Canva: más rápido y gastando menos material.

**100% client-side.** No hay servidor, ni base de datos, ni cuentas. Los
archivos nunca salen del navegador.

## Qué hace

- **Cargás diseños PNG** y definís medidas y cantidades para cada uno.
- **Optimizar** los distribuye minimizando la altura total del lienzo.
  - Modo **Rectángulos**: MaxRects con heurística Best Short Side Fit.
  - Modo **Formas**: acomoda según la forma real del diseño, aprovechando los
    huecos que deja una figura curva. Prueba varias estrategias y se queda con
    la que gasta menos material.
- **Ajustás a mano** sobre el lienzo: mover, rotar a cualquier ángulo, duplicar,
  eliminar, con deshacer/rehacer y avisos de solapes o separación insuficiente.
- **Exportás el PNG** transparente al DPI que necesites.
- **El trabajo se guarda solo** y se retoma al volver a abrir.

## Cómo correrlo

Requiere **Node 20 o superior**.

```bash
npm install
npm run dev        # http://localhost:5173
```

Otros comandos:

```bash
npm run build      # compila TS y genera el build de producción en dist/
npm run preview    # sirve el build de producción
npm test           # corre los tests
npm run test:watch # tests en modo watch
npm run lint       # oxlint
```

## Stack

- **React 19 + TypeScript**
- **Vite 8** — bundler y servidor de desarrollo
- **Tailwind CSS 4** — configuración CSS-first, el tema vive en `src/index.css`
- **Konva + react-konva** — el editor de lienzo
- **Vitest** — tests del código puro: packing, geometría, estado, validación

## Cómo está organizado

```
src/
  types/      modelo de dominio (Diseño → Variante → Pieza), todo en centímetros
  state/      Context + useReducer, con undo/redo por snapshots
  lib/        geometría, máscaras, análisis de imágenes, métricas
  packing/    motores de acomodado (rectángulos y formas) — TS puro, sin React
  storage/    guardar y retomar el trabajo (IndexedDB)
  export/     render offscreen y descarga del PNG
  components/ UI
  hooks/
```

La regla que ordena todo: **la lógica de dominio es pura y está testeada**
(packing, geometría, validación, serialización); solo una capa fina toca el DOM
(leer imágenes, canvas, IndexedDB). Por eso el motor se puede probar sin
navegador.

Para el detalle de las decisiones técnicas y por qué se tomaron, ver
[CLAUDE.md](CLAUDE.md).

## Limitaciones conocidas

- La exportación tiene un techo de tamaño impuesto por el navegador (lado máximo
  16384 px, ~100 MP). La app lo detecta antes de intentar y sugiere un DPI que
  entre.
- Se guarda un solo trabajo a la vez: al abrir se retoma el último.
- **El trabajo guardado no viaja entre dispositivos.** Se guarda en el
  navegador que lo creó, así que abrir la app en otra computadora o en el
  celular no trae lo que estabas haciendo. Es consecuencia de no tener
  servidor: no hay dónde sincronizar.
- Está pensada para pantalla de computadora, no para teléfono.
