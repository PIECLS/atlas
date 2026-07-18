// Orquestador de la Capa 3. El mapa vive detrás; la cabecera y la vista de nodo
// flotan encima. Navegación por estado (+ hash manual, sin router).

import { useCallback, useEffect, useMemo, useState } from 'react'
import MapaAtlas from './graph/MapaAtlas'
import VistaNodo from './components/VistaNodo'
import SelectorVista from './components/SelectorVista'
import BuscadorOA, { OARotulo } from './components/BuscadorOA'
import { atlas, getNodo, getOA } from './data/loadAtlas'
import { nivelCamara, PISTA_NIVEL } from './graph/zoom'
import { defVista, type Vista } from './vistas'

export default function App() {
  const [vista, setVista] = useState<Vista>('profesor')
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [foco, setFoco] = useState<{ id: string; nonce: number } | null>(null)
  const [oaActivo, setOaActivo] = useState<string | null>(null)
  const [ratio, setRatio] = useState(1)

  // Resaltado por OA y selección de nodo son estados mutuamente excluyentes.
  const seleccionar = useCallback((id: string | null) => {
    setSeleccion(id)
    if (id) setOaActivo(null)
  }, [])

  const activarOA = useCallback((codigo: string) => {
    setOaActivo(codigo)
    setSeleccion(null)
    setAbierto(null)
  }, [])

  // Hash manual: #nodo/<id> abre la vista de nodo (deep-linkable, sin router).
  useEffect(() => {
    const aplicarHash = () => {
      const m = location.hash.match(/^#nodo\/([a-z0-9_]+)$/)
      if (m && getNodo(m[1])) {
        setAbierto(m[1])
        setSeleccion(m[1])
        setOaActivo(null)
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
    setOaActivo(null)
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
    setOaActivo(null)
    setFoco({ id, nonce: Date.now() })
    history.replaceState(null, '', location.pathname + location.search)
  }, [])

  const oa = useMemo(() => {
    if (!oaActivo) return null
    const e = getOA(oaActivo)
    return e ? { codigo: e.codigo, nodos: e.nodos } : null
  }, [oaActivo])

  const nivel = nivelCamara(ratio)
  const def = defVista(vista)
  const mostrarBuscador = vista !== 'estudiante'

  return (
    <div className="app">
      <MapaAtlas
        seleccion={seleccion}
        onSeleccion={seleccionar}
        onAbrir={abrir}
        foco={foco}
        oa={oa}
        onRatio={setRatio}
      />

      <header className="cabecera">
        <div className="marca">
          <b>Atlas del Conocimiento</b>
          <span>
            {atlas.dominio.nombre} · hipótesis estructural v{atlas.atlas_version}
          </span>
        </div>
        {mostrarBuscador && (
          <BuscadorOA
            oaActivo={oaActivo}
            onSelect={activarOA}
            onClear={() => setOaActivo(null)}
          />
        )}
        <SelectorVista vista={vista} onCambio={setVista} />
      </header>

      {mostrarBuscador && oaActivo && (
        <OARotulo codigo={oaActivo} mostrarDistribucion={def.muestraPropiedades} />
      )}

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
