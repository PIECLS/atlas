// Loader de la Capa 1. Importa el dataset (read-only en runtime, A5),
// construye el grafo de graphology y precomputa precedencias y clausura
// transitiva. El explorador LEE de aquí; nunca muta el dataset.

import Graph from 'graphology'
import datasetJson from '../../data/atlas.numero.json'
import type { Atlas, Nodo, Region, Arista } from '../types/atlas'
// @ts-expect-error — módulo .mjs sin tipos; se consume por su contrato de runtime.
import { calcularICA } from '../../tools/ica.mjs'

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

// ── Aristas inducidas (Fase 3.5) ─────────────────────────────────────────
// El zoom semántico debe AGREGAR la estructura, no esconderla (como Google Maps
// agrega calles en autopistas). Se derivan EN MEMORIA proyectando cada arista
// real hacia arriba por `padre` hasta el nivel mostrado. NO se escriben en /data
// (contaminaría la Capa 1); `padre` sigue sin ser prerrequisito.

export interface AristaInducida {
  de: string
  a: string
  nivel: number // nivel de zoom de los extremos agregados (1 o 2)
  peso: number // cuántas aristas reales la sustentan
  origen: { de: string; a: string }[]
}

// Sube por `padre` hasta el ancestro en `nivel`. null si no lo alcanza.
function ancestroEnNivel(id: string, nivel: number): string | null {
  let cur: string | null = id
  while (cur) {
    const n = nodos.get(cur)
    if (!n) return null
    if (n.nivel_zoom === nivel) return cur
    if (n.nivel_zoom < nivel) return null // ya pasamos el nivel: no hay ancestro ahí
    cur = n.padre ?? null
  }
  return null
}

function inducidasNivel(nivel: number): AristaInducida[] {
  const mapa = new Map<string, AristaInducida>()
  for (const e of atlas.aristas) {
    const pa = ancestroEnNivel(e.de, nivel)
    const pb = ancestroEnNivel(e.a, nivel)
    // extremos distintos = dependencia entre dominios; iguales = interna, se descarta
    if (!pa || !pb || pa === pb) continue
    const clave = `${pa}${pb}`
    let ind = mapa.get(clave)
    if (!ind) {
      ind = { de: pa, a: pb, nivel, peso: 0, origen: [] }
      mapa.set(clave, ind)
    }
    ind.peso++
    ind.origen.push({ de: e.de, a: e.a })
  }
  // Reducción transitiva sobre las inducidas de este nivel (A6): nada de spaghetti.
  // OJO: el grafo agregado puede tener CICLOS (p. ej. operaciones ↔ fracciones:
  // hay operaciones que requieren fracciones y fracciones que requieren
  // operaciones). La reducción transitiva solo está definida sobre un DAG, así que
  // se aplica sobre la CONDENSACIÓN (componentes fuertemente conexas):
  //   · las aristas internas de un ciclo se conservan (dependencia mutua real),
  //   · entre componentes distintas se reduce la implicación transitiva.
  const inducidas = [...mapa.values()]
  const succL = new Map<string, string[]>()
  const nodosL = new Set<string>()
  for (const ind of inducidas) {
    nodosL.add(ind.de)
    nodosL.add(ind.a)
    if (!succL.has(ind.de)) succL.set(ind.de, [])
    succL.get(ind.de)!.push(ind.a)
  }
  const alcanzables = (start: string, succ: Map<string, string[]>): Set<string> => {
    const acc = new Set<string>()
    const cola = [...(succ.get(start) ?? [])]
    while (cola.length) {
      const x = cola.shift()!
      if (acc.has(x)) continue
      acc.add(x)
      for (const y of succ.get(x) ?? []) cola.push(y)
    }
    return acc
  }
  // Componentes fuertemente conexas (a y b en el mismo ciclo si se alcanzan mutuamente).
  const comp = new Map<string, number>()
  const reachCacheL = new Map<string, Set<string>>()
  const reachL = (n: string) => {
    if (!reachCacheL.has(n)) reachCacheL.set(n, alcanzables(n, succL))
    return reachCacheL.get(n)!
  }
  let cid = 0
  for (const n of nodosL) {
    if (comp.has(n)) continue
    const fwd = reachL(n)
    const scc = new Set([n])
    for (const m of nodosL) {
      if (m !== n && fwd.has(m) && reachL(m).has(n)) scc.add(m)
    }
    for (const m of scc) comp.set(m, cid)
    cid++
  }
  // Condensación (DAG entre componentes) y su reducción transitiva.
  const condSucc = new Map<number, Set<number>>()
  for (const ind of inducidas) {
    const ca = comp.get(ind.de)!
    const cb = comp.get(ind.a)!
    if (ca === cb) continue
    if (!condSucc.has(ca)) condSucc.set(ca, new Set())
    condSucc.get(ca)!.add(cb)
  }
  const condSuccArr = new Map<number, number[]>()
  for (const [k, v] of condSucc) condSuccArr.set(k, [...v])
  const condRedundante = (ca: number, cb: number): boolean => {
    const cola = [...(condSuccArr.get(ca) ?? [])]
    const i = cola.indexOf(cb)
    if (i !== -1) cola.splice(i, 1)
    const visto = new Set<number>()
    while (cola.length) {
      const x = cola.shift()!
      if (x === cb) return true
      if (visto.has(x)) continue
      visto.add(x)
      for (const y of condSuccArr.get(x) ?? []) cola.push(y)
    }
    return false
  }
  return inducidas.filter((ind) => {
    const ca = comp.get(ind.de)!
    const cb = comp.get(ind.a)!
    if (ca === cb) return true // arista interna del ciclo: se conserva
    return !condRedundante(ca, cb) // entre componentes: reducción transitiva
  })
}

