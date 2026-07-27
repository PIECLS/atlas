// Herramienta de layout OFFLINE (Fase 5 + 3.6-B/C + 3.7-C + 3.8). NO es parte
// de la app (A5). Computa DOS proyecciones del mismo espacio de conocimiento y
// las congela en el dataset como contenido editorial:
//
//   coordenada         — "en capas": y = profundidad en el orden parcial
//                         (longest path desde raíces), x = región + baricentro.
//   coordenada_radial  — "radial": radio = profundidad (consecuencia de cuántos
//                         nodos hay en cada anillo, no una constante), ángulo =
//                         región (repartida DENTRO de cada anillo según cuántos
//                         nodos aporta esa región A ESE anillo — Fase 3.8-A).
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

// ═══════════════════════════════ SEPARACIÓN (compartida) ═══════════════════
// SEP_NODO sube de 450 a 600 (Fase 3.8-B1): con 450 un balde de 8 nodos
// (operaciones, misma región+profundidad) medía 3.600px — más ancho que la
// separación que había entre regiones vecinas, así que se invadían.
// SEP_NODO_OBJETIVO es el criterio de cierre (el que se reporta y se
// verifica). SEP_NODO —usado en todos los cálculos— lleva un colchón extra:
// el redondeo final a enteros puede recortar 1-2px del resultado teórico.
const SEP_NODO_OBJETIVO = 600
const SEP_NODO = SEP_NODO_OBJETIVO + 4
// Piso de separación RADIAL entre anillos consecutivos (antes SEP_ANILLO_MIN,
// Fase 3.7-C2). Debe ser al menos SEP_NODO, no un valor menor: dos nodos de
// anillos vecinos con ángulos parecidos (frecuente — el barrido de baricentro
// alinea un nodo con sus vecinos, que suelen vivir en el anillo de al lado)
// quedan a una distancia real ≈ esta diferencia de radio, sin importar cuánto
// arco tengan disponible dentro de su propio anillo.
const SEP_RADIAL = SEP_NODO

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
// Punto medio del RANGO, no promedio de posiciones (Fase 3.8-B2): con
// regiones de anchos muy desiguales, el promedio se corre hacia donde hay más
// nodos. El punto medio del rango centra sobre el ESPACIO ocupado, no sobre
// la masa de puntos.
function puntoMedio(xs) {
  return xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0
}
const fijadaEn = (n, campo) => n[campo]?.fijada_a_mano === true

// ─────────────────────────────── EN CAPAS ───────────────────────────────────
const BANDA_L2 = 110 // altura de la fila de conceptos (zoom 2)
const BANDA_L2_ALT = 70 // desfase de la fila alterna (evita encabalgar etiquetas, 3.6-B)
// Microconocimientos (base, antes de sumar profundidad). El contenedor zoom2
// se centra en el punto medio del rango de TODOS sus hijos (3.8-B2), que
// puede coincidir en x con uno de ellos en particular — con poco aire
// vertical ese hijo de profundidad 0 quedaba pegado a su propio contenedor
// (3.7-C1: geometria_c~paralelas_perpendiculares). El salto debe superar
// SEP_NODO igual que cualquier otro par; al subir SEP_NODO en 3.8 (450→600)
// el viejo BANDA_L3=700 volvió a quedar corto (520px medido contra
// BANDA_L2_ALT=180), así que sube con él.
const BANDA_L3 = 900
const UNIDAD_Y = 2300 // separación vertical por nivel de profundidad
// Zigzag vertical para baldes de más de 5 nodos (Fase 3.8-B1 — propuesto en
// 3.6, nunca aplicado porque el rebalance de constantes alcanzó sin él; con
// SEP_NODO ahora en 600 un balde de 8+ nodos sigue siendo muy ancho, y
// alternar la fila reduce cuántas etiquetas compiten a la misma altura). No
// reemplaza la separación horizontal — es adicional.
const ESCALON_ZOOM3 = 300
// Separación clara entre el nodo raíz (zoom 1) y la fila de categorías (zoom
// 2): hoy quedan a 110-180px de distancia, mucho menos que SEP_NODO, y el
// nodo raíz se cruza con la fila (Fase 3.8-B2).
const ZOOM1_Y = -900
const SWEEPS = 8 // barridos de baricentro

function yDeCapas(nodo) {
  if (nodo.nivel_zoom === 1) return ZOOM1_Y
  if (nodo.nivel_zoom === 2) return BANDA_L2
  return BANDA_L3 + prof.get(nodo.id) * UNIDAD_Y
}

