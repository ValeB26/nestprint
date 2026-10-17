# CLAUDE.md — NestPrint

Contexto de proyecto para Claude Code. Leer esto al inicio de cada sesión antes
de tocar código.

---

## Qué es NestPrint

Herramienta web **100% client-side** para un negocio de gráfica y estampado.
Automatiza el acomodo (nesting 2D) de diseños dentro de un lienzo de **ancho fijo
(58 cm) y altura variable**, y exporta un **PNG transparente** listo para enviar
al proveedor de impresión. Hoy ese acomodo se hace a mano en Canva: es lento y
desperdicia material.

El cuello de botella NO es diseñar las piezas, sino distribuirlas minimizando la
altura total. Es un problema de *2D rectangle bin packing* con ancho fijo.

**Principio rector:** no buscamos el layout matemáticamente perfecto. Buscamos
resolver mejor que el proceso manual, rápido y confiable. *Automatización primero,
ajuste humano después.*

---

## Cómo quiero trabajar (importante)

- **Respondé en español.** El dueño del proyecto es argentino; usá voseo.
- **Construcción progresiva por fases.** NO generar toda la app de golpe. Cada
  fase produce algo funcional y testeable; no se avanza sin validar la anterior.
- **Nivel del desarrollador:** junior con bases de HTML/CSS/JS/React/Node/Git/
  Docker. Usa IA para programar y quiere **aprender mientras construye**.
- **Código entendible, modular, mantenible y razonablemente simple.** Sin hacks
  ni sobreingeniería.
- **Al tomar una decisión técnica importante, explicar brevemente:** QUÉ hacemos,
  POR QUÉ, y QUÉ alternativa se descarta. No hace falta explicar código trivial
  línea por línea.
- Preferir una solución simple suficientemente buena antes que un algoritmo
  complejo.

---

## Stack y comandos

- **React 19 + TypeScript**
- **Vite 8** (bundler + dev server)
- **Tailwind CSS 4** — configuración CSS-first. NO hay `tailwind.config.js`: el
  tema (colores, fuentes) se define con `@theme` dentro de `src/index.css`. Cada
  variable genera utilidades automáticamente (`--color-brand` → `bg-brand`).
- **Konva + react-konva** — editor de canvas interactivo (en uso desde la Fase 5).
- **Vitest** — testing del código puro: packing, geometría, estado, validación.
- **oxlint** — linter. Queda un warning conocido e inofensivo en `AppContext.tsx`
  (`only-export-components`): es el patrón normal de Context + hook en un archivo.

```bash
npm install        # instalar dependencias
npm run dev        # servidor de desarrollo (http://localhost:5173)
npm run build      # compila TS (tsc -b) y genera build de producción
npm run preview    # sirve el build de producción
npm test           # corre los tests una vez (vitest run)
npm run test:watch # tests en modo watch
npm run lint       # oxlint
```

Requiere Node 20+. El desarrollo es en **Windows** (Asus TUF, VSCode).

> **Nota para Claude:** en este entorno, los heredocs de bash se comen los
> backslashes. Para scripts de parcheo, evitar `\n` y `\` (usar
> `String.fromCharCode(10)` / `(92)`), o escribir archivos completos de una.

---

## Deploy

La app está publicada en **Vercel**, desde el repo
**https://github.com/ValeB26/nestprint** (rama `main`).

- **Cada `git push` a `main` redeploya solo.** No hay que correr nada a mano.
- **No hay `vercel.json`.** Vercel detecta Vite y ya sabe que el build es
  `npm run build` y la salida `dist`. Haría falta solo si se agregaran rutas del
  lado del cliente (`/editor`, `/trabajos`), que necesitan un rewrite a
  `index.html`. Hoy la app es una sola pantalla y no usa router.
- **`engines: { node: ">=20" }`** en `package.json` fija la versión de Node con
  la que buildea Vercel; sin eso queda a merced del default de la plataforma,
  que cambia solo cada tanto.
- `.vercel` está en el `.gitignore`: lo escribe el CLI y no va al repo.

### El trabajo guardado NO viaja entre dispositivos

IndexedDB es **por origen y por navegador**. O sea:

| Dónde se abre la app | Trabajo guardado |
|---|---|
| `localhost:5173` (desarrollo) | uno |
| la URL de Vercel, en la laptop | otro |
| la URL de Vercel, en otra compu o el celular | otro más |

Son almacenamientos distintos y ninguno ve al otro: abrir la app en el celular
no trae el trabajo de la laptop. **Es consecuencia de ser 100% client-side**, no
un bug — sin servidor no hay dónde sincronizar.

Si alguna vez hace falta llevar un trabajo de una máquina a otra, el camino
corto es exportar/importar el snapshot como archivo `.json`: `toSnapshot()` y
`fromSnapshot()` (`storage/projectSnapshot.ts`) ya hacen todo el trabajo, y
`fromSnapshot()` ya valida lo que entra. Sincronización de verdad pide servidor
y queda fuera del MVP.

---

## Arquitectura: tres capas desacopladas

```
Capa UI (React + Konva)
  Panel de diseños · Editor canvas · Toolbar · Métricas
        ↓ despacha acciones        ↑ lee estado
Capa de Estado (React Context + useReducer + historial)
  designs[] · variants[] · placedPieces[] · config
        ↓ entrada                  ↑ salida
Motor de Packing (TS puro)   +   Módulo de Exportación
  variantes → piezas posicionadas   cm→px (DPI) → canvas offscreen → PNG
