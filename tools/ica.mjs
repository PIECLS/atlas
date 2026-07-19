// Índice de Centralidad del Atlas (ICA). Capa 3, puramente visual — fija el
// tamaño de cada nodo (zoom 3) según su peso estructural. NO toca /data ni la
// estructura del grafo; se recalcula desde el dataset, nunca se persiste como
// propiedad epistémica.
//
//   ICA(n) = 0.70 · I(n) + 0.30 · B(n)
//   I(n)  = log(1+descendientes(n)) / log(1+max descendientes)   (impacto, log)
//   B(n)  = betweenness(n) / max betweenness                     (puente, lineal)
//   radio(n) = R_MIN + (R_MAX-R_MIN) · sqrt(ICA(n) / max ICA)    (área ~ ICA)
//
// Se calcula SOLO sobre nodos zoom 3 (microconocimientos) y SOLO sobre las
// aristas reales — ya son la reducción transitiva del dataset (A6) — nunca
// sobre las aristas inducidas de la Fase 3.5, que son una capa de agregación
// distinta. Los nodos "_c" (zoom 2, paraguas de región) se excluyen: no son
// conocimientos.

import Graph from 'graphology'
import betweennessCentrality from 'graphology-metrics/centrality/betweenness.js'

export const R_MIN = 8
export const R_MAX = 20

/**
 * @param {{id: string, nivel_zoom: number}[]} nodos
 * @param {{de: string, a: string}[]} aristas
 * @returns {Map<string, {impacto_bruto:number, I:number, B:number, ICA:number, radio:number}>}
 */
export function calcularICA(nodos, aristas) {
  const estructurales = nodos.filter((n) => n.nivel_zoom === 3)
  const ids = new Set(estructurales.map((n) => n.id))

  const g = new Graph({ type: 'directed', multi: false, allowSelfLoops: false })
  for (const n of estructurales) g.addNode(n.id)
  for (const e of aristas) {
    if (ids.has(e.de) && ids.has(e.a) && !g.hasEdge(e.de, e.a)) g.addDirectedEdge(e.de, e.a)
  }

  // Impacto: |descendientes| por BFS sobre aristas salientes (grafo reducido).
  const succ = new Map(estructurales.map((n) => [n.id, []]))
  for (const e of aristas) {
    if (ids.has(e.de) && ids.has(e.a)) succ.get(e.de).push(e.a)
  }
  function contarDescendientes(id) {
    const vistos = new Set()
    const cola = [...succ.get(id)]
    while (cola.length) {
      const x = cola.shift()
      if (vistos.has(x)) continue
      vistos.add(x)
      for (const y of succ.get(x) ?? []) cola.push(y)
    }
    return vistos.size
  }

  const impactoBruto = new Map(estructurales.map((n) => [n.id, contarDescendientes(n.id)]))
  const maxImpacto = Math.max(0, ...impactoBruto.values())

  const betweenness = betweennessCentrality(g, { normalized: true })
  const maxB = Math.max(0, ...Object.values(betweenness))

  const resultados = new Map()
  for (const n of estructurales) {
    const bruto = impactoBruto.get(n.id)
    const I = maxImpacto > 0 ? Math.log(1 + bruto) / Math.log(1 + maxImpacto) : 0
    const B = maxB > 0 ? (betweenness[n.id] ?? 0) / maxB : 0
    resultados.set(n.id, { impacto_bruto: bruto, I, B, ICA: 0.7 * I + 0.3 * B })
  }

  const maxICA = Math.max(0, ...[...resultados.values()].map((r) => r.ICA))
  for (const r of resultados.values()) {
    r.radio = maxICA > 0 ? R_MIN + (R_MAX - R_MIN) * Math.sqrt(r.ICA / maxICA) : R_MIN
  }

  return resultados
}
