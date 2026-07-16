// Orquestador de la Capa 3. El mapa vive detrás; la cabecera y la vista de nodo
// flotan encima. Navegación por estado (+ hash manual, sin router).

import { useCallback, useEffect, useState } from 'react'
import MapaAtlas from './graph/MapaAtlas'
import VistaNodo from './components/VistaNodo'
import SelectorVista from './components/SelectorVista'
import { atlas, getNodo } from './data/loadAtlas'
import { nivelCamara, PISTA_NIVEL } from './graph/zoom'
import type { Vista } from './vistas'

export default function App() {
  const [vista, setVista] = useState<Vista>('profesor')
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [foco, setFoco] = useState<{ id: string; nonce: number } | null>(null)
  const [ratio, setRatio] = useState(1)

  // Hash manual: #nodo/<id> abre la vista de nodo (deep-linkable, sin router).
  useEffect(() => {
    const aplicarHash = () => {
      const m = location.hash.match(/^#nodo\/([a-z0-9_]+)$/)
      if (m && getNodo(m[1])) {
        setAbierto(m[1])
        setSeleccion(m[1])
      } else if (!location.hash) {
        setAbierto(null)
      }
    }
    aplicarHash()
    window.addEventListener('hashchange', aplicarHash)
    return () => window.removeEventListener('hashchange', aplicarHash)
  }, [])

  const abrir = useCallback((id: string) => {
    setAbierto(id)
    setSeleccion(id)
    history.replaceState(null, '', `#nodo/${id}`)
  }, [])

  const cerrar = useCallback(() => {
    setAbierto(null)
    history.replaceState(null, '', location.pathname + location.search)
  }, [])

  // Puente diagnóstico: navega el mapa a otro nodo y centra la cámara.
  const irANodo = useCallback((id: string) => {
    setAbierto(null)
    setSeleccion(id)
    setFoco({ id, nonce: Date.now() })
    history.replaceState(null, '', location.pathname + location.search)
  }, [])

  const nivel = nivelCamara(ratio)

  return (
    <div className="app">
      <MapaAtlas
        seleccion={seleccion}
        onSeleccion={setSeleccion}
        onAbrir={abrir}
        foco={foco}
        onRatio={setRatio}
      />

      <header className="cabecera">
        <div className="marca">
          <b>Atlas del Conocimiento</b>
          <span>
            {atlas.dominio.nombre} · hipótesis estructural v{atlas.atlas_version}
          </span>
        </div>
        <SelectorVista vista={vista} onCambio={setVista} />
      </header>

      <div className="pista">
        <b>Nivel: {nivel}</b>
        <br />
        {PISTA_NIVEL[nivel]}
      </div>

      <div className="leyenda">
        {(atlas.regiones ?? []).map((r) => (
          <div className="fila" key={r.id}>
            <span
              className="punto"
              style={{ background: `var(--${r.color_token ?? 'region-fallback'})` }}
            />
            {r.nombre}
          </div>
        ))}
      </div>

      {abierto && (
        <VistaNodo id={abierto} vista={vista} onCerrar={cerrar} onIrANodo={irANodo} />
      )}
    </div>
  )
}