```

- **El Motor de Packing es una función pura de TS.** No importa React ni nada de
  UI. Recibe variantes, devuelve piezas posicionadas. Se testea con JSON aislado.
- **La Capa de Estado centraliza todo** en un reducer, con undo/redo por
  snapshots de estado inmutable (NO comandos invertibles). El historial vive en
  `state/history.ts`, que envuelve al `appReducer` y guarda `past/present/future`.
- **El Módulo de Exportación** toma las piezas, aplica cm→px según DPI, renderiza
  en canvas offscreen y genera el blob PNG. *(Todavía no construido: Fase 7.)*

---

## Modelo de datos: Diseño → Variante → Pieza

Definido en `src/types/index.ts`. Tres niveles:

- **Design** — el archivo visual original, se sube UNA vez. Guarda la imagen como
  data URL. Campos: `id`, `name`, `imageDataUrl`, `originalWidthPx`,
  `originalHeightPx`.
- **DesignVariant** — un uso concreto de un diseño con tamaño + cantidad. Campos:
  `id`, `designId`, `name`, `widthCm`, `heightCm`, `quantity`, `allowRotation`.
- **PlacedPiece** — una instancia individual ya posicionada. Campos: `id`,
  `variantId`, `xCm`, `yCm`, `widthCm`, `heightCm`, `rotation` (grados,
  cualquier ángulo).

**Cómo se interpreta una PlacedPiece (importante, cambió en la Fase 6+):**

- `widthCm`/`heightCm` son el **tamaño PROPIO del sticker**, NO el espacio que
  ocupa. `xCm`/`yCm` son la esquina superior izquierda de *ese* rectángulo.
- `rotation` se aplica **alrededor del centro de la pieza**. Por eso rotar NO
  cambia `xCm`/`yCm`/`widthCm`/`heightCm`: solo cambia el ángulo.
- El espacio que la pieza ocupa en el lienzo (su **bounding box**) se calcula con
  `pieceBounds()` (`src/lib/geometry.ts`). Eso es lo que usan el packing, la
  validación de solapes y el cálculo del alto usado.
- *Por qué así:* guardar el tamaño ya rotado solo funciona con múltiplos de 90°
  (ahí rotar es intercambiar ancho y alto). Con un ángulo libre no se podría
  recuperar el tamaño real de la pieza para dibujarla.

**Reglas que no se rompen:**

- La imagen vive SOLO en el Design. Varias variantes del mismo diseño la
  referencian por `designId` y NUNCA la duplican.
- Si una variante pide cantidad 10, se generan 10 `PlacedPiece` con el mismo
  `variantId` pero distinto `id`/posición/rotación.
- El optimizador trabaja con PIEZAS (expandidas desde variantes), no con diseños.
  Cada variante es un tipo de pieza independiente aunque compartan diseño.

---

## Decisiones técnicas clave

1. **cm es la unidad de dominio.** TODO el estado se maneja en centímetros. La
   conversión a píxeles (`px = cm × DPI / 2.54`) ocurre ÚNICAMENTE al exportar.
   En el editor, Konva usa un factor de escala para mostrar cm en pantalla; ese
   factor cambia con el zoom pero no afecta las medidas reales.

2. **Packing: MaxRects con heurística Best Short Side Fit (BSSF).** Mejor relación
   calidad / complejidad / mantenibilidad para el MVP. Se descartaron: Shelf/Row
   (desperdicia mucho), First Fit Decreasing (MaxRects lo supera con poco más
   esfuerzo), solvers exactos (sobreingeniería). Mejora futura: correr varias
   heurísticas y quedarse con la de menor altura.

3. **Separación entre piezas:** el packing infla cada pieza en `gap/2` por lado
   antes de colocarla, así dos piezas pegadas quedan a `gap` de distancia. Al
   guardar la pieza se le devuelve su tamaño real, centrada en el hueco que
   ocupó. El inflado es solo del algoritmo: nunca se dibuja ni se exporta.

4. **Rotación: dos mundos distintos.**
   - El *packing automático* solo prueba 0° y 90°: elige la mejor de las dos,
     respetando el flag `allowRotation` por variante (para diseños con texto u
     orientación fija).
   - El *usuario* puede poner **cualquier ángulo** a mano sobre el lienzo:
     arrastrando el tirador de rotación, con los botones 90°/180° o escribiendo
     los grados. Esto ignora `allowRotation` a propósito — si lo está haciendo a
     mano, es porque lo quiere.
   - Siempre gira alrededor del centro de la pieza, así rotar no la mueve.

5. **Para el MVP cada diseño es su rectángulo delimitador (bounding box).** No se
   analiza el canal alpha todavía. Eso es mejora futura.

6. **Validación con bounding box, no con rectángulos rotados.** Para ángulos
   que no son múltiplos de 90 el *bounding box* es más grande que la pieza real,
   así que la validación de solapes queda **conservadora**: puede avisar que dos
   piezas en diagonal están muy juntas cuando todavía entrarían. Preferimos
   avisar de más antes que dejar pasar un solape. Comparar rectángulos rotados
   de verdad (SAT) es bastante más código y para el MVP no hace falta.

7. **Las medidas de una variante se mantienen proporcionales por defecto.** Al
   editar ancho o alto, el otro valor se recalcula con la proporción del
   **CONTENIDO** (`geometry.heightOverWidth`), no la del archivo, así el diseño no sale
   deformado y el usuario piensa en una sola medida. El checkbox "Mantener
   proporción" (estado local de `VariantRow`, ON por defecto) permite
   desactivarlo cuando se necesita una medida exacta no proporcional. Si al
   derivar el ancho se pasa de los 58 cm, se topea y se recalcula el alto para
   no romper la proporción.

   **Por qué la del contenido y no la del archivo** (bug del logo cuadrado): el
   rectángulo de la pieza ES el content box — `contentDrawRect()` agranda la
   imagen para que lo visible lo llene exacto, así que el margen transparente
   del PNG no se dibuja. Un archivo cuadrado con un logo alto adentro tiene
   proporción 1 pero se dibuja alto: con la del archivo, escribir 25 cm de
   ancho daba 25 de alto y el logo salía achatado. La cuenta vive en
   `lib/aspect.ts` (puro y testeado) y la usan `VariantRow` **y**
   `createVariant`: antes cada uno calculaba la suya y la variante cambiaba de
   forma apenas se la editaba.

   **Cuidado:** cambiar el tratamiento del fondo cambia el content box, o sea
   la proporción correcta. Las medidas ya cargadas NO se re-derivan solas, así
   que conviene elegir el fondo ANTES de cargar las medidas.

8. **Lo que se puede derivar, no se guarda.** El alto usado y el aprovechamiento
   se calculan de `placedPieces` (`lib/metrics.ts`) en vez de vivir en el estado.
   Un dato derivado guardado se desincroniza la primera vez que el usuario mueve
   una pieza a mano.

---

## Parámetros confirmados con el usuario del negocio

- **Ancho del lienzo:** 58 cm **fijo, NO configurable** desde la UI (es el ancho
  del material del proveedor). Se muestra en el panel como referencia. Sigue
  siendo un campo de `CanvasConfig` porque el motor de packing lo recibe como
  parámetro; la constante es `CANVAS_WIDTH_CM`. Otros anchos son post-MVP.
- **Separación mínima:** 2 mm por defecto (`gapCm: 0.2`), configurable.
- **Resolución de exportación:** **300 DPI** (lo que usa hoy en Canva),
  **configurable**. A 300 DPI, 58 cm = 6850 px de ancho.
- **Fondo del lienzo en pantalla:** Blanco (default), Negro o **personalizado**
  (`previewBackground` guarda un color hex cualquiera). Se elige con muestras,
  la paleta nativa del navegador o un cuentagotas (EyeDropper API; solo en
  Chromium, el botón se esconde si no está). Es SOLO una ayuda visual para poder
  ver los diseños de tinta blanca (calcomanías blancas). **No afecta al PNG
  exportado**, que siempre sale transparente.
- **Un solo usuario.** Sin autenticación ni persistencia server-side.
- **PNG, JPG y WebP** como formatos de entrada. Un archivo sin transparencia
  arranca con el fondo en "Quitar borde". Ver "Formatos de entrada y resolución".
- **Rotación en el packing habilitada** por defecto, desactivable por variante
  (`allowRotation`). La rotación manual sobre el lienzo es siempre libre.
- **Proporción del diseño:** al cambiar ancho o alto de una variante se
  recalcula la otra medida con la proporción real del archivo. Se puede
  desactivar por variante con "Mantener proporción".

Valores por defecto en `DEFAULT_CONFIG` (`src/types/index.ts`).

---

## Estado actual: Fases 1 a 7 completadas (+ ajustes extra). MVP cerrado y deployado.

La app hace el ciclo completo: cargás PNGs, definís variantes con tamaño y
cantidad, presionás Optimizar y el motor las distribuye, ajustás a mano sobre el
lienzo con undo/redo y avisos de error, y **exportás el PNG transparente** listo
para el proveedor. El trabajo **se guarda solo** y se retoma al volver a abrir.

**251 tests de Vitest en verde.** Compila (`tsc -b`), buildea y corre.
Está publicada en Vercel y se accede por link desde cualquier dispositivo (ver
"Deploy" más arriba).

**En curso: nesting por forma real.** Etapas 1 a 4 terminadas. El editor valida
por forma real y **el optimizador ya puede acomodar por forma**, detrás del
selector "Acomodado: Rectángulos / Formas" (por defecto **Rectángulos**: el
método nuevo no reemplaza al viejo hasta compararlos). Falta la etapa 5: medir
los dos con trabajos reales. Ver "Nesting por forma real" más abajo.

### Por dónde seguir

**Fase 8 — Testing con casos reales.** Trabajos reales del negocio: medir
velocidad, aprovechamiento y calidad del PNG contra el proceso manual en Canva.

También queda pendiente la **etapa 5 del nesting por forma**: comparar los dos
modos con trabajos reales y decidir cuál debería ser el default.

### Limitaciones conocidas (decisiones, no bugs)

- Al arrastrar un grupo de piezas seleccionadas, durante el arrastre solo se ve
  moverse la pieza agarrada; las demás se reacomodan al soltar.
- La validación de solapes con ángulos que no son múltiplos de 90 es
  conservadora (ver decisión técnica 6).
- Cambiar variantes o config después de optimizar NO re-optimiza solo: el layout
  queda como estaba hasta que se vuelve a apretar Optimizar.
- `npm run build` avisa que el chunk pasa los 500 kB. Es Konva, que es grande.
  Para una app client-side de un solo usuario no es problema.
- **El trabajo guardado es uno solo.** No hay proyectos con nombre: al abrir se
  retoma el último. Varios proyectos sería la evolución natural y el
  almacenamiento ya lo soporta (IndexedDB con una clave por proyecto).
- **La exportación tiene un techo de tamaño**, impuesto por el navegador: lado
  máximo 16384 px y ~100 megapíxeles de área. Un trabajo de 135 cm a 300 DPI
  (6850 × 15945 px = 109 MP) NO entra; la app lo detecta antes de intentar y
  sugiere un DPI que sí entre. Exportar por partes sería la solución real, y es
  post-MVP.

### Estructura

```
nestprint/
├── CLAUDE.md                    ← este archivo
├── README.md
├── index.html                   ← fuentes Inter + JetBrains Mono + favicon
├── public/
│   ├── favicon.png              ← isotipo 64x64, cuadrado con respiro
│   └── logo.png                 ← isotipo 153x128, a su proporcion, para LogoMark
├── vite.config.ts               ← plugins react + tailwind
├── package.json
└── src/
    ├── main.tsx
    ├── integration.test.ts   ← 21 tests: un trabajo real cruzando todas las capas
    ├── App.tsx                  ← envuelve el layout en <AppProvider>
    ├── index.css                ← Tailwind 4 + tema (@theme)
    ├── types/
    │   └── index.ts             ← Design, DesignVariant, PlacedPiece, CanvasConfig,
    │                               BACKGROUND_PRESETS, CANVAS_WIDTH_CM, DEFAULT_CONFIG
    ├── state/
    │   ├── appReducer.ts        ← AppState (+ baselineHeightCm) + AppAction + reducer puro
    │   ├── appReducer.test.ts   ← 12 tests de edición múltiple y rotación libre
    │   ├── history.ts           ← undo/redo por snapshots (envuelve appReducer)
    │   ├── history.test.ts      ← 7 tests del historial
    │   └── AppContext.tsx       ← Provider + useApp() (state, dispatch, canUndo, canRedo)
    ├── lib/
    │   ├── id.ts                ← newId() (crypto.randomUUID)
    │   ├── image.ts             ← readImageFile(): File → data URL + dimensiones px
    │   ├── createVariant.ts     ← variante por defecto (respeta proporción del diseño)
    │   ├── aspect.ts            ← proporción del diseño + medidas derivadas (puro)
    │   ├── aspect.test.ts       ← 19 tests (incluye el logo que salía cuadrado)
    │   ├── resolution.ts        ← DPI real de una variante + aviso (puro)
    │   ├── resolution.test.ts   ← 16 tests
    │   ├── sealedWhite.test.ts  ← 11 tests de erode + blanco sellado
    │   ├── geometry.ts          ← pieceBounds/pieceCenter/angleFromTo/unionBounds
    │   ├── geometry.test.ts     ← 12 tests de bounding box, ángulos y uniones
    │   ├── metrics.ts           ← alto usado y aprovechamiento derivados de las piezas
    │   ├── mask.ts              ← grillas booleanas: content box, flood fill,
    │   │                           huecos, resample, rotación, dilatación
    │   ├── mask.test.ts         ← 14 tests (máscaras dibujadas con texto)
    │   ├── maskGrid.test.ts     ← 12 tests de resample / rotar / dilatar
    │   ├── designMask.ts        ← análisis puro: muestra + modo → tinta + huella
    │   ├── designMask.test.ts   ← 11 tests (reproducen la insignia y el lettering)
    │   ├── imageSample.ts       ← [DOM] muestrear PNG y quitarle el fondo
    │   ├── designCache.ts       ← caché de muestras e imágenes procesadas
    │   ├── color.ts             ← isDarkColor(): texto claro u oscuro según el fondo
    │   ├── color.test.ts        ← 4 tests de luminancia
    │   └── eyedropper.ts        ← cuentagotas (EyeDropper API, con feature detection)
    ├── components/
    │   ├── layout/
    │   │   ├── Toolbar.tsx      ← marca + Deshacer/Rehacer + Exportar (INERTE) + Optimizar
    │   │   ├── DesignPanel.tsx  ← upload PNG + lista de diseños + config
    │   │   ├── CanvasArea.tsx   ← fondo cutting-mat + selección + atajos de teclado
    │   │   └── MetricsBar.tsx   ← ancho/alto/aprovechamiento/piezas + aviso de problemas
    │   ├── designs/
    │   │   ├── DesignCard.tsx   ← miniatura + variantes + "agregar variante"
    │   │   ├── VariantRow.tsx   ← edición inline + proporción automática ancho/alto
    │   │   └── DesignShapePanel.tsx ← fondo (dejar/borde/blanco) + anidado interior
    │   ├── config/
    │   │   └── ConfigForm.tsx   ← ajustes del trabajo; va DENTRO del popover de la toolbar
    │   ├── canvas/
    │   │   ├── CanvasStage.tsx  ← Stage Konva: escala cm→px, zoom, paneo, fit, selección
    │   │   ├── PieceShape.tsx   ← dibuja una pieza (imagen rotada + borde según estado)
    │   │   ├── PieceToolbar.tsx ← acciones de la selección (90/180, ángulo, duplicar, borrar)
    │   │   └── SelectionOverlay.tsx ← marco de selección + tirador para rotar arrastrando
    │   └── ui/
    │       ├── NumberInput.tsx  ← input numérico con buffer de texto y commit en blur
    │       ├── Popover.tsx      ← panel flotante (cierra al clickear afuera o con Esc)
    │       └── LogoMark.tsx     ← isotipo del estudio (toolbar + pantalla de carga)
    ├── packing/
    │   ├── maxRects.ts          ← algoritmo MaxRects BSSF genérico (clase MaxRectsBin)
    │   ├── pack.ts              ← packRects(): acomodado por rectángulo (MaxRects BSSF)
    │   ├── index.ts             ← pack(): prueba varias estrategias y se queda con la mejor
    │   ├── index.test.ts        ← 8 tests del despachador (incluye "nunca peor que rect")
    │   ├── raster/              ← nesting por forma (etapas 2+)
    │   │   ├── bitmask.ts       ← máscaras en bits: 32 celdas por palabra, overlapsAt
    │   │   ├── bitmask.test.ts  ← 11 tests (incluye cruce de límite de palabra)
    │   │   ├── packRaster.ts    ← acomodado por forma (perfil de columnas)
    │   │   ├── packRaster.test.ts ← 9 tests (incluye comparación contra rectángulos)
    │   │   ├── pieceMask.ts     ← forma del diseño → máscara en cm, rotada y dilatada;
    │   │   │                       PieceShape (cruda + dilatada), quarterTurnsOf
    │   │   └── pieceMask.test.ts ← 12 tests (separación, forma en L, disco ≈ pi/4)
    │   ├── validate.ts          ← validateLayout(): dos niveles (AABB → máscara)
    │   ├── pack.test.ts         ← 8 tests (los 7 casos de abajo + borde)
    │   └── validate.test.ts     ← 10 tests (incluye integración con pack y rotación)
    ├── storage/
    │   ├── projectSnapshot.ts   ← estado ↔ trabajo guardable + validación (puro)
    │   ├── projectSnapshot.test.ts ← 14 tests (sobre todo del camino defensivo)
    │   └── projectStore.ts      ← [DOM] IndexedDB: leer / guardar / borrar
    ├── export/
    │   ├── exportSize.ts        ← cm→px, límites del navegador, DPI sugerido (puro)
    │   ├── exportSize.test.ts   ← 13 tests
    │   └── exportPng.ts         ← [DOM] render offscreen + descarga
    └── hooks/
        ├── useElementSize.ts    ← mide el contenedor (ResizeObserver) para el Stage
        ├── useDesignImages.ts   ← carga data URL → HTMLImageElement para Konva
        ├── useDesignGeometry.ts ← analiza la forma de un diseño (memoizado)
        ├── useShapeLookup.ts    ← buscadores de formas (para validar y para optimizar)
        ├── useProjectPersistence.ts ← retomar al abrir + autoguardado con pausa
        └── useProcessedUrl.ts   ← data URL con el fondo ya quitado
