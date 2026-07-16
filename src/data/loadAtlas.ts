// Loader de la Capa 1. Importa el dataset (read-only en runtime, A5),
// construye el grafo de graphology y precomputa precedencias y clausura
// transitiva. El explorador LEE de aquí; nunca muta el dataset.

import Graph from 'graphology'
import datasetJson from '../../data/atlas.numero.json'
import type { Atlas, Nodo, Region, Arista } from '../types/atlas'

const atlas = datasetJson as unknown as Atlas

// ── Índices ──────────────────────────────────────────────────────────────
const nodos = new Map<string, Nodo>(atlas.nodos.map((n) => [n.id, n]))
const regiones = new Map<string, Region>((atlas.regiones ?? []).map((r) => [r.id, r]))

const succMap = new Map<string, string[]>()
const predMap = new Map<string, string[]>()
const hijosMap = new Map<string, string[]>() // agregación visual (padre)
for (const n of atlas.nodos) {
  succMap.set(n.id, [])
  predMap.set(n.id, [])
  hijosMap.set(n.id, [])
}
for (const { de, a } of atlas.aristas) {
  succMap.get(de)?.push(a)
  predMap.get(a)?.push(de)
}
for (const n of atlas.nodos) {
  if (n.padre && hijosMap.has(n.padre)) hijosMap.get(n.padre)!.push(n.id)
}

// ── Validación ligera en dev (la autoritativa es `npm run validate` / Fase 6) ──
if (import.meta.env.DEV) {
  const problemas: string[] = []
  const ids = new Set<string>()
  for (const n of atlas.nodos) {
    if (ids.has(n.id)) problemas.push(`id duplicado: ${n.id}`)
    ids.add(n.id)
  }
  for (const e of atlas.aristas) {
    if (!ids.has(e.de)) problemas.push(`arista de nodo inexistente: ${e.de}`)
    if (!ids.has(e.a)) problemas.push(`arista a nodo inexistente: ${e.a}`)
    if (e.clausula !== null && e.clausula !== undefined)
      problemas.push(`arista ${e.de}->${e.a}: clausula no-null (A1)`)
  }
  if (problemas.length)
    console.error('[Atlas] dataset con problemas:\n' + problemas.map((p) => '  · ' + p).join('\n'))
}

// ── Clausura transitiva (para iluminar ancestros/descendientes sin dibujarlos) ──
function cerrar(desde: string, mapa: Map<string, string[]>): Set<string> {
  const acc = new Set<string>()
  const cola = [...(mapa.get(desde) ?? [])]
  while (cola.length) {
    const x = cola.shift()!
    if (acc.has(x)) continue
    acc.add(x)
    for (const y of mapa.get(x) ?? []) cola.push(y)
  }
  return acc
}

const reachCache = new Map<string, Set<string>>()
const reachInvCache = new Map<string, Set<string>>()

/** Descendientes transitivos (conocimientos posteriores). No incluye a `id`. */
export function reach(id: string): Set<string> {
  if (!reachCache.has(id)) reachCache.set(id, cerrar(id, succMap))
  return reachCache.get(id)!
}

/** Ancestros transitivos (prerrequisitos). No incluye a `id`. */
export function reachInv(id: string): Set<string> {
  if (!reachInvCache.has(id)) reachInvCache.set(id, cerrar(id, predMap))
  return reachInvCache.get(id)!
}

export function pred(id: string): string[] {
  return predMap.get(id) ?? []
}
export function succ(id: string): string[] {
  return succMap.get(id) ?? []
}
export function hijos(id: string): string[] {
  return hijosMap.get(id) ?? []
}

// Tamaño del nodo según su nivel de zoom semántico (no según el grado).
const TAMANO_POR_ZOOM: Record<number, number> = { 1: 18, 2: 11, 3: 7 }

// ── Construcción del grafo de graphology (solo reducción transitiva, A6) ──
export function construirGrafo(): Graph {
  const g = new Graph({ type: 'directed', multi: false, allowSelfLoops: false })
  for (const n of atlas.nodos) {
    g.addNode(n.id, {
      label: n.nombre,
      x: n.coordenada?.x ?? 0,
      y: -(n.coordenada?.y ?? 0), // y del dataset crece hacia abajo; Sigma crece hacia arriba
      size: TAMANO_POR_ZOOM[n.nivel_zoom] ?? 7,
      region: n.region ?? null,
      nivelZoom: n.nivel_zoom,
      completitud: n.completitud,
      padre: n.padre ?? null,
    })
  }
  for (const e of atlas.aristas) {
    if (g.hasNode(e.de) && g.hasNode(e.a) && !g.hasEdge(e.de, e.a)) {
      g.addDirectedEdge(e.de, e.a, {
        justificacion: e.justificacion ?? '',
        confianza: e.confianza ?? 'hipotesis',
      })
    }
  }
  return g
}

export function getNodo(id: string): Nodo | undefined {
  return nodos.get(id)
}
export function getRegion(id: string | null | undefined): Region | undefined {
  return id ? regiones.get(id) : undefined
}
export function todasLasAristas(): Arista[] {
  return atlas.aristas
}

export { atlas, nodos, regiones }
