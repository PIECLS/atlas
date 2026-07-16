// Zoom semántico (Fase 3). El ratio de la cámara decide qué nivel se revela.
// En Sigma, ratio grande = alejado; ratio pequeño = acercado.
// Las transiciones son fundidos (alfa continuo), nunca apariciones bruscas.

export type NivelCamara = 'lejano' | 'medio' | 'cercano'

// Centros de transición sobre el ratio de cámara.
const T_LEJANO_MEDIO = 1.5 // aparecen los conceptos (nivel 2)
const T_MEDIO_CERCANO = 0.6 // aparecen los microconocimientos (nivel 3)

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Sube de 0 a 1 a medida que el ratio DISMINUYE al cruzar `centro`.
function apareceAlAcercar(ratio: number, centro: number, ancho: number): number {
  return 1 - smoothstep(centro - ancho, centro + ancho, ratio)
}

/** Opacidad objetivo de un nivel de zoom (1,2,3) para un ratio de cámara dado. */
export function alphaNivel(nivel: number, ratio: number): number {
  switch (nivel) {
    case 1:
      // Dominios: plenos de lejos; se difuminan a niebla al acercarse (no desaparecen del todo).
      return 0.12 + 0.88 * smoothstep(0.4, 0.85, ratio)
    case 2:
      return apareceAlAcercar(ratio, T_LEJANO_MEDIO, 0.55)
    case 3:
      return apareceAlAcercar(ratio, T_MEDIO_CERCANO, 0.28)
    default:
      return 1
  }
}

export function nivelCamara(ratio: number): NivelCamara {
  if (ratio >= T_LEJANO_MEDIO) return 'lejano'
  if (ratio >= T_MEDIO_CERCANO) return 'medio'
  return 'cercano'
}

export const PISTA_NIVEL: Record<NivelCamara, string> = {
  lejano: 'Dominios. Acércate para ver los conceptos.',
  medio: 'Conceptos. Sigue acercándote para los microconocimientos.',
  cercano: 'Microconocimientos. Doble clic en un nodo para abrirlo.',
}