```

**La marca es la del estudio (COCO).** Se usa el **isotipo** "CO CO/" solo, sin
la palabra STUDIO del logo completo: a los 22 px de la barra esa palabra mediría
2 px y además achicaría el bloque que sí se lee. Son dos recortes porque son dos
usos: el favicon va cuadrado con respiro, el de la app a su proporción natural
(es más ancho que alto, y encajarlo en un cuadrado lo dejaría innecesariamente
chico). El fondo crema del archivo se quitó con una rampa y **desmezclando** el
color de los bordes: sin eso, los bordes arrastran el crema y sobre blanco se ven
como un halo sucio.

**Diseño visual:** identidad de taller gráfico. Verde "cutting-mat" (`--color-brand`
`#1f7a63`) como color de marca; superficie fría y neutra para que los diseños del
usuario manden el color; mono (JetBrains Mono) reservada solo para medidas
numéricas (clase `.measure`).

**Arquitectura de información (rediseño).** Después de 7 fases, el panel de 288 px
había juntado ~80 controles con todos el mismo peso. Se reorganizó por
**frecuencia de uso**:

- **Los ajustes del trabajo salieron del panel** a un popover de la barra
  superior (`Popover` + `ConfigForm`). Se tocan una vez por trabajo; ocupaban
  espacio permanente compitiendo con lo que sí se usa todo el tiempo.
