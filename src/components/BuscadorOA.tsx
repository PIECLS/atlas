// Buscador de OA (Fase 4.5). Puerta de entrada curricular: al elegir un OA se
// iluminan TODOS los conocimientos que lo componen — la demostración de que un
// OA no es una unidad, sino una agrupación (A3). No toca la estructura.

import { useEffect, useMemo, useRef, useState } from 'react'
import { buscarOA, getOA, type OAResumen } from '../data/loadAtlas'

interface Props {
  oaActivo: string | null
  onSelect: (codigo: string) => void
  onClear: () => void
}

export default function BuscadorOA({ oaActivo, onSelect, onClear }: Props) {
  const [query, setQuery] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const sugerencias = useMemo(() => (query.trim() ? buscarOA(query) : []), [query])

  // Si el OA activo se limpió desde fuera (p. ej. al seleccionar un nodo), vaciar.
  useEffect(() => {
    if (!oaActivo) setQuery('')
  }, [oaActivo])

  const elegir = (oa: OAResumen) => {
    onSelect(oa.codigo)
    setQuery(oa.codigo)
    setAbierto(false)
    inputRef.current?.blur()
  }

  const limpiar = () => {
    setQuery('')
    setAbierto(false)
    onClear()
  }

  const alTeclado = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      limpiar()
      inputRef.current?.blur()
      return
    }
    if (!sugerencias.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (c + 1) % sugerencias.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (c - 1 + sugerencias.length) % sugerencias.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      elegir(sugerencias[Math.min(cursor, sugerencias.length - 1)])
    }
  }

  return (
    <div className="buscador-oa">
      <span className="lupa" aria-hidden>
        ⌕
      </span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Buscar OA: MA01 OA 01, «contar»…"
        aria-label="Buscar Objetivo de Aprendizaje"
        onChange={(e) => {
          setQuery(e.target.value)
          setAbierto(true)
          setCursor(0)
        }}
        onFocus={() => query.trim() && setAbierto(true)}
        onKeyDown={alTeclado}
      />
      {(query || oaActivo) && (
        <button className="limpiar" onClick={limpiar} aria-label="Limpiar búsqueda">
          ✕
        </button>
      )}
      {abierto && sugerencias.length > 0 && (
        <div className="sugerencias" role="listbox">
          {sugerencias.map((oa, i) => (
            <button
              key={oa.codigo}
              role="option"
              aria-selected={i === cursor}
              onMouseEnter={() => setCursor(i)}
              onClick={() => elegir(oa)}
            >
              <span className="cod">{oa.codigo}</span>
              {oa.curso && <span className="curso">{oa.curso}</span>}
              <span className="cuenta-nodos">
                {oa.nodos.length} {oa.nodos.length === 1 ? 'nodo' : 'nodos'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Rótulo del OA activo, sobre el lienzo. Para investigador muestra la distribución
// de cobertura. La cuenta de conocimientos es el argumento del proyecto, hecho dato.
export function OARotulo({
  codigo,
  mostrarDistribucion,
}: {
  codigo: string
  mostrarDistribucion: boolean
}) {
  const oa = getOA(codigo)
  if (!oa) return null
  const n = oa.nodos.length
  const dist = { total: 0, parcial: 0, tangencial: 0 } as Record<string, number>
  for (const x of oa.nodos) if (x.cobertura) dist[x.cobertura] = (dist[x.cobertura] ?? 0) + 1

  return (
    <div className="oa-rotulo">
      <div className="linea1">
        <span className="cod">{oa.codigo}</span>
        {oa.curso && <span className="curso etiqueta">{oa.curso}</span>}
        <span className="cuenta">
          {n} {n === 1 ? 'conocimiento' : 'conocimientos'}
        </span>
      </div>
      {oa.texto && <p className="texto">{oa.texto}</p>}
      {mostrarDistribucion && (
        <div className="cobertura-dist">
          {(['total', 'parcial', 'tangencial'] as const).map((c) =>
            dist[c] ? (
              <span className="cobertura" key={c}>
                {c}: {dist[c]}
              </span>
            ) : null,
          )}
        </div>
      )}
    </div>
  )
}