let _inducidas: AristaInducida[] | null = null
export function aristasInducidas(): AristaInducida[] {
  if (!_inducidas) _inducidas = [...inducidasNivel(2), ...inducidasNivel(1)]
  return _inducidas
}

// ── Índice de OA (Fase 4.5) ──────────────────────────────────────────────
// Códex curricular: qué nodos rinde cada OA. La demostración de que un OA NO es
// una unidad (A3) sino una agrupación de conocimientos.

export interface OAResumen {
  codigo: string
  curso?: string
  eje?: string
  texto?: string
  nodos: { id: string; cobertura?: string }[]
}

const oaIndex = new Map<string, OAResumen>()
const oaBlob = new Map<string, string>() // texto normalizado para búsqueda tolerante

const DIACRITICOS = /[̀-ͯ]/g
function normalizar(s: string): string {
  return s.normalize('NFD').replace(DIACRITICOS, '').toLowerCase().replace(/\s+/g, '')
}

for (const n of atlas.nodos) {
  for (const oa of n.metadatos?.oa_relacionados ?? []) {
    let e = oaIndex.get(oa.codigo)
    if (!e) {
      e = { codigo: oa.codigo, nodos: [] }
      oaIndex.set(oa.codigo, e)
    }
    e.nodos.push({ id: n.id, cobertura: oa.cobertura })
    if (!e.curso && oa.curso) e.curso = oa.curso
    if (!e.eje && oa.eje) e.eje = oa.eje
    if (!e.texto && oa.texto) e.texto = oa.texto
  }
}
// Blob de búsqueda: código + curso + texto del OA + nombres y definiciones de sus nodos.
for (const e of oaIndex.values()) {
  const partes = [e.codigo, e.curso ?? '', e.texto ?? '']
  for (const { id } of e.nodos) {
    const n = nodos.get(id)
    if (n) partes.push(n.nombre, n.metadatos?.definicion ?? '')
  }
  oaBlob.set(e.codigo, normalizar(partes.join(' ')))
}