- **La tarjeta de diseño ordena por frecuencia:** arriba y con peso las medidas
  y cantidades; abajo y **plegado** (`<details>`) el tratamiento de fondo y el
  anidado, que se definen una vez al cargar el archivo.
- **Plegar no esconde nada:** el encabezado plegado muestra siempre el estado
  ("Sin transparencia", "Sin blanco · ocupa 45%"), así el aviso de un PNG opaco
  se ve sin abrir nada.
- **La barra inferior tiene jerarquía:** el alto usado va grande porque ES el
  material gastado. Y si el acomodado por formas le ganó al rectangular, se
  muestra el ahorro — la razón de ser de la app, que antes no aparecía en
  ningún lado.

**Contraste corregido.** El `--color-faint` anterior (`#9aa1ab`) daba 3:1 sobre
blanco y los textos de ayuda no se leían. La escala quedó en tres pasos que
pasan el mínimo de 4.5:1: `ink` → `muted` (6.2:1) → `faint` (4.8:1).

**El ahorro necesita un punto de comparación.** `pack()` devuelve
`baselineHeightCm` (lo que habría usado el método rectangular) y se guarda en el
estado. NO se deriva de las piezas —hay que correr el otro algoritmo—, así que
viaja con el resultado del packing, igual que `placedPieces`. El ahorro se
calcula contra el alto ACTUAL, así que si el usuario mejora el layout a mano,
sube.

---

## Notas de implementación por fase

Esto es el "por qué" de cada parte. Vale más que el código, porque el código se
lee solo pero las razones se olvidan.

**Fase 3 — Carga de diseños y variantes:**
- El estado vive en `AppState` (`designs`, `variants`, `placedPieces`, `config`).
  Todo cambio pasa por el `appReducer`; la UI solo lee con `useApp()` y despacha.
- Al borrar un diseño, el reducer limpia sus variantes y las piezas asociadas.
- Edición inline (sin formularios modales): cada diseño nace con una variante
  lista para ajustar, con el alto calculado según la proporción del archivo.
- `NumberInput` guarda lo tipeado como texto y confirma en blur/Enter. Un input
  numérico que lee directo del estado no te deja borrar para reescribir.

**Fase 4 — Motor de packing:**
- `pack(variants, config)` es una función pura: expande variantes a piezas,
  ordena de mayor a menor (por área), las coloca con MaxRects BSSF y devuelve
  `{ pieces, usedHeightCm, unplaced }`. No sabe nada de React ni del DOM.
- Ordenar de mayor a menor es lo que hace rendir a MaxRects: las grandes primero
  y las chicas rellenan los huecos.
- Las piezas se inflan `gap/2` por lado para colocarlas y después se guardan con
  su tamaño real, **centradas en el hueco** que ocuparon. Para una pieza sin
  rotar eso da la esquina del hueco; para una rotada 90°, su rectángulo propio
  queda "cruzado" respecto del hueco, que es lo correcto con rotación al centro.
- **Detalle clave del lienzo:** su alto para el algoritmo es `columnStack + ancho`.
  El margen extra evita que, cuando el trabajo es más bajo que ancho, la
  heurística prefiera apilar en columna en vez de llenar filas. Esto lo encontró
  un test que fallaba: sin el margen, 10 piezas de 5×5 quedaban en una columna.
- `unplaced` cuenta las piezas que no entran ni rotadas (más anchas que 58 cm).
  Hoy solo se avisa por consola.

**Fase 5 — Visualización con Konva:**
- Todo el dibujo se hace en cm; la `Layer` de Konva aplica la escala cm→px
  (`view.scale` = px por cm). El zoom cambia esa escala, no las medidas reales.
