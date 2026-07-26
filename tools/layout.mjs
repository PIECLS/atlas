// Herramienta de layout OFFLINE (Fase 5 + 3.6-B/C). NO es parte de la app (A5).
// Computa DOS proyecciones del mismo espacio de conocimiento y las congela en
// el dataset como contenido editorial:
//
//   coordenada         — "en capas": y = profundidad en el orden parcial
//                         (longest path desde raíces), x = región + baricentro.
//   coordenada_radial  — "radial": radio = profundidad (misma magnitud que y),
//                         ángulo = región (sectores proporcionales a la
//                         cantidad de nodos de cada región, en orden
//                         region.orden_x).
//
// Ambas se computan offline, una vez, y se congelan (A5). El explorador LEE
// las dos y alterna entre ellas; nunca calcula ninguna en runtime.
// Respeta coordenada.fijada_a_mano / coordenada_radial.fijada_a_mano: no las toca.
// Idempotente para ambas: correr la herramienta dos veces seguidas produce el
// mismo archivo.
//
// Uso:  node tools/layout.mjs        (escribe)
//       node tools/layout.mjs --check (falla si el archivo cambiaría)

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUTA = resolve(__dirname, '..', 'data', 'atlas.numero.json')

// ═══════════════════════════════ EN CAPAS (Fase 5 + 3.6-C) ═════════════════
// Constantes rebalanceadas (Fase 3.6-C, táctica 1): con 14 regiones el ancho
// total (SEP_REGION × 13) dominaba por 9:1 sobre el alto (UNIDAD_Y × profundidad
// máxima). Subir UNIDAD_Y y bajar SEP_REGION alcanza el objetivo (1:1–2:1) sin
// necesitar empaquetar columnas por intervalo de profundidad (táctica 2): los
// rangos de profundidad de las regiones se solapan demasiado entre sí para que
// el empaquetado rinda (p.ej. patrones_algebra cubre [0,14], geometria [0,11]:
// casi ninguna región deja una banda libre para compartir con otra).
const BANDA_L2 = 110 // altura de la fila de conceptos (zoom 2)
const BANDA_L2_ALT = 70 // desfase de la fila alterna (evita encabalgar etiquetas, 3.6-B)
const BANDA_L3 = 240 // microconocimientos (base, antes de sumar profundidad)
const UNIDAD_Y = 400 // separación vertical por nivel de profundidad (antes 130)
const SEP_REGION = 700 // separación horizontal entre territorios (antes 280)
const SEP_NODO = 96 // separación entre nodos del mismo territorio y capa
const SWEEPS = 8 // barridos de baricentro

// ═══════════════════════════════ RADIAL (Fase 3.6-B) ═══════════════════════
const RADIO_INICIAL = 700 // el anillo central (profundidad 0) tiene 16 nodos; a 400 no caben
const SEP_ANILLO = 400 // separación radial por nivel de profundidad
const RADIO_ZOOM2 = 350 // anillo interior propio para los contenedores de región
const ARCO_NODO = 90 // separación angular mínima entre nodos del mismo balde, en px de arco
const SWEEPS_RADIAL = 8

const atlas = JSON.parse(readFileSync(RUTA, 'utf8'))
atlas.schema_version = '1.1.0'

const nodos = atlas.nodos
const porId = new Map(nodos.map((n) => [n.id, n]))
const regionPorId = new Map((atlas.regiones ?? []).map((r) => [r.id, r]))
const regionesOrdenadas = [...(atlas.regiones ?? [])].sort((a, b) => (a.orden_x ?? 0) - (b.orden_x ?? 0))

// — Precedencia (solo aristas; padre es agregación visual, no estructura) —
const pred = new Map(nodos.map((n) => [n.id, []]))
const succ = new Map(nodos.map((n) => [n.id, []]))
for (const { de, a } of atlas.aristas) {
  succ.get(de)?.push(a)
  pred.get(a)?.push(de)
}

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
const prof = profundidades()

const hijos = new Map(nodos.map((n) => [n.id, []]))
for (const n of nodos) if (n.padre && hijos.has(n.padre)) hijos.get(n.padre).push(n.id)

function media(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}
const fijadaEn = (n, campo) => n[campo]?.fijada_a_mano === true

