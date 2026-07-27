// Herramienta de layout OFFLINE (Fase 5 + 3.6-B/C + 3.7-C). NO es parte de la
// app (A5). Computa DOS proyecciones del mismo espacio de conocimiento y las
// congela en el dataset como contenido editorial:
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

// ═══════════════════════════════ EN CAPAS (Fase 5 + 3.6-C + 3.7-C) ═════════
// SEP_NODO sube de 96 a 450 (Fase 3.7-C1): debe superar con holgura el ancho
// típico de una etiqueta (~165px, medido; las peores llegan a ~340px). Con
// las etiquetas ahora DEBAJO del nodo (Fase 3.7-B1) esto ya no compite con el
// nodo vecino, pero SIGUE compitiendo con la ETIQUETA del vecino en la misma
// capa — dos etiquetas centradas a menos de ~165-340px se solapan igual.
// SEP_REGION y UNIDAD_Y suben en cascada para conservar la proporción 1:1–2:1
// que fijó la Fase 3.6: al ensanchar las capas, las columnas necesitan más
// aire entre sí, y el alto debe acompañar o el mapa vuelve a desbalancearse.
const BANDA_L2 = 110 // altura de la fila de conceptos (zoom 2)
const BANDA_L2_ALT = 70 // desfase de la fila alterna (evita encabalgar etiquetas, 3.6-B)
// Microconocimientos (base, antes de sumar profundidad). 700, no 240: un
// contenedor zoom2 se centra en el BARICENTRO de TODOS sus hijos, que puede
// coincidir en x con uno de ellos en particular — con poco aire vertical
// (240-180=60px) ese hijo de profundidad 0 quedaba pegado a su propio
// contenedor (3.7-C1, hallazgo real: geometria_c ~ paralelas_perpendiculares
// a 60px). El salto debe superar SEP_NODO igual que cualquier otro par.
const BANDA_L3 = 700
const UNIDAD_Y = 2200 // separación vertical por nivel de profundidad (antes 400)
const SEP_REGION = 4200 // separación horizontal entre territorios (antes 700)
// SEP_NODO_OBJETIVO es el criterio de cierre (450px, el que se reporta y se
// verifica). SEP_NODO —usado en todos los cálculos— lleva un pequeño colchón
// extra: el redondeo final a enteros (Math.round de x/y, y en radial la
// conversión polar→cartesiana) puede recortar 1-2px del resultado teórico;
// sin el colchón, algún par quedaba en 449px en vez de 450.
const SEP_NODO_OBJETIVO = 450
const SEP_NODO = SEP_NODO_OBJETIVO + 4 // separación entre nodos del mismo territorio y capa (antes 96)
const SWEEPS = 8 // barridos de baricentro

// ═══════════════════════════════ RADIAL (Fase 3.6-B + 3.7-C2) ══════════════
// El radio de cada anillo deja de ser una constante (RADIO_INICIAL + d·SEP)
// y pasa a ser una CONSECUENCIA de cuántos nodos contiene (Fase 3.7-C2): el
// perímetro disponible en un anillo interior es mucho menor que en uno
// exterior para el MISMO sector angular, así que un incremento fijo aprieta
// el centro y deja el borde holgado. Cada anillo se empuja hacia afuera lo
// necesario para que, dentro de su sector, sus nodos queden a ≥SEP_NODO de
// distancia de arco real — nunca menos que el anillo anterior + un piso.
const RADIO_INICIAL = 700 // el anillo central (profundidad 0) tiene 16 nodos; mínimo del anillo 0
// Piso de separación RADIAL entre anillos consecutivos. Debe ser al menos
// SEP_NODO: dos nodos de anillos vecinos con ángulos parecidos (frecuente en
// regiones angostas, pocos nodos por anillo) quedan a una distancia ≈ esta
// diferencia de radio — no solo importa la separación DENTRO de un anillo.
const SEP_ANILLO_MIN = SEP_NODO
const RADIO_ZOOM2 = 350 // anillo interior propio para los contenedores de región
const SWEEPS_RADIAL = 8

const atlas = JSON.parse(readFileSync(RUTA, 'utf8'))
atlas.schema_version = '1.2.0'

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
const profMax = Math.max(0, ...[...prof.values()])

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

  // Nodos zoom 3 por balde (región @ y): baricentro estilo Sugiyama. La
  // fórmula (i - (largo-1)/2) * SEP_NODO da separación EXACTA = SEP_NODO
  // entre consecutivos sin importar paridad — verificado, no había bug de
  // centrado en esta implementación; lo que faltaba era que SEP_NODO fuera
  // mayor que el ancho de etiqueta (3.7-C1).
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
  const sectores = new Map() // region -> {inicio, ancho, centro, centroEtiqueta, cuenta}
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
      cuenta,
    })
    cursor += ancho
  })
  return sectores
}