- **Rotación:** el `Group` de la pieza se posiciona en su CENTRO y se le da un
  `offset` de medio ancho y medio alto. Eso hace dos cosas de una: los hijos se
  dibujan en coordenadas locales (0,0)-(ancho,alto) como si nada, y la rotación
  de Konva gira alrededor del centro, que es el modelo que guardamos. Así
  cualquier ángulo funciona igual, sin casos especiales.
- Bordes con `strokeScaleEnabled={false}` para que queden finos a cualquier zoom.
- Encuadre automático solo al cambiar las dimensiones del lienzo, no en cada
  resize ni al mover una pieza, para no pisarle el zoom al usuario.
- Cada pieza tiene un `Rect` transparente encima que recibe los clicks: si no,
  no se podrían agarrar los diseños con mucha zona transparente.

**Fase 6 — Edición manual:**
- **Undo/redo por snapshots** (`state/history.ts`): `historyReducer` envuelve al
  `appReducer` y guarda el estado anterior en una pila `past` (tope de 50). Como
  el estado es inmutable, los snapshots comparten estructura: guardar 50 no
  duplica las imágenes. La alternativa (comandos invertibles) exige escribir y
  mantener el inverso de CADA acción, y cualquier olvido es un bug silencioso.
- Las ediciones continuas (`UPDATE_VARIANT`, `UPDATE_CONFIG`) quedan FUERA del
  historial a propósito: si no, cada tecla tipeada sería un paso de undo.
- **La selección es estado local** de `CanvasArea`, no global: es información de
  interfaz, y si entrara al historial, deshacer movería la selección en vez de
  revertir un cambio real. Las piezas seleccionadas se derivan en cada render,
  así un id que ya no existe simplemente no aparece.
- **Selección múltiple con Ctrl+clic.** Por eso TODAS las acciones de piezas del
  reducer operan sobre un array de ids (`MOVE_PIECES`, `ROTATE_PIECES`,
  `SET_PIECES_ROTATION`, `REMOVE_PIECES`, `DUPLICATE_PIECES`): si se despachara
  una acción por pieza, deshacer un cambio sobre 10 piezas pediría 10 Ctrl+Z.
- `DUPLICATE_PIECES` recibe los ids nuevos desde la UI para que el reducer siga
  siendo puro (generar ids al azar adentro lo haría no testeable).
- `MOVE_PIECES` mueve por **desplazamiento** (no a una posición absoluta) para
  que un grupo arrastrado mantenga su distribución relativa.
- Hacer clic sin Ctrl sobre una pieza **ya seleccionada** no deshace la
  selección, para poder empezar a arrastrar el grupo.
- `validateLayout()` no corrige nada: avisa. Rojo = error (solape o fuera de
  límites), naranja punteado = aviso (separación menor al gap). Tolerancia de
  0.1 mm para absorber el redondeo y no reportar problemas falsos.
- **Rotar arrastrando** (`SelectionOverlay`): el tirador sobre el marco de la
  selección gira las piezas siguiendo el mouse. El ángulo se mide desde el
  centro del marco hasta el puntero. Con **Shift** va en pasos de 15°.
  - El giro en curso NO se despacha al estado: vive en `rotationDelta` (estado
    local de `CanvasStage`) y se pasa a las piezas como `rotationPreviewDelta`
    solo para dibujar. Se confirma con un único `ROTATE_PIECES` al soltar. Si se
    despachara en cada movimiento del mouse, el historial se llenaría de cientos
    de pasos y deshacer sería inservible.
  - Cada pieza gira sobre su **propio centro** (igual que los botones 90/180), no
    alrededor del centro del grupo: así rotar nunca mueve las piezas de lugar.
  - El marco se calcula con los ángulos ya confirmados, para que el tirador se
    quede quieto mientras se arrastra en vez de perseguir al mouse.
  - Los tamaños del tirador se dividen por el zoom (`px / scale`) para que midan
    siempre lo mismo en pantalla, porque la Layer está escalada en px por cm.
- **Atajos de teclado:** `R` rotar 90° (`Shift+R` al revés), `Ctrl+D` duplicar,
  `Supr`/`Backspace` eliminar, `Esc` deseleccionar, `Ctrl+Z` deshacer,
  `Ctrl+Shift+Z` / `Ctrl+Y` rehacer. Se ignoran mientras el foco está en un input.

---

## Retomar un trabajo

El trabajo se guarda solo mientras se usa la app, y se retoma al volver a abrir.

### Por qué IndexedDB y no localStorage

Las imágenes viajan como data URL adentro del trabajo. **Medido con los archivos
reales del negocio:**

| | Bytes | Cuota en localStorage |
|---|---|---|
| Insignia | 73.803 | 192 KB |
| Lettering | 521.477 | 1.358 KB |
| **Los dos juntos** | | **1,51 MB de 5 MB** |

localStorage guarda texto **UTF-16**, así que cada carácter del base64 cuenta
doble. Con diseños de ese peso entran unos **6** antes de tirar
`QuotaExceededError` — justo cuando más trabajo hay cargado. IndexedDB no tiene
ese techo y además guarda el objeto tal cual, sin pasarlo por JSON.

### La separación de siempre

- `storage/projectSnapshot.ts` — **puro**: estado ↔ trabajo guardable, con
  validación. Se testea sin navegador.
- `storage/projectStore.ts` — **[DOM]**: IndexedDB, y nada más.

### Validar al leer no es paranoia

Lo guardado puede venir de una versión vieja (el modelo cambió bastante: la
rotación pasó de `0 | 90` a cualquier ángulo), de un guardado a medias o de algo
tocado a mano. `fromSnapshot()` valida campo por campo y además chequea
**integridad referencial**: una variante que apunta a un diseño inexistente, o
una pieza a una variante inexistente, dejarían piezas imposibles de dibujar.

Ante la menor duda **descarta todo y arranca limpio**: perder un trabajo es
malo, pero una app que no abre es peor. Lo que sí tolera: campos que no existían
antes (caen al valor por defecto) y una config incompleta (se mezcla sobre
`DEFAULT_CONFIG`).

### Tres detalles que hacen que funcione

1. **No se guarda nada hasta terminar de retomar.** Si no, el estado vacío del
   arranque pisaría el trabajo guardado antes de poder leerlo.
2. **Las formas se vuelven a analizar ANTES de publicar los diseños en el
   estado.** El análisis vive en una caché fuera de React, así que al retomar
   está vacía; si los diseños entraran primero, el acomodado por formas y el
   panel de forma se quedarían sin datos hasta volver a subir el archivo.
3. **El efecto de autoguardado no depende de `status`, aunque lo cambie.** Si
   dependiera, cada guardado dispararía otro y quedaría escribiendo para
   siempre. Es un bug que apareció al escribirlo y se corrigió ahí mismo.

**El historial de deshacer NO se guarda.** Retomar un trabajo arranca con el
historial limpio: "deshacer" el haber abierto la app no significa nada.

---

## Formatos de entrada y resolución

### Aceptar JPG no pidió un conversor

Se aceptan **PNG, JPG y WebP** (`ACCEPTED_IMAGE_TYPES` en `lib/image.ts`).

Todo lo que viene después de leer el archivo —muestrear la forma, quitar el
fondo, dibujar en Konva, exportar— pasa por `new Image()` y canvas, a los que no
les importa el formato de origen; y la exportación genera PNG siempre. Aceptar
JPG fue cambiar el `accept` del input, no escribir un conversor.