// ─────────────────────────────── EN CAPAS ───────────────────────────────────
function yDeCapas(nodo) {
  if (nodo.nivel_zoom === 1) return 0
  if (nodo.nivel_zoom === 2) return BANDA_L2
  return BANDA_L3 + prof.get(nodo.id) * UNIDAD_Y
}
function centroRegion(regionId) {
  const r = regionPorId.get(regionId)
  return (r?.orden_x ?? 0) * SEP_REGION
}

function calcularCapas() {
  const fijada = (n) => fijadaEn(n, 'coordenada')

  const yMap = new Map()
  for (const n of nodos) yMap.set(n.id, fijada(n) ? n.coordenada.y : yDeCapas(n))

  const xMap = new Map()
  for (const n of nodos) xMap.set(n.id, fijada(n) ? n.coordenada.x : centroRegion(n.region))

  // Nodos zoom 3 por balde (región @ y): baricentro estilo Sugiyama.
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
      ids.sort((a, b) => bary(a) - bary(b) || (a < b ? -1 : a > b ? 1 : 0))
      const centro = centroRegion(porId.get(ids[0]).region)
      ids.forEach((id, i) => xMap.set(id, centro + (i - (ids.length - 1) / 2) * SEP_NODO))
    }
  }

  // Contenedores zoom 2: x = baricentro de sus hijos; y ALTERNADA en dos filas
  // (3.6-B: antes, 14 puntos colineales a la misma y — las etiquetas se
  // encimaban). La fila se decide por el orden_x de la región (par/impar), no
  // por el id, para que regiones vecinas en el mapa caigan en filas distintas.
  for (const n of nodos) {
    if (n.nivel_zoom !== 2 || fijada(n)) continue
    const hs = hijos.get(n.id)
    if (hs.length) xMap.set(n.id, media(hs.map((h) => xMap.get(h))))
    const orden = regionPorId.get(n.region)?.orden_x ?? 0
    yMap.set(n.id, BANDA_L2 + (orden % 2 === 1 ? BANDA_L2_ALT : 0))
  }
  // Zoom 1 (dominio): x = baricentro de sus hijos directos.
  for (const n of nodos) {
    if (n.nivel_zoom !== 1 || fijada(n)) continue
    const hs = hijos.get(n.id)
    if (hs.length) xMap.set(n.id, media(hs.map((h) => xMap.get(h))))
  }

  return { xMap, yMap }
}

// ─────────────────────────────────── RADIAL ─────────────────────────────────
// Sectores angulares proporcionales a la cantidad de nodos zoom 3 de cada
// región (no partes iguales), recorridos en orden region.orden_x.
function calcularSectores() {
  const cuentaPorRegion = new Map()
  let total = 0
  for (const n of nodos) {
    if (n.nivel_zoom !== 3) continue
    cuentaPorRegion.set(n.region, (cuentaPorRegion.get(n.region) ?? 0) + 1)
    total++
  }
  const sectores = new Map() // region -> {inicio, ancho, centro, centroEtiqueta}
  let cursor = -Math.PI / 2 // arranca arriba, sentido horario
  const anchoUniforme = (2 * Math.PI) / (regionesOrdenadas.length || 1)
  regionesOrdenadas.forEach((r, i) => {
    const cuenta = cuentaPorRegion.get(r.id) ?? 0
    const ancho = total > 0 ? (cuenta / total) * 2 * Math.PI : 0
    // El contenido zoom3 usa el sector PROPORCIONAL (centro real). El nodo
    // zoom2 (contenedor) usa un centro EQUIESPACIADO aparte: dos regiones
    // angostas y vecinas (p.ej. decimales 8° y proporcion 5°) dejarían sus
    // centros reales a solo unos pocos grados — separación de arco casi nula
    // a cualquier radio razonable. Repartir 360°/14 por igual SOLO para este
    // punto evita que las etiquetas de región se encimen (3.6-B).
    sectores.set(r.id, {
      inicio: cursor,
      ancho,
      centro: cursor + ancho / 2,
      centroEtiqueta: -Math.PI / 2 + (i + 0.5) * anchoUniforme,
    })
    cursor += ancho
  })
  return sectores
}