// SEP_REGION deja de ser una constante fija (Fase 3.8-B1): se deriva del
// ancho real de la región más ancha del dataset (cuántos nodos caben en su
// balde más denso × SEP_NODO), más un margen de un SEP_NODO completo. Antes
// era al revés — una constante fija elegida a ojo, sin relación con el
// contenido — y por eso regiones anchas (operaciones) invadían a sus vecinas.
function calcularSepRegion() {
  const cuentaPorBalde = new Map() // `${region}|${y}` -> cuenta
  for (const n of nodos) {
    if (n.nivel_zoom !== 3) continue
    const clave = `${n.region}|${yDeCapas(n)}`
    cuentaPorBalde.set(clave, (cuentaPorBalde.get(clave) ?? 0) + 1)
  }
  const maxPorRegion = new Map()
  for (const [clave, cuenta] of cuentaPorBalde) {
    const region = clave.slice(0, clave.lastIndexOf('|'))
    const ancho = cuenta * SEP_NODO
    if (ancho > (maxPorRegion.get(region) ?? 0)) maxPorRegion.set(region, ancho)
  }
  const maxGlobal = Math.max(0, ...maxPorRegion.values())
  return maxGlobal + SEP_NODO
}
const SEP_REGION = calcularSepRegion()

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
  // entre consecutivos sin importar paridad (verificado en 3.7 — no había bug
  // de centrado; lo que faltaba era que SEP_NODO superara el ancho de
  // etiqueta).
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

  // Zigzag (Fase 3.8-B1): baldes de más de 5 nodos alternan media fila, en el
  // mismo orden final (por x) que dejó el barrido de baricentro.
  for (const [, ids] of buckets) {
    if (ids.length <= 5) continue
    const base = yMap.get(ids[0])
    ids.forEach((id, i) => {
      if (i % 2 === 1) yMap.set(id, base + ESCALON_ZOOM3)
    })
  }

  // Contenedores zoom 2: x = punto medio del rango de sus hijos (3.8-B2); y
  // ALTERNADA en dos filas (3.6-B: antes, 14 puntos colineales a la misma y —
  // las etiquetas se encimaban). La fila se decide por el orden_x de la
  // región (par/impar), no por el id, para que regiones vecinas en el mapa
  // caigan en filas distintas.
  for (const n of nodos) {
    if (n.nivel_zoom !== 2 || fijada(n)) continue
    const hs = hijos.get(n.id)
    if (hs.length) xMap.set(n.id, puntoMedio(hs.map((h) => xMap.get(h))))
    const orden = regionPorId.get(n.region)?.orden_x ?? 0
    yMap.set(n.id, BANDA_L2 + (orden % 2 === 1 ? BANDA_L2_ALT : 0))
  }
  // Zoom 1 (dominio): x = punto medio del rango de sus hijos directos (3.8-B2).
  for (const n of nodos) {
    if (n.nivel_zoom !== 1 || fijada(n)) continue
    const hs = hijos.get(n.id)
    if (hs.length) xMap.set(n.id, puntoMedio(hs.map((h) => xMap.get(h))))
  }

  return { xMap, yMap }
}

// ─────────────────────────────────── RADIAL ─────────────────────────────────
// Fase 3.8-A: el reparto angular deja de ser por región (sector fijo,
// proporcional a la cantidad TOTAL de nodos de la región) y pasa a ser POR
// ANILLO — cada anillo reparte sus 360° entre las regiones que efectivamente
// tiene, proporcional a cuántos nodos aporta cada una A ESE ANILLO. El orden
// de las regiones alrededor del círculo es siempre el mismo (region.orden_x);
// solo cambia el ancho angular de cada una de un anillo a otro (estructura de
// sunburst). Una región ausente de un anillo no ocupa ángulo ahí.
//
// Consecuencia importante: como el ancho de cada sector es proporcional a su
// cuenta EN ESE ANILLO, el paso angular por nodo (ancho/cuenta) da
// exactamente 2π/total_del_anillo para CUALQUIER región de ese anillo — el
// mismo valor. Por eso no hace falta el margen angular ni la convergencia
// iterativa que exigió la Fase 3.7-C2 (ahí los sectores eran fijos por
// región, con paso distinto entre regiones vecinas): con paso uniforme, el
// centrado simétrico dentro de cada sector ya deja, en el borde entre dos
// regiones, exactamente el mismo hueco que entre dos nodos consecutivos de
// una misma región.
function calcularSectoresPorAnillo() {
  const cuentaPorAnilloRegion = new Map() // `${d}|${region}` -> cuenta
  const cuentaPorAnillo = new Map() // d -> total de nodos zoom 3 en ese anillo
  for (const n of nodos) {
    if (n.nivel_zoom !== 3) continue
    const d = prof.get(n.id)
    const clave = `${d}|${n.region}`
    cuentaPorAnilloRegion.set(clave, (cuentaPorAnilloRegion.get(clave) ?? 0) + 1)
    cuentaPorAnillo.set(d, (cuentaPorAnillo.get(d) ?? 0) + 1)
  }
  const porAnillo = new Map() // d -> { total, sectores: Map<region, {ancho, centro, cuenta}> }
  for (let d = 0; d <= profMax; d++) {
    const total = cuentaPorAnillo.get(d) ?? 0
    const sectores = new Map()
    let cursor = -Math.PI / 2 // arranca arriba, sentido horario
    for (const r of regionesOrdenadas) {
      const cuenta = cuentaPorAnilloRegion.get(`${d}|${r.id}`) ?? 0
      const ancho = total > 0 ? (cuenta / total) * 2 * Math.PI : 0
      if (cuenta > 0) sectores.set(r.id, { ancho, centro: cursor + ancho / 2, cuenta })
      cursor += ancho
    }
    porAnillo.set(d, { total, sectores })
  }
  return porAnillo
}