**Convertir un JPG a PNG no le da transparencia.** Un JPEG no tiene canal alfa:
pasarlo a PNG deja un PNG con fondo opaco. Lo que lo vuelve usable es
"Quitar borde", que ya existía.

### Un archivo opaco arranca en 'border'

Si `geometry.isOpaque`, el diseño nace con `backgroundMode: 'border'` en vez de
`'none'`. Un JPG siempre es opaco, y con `'none'` se imprimiría como un
rectángulo con fondo: nunca es lo que se quiere en una calcomanía. Queda a un
clic de "Dejar" y el encabezado plegado muestra siempre el modo, así que no
esconde nada.

Es seguro con una imagen de fondo oscuro: ahí el relleno desde el borde no
alcanza nada y el resultado es igual que `'none'`.

### Lo que midió el JPG real del negocio (1025 × 957, logo de una pollería)

| Modo | Tinta | Qué pasa |
|---|---|---|
| Dejar | 100% | el rectángulo blanco entero |
| **Quitar borde** | **74.2%** | el logo con su blanco interior intacto |
| Quitar blanco | 43.7% | **le borra el cuerpo del pollo y las letras** |

Ese archivo es el caso de manual de por qué "Quitar blanco" es por diseño y
explícito: casi la mitad de su tinta ES blanca y es contenido.

La suciedad que deja el JPEG tras quitar el borde: 24 manchitas que suman 42 px
sobre 981.000 (**0.004%**). La rampa de `whiteness()` ya las absorbe, así que
**no hizo falta tocar el umbral** — la sospecha de que el ringing del JPEG
obligaría a recalibrar no se confirmó. Está medido sobre UN archivo; si aparece
uno peor (WhatsApp, muy comprimido), la perilla ya existe: `whiteThreshold` y
`whiteSoftness` son parámetros de `analyzeDesign`.

### Aviso de resolución, no escalado

`lib/resolution.ts`, puro. `dpi = pxUtiles / (widthCm / 2.54)`, donde `pxUtiles`
descuenta el margen que no se dibuja (`contentFraction.width`). Por debajo de
**150 DPI** (`MIN_PRINT_DPI`) la fila de la variante avisa, y el ancho máximo
que sí llega es un botón que lo aplica.

El logo de 1025 px: a 10 cm son 260 DPI, a 25 cm son 104. Tope a 150: 17.3 cm.

**Por qué avisar y no escalar:** interpolar agranda sin agregar detalle — es lo
que ya hace la impresora sola. Escalar de verdad pide un modelo de IA: o manda
los logos de los clientes a un tercero, o mete decenas de MB en el navegador.
Vectorizar (trazar a SVG) sí daría resolución infinita y es client-side, pero
solo sirve para arte plano de 1 o 2 colores y es una fase entera. Queda abierto.

---

## Exportación PNG (Fase 7)

`exportLayoutToPng()` en `src/export/exportPng.ts`. Tres reglas que no se rompen:

1. **El PNG sale transparente.** `previewBackground` es solo ayuda de pantalla;
   nunca se dibuja en el archivo.
2. **Se dibuja igual que en el canvas:** trasladar al centro de la pieza, rotar,
   dibujar centrado, usando la MISMA `contentDrawRect()` que `PieceShape`.
   Compartir esa función es lo que garantiza que el PNG coincida con lo que se
   ve — y es la lección del bug de los 2.53 cm, que vino justamente de tener dos
   cálculos distintos. Hay un test de la invariante en `geometry.test.ts`.
3. **El fondo se vuelve a quitar a resolución de impresión**, no a la de
   pantalla (`renderWithoutBackground` acepta `maxPx`).

**Resolución justa, no máxima.** Cada diseño se procesa a la resolución que pide
la pieza más grande que lo usa: si un archivo de 3000 px se imprime a 10 cm y
300 DPI, solo hacen falta 1181. Procesar siempre a resolución completa sería
tirar trabajo, sobre todo con el flood fill del modo 'border'.

### El techo del navegador

Un canvas no puede tener lados de más de **16384 px** (Chrome/Firefox) y por
memoria conviene no pasar de **~100 megapíxeles** (cada píxel son 4 bytes: 100 MP
ya son 400 MB solo para el bitmap). Pasado el límite, el canvas queda **en blanco
sin avisar**, que es el peor fallo posible.

Por eso `exportBlocker()` chequea ANTES de intentar y devuelve un mensaje con una
sugerencia concreta:

> A 300 DPI el PNG mediría 6850 × 15945 px (109.2 MP), demasiado para el
> navegador. Probá con 150 DPI.

Un trabajo de 58 × 135 cm a 300 DPI no entra. La solución real sería exportar por
partes (varios PNG), y es post-MVP.

---

## Nesting por forma real (en curso)

Objetivo: dejar de tratar cada diseño como un rectángulo y acomodar según su
forma visible, para gastar menos material.

### Lo que midieron los archivos reales del negocio

| | Insignia circular | Lettering |
|---|---|---|
| Formato | Grises, **sin canal alfa** | RGBA |
| Píxeles visibles | 100% | 41.6% |
| Recorte de margen | 0% | 0% (ya viene al ras) |
| Tras quitar el fondo | huella = **45%** del archivo | huella = 45% del box |
| Hueco interior | 39.7%, pero el cuadrado más grande es 0.84 cm a 10 cm | 2.1% |

Tres conclusiones que ordenaron el plan:

1. **La insignia no tiene transparencia**: hoy se imprimiría como un cuadrado
   blanco. Es un error de producción, no de aprovechamiento, y por eso el
   tratamiento del fondo va PRIMERO: sin él, ese diseño no gana nada con nada.
2. **El recorte de margen transparente no sirve** para estos archivos (los dos
   vienen al ras). Se mantiene como red de seguridad, no como la gran ganancia.
3. **El hueco interior de la insignia es inservible**: está picado por el trébol
   y las letras. Medirlo con el cuadrado más grande (no el rectángulo de mayor
   área) es lo que lo dejó en evidencia.

### Las dos máscaras (no confundirlas)

- **Tinta** (`geometry.ink`): lo que se imprime. Manda al exportar.
- **Huella** (`geometry.footprint`): el espacio físico que ocupa. Es la tinta
  con los huecos ENCERRADOS rellenados. Manda al acomodar y al medir separación.

Se rellenan los huecos porque una pieza metida adentro del aro de una insignia
no se puede separar al cortar. Se puede habilitar por diseño
(`allowInteriorNesting`), y el panel muestra el tamaño del hueco en cm para que
la decisión no sea a ciegas.

### Tratamiento del fondo

`Design.backgroundMode`: `none` | `border` | `white`.

- `border` quita solo el blanco **pegado al borde** (flood fill). Conserva los
  blancos interiores: un disco con relleno blanco queda entero.
- `white` quita **todo** el blanco. Lo necesita un line art donde el blanco no se
  imprime, pero borra blancos intencionales (base blanca para telas oscuras,
  texto blanco). Por eso es por diseño, explícito y con vista previa.

**Nunca se toca el archivo.** `imageDataUrl` guarda siempre el PNG original; el
modo es un parámetro y el alpha se recalcula: en baja resolución para geometría,
y a resolución completa al exportar (pendiente, Fase 7).

### Colisión en dos niveles (etapa 3)

