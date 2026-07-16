// Selector de vista (Fase 7). Sin cuentas. Filtra la presentación, no la estructura.

import { VISTAS, type Vista } from '../vistas'

interface Props {
  vista: Vista
  onCambio: (v: Vista) => void
}

export default function SelectorVista({ vista, onCambio }: Props) {
  return (
    <div className="selector-vista" role="group" aria-label="Vista">
      {VISTAS.map((v) => (
        <button
          key={v.id}
          aria-pressed={v.id === vista}
          onClick={() => onCambio(v.id)}
        >
          {v.nombre}
        </button>
      ))}
    </div>
  )
}