// El nodo zoom2 (contenedor de región) usa un centro angular EQUIESPACIADO,
// independiente de los anillos: dos regiones angostas y vecinas dejarían sus
// centros reales a solo unos pocos grados si se promediara su propio
// contenido — separación de arco casi nula para la ETIQUETA de la región,
// que es un elemento único por región, no ligado a ningún anillo (3.6-B).
const anchoUniformeRegion = (2 * Math.PI) / (regionesOrdenadas.length || 1)
function centroEtiquetaRegion(regionId) {
  const i = regionesOrdenadas.findIndex((r) => r.id === regionId)
  return -Math.PI / 2 + (i + 0.5) * anchoUniformeRegion
}

// Radio mínimo para que `cuenta` puntos EQUIESPACIADOS en una circunferencia
// completa queden a ≥ sep de distancia real (línea recta), no de arco. Arco =
// radio×ángulo siempre es ≥ cuerda = 2·radio·sin(ángulo/2) — usar el arco como
// aproximación de la distancia real SUBESTIMA el radio que hace falta. La
// diferencia es chica para anillos con muchos nodos (ángulo pequeño) pero
// importa para anillos con pocos: con 14 nodos (el anillo de categorías,
// zoom 2) la aproximación por arco dejaba pares a 598px con SEP_NODO=604,
// midiendo directo en el navegador — 1% corto, pero corto.
function radioParaSeparar(cuenta, sep) {
  return cuenta > 1 ? sep / (2 * Math.sin(Math.PI / cuenta)) : 0
}

// Radio de cada anillo: consecuencia de cuántos nodos contiene, no una
// constante (Fase 3.7-C2, extendido en 3.8-A). Nunca por debajo del anillo
// anterior + SEP_RADIAL, para que el orden por profundidad no se altere.
//
// El anillo 0 además debe dejar sitio cómodo al anillo interior de
// categorías (zoom 2, Fase 3.8-A): su radio también respeta
// radioZoom2 + SEP_RADIAL, no solo su propio mínimo. El radio inicial fijo de
// 700 que fijó la Fase 3.6 queda derogado — se recalcula desde los datos.
function calcularRadiosAnillo(porAnillo) {
  const cuentaZoom2 = nodos.filter((n) => n.nivel_zoom === 2).length
  const radioZoom2 = radioParaSeparar(cuentaZoom2, SEP_NODO)

  const radioPorAnillo = new Map()
  let radioAnterior = 0
  for (let d = 0; d <= profMax; d++) {
    const { total } = porAnillo.get(d)
    const radioMinimo = radioParaSeparar(total, SEP_NODO)
    const radio =
      d === 0 ? Math.max(radioMinimo, radioZoom2 + SEP_RADIAL) : Math.max(radioMinimo, radioAnterior + SEP_RADIAL)
    radioPorAnillo.set(d, radio)
    radioAnterior = radio
  }
  return { radioPorAnillo, radioZoom2 }
}