`validateLayout(pieces, config, shapeOf?)`. **Sin el tercer parámetro, el
comportamiento de siempre, bit a bit** — por eso los tests anteriores siguieron
pasando sin tocarlos.

1. **Nivel 1 (barato):** si los rectángulos inflados en `gap/2` ni se tocan, no
   hay nada que mirar. La mayoría de los pares muere acá.
2. **Nivel 2:** recién ahí se comparan las máscaras. La cruda detecta solapes
   reales; la dilatada, separación insuficiente.

**Cuándo se cae al rectángulo** (y no es un bug, es el diseño): si el diseño no
tiene muestra analizada, o si la pieza está rotada un ángulo que no es múltiplo
de 90 (`quarterTurnsOf` devuelve null). Rotar una máscara un ángulo libre
obligaría a rasterizarla de nuevo con interpolación; el rectángulo es
conservador y ya está hecho.

**En qué dirección se equivoca:** el remuestreo redondea hacia afuera, así que
la máscara es un superconjunto de la forma. Si las máscaras NO se tocan, las
formas seguro que no. Si se tocan, puede ser un falso positivo. O sea: avisa de
más, nunca de menos.

**Dónde se cachean las máscaras:** `useShapeLookup` las guarda en un Map a nivel
de módulo, porque el lienzo y la barra de métricas validan por separado y si
cada uno tuviera su caché se construiría todo dos veces. La clave incluye todo
lo que cambia la forma (tamaño, rotación, precision, gap, modo de fondo), así
que se invalida sola.

### El blanco sellado entre dos trazos (bug de la cuña)

`border` conserva el blanco que el relleno desde el borde no alcanza. Eso es lo
correcto para el relleno de una insignia, y **mal** para la cuña que queda
atrapada entre dos letras cuyos contornos casi se tocan: eso es fondo, se ve
sobre lienzo oscuro y **se imprime como tinta blanca**.

Lo distingue el **grosor del sello**, no el tamaño. Medido sobre el logo de una
pollería (1025 × 957):

| Adelgazando la barrera k px | regiones encerradas | la cuña |
|---|---|---|
| 0–2 | 34 | **queda** |
| **3–5** | 33 | **eliminada, y nada más** |
| 8 | 23 | eliminada, pero se come 11 regiones legítimas |

**Por tamaño no se puede separar, está medido:** la cuña tenía 25 px de grosor
y las letras de "J. DE GARAY 2565" entre 11 y 15. Cualquier umbral por área o
por grosor borraría texto real.

`reachableBackground()` (`lib/designMask.ts`) adelgaza la barrera en
`SEALED_BARRIER_FRACTION` (0.004 del lado menor) y vuelve a preguntar qué se
alcanza. Es **relativo** a propósito: 4 px en el render de 1025, 2 px en la
muestra de 512, 12 px al exportar a 3000. Las dos resoluciones dan el mismo
0.61% de blanco rescatado, que es la prueba de que la escala es la correcta.

**La guarda (`MAX_RESCUED_SHARE`, 25%)** es lo que lo vuelve seguro. En un
dibujo de línea fina, adelgazar atravesaría todos los trazos y vaciaría los
rellenos de una — justo lo que `border` existe para evitar. Si el rescate se
lleva más de un cuarto del blanco encerrado, no se aplica nada. En el logo real
rescata el 0.61%; en un line art rescataría casi el 100% y la guarda frena.

**Nunca puede borrar un trazo:** solo suma celdas que ya eran blancas.

`erode()` en `lib/mask.ts` es el dual de `dilate()`, con una diferencia: NO
agranda la grilla, así que el borde también se come. Usa una transformada de
distancia de dos pasadas, así el costo no depende del radio.

### Dos trampas que ya costaron un bug (no repetirlas)

**1. El canvas tiene que dibujar el CONTENIDO, no la imagen.** La máscara se
construye del content box y supone que el dibujo llena el rectángulo de la
pieza. Si el canvas dibuja la imagen entera escalada a ese rectángulo, el dibujo
sale más chico y la validación no coincide con lo que se ve. En la insignia con
el fondo quitado el desfasaje medido era de **2.53 cm sobre 10**: las piezas se
veían separadas y se marcaban en rojo.

`PieceShape` recibe `contentFraction` y escala/corre la imagen para que el
contenido calce exacto. **La exportación (Fase 7) tiene que hacer lo mismo.**

**2. Quitar el fondo con un umbral duro deja un halo.** Los bordes suavizados
valen 230-244, no llegan al umbral y sobreviven enteros: se ven como suciedad
blanca. La solución es una rampa (`whiteness()`): por encima del umbral es
fondo completo, por debajo del umbral menos `softness` es contenido intacto, y
en el medio se descuenta en forma proporcional.

La MISMA función `whiteness()` decide la forma (`designMask`) y lo que se dibuja
(`imageSample`). Si cada uno usara su criterio, la máscara y la imagen dirían
cosas distintas sobre el mismo píxel.

### Cómo acomoda por forma (etapa 4)

No usa comparación de máscara contra máscara. Mantiene un **perfil de columnas**
del lienzo (`heights[c]` = primera fila libre de esa columna) y para probar una
pieza en la columna x alcanza con:

```
y = max sobre las columnas c de ( heights[x+c] - perfilPieza[c] )
```

Ese `y` es **demostrablemente** libre de choque: toda celda de la pieza queda
por debajo de todo lo ocupado en su misma columna. Como el perfil de la pieza
sigue su contorno, una forma curva se acomoda sobre otra en vez de apoyarse en
su rectángulo. Cuesta O(ancho de la pieza) por posición: no hace falta ni un
solo test de máscara, así que es muy rápido.

**Las cuevas.** El perfil no ve los huecos que quedan ARRIBA de algo ya
colocado: el espacio entre dos discos, el de adentro de una curva. Son reales y
grandes. Medido con 14 piezas de 14×14 (discos) + 7 de 5×5:

| | Primera chica | Alto total |
|---|---|---|
| Solo perfil | y = 38.1 cm | 54.3 cm |
| **Con búsqueda en cuevas** | **y = 14.1 cm** | **51.3 cm** |
| Óptimo real (fuerza bruta) | y = 13.6 cm | — |
| Por rectángulos | — | 56.7 cm |

51.3 cm es exactamente el alto de los 14 discos solos: las chicas entran en los
huecos **sin estirar el lienzo**. Contra rectángulos, 9.5% menos material.

Por eso se mantiene TAMBIÉN la ocupación en bits, y cuando el lugar que dice el
perfil **haría crecer el lienzo**, se busca antes un hueco más arriba
(`probeAbove`). Esa condición es la clave del costo: buscar siempre sería
carísimo, pero solo importa cuando está en juego el alto final.

La búsqueda va de arriba hacia abajo con pasos gruesos (un cuarto de la pieza) y
después afina. **No es exhaustiva a propósito**, y tiene un tope de 4000 pruebas
por pieza: si no encuentra nada, se usa el lugar del perfil, que siempre es
válido. Nunca puede dar un layout inválido, solo uno menos bueno.

Costo medido: 21 piezas en 20 ms, 100 piezas en 36 ms.

### Varias estrategias, nos quedamos con la mejor

**Ninguna heurística gana siempre.** Medido sobre tres trabajos distintos, en el
mixto ganó ordenar por lado mayor buscando huecos siempre; en otros, por área.
Y con formas macizas y alargadas, el acomodado por forma **perdía** contra
MaxRects (109.7 vs 108.5 cm).