// Radio de cada anillo (profundidad): consecuencia de cuántos nodos contiene,
// no una constante (3.7-C2). Para cada región con nodos en ese anillo, el
// radio mínimo que evita solaparlos es (cuenta-1)*SEP_NODO / anchoSector (el
// ancho de sector en radianes, convertido a píxeles de arco vía radio). Se
// toma el máximo entre todas las regiones de ese anillo, nunca por debajo del
// anillo anterior + el piso, para que el orden por profundidad no se altere.
// Margen angular entre sectores VECINOS, en radianes, para un radio dado —
// el equivalente a SEP_NODO de arco, repartido a ambos lados del sector. Sin
// esto, el último nodo del sector de una región y el primero del sector
// vecino (misma profundidad, ángulos parecidos si ambos quedan cerca del
// borde) pueden terminar más cerca que SEP_NODO aunque cada uno, por
// separado, respete la separación DENTRO de su propio sector.
function margenAngular(radio) {
  return radio > 0 ? SEP_NODO / radio : Infinity
}

function calcularRadiosAnillo(sectores) {
  const cuentaPorAnilloRegion = new Map() // `${d}@${region}` -> cuenta
  for (const n of nodos) {
    if (n.nivel_zoom !== 3) continue
    const clave = `${prof.get(n.id)}@${n.region}`
    cuentaPorAnilloRegion.set(clave, (cuentaPorAnilloRegion.get(clave) ?? 0) + 1)
  }
  const radioPorAnillo = new Map()
  let radioAnterior = 0
  for (let d = 0; d <= profMax; d++) {
    let radioMinimo = d === 0 ? RADIO_INICIAL : 0
    for (const r of regionesOrdenadas) {
      const cuenta = cuentaPorAnilloRegion.get(`${d}@${r.id}`) ?? 0
      if (cuenta === 0) continue
      const sec = sectores.get(r.id)
      // El radio necesario depende del margen (que depende del radio) y de
      // la separación intra-sector (que depende del ancho YA descontado el
      // margen, que también depende del radio): converge en pocas vueltas.
      let radioEstimado = Math.max(radioAnterior + SEP_ANILLO_MIN, d === 0 ? RADIO_INICIAL : 0)
      for (let it = 0; it < 4; it++) {
        const margen = margenAngular(radioEstimado)
        const anchoUtil = Math.max(sec.ancho - margen, sec.ancho * 0.05)
        const necesarioMargen = SEP_NODO / sec.ancho // que el margen quepa dentro del sector
        const necesarioIntra = cuenta > 1 ? ((cuenta - 1) * SEP_NODO) / anchoUtil : 0
        radioEstimado = Math.max(radioEstimado, necesarioMargen, necesarioIntra)
      }
      if (radioEstimado > radioMinimo) radioMinimo = radioEstimado
    }
    const radio = Math.max(radioMinimo, radioAnterior + SEP_ANILLO_MIN)
    radioPorAnillo.set(d, radio)
    radioAnterior = radio
  }
  return radioPorAnillo
}

function calcularRadial() {
  const fijada = (n) => fijadaEn(n, 'coordenada_radial')
  const sectores = calcularSectores()
  const radioPorAnillo = calcularRadiosAnillo(sectores)

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
      radioMap.set(n.id, radioPorAnillo.get(prof.get(n.id)))
      anguloMap.set(n.id, sectores.get(n.region)?.centro ?? 0)
    }
  }

  // Nodos zoom 3 por balde (región @ profundidad): baricentro angular, con el
  // ancho de separación convertido de píxeles de arco a radianes según el
  // radio YA AJUSTADO de ese anillo (por diseño, siempre alcanza — el radio
  // se calculó para que SEP_NODO quepa exactamente en el sector disponible).
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
      const pasoAngular = radio > 0 ? SEP_NODO / radio : 0
      const bary = (id) => {
        const vecinos = [...pred.get(id), ...succ.get(id)]
        if (!vecinos.length) return anguloMap.get(id)
        return media(vecinos.map((v) => sec.centro + normalizarAngulo(anguloMap.get(v) - sec.centro)))
      }
      ids.sort((a, b) => bary(a) - bary(b) || (a < b ? -1 : a > b ? 1 : 0))
      // Mismo margen que calcularRadiosAnillo: el ancho utilizable descuenta
      // el arco reservado para no invadir al sector vecino.
      const anchoDisponible = Math.max(sec.ancho - margenAngular(radio), sec.ancho * 0.05)
      const anchoNecesario = (ids.length - 1) * pasoAngular
      const paso = anchoNecesario > anchoDisponible && ids.length > 1 ? anchoDisponible / (ids.length - 1) : pasoAngular
      ids.forEach((id, i) => {
        anguloMap.set(id, sec.centro + (i - (ids.length - 1) / 2) * paso)
      })
    }
  }

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
  return { texto: JSON.stringify(copia, null, 2) + '\n', dataset: copia }
}