function calcularRadial() {
  const fijada = (n) => fijadaEn(n, 'coordenada_radial')
  const porAnillo = calcularSectoresPorAnillo()
  const { radioPorAnillo, radioZoom2 } = calcularRadiosAnillo(porAnillo)

  const radioMap = new Map()
  const anguloMap = new Map()

  for (const n of nodos) {
    if (fijada(n)) continue
    if (n.nivel_zoom === 1) {
      radioMap.set(n.id, 0)
      anguloMap.set(n.id, 0)
    } else if (n.nivel_zoom === 2) {
      radioMap.set(n.id, radioZoom2)
      anguloMap.set(n.id, centroEtiquetaRegion(n.region))
    } else {
      const d = prof.get(n.id)
      radioMap.set(n.id, radioPorAnillo.get(d))
      anguloMap.set(n.id, porAnillo.get(d).sectores.get(n.region)?.centro ?? 0)
    }
  }

  // Nodos zoom 3 por balde (región @ profundidad): baricentro angular. El
  // paso (ancho del sector / cuenta) da 2π/total_del_anillo para cualquier
  // región de este anillo (ver comentario de calcularSectoresPorAnillo) — no
  // hace falta convertir de píxeles de arco a radianes ni converger nada.
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
  for (let s = 0; s < SWEEPS; s++) {
    for (const [, ids] of buckets) {
      const region = porId.get(ids[0]).region
      const d = prof.get(ids[0])
      const sec = porAnillo.get(d).sectores.get(region)
      const paso = sec.cuenta > 1 ? sec.ancho / sec.cuenta : 0
      const bary = (id) => {
        const vecinos = [...pred.get(id), ...succ.get(id)]
        if (!vecinos.length) return anguloMap.get(id)
        return media(vecinos.map((v) => sec.centro + normalizarAngulo(anguloMap.get(v) - sec.centro)))
      }
      ids.sort((a, b) => bary(a) - bary(b) || (a < b ? -1 : a > b ? 1 : 0))
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
// Distancia mínima real (no solo dentro de un balde) entre nodos zoom 3, en
// cada proyección — para poder verificar el criterio de cierre sin abrir la
// app (Fase 3.7-C, 3.8-C).
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

function dimensiones(dataset, campo) {
  const xs = dataset.nodos.map((n) => n[campo].x)
  const ys = dataset.nodos.map((n) => n[campo].y)
  const ancho = Math.max(...xs) - Math.min(...xs)
  const alto = Math.max(...ys) - Math.min(...ys)
  return { ancho, alto, proporcion: ancho / alto }
}

// Distancia del nodo zoom 1 (dominio) al nodo zoom 2 (categoría) más cercano
// (Fase 3.8-C) — diagnóstico aparte, no sujeto al mismo piso SEP_NODO que los
// zoom 3 (son solo 15 elementos en total, el criterio real es "no se cruzan").
function distanciaZoom1Zoom2(dataset, campo) {
  const z1 = dataset.nodos.find((n) => n.nivel_zoom === 1)
  const z2s = dataset.nodos.filter((n) => n.nivel_zoom === 2)
  let min = Infinity
  let cual = null
  for (const n of z2s) {
    const d = Math.hypot(z1[campo].x - n[campo].x, z1[campo].y - n[campo].y)
    if (d < min) {
      min = d
      cual = n.id
    }
  }
  return { min, cual }
}

function reportar(dataset) {
  console.log('\n── Reporte (Fase 3.8) ──────────────────────────────')

  const dCapas = distanciaMinima(dataset, 'coordenada')
  const dRadial = distanciaMinima(dataset, 'coordenada_radial')
  console.log(`Distancia mínima en capas (zoom 3):  ${dCapas.min.toFixed(1)}px  (${dCapas.par.join(' ~ ')})`)
  console.log(`Distancia mínima en radial (zoom 3): ${dRadial.min.toFixed(1)}px  (${dRadial.par.join(' ~ ')})`)
  const cumpleAmbas = dCapas.min >= SEP_NODO_OBJETIVO && dRadial.min >= SEP_NODO_OBJETIVO
  console.log(`SEP_NODO objetivo: ${SEP_NODO_OBJETIVO}px — ${cumpleAmbas ? '✓ cumplido en ambas' : '✗ NO cumplido'}`)

  const dimCapas = dimensiones(dataset, 'coordenada')
  const dimRadial = dimensiones(dataset, 'coordenada_radial')
  console.log(
    `Dimensiones en capas:  ${dimCapas.ancho}×${dimCapas.alto} = ${dimCapas.proporcion.toFixed(2)}:1`,
  )
  console.log(
    `Dimensiones en radial: ${dimRadial.ancho}×${dimRadial.alto} = ${dimRadial.proporcion.toFixed(2)}:1`,
  )

  const z1z2Capas = distanciaZoom1Zoom2(dataset, 'coordenada')
  const z1z2Radial = distanciaZoom1Zoom2(dataset, 'coordenada_radial')
  console.log(`Zoom1 ~ zoom2 más cercano (capas):  ${z1z2Capas.min.toFixed(1)}px  (${z1z2Capas.cual})`)
  console.log(`Zoom1 ~ zoom2 más cercano (radial): ${z1z2Radial.min.toFixed(1)}px  (${z1z2Radial.cual})`)

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

  return cumpleAmbas
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
const cumpleAmbas = reportar(dataset)
if (!cumpleAmbas) {
  console.error('\n✗ el layout no cumple SEP_NODO en alguna proyección — corregir antes de cerrar la fase.')
  process.exit(1)
}