function calcularRadial() {
  const fijada = (n) => fijadaEn(n, 'coordenada_radial')
  const sectores = calcularSectores()

  const radioMap = new Map()
  const anguloMap = new Map()

  for (const n of nodos) {
    if (fijada(n)) continue
    if (n.nivel_zoom === 1) {
      radioMap.set(n.id, 0)
      anguloMap.set(n.id, 0)
    } else if (n.nivel_zoom === 2) {
      const sec = sectores.get(n.region)
      radioMap.set(n.id, RADIO_ZOOM2)
      anguloMap.set(n.id, sec?.centroEtiqueta ?? 0)
    } else {
      radioMap.set(n.id, RADIO_INICIAL + prof.get(n.id) * SEP_ANILLO)
      anguloMap.set(n.id, sectores.get(n.region)?.centro ?? 0)
    }
  }

  // Nodos zoom 3 por balde (región @ profundidad): baricentro angular, con el
  // ancho de separación convertido de píxeles de arco a radianes según el
  // radio de ese anillo (así el espaciado visual es consistente aunque los
  // anillos exteriores tengan mucho más perímetro disponible).
  const buckets = new Map()
  for (const n of nodos) {
    if (n.nivel_zoom !== 3 || fijada(n)) continue
    const clave = `${n.region}@${prof.get(n.id)}`
    if (!buckets.has(clave)) buckets.set(clave, [])
    buckets.get(clave).push(n.id)
  }
  const normalizarAngulo = (a) => {
    let x = a
    while (x > Math.PI) x -= 2 * Math.PI
    while (x < -Math.PI) x += 2 * Math.PI
    return x
  }
  for (let s = 0; s < SWEEPS_RADIAL; s++) {
    for (const [, ids] of buckets) {
      const sec = sectores.get(porId.get(ids[0]).region)
      const radio = radioMap.get(ids[0])
      const pasoAngular = radio > 0 ? ARCO_NODO / radio : 0
      const bary = (id) => {
        const vecinos = [...pred.get(id), ...succ.get(id)]
        if (!vecinos.length) return anguloMap.get(id)
        // Promedio circular simple respecto del centro del sector (los
        // vecinos rara vez cruzan más de un cuadrante de distancia real).
        return media(vecinos.map((v) => sec.centro + normalizarAngulo(anguloMap.get(v) - sec.centro)))
      }
      ids.sort((a, b) => bary(a) - bary(b) || (a < b ? -1 : a > b ? 1 : 0))
      const anchoNecesario = (ids.length - 1) * pasoAngular
      // Si el balde no cabe en el sector, se comprime (nunca se derrama a la
      // región vecina): el sector completo pasa a ser el ancho disponible.
      const anchoDisponible = Math.max(sec.ancho * 0.92, 0)
      const paso = anchoNecesario > anchoDisponible && ids.length > 1 ? anchoDisponible / (ids.length - 1) : pasoAngular
      ids.forEach((id, i) => {
        anguloMap.set(id, sec.centro + (i - (ids.length - 1) / 2) * paso)
      })
    }
  }

  // Contenedores zoom 2 ya fijados al centro de su sector arriba; zoom 1 al centro.
  return { radioMap, anguloMap }
}

function aPolar(radio, angulo) {
  return { x: Math.round(radio * Math.cos(angulo)), y: Math.round(radio * Math.sin(angulo)) }
}

// ─────────────────────────────────── ESCRITURA ──────────────────────────────
function aplicar() {
  const { xMap, yMap } = calcularCapas()
  const { radioMap, anguloMap } = calcularRadial()
  const copia = JSON.parse(JSON.stringify(atlas))

  for (const n of copia.nodos) {
    const fijadaCapas = n.coordenada?.fijada_a_mano === true
    n.coordenada = fijadaCapas
      ? n.coordenada
      : { x: Math.round(xMap.get(n.id)), y: Math.round(yMap.get(n.id)), fijada_a_mano: false }

    const fijadaRadial = n.coordenada_radial?.fijada_a_mano === true
    if (fijadaRadial) continue
    const { x, y } = aPolar(radioMap.get(n.id), anguloMap.get(n.id))
    n.coordenada_radial = { x, y, fijada_a_mano: false }
  }
  return JSON.stringify(copia, null, 2) + '\n'
}

const salida = aplicar()
const actual = readFileSync(RUTA, 'utf8')

if (process.argv.includes('--check')) {
  if (salida === actual) {
    console.log('✓ layout idempotente: el archivo no cambiaría (en capas + radial).')
  } else {
    console.error('✗ el layout produciría cambios. Corré `npm run layout`.')
    process.exit(1)
  }
} else {
  writeFileSync(RUTA, salida)
  console.log('✓ coordenadas escritas en data/atlas.numero.json (en capas + radial)')
  console.log('  (respetadas las fijadas a mano; el resto derivado de la estructura)')
}