Por eso `pack()` en modo 'shape' corre tres variantes por forma **y también la
rectangular**, y devuelve la de menor altura. Incluir la rectangular de
candidata es lo que garantiza que el modo Formas **nunca** dé un resultado peor
que el método de siempre; hay un test que lo verifica en los tres trabajos.

Resultados medidos (82 piezas mixtas, 58 cm de ancho):

| Trabajo | Una estrategia, presupuesto 4000 | Multi-estrategia | vs Rectángulos |
|---|---|---|---|
| Mixto (82 piezas) | 143.2 cm | **135.6 cm** | 7.9% menos |
| Solo discos | 119.7 cm | **117.6 cm** | 9.2% menos |
| Alargados macizos | 109.7 cm | **108.5 cm** | 0.0% (ya no pierde) |

Costo: 54-89 ms para correr las cuatro. La cota teórica del mixto (área pura /
ancho) es 110.7 cm, así que todavía queda ~18% de desperdicio: es lo propio de
un greedy con formas redondas, no un bug.

**Si falta la máscara de un diseño**, se arma un rectángulo macizo y esa pieza
se comporta como antes, en vez de quedar sin colocar.

### Cuidado con cellCm contra gapCm

El `padding` de la máscara es `ceil(gapCm / 2 / cellCm)` **celdas enteras**. Con
`cellCm` 0.1 y `gapCm` 0.2 da 1 celda = exactamente gap/2. Pero con `cellCm`
0.2 daría también 1 celda = 2 mm por lado, o sea **el doble** de separación, y el
acomodado por formas arrancaría perdiendo contra el rectangular. Un test lo
encontró al fallar. Si alguna vez se expone `cellCm` en la UI, hay que avisar
de esto o limitar los valores a divisores de `gapCm / 2`.

### Etapas

| # | Etapa | Estado |
|---|---|---|
| 1 | Análisis de alpha, fondo, dos máscaras, content box | **Hecha** |
| 2 | Máscaras a bitsets + dilatación por el gap | **Hecha** |
| 3 | Colisión en dos niveles (AABB, después máscara) | **Hecha** |
| 4 | `packRaster` tras un selector de modo | **Hecha** |
| 5 | Comparación medida contra el packing rectangular | pendiente |

El algoritmo rectangular **no se toca** hasta que la comparación demuestre que
el nuevo rinde mejor. `pack()` y `validateLayout()` van a recibir las máscaras
como tercer parámetro OPCIONAL: sin él, el comportamiento actual intacto.

### Rendimiento (medido en la etapa 2)

Grilla de 1 mm sobre 58 cm = 580 columnas. Pieza típica de 10 x 7 cm = 102 x 72
celdas con la dilatación. Midiendo 47.800 pruebas de posición (100 piezas x 478
posiciones):

| Escenario | Tiempo | Por posición |
|---|---|---|
| Peor caso (lienzo vacío: sin choque, recorre todo) | 102 ms | 2.1 µs |
| Choque temprano (corta apenas encuentra uno) | 13 ms | 0.3 µs |

Un trabajo real cae en el medio, así que el botón Optimizar debería responder
en bastante menos de 100 ms. `overlapsAt` saca el cálculo de índices fuera del
bucle interno (el desfasaje dentro de la palabra es el mismo para toda la
máscara): eso solo bajó el peor caso de 148 a 102 ms.

Sin bitsets, cada prueba compararía 7.000 celdas sueltas en vez de 288 palabras:
~25x más. Por eso acá los bitsets no son optimización prematura sino requisito.
A 300 DPI la grilla tendría 40 millones de celdas, 100-1000x el costo para una
precisión que ningún plotter aprovecha.

**Dónde vive cada representación:** lo que se hace UNA vez por diseño (recortar,
rotar, dilatar, rellenar huecos) usa `Mask`, de un byte por celda, que se lee y
se testea fácil. Solo el camino caliente de colisiones usa bits.

**Implicación de rasterizar:** las celdas se redondean hacia afuera (conservador),
así que la separación real queda **>= gap**, y hasta gap + 2 celdas en el peor
caso. Con celdas de 1 mm y gap de 2 mm, dos piezas pueden terminar a 4 mm.

---

## Plan de fases

**Completadas:** Fase 1 (análisis), 2 (scaffold + layout), 3 (carga de diseños y
variantes), 4 (motor de packing + tests), 5 (visualización con Konva), 6 (edición
manual + undo/redo + validaciones).

**Ajustes extra pedidos después de la Fase 6** (ya aplicados): ancho de lienzo
fijo en 58 cm; proporción automática ancho/alto por variante; fondo de lienzo
Blanco/Negro/personalizado con paleta y cuentagotas; rotación libre con tirador
de arrastre y atajos de 90°/180°; selección múltiple con Ctrl+clic.

**Lo que falta:**

- **Fase 7 — Exportación PNG.** Render offscreen con DPI configurable. PNG
  transparente. *Entregable: el PNG descargado coincide con el layout en pantalla.*

- **Fase 8 — Testing con casos reales.** Trabajos reales del negocio. Medir
  velocidad, aprovechamiento, calidad del PNG.

---

## Casos de test del motor de packing (Fase 4)

1. 10 piezas de 5×5 cm en lienzo de 58 cm.
2. Piezas de tamaños diferentes.
3. Muchas unidades de una pieza pequeña.
4. Piezas que necesitan rotación para mejor distribución.
5. Combinación que casi llena exactamente el ancho.
6. Un mismo diseño con varias variantes (ej: 5× 25×15 + 20× 8×5).
7. Varios diseños, cada uno con varias variantes.

**Validar en cada caso:** sin solapamientos; todo dentro de límites; cantidades
exactas; dimensiones correctas; rotaciones válidas; separación mínima respetada;
altura calculada correctamente; `variantId` correcto por pieza.

Están en `src/packing/pack.test.ts`, con un validador reutilizable que chequea
todos los invariantes. `validate.test.ts` agrega el test más valioso: que el
output del packing **siempre** pase `validateLayout()`.

---

## Qué NO construir todavía (fuera del MVP)

Integración con impresoras, drivers, RIP, perfiles ICC, control de color, conexión
con proveedores, cuentas de usuario, autenticación, pagos, base de datos, historial
online, marketplace, gestión de clientes/pedidos, facturación, IA generativa,
análisis avanzado de imágenes, nesting por formas irregulares.

Post-MVP cercano (NO ahora): guardar/cargar proyectos (localStorage), bounding box
por alpha, múltiples heurísticas de packing, vectorizar logos planos a SVG,
otros anchos de lienzo, plantillas, redimensionar piezas desde el lienzo,
arrastre de grupo con preview en vivo, validación exacta de rectángulos rotados.

---

## Convenciones de código

- Componentes en PascalCase, un componente por archivo.
- Medidas de dominio siempre en cm; nombrar variables con sufijo de unidad cuando
  ayude (`widthCm`, `widthPx`).
- Texto de cara al usuario en español con voseo; comentarios de código en español.
- Empty states y errores que orientan la acción, no decorativos.
- La lógica pura (packing, geometría, métricas, validación, reducer) va en módulos
  sin React y CON tests. La UI no calcula reglas de dominio.
- Mantener este CLAUDE.md actualizado al cerrar cada fase.
