// DRY RUN — no escribe /data. Explora usar ForceAtlas2 para resolver el
// solapamiento de x que introdujo el ICA (tamaños de nodo ahora variables)
// SIN violar A5: corre offline (tools/), nunca en el runtime de la app, y
// preserva y = profundidad en el orden parcial (no se toca; ver CLAUDE.md,
// A5 y la definición de `coordenada.y` en el esquema).
//
// Cómo se evita que FA2 mueva y y desordene las regiones entre sí:
//   En un DAG con y=profundidad (longest-path), dos nodos de la MISMA
//   profundidad NUNCA tienen arista directa entre ellos (una arista siempre
//   sube de profundidad). Por eso FA2 corre POR SEPARADO dentro de cada
//   balde (región, y) fijo: ahí no hay atracción (no hay aristas intra-balde),
//   solo repulsión + adjustSizes con el radio real del ICA — exactamente lo
//   necesario para separar círculos que se solapan, sin arrastrar una región
//   hacia otra vía aristas cruzadas.
//
// scalingRatio se ajusta automáticamente (arranca en el valor pedido, sube si
// queda solapamiento) hasta que ningún par de círculos se superponga.
//
// Uso: node tools/layout-fa2-dryrun.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { calcularICA } from './ica.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const atlas = JSON.parse(readFileSync(resolve(__dirname, '..', 'data', 'atlas.numero.json'), 'utf8'))

const SCALING_RATIO_INICIAL = 10
const MAX_INTENTOS = 12
const ITERACIONES = 400
const MARGEN = 4 // px de aire entre círculos, además de r1+r2

const zoom3 = atlas.nodos.filter((n) => n.nivel_zoom === 3)
const ica = calcularICA(atlas.nodos, atlas.aristas)

// Baldes (región, y) — mismo agrupamiento que usa la reducción transitiva
// por profundidad; dentro de un balde nunca hay arista directa (ver nota arriba).
const baldes = new Map()
for (const n of zoom3) {
  const clave = `${n.region}@${n.coordenada.y}`
  if (!baldes.has(clave)) baldes.set(clave, [])
  baldes.get(clave).push(n)
}

function distancia(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function haySolapamiento(nodosBalde, radios) {
  for (let i = 0; i < nodosBalde.length; i++) {
    for (let j = i + 1; j < nodosBalde.length; j++) {
      const a = nodosBalde[i]
      const b = nodosBalde[j]
      const minDist = radios.get(a.id) + radios.get(b.id) + MARGEN
      if (distancia(a, b) < minDist) return true
    }
  }
  return false
}

function correrFA2Balde(nodosBalde, scalingRatio) {
  const g = new Graph({ type: 'undirected' })
  for (const n of nodosBalde) {
    g.addNode(n.id, {
      x: n.coordenada.x + (Math.random() - 0.5) * 2, // jitter mínimo: FA2 no mueve nodos coincidentes exactos
      y: 0, // eje local: se descarta y se restaura la y real al final
      size: ica.get(n.id)?.radio ?? 8,
    })
  }
  if (g.order > 1) {
    forceAtlas2.assign(g, {
      iterations: ITERACIONES,
      settings: {
        adjustSizes: true,
        scalingRatio,
        barnesHutOptimize: true,
        gravity: 1, // ancla suave al centro del balde para no derivar
      },
    })
  }
  return g
}

console.log(`── FA2 dry-run · ${baldes.size} baldes (región@y), ${zoom3.length} nodos zoom 3 ──\n`)

const resultado = new Map() // id -> {x, y, scalingRatioUsado, intentos}
let baldesConSolapamientoResidual = 0
let maxScalingRatioUsado = 0

for (const [clave, nodosBalde] of baldes) {
  if (nodosBalde.length <= 1) {
    for (const n of nodosBalde) resultado.set(n.id, { x: n.coordenada.x, y: n.coordenada.y, scalingRatio: null })
    continue
  }
  const radios = new Map(nodosBalde.map((n) => [n.id, ica.get(n.id)?.radio ?? 8]))
  let scalingRatio = SCALING_RATIO_INICIAL
  let g = null
  let intento = 0
  for (; intento < MAX_INTENTOS; intento++) {
    g = correrFA2Balde(nodosBalde, scalingRatio)
    const posiciones = nodosBalde.map((n) => ({ id: n.id, x: g.getNodeAttribute(n.id, 'x'), y: g.getNodeAttribute(n.id, 'y') }))
    if (!haySolapamiento(posiciones, radios)) break
    scalingRatio *= 1.6
  }
  maxScalingRatioUsado = Math.max(maxScalingRatioUsado, scalingRatio)
  const posicionesFinales = nodosBalde.map((n) => ({ id: n.id, x: g.getNodeAttribute(n.id, 'x'), y: g.getNodeAttribute(n.id, 'y') }))
  const solapaAunAsi = haySolapamiento(posicionesFinales, radios)
  if (solapaAunAsi) baldesConSolapamientoResidual++
  for (const n of nodosBalde) {
    const p = posicionesFinales.find((x) => x.id === n.id)
    resultado.set(n.id, { x: p.x, y: n.coordenada.y, scalingRatio, intentos: intento + 1, solapaAunAsi })
  }
}

// ── Reporte (dry-run: nada se escribe) ──────────────────────────────────
const nombrePorId = new Map(atlas.nodos.map((n) => [n.id, n.nombre]))
let movidos = 0
let deltaTotal = 0
let deltaMax = 0
let deltaMaxId = null
for (const n of zoom3) {
  const r = resultado.get(n.id)
  const delta = Math.abs(r.x - n.coordenada.x)
  if (delta > 0.5) movidos++
  deltaTotal += delta
  if (delta > deltaMax) { deltaMax = delta; deltaMaxId = n.id }
}

console.log(`Nodos zoom 3: ${zoom3.length}`)
console.log(`Baldes con >1 nodo (candidatos a solapamiento): ${[...baldes.values()].filter((b) => b.length > 1).length}`)
console.log(`Nodos cuya x cambiaría (>0.5px): ${movidos}`)
console.log(`Desplazamiento promedio en x: ${(deltaTotal / zoom3.length).toFixed(1)}px`)
console.log(`Desplazamiento máximo en x: ${deltaMax.toFixed(1)}px (${deltaMaxId} · ${nombrePorId.get(deltaMaxId)})`)
console.log(`scalingRatio máximo necesitado: ${maxScalingRatioUsado.toFixed(1)} (arrancó en ${SCALING_RATIO_INICIAL})`)
console.log(`Baldes con solapamiento residual tras ${MAX_INTENTOS} intentos: ${baldesConSolapamientoResidual}`)

// Verificación de que y quedó exactamente intacta (garantía de A5).
let yAlterada = 0
for (const n of zoom3) if (resultado.get(n.id).y !== n.coordenada.y) yAlterada++
console.log(`\ny alterada respecto al original: ${yAlterada} nodos (debe ser 0)`)

console.log('\n── Muestra de los 10 mayores desplazamientos en x ──')
const muestra = zoom3
  .map((n) => ({ id: n.id, nombre: n.nombre, antes: n.coordenada.x, despues: resultado.get(n.id).x }))
  .sort((a, b) => Math.abs(b.despues - b.antes) - Math.abs(a.despues - a.antes))
  .slice(0, 10)
for (const m of muestra) {
  console.log(`  ${m.id.padEnd(30)} x: ${m.antes.toFixed(0).padStart(6)} -> ${m.despues.toFixed(0).padStart(6)}  (Δ${(m.despues - m.antes).toFixed(0)})`)
}

console.log('\nDry-run completo. /data NO fue modificado.')
