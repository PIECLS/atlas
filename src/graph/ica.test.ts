import { describe, it, expect } from 'vitest'
// @ts-expect-error — módulo .mjs sin tipos; se consume por su contrato de runtime.
import { calcularICA, R_MIN, R_MAX } from '../../tools/ica.mjs'

// Fixture mínima: cadena a->b->c (zoom 3), un nodo aislado d (zoom 3) y un
// nodo de región e (zoom 2) que debe quedar excluido del cálculo.
function nodos() {
  return [
    { id: 'a', nivel_zoom: 3 },
    { id: 'b', nivel_zoom: 3 },
    { id: 'c', nivel_zoom: 3 },
    { id: 'd', nivel_zoom: 3 }, // aislado: sin aristas
    { id: 'region_c', nivel_zoom: 2 }, // debe excluirse
  ]
}
function aristas() {
  return [
    { de: 'a', a: 'b' },
    { de: 'b', a: 'c' },
  ]
}

describe('calcularICA', () => {
  it('excluye los nodos de agregación (zoom !== 3)', () => {
    const ica = calcularICA(nodos(), aristas())
    expect(ica.has('region_c')).toBe(false)
    expect(ica.size).toBe(4)
  })

  it('un nodo aislado (sin descendientes ni tránsito) queda en R_MIN', () => {
    const ica = calcularICA(nodos(), aristas())
    expect(ica.get('d').radio).toBeCloseTo(R_MIN)
    expect(ica.get('d').ICA).toBe(0)
  })

  it('la hoja de la cadena (0 descendientes, 0 tránsito) queda en R_MIN', () => {
    const ica = calcularICA(nodos(), aristas())
    expect(ica.get('c').radio).toBeCloseTo(R_MIN)
  })

  it('betweenness corrige a favor del nodo-puente sobre el de mayor impacto bruto', () => {
    // a tiene el impacto máximo (2 descendientes) pero B=0 (nunca es intermediario).
    // b tiene menos impacto (1 descendiente) pero es el único puente a->c: B=1 (normalizado).
    // Con pesos 0.7/0.3, b debe superar a a en ICA — la demostración misma del ICA.
    const ica = calcularICA(nodos(), aristas())
    const a = ica.get('a')
    const b = ica.get('b')
    expect(a.I).toBeGreaterThan(b.I) // a tiene más impacto bruto
    expect(b.B).toBeGreaterThan(a.B) // b es el puente
    expect(b.ICA).toBeGreaterThan(a.ICA) // el peso de B basta para invertir el orden
  })

  it('el radio máximo alcanza exactamente R_MAX y todo cae en [R_MIN, R_MAX]', () => {
    const ica = calcularICA(nodos(), aristas())
    const radios = [...ica.values()].map((r) => r.radio)
    expect(Math.max(...radios)).toBeCloseTo(R_MAX)
    for (const r of radios) {
      expect(r).toBeGreaterThanOrEqual(R_MIN - 1e-9)
      expect(r).toBeLessThanOrEqual(R_MAX + 1e-9)
    }
  })

  it('un dataset sin aristas no produce NaN (todos los radios caen en R_MIN)', () => {
    const ica = calcularICA(nodos(), [])
    for (const r of ica.values()) {
      expect(Number.isNaN(r.radio)).toBe(false)
      expect(r.radio).toBeCloseTo(R_MIN)
    }
  })
})
