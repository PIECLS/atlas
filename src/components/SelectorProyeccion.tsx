// Selector de proyección (Fase 3.6-B). Rima con A1: el rigor no está en no
// proyectar, sino en declarar la proyección. Se bloquea durante la transición
// para evitar animaciones encimadas.

import type { Proyeccion } from '../graph/MapaAtlas'

interface Props {
  proyeccion: Proyeccion
  onCambio: (p: Proyeccion) => void
  bloqueado: boolean
}

const OPCIONES: { id: Proyeccion; nombre: string }[] = [
  { id: 'capas', nombre: 'En capas' },
  { id: 'radial', nombre: 'Radial' },
]

export default function SelectorProyeccion({ proyeccion, onCambio, bloqueado }: Props) {
  return (
    <div className="selector-vista" role="group" aria-label="Proyección" aria-disabled={bloqueado}>
      {OPCIONES.map((o) => (
        <button
          key={o.id}
          aria-pressed={o.id === proyeccion}
          disabled={bloqueado}
          onClick={() => onCambio(o.id)}
        >
          {o.nombre}
        </button>
      ))}
    </div>
  )
}
