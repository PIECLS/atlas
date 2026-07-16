// Vistas por usuario (Fase 7). Filtran la PRESENTACIÓN, jamás la estructura.
// El grafo es el mismo para todos.

export type Vista = 'profesor' | 'estudiante' | 'investigador' | 'pie'

export interface DefVista {
  id: Vista
  nombre: string
  /** Pestañas de la vista de nodo que esta vista enfatiza (orden = prioridad). */
  enfasis: string[]
  /** La vista investigador revela propiedades estructurales (n_estados, profundidad…). */
  muestraPropiedades: boolean
}

export const VISTAS: DefVista[] = [
  {
    id: 'profesor',
    nombre: 'Profesor',
    enfasis: [], // acceso completo, orden natural
    muestraPropiedades: false,
  },
  {
    id: 'estudiante',
    nombre: 'Estudiante',
    enfasis: ['representaciones', 'recursos'],
    muestraPropiedades: false,
  },
  {
    id: 'investigador',
    nombre: 'Investigador',
    enfasis: ['oa', 'evaluacion'],
    muestraPropiedades: true,
  },
  {
    id: 'pie',
    nombre: 'PIE',
    enfasis: ['errores', 'pie'],
    muestraPropiedades: false,
  },
]

export function defVista(v: Vista): DefVista {
  return VISTAS.find((x) => x.id === v) ?? VISTAS[0]
}