export function getOA(codigo: string): OAResumen | undefined {
  return oaIndex.get(codigo)
}

/** Busca OA por código (exacto/parcial), o texto libre en OA y nodos. Tolerante. */
export function buscarOA(consulta: string): OAResumen[] {
  const q = normalizar(consulta)
  if (!q) return []
  const puntuadas: { e: OAResumen; score: number }[] = []
  for (const e of oaIndex.values()) {
    const code = normalizar(e.codigo)
    let score = -1
    if (code === q) score = 0
    else if (code.startsWith(q)) score = 1
    else if (code.includes(q)) score = 2
    else if ((oaBlob.get(e.codigo) ?? '').includes(q)) score = 3
    if (score >= 0) puntuadas.push({ e, score })
  }
  puntuadas.sort(
    (a, b) =>
      a.score - b.score ||
      b.e.nodos.length - a.e.nodos.length ||
      a.e.codigo.localeCompare(b.e.codigo),
  )
  return puntuadas.slice(0, 12).map((p) => p.e)
}

export function totalOA(): number {
  return oaIndex.size
}

// Tamaño de los nodos de agregación (zoom 1 dominio, zoom 2 concepto): fijo,
// no son "conocimientos" y quedan fuera del cálculo del ICA.
const TAMANO_AGREGACION: Record<number, number> = { 1: 18, 2: 11 }

// Índice de Centralidad del Atlas (tools/ica.mjs): tamaño de los nodos zoom 3
// (microconocimientos) según su peso estructural. Puramente visual — se
// recalcula del dataset, nunca se persiste (A5 solo aplica a x/y, no al radio).
interface FilaICA {
  impacto_bruto: number
  I: number
  B: number
  ICA: number
  radio: number
}
const icaPorId: Map<string, FilaICA> = calcularICA(atlas.nodos, atlas.aristas)

export function getICA(id: string): FilaICA | undefined {
  return icaPorId.get(id)
}

// ── Construcción del grafo de graphology (solo reducción transitiva, A6) ──
export function construirGrafo(): Graph {
  const g = new Graph({ type: 'directed', multi: false, allowSelfLoops: false })
  for (const n of atlas.nodos) {
    const size =
      n.nivel_zoom === 3
        ? (icaPorId.get(n.id)?.radio ?? 18)
        : (TAMANO_AGREGACION[n.nivel_zoom] ?? 18)
    g.addNode(n.id, {
      label: n.nombre,
      x: n.coordenada?.x ?? 0,
      y: -(n.coordenada?.y ?? 0), // y del dataset crece hacia abajo; Sigma crece hacia arriba
      size,
      // Guardamos el color_token (no el id de región): es lo que resuelve la paleta.
      region: regiones.get(n.region ?? '')?.color_token ?? null,
      nivelZoom: n.nivel_zoom,
      completitud: n.completitud,
      padre: n.padre ?? null,
    })
  }
  // Aristas reales (zoom 3): la reducción transitiva del dataset.
  for (const e of atlas.aristas) {
    if (g.hasNode(e.de) && g.hasNode(e.a) && !g.hasEdge(e.de, e.a)) {
      g.addDirectedEdge(e.de, e.a, {
        tipo: 'real',
        nivel: 3,
        justificacion: e.justificacion ?? '',
        confianza: e.confianza ?? 'hipotesis',
      })
    }
  }
  // Aristas inducidas (Fase 3.5): agregación de la estructura para el zoom lejano.
  // Se añaden una sola vez al construir; el reducer decide real/inducida por cámara.
  for (const ind of aristasInducidas()) {
    if (g.hasNode(ind.de) && g.hasNode(ind.a) && !g.hasEdge(ind.de, ind.a)) {
      g.addDirectedEdge(ind.de, ind.a, {
        tipo: 'inducida',
        nivel: ind.nivel,
        peso: ind.peso,
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
