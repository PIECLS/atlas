// Herramienta de layout OFFLINE (Fase 5). NO es parte de la app (A5).
// Computa la geografía una vez y la escribe de vuelta al dataset como contenido.
//   y = profundidad en el orden parcial (longest path desde raíces) — de la
//       estructura, no del nivel escolar. Que correlacione con el curso es
//       consecuencia, no causa (A2).
//   x = banda por region.orden_x; dentro de la banda, baricentro estilo Sugiyama
//       para reducir cruces.
//   Respeta coordenada.fijada_a_mano: true (no la toca).
// Idempotente: correrla dos veces seguidas produce el mismo archivo.
//
// Uso:  node tools/layout.mjs        (escribe)
//       node tools/layout.mjs --check (falla si el archivo cambiaría)

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA = resolve(__dirname, '..', 'data', 'atlas.numero.json')

// — Métrica de la geografía (constantes editoriales, no del algoritmo) —
const BANDA_L2 = 110 // conceptos
const BANDA_L3 = 240 // microconocimientos (base, antes de sumar profundidad)
const UNIDAD_Y = 130 // separación vertical por nivel de profundidad
const SEP_REGION = 280 // separación horizontal entre territorios
const SEP_NODO = 96 // separación entre nodos del mismo territorio y capa
const SWEEPS = 8 // barridos de baricentro

const atlas = JSON.parse(readFileSync(RUTA, 'utf8'))

const nodos = atlas.nodos
const porId = new Map(nodos.map((n) => [n.id, n]))
const regionPorId = new Map((atlas.regiones ?? []).map((r) => [r.id, r]))

// — Precedencia (solo aristas; padre es agregación visual, no estructura) —
const pred = new Map(nodos.map((n) => [n.id, []]))
const succ = new Map(nodos.map((n) => [n.id, []]))
for (const { de, a } of atlas.aristas) {
  succ.get(de)?.push(a)
  pred.get(a)?.push(de)
}
const esEstructural = (id) => pred.get(id).length > 0 || succ.get(id).length > 0

// — Profundidad = longest path desde raíces (topológico de Kahn) —
function profundidades() {
  const prof = new Map(nodos.map((n) => [n.id, 0]))
  const gradoEntrada = new Map(nodos.map((n) => [n.id, pred.get(n.id).length]))
  const cola = nodos.filter((n) => gradoEntrada.get(n.id) === 0).map((n) => n.id)
  while (cola.length) {
    const u = cola.shift()
    for (const v of succ.get(u)) {
      prof.set(v, Math.max(prof.get(v), prof.get(u) + 1))
      gradoEntrada.set(v, gradoEntrada.get(v) - 1)
      if (gradoEntrada.get(v) === 0) cola.push(v)
    }
  }
  return prof
}

function yDe(nodo, prof) {
  if (nodo.nivel_zoom === 1) return 0
  if (nodo.nivel_zoom === 2) return BANDA_L2
  return BANDA_L3 + prof.get(nodo.id) * UNIDAD_Y
}

function centroRegion(regionId) {
  const r = regionPorId.get(regionId)
  return (r?.orden_x ?? 0) * SEP_REGION
}

function media(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function calcular() {
  const prof = profundidades()
  const fijada = (n) => n.coordenada?.fijada_a_mano === true

  // y: de la estructura (salvo las fijadas a mano).
  const yMap = new Map()
  for (const n of nodos) yMap.set(n.id, fijada(n) ? n.coordenada.y : yDe(n, prof))

  // x inicial: centro del territorio (las fijadas conservan su x).
  const xMap = new Map()
  for (const n of nodos)
    xMap.set(n.id, fijada(n) ? n.coordenada.x : centroRegion(n.region))

  // Nodos estructurales/hoja (zoom 3) por bucket (region @ y): baricentro.
  const buckets = new Map()
  for (const n of nodos) {
    if (n.nivel_zoom !== 3 || fijada(n)) continue
    const clave = `${n.region}@${yMap.get(n.id)}`
    if (!buckets.has(clave)) buckets.set(clave, [])
    buckets.get(clave).push(n.id)
  }

  for (let s = 0; s < SWEEPS; s++) {
    for (const [, ids] of buckets) {
      const bary = (id) => {
        const vecinos = [...pred.get(id), ...succ.get(id)]
        return vecinos.length ? media(vecinos.map((v) => xMap.get(v))) : xMap.get(id)
      }
      // Orden estable: por baricentro, desempatando por id (idempotencia).
      ids.sort((a, b) => bary(a) - bary(b) || (a < b ? -1 : a > b ? 1 : 0))
      const centro = centroRegion(porId.get(ids[0]).region)
      ids.forEach((id, i) => {
        xMap.set(id, centro + (i - (ids.length - 1) / 2) * SEP_NODO)
      })
    }
  }

  // Contenedores (zoom 1/2): x = baricentro de sus hijos (agregación visual).
  const hijos = new Map(nodos.map((n) => [n.id, []]))
  for (const n of nodos) if (n.padre && hijos.has(n.padre)) hijos.get(n.padre).push(n.id)
  // De abajo hacia arriba: primero zoom 2, luego zoom 1.
  for (const nivel of [2, 1]) {
    for (const n of nodos) {
      if (n.nivel_zoom !== nivel || fijada(n)) continue
      const hs = hijos.get(n.id)
      if (hs.length) xMap.set(n.id, media(hs.map((h) => xMap.get(h))))
    }
  }

  return { xMap, yMap }
}

function aplicar({ xMap, yMap }) {
  const copia = JSON.parse(JSON.stringify(atlas))
  for (const n of copia.nodos) {
    const fijada = n.coordenada?.fijada_a_mano === true
    const nueva = { x: Math.round(xMap.get(n.id)), y: Math.round(yMap.get(n.id)) }
    if (fijada) nueva.fijada_a_mano = true
    n.coordenada = nueva
  }
  return JSON.stringify(copia, null, 2) + '\n'
}

const salida = aplicar(calcular())
const actual = readFileSync(RUTA, 'utf8')

if (process.argv.includes('--check')) {
  if (salida === actual) {
    console.log('✓ layout idempotente: el archivo no cambiaría.')
  } else {
    console.error('✗ el layout produciría cambios. Corré `npm run layout`.')
    process.exit(1)
  }
} else {
  writeFileSync(RUTA, salida)
  console.log('✓ coordenadas escritas en data/atlas.numero.json')
  console.log('  (respetadas las fijadas a mano; el resto derivado de la estructura)')
}