// ─────────────────────────────────── REPORTE ─────────────────────────────────
// Distancia mínima real (no solo dentro de un balde) entre nodos, en cada
// proyección — el criterio de cierre de la Fase 3.7-C pide poder verificarlo
// sin abrir la app. `filtro` por defecto mide solo zoom 3 (microconocimientos,
// el foco de la Parte C); pasar null mide TODOS los nodos, incluidos los 14
// contenedores zoom 2.
function distanciaMinima(dataset, campo, filtro = (n) => n.nivel_zoom === 3) {
  const grupo = filtro ? dataset.nodos.filter(filtro) : dataset.nodos
  let min = Infinity
  let par = null
  for (let i = 0; i < grupo.length; i++) {
    for (let j = i + 1; j < grupo.length; j++) {
      const A = grupo[i][campo]
      const B = grupo[j][campo]
      const d = Math.hypot(A.x - B.x, A.y - B.y)
      if (d < min) {
        min = d
        par = [grupo[i].id, grupo[j].id]
      }
    }
  }
  return { min, par }
}

function reportar(dataset) {
  console.log('\n── Reporte (Fase 3.7) ──────────────────────────────')

  const dCapas = distanciaMinima(dataset, 'coordenada')
  const dRadial = distanciaMinima(dataset, 'coordenada_radial')
  console.log(`Distancia mínima en capas (zoom 3):  ${dCapas.min.toFixed(1)}px  (${dCapas.par.join(' ~ ')})`)
  console.log(`Distancia mínima en radial (zoom 3): ${dRadial.min.toFixed(1)}px  (${dRadial.par.join(' ~ ')})`)
  console.log(`SEP_NODO objetivo: ${SEP_NODO_OBJETIVO}px — ${dCapas.min >= SEP_NODO_OBJETIVO && dRadial.min >= SEP_NODO_OBJETIVO ? '✓ cumplido en ambas' : '✗ NO cumplido'}`)

  // Los 14 contenedores zoom 2 usan un estándar de separación propio (anillo
  // interior fijo, equiespaciado — Fase 3.6-B), menor que SEP_NODO: son solo
  // 14 elementos, y el criterio ahí es que sus ETIQUETAS no se encimen, ya
  // verificado en 3.6. Se reporta aparte para no mezclar ambos estándares.
  const dTodosCapas = distanciaMinima(dataset, 'coordenada', null)
  const dTodosRadial = distanciaMinima(dataset, 'coordenada_radial', null)
  console.log(`Distancia mínima en capas (todos):   ${dTodosCapas.min.toFixed(1)}px  (${dTodosCapas.par.join(' ~ ')})`)
  console.log(`Distancia mínima en radial (todos):  ${dTodosRadial.min.toFixed(1)}px  (${dTodosRadial.par.join(' ~ ')})`)

  const xs = dataset.nodos.map((n) => n.coordenada.x)
  const ys = dataset.nodos.map((n) => n.coordenada.y)
  const ancho = Math.max(...xs) - Math.min(...xs)
  const alto = Math.max(...ys) - Math.min(...ys)
  console.log(`Proporción del mapa (en capas): ${ancho}×${alto} = ${(ancho / alto).toFixed(2)}:1`)

  const largos = dataset.nodos.filter((n) => n.nombre.length > 25).sort((a, b) => b.nombre.length - a.nombre.length)
  console.log(`\nNodos con nombre > 25 caracteres: ${largos.length} de ${dataset.nodos.length}`)
  for (const n of largos) console.log(`  ${String(n.nombre.length).padStart(2)} · ${n.id.padEnd(32)} ${n.nombre}`)

  // Salida de la herramienta (3.7-B3), no del dataset: no se inventan nombres
  // cortos, solo se prioriza a quién le hacen falta. csv listo para completar
  // a mano; nombre_corto queda vacío hasta que el autor lo llene.
  const filas = largos.map((n) => `${n.id},"${n.nombre.replace(/"/g, '""')}",${n.nombre.length},`)
  const csv = 'id,nombre,largo,nombre_corto\n' + filas.join('\n') + '\n'
  writeFileSync(resolve(__dirname, '..', 'data', 'nodos_nombre_largo.csv'), csv)
  console.log(`\n✓ lista completa: data/nodos_nombre_largo.csv (${largos.length} filas, nombre_corto vacío para completar)`)
}

const { texto: salida, dataset } = aplicar()
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
reportar(dataset)
