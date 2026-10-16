import { AppProvider } from './state/AppContext'
import { useProjectPersistence } from './hooks/useProjectPersistence'
import Toolbar from './components/layout/Toolbar'
import DesignPanel from './components/layout/DesignPanel'
import CanvasArea from './components/layout/CanvasArea'
import MetricsBar from './components/layout/MetricsBar'
import LogoMark from './components/ui/LogoMark'

/**
 * Composicion del layout: barra superior, cuerpo (panel izquierdo + canvas) y
 * barra inferior de metricas, todo dentro del AppProvider.
 *
 * El espacio de trabajo es un componente aparte porque la persistencia necesita
 * leer y escribir el estado global, asi que tiene que vivir ADENTRO del
 * provider.
 */
export default function App() {
  return (
    <AppProvider>
      <Workspace />
    </AppProvider>
  )
}

function Workspace() {
  const { ready, status, reset } = useProjectPersistence()

  // Mientras se busca el trabajo guardado no mostramos la app: si no, se veria
  // un parpadeo de "todavia no hay disenos" antes de que aparezca el trabajo.
  if (!ready) return <Splash />

  return (
    <div className="flex h-full flex-col">
      <Toolbar saveStatus={status} onReset={reset} />
      <div className="flex min-h-0 flex-1">
        <DesignPanel />
        <CanvasArea />
      </div>
      <MetricsBar />
    </div>
  )
}

function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-canvas">
      <LogoMark size={32} />
      <p className="text-sm text-muted">Buscando tu último trabajo…</p>
    </div>
  )
}
