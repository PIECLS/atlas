// Merge de "otros ejes" (Geometría, Medición, Datos y Probabilidades, Patrones y
// Álgebra) al dataset del Atlas. Script de un solo uso, documentado y committeado
// como registro de las decisiones de mapeo (misma lógica que se aplicaría a
// futuras extracciones análogas).
//
// Uso: node tools/merge-otros-ejes.mjs
//
// Fuentes (fuera del repo, no se commitean tal cual):
//   INSTRUCCIONES_OTROS_EJES.md, y los JSON de nodos/aristas extraídos.
//
// Decisiones de mapeo documentadas inline. Puntos NO mecánicos (requerían
// lectura del esquema real, no están garantizados a coincidir 1:1):
//
//   1. TRAMPA DE NOMBRES: las aristas fuente usan campos "a"/"b" para
//      (prerrequisito, dependiente) — NO coincide con el esquema real, donde
//      "de"/"a" son (prerrequisito, dependiente). Verificado con la
//      justificación de cada arista ("no es posible B sin A") y con qué lado
//      son nodos ya existentes (25 casos: siempre en "a", nunca en "b" — los
//      nodos existentes solo alimentan al territorio nuevo, nunca lo consumen).
//      Mapeo: fuente.a -> esquema.de, fuente.b -> esquema.a.
//
//   2. `confianza` y `origen` de NODOS, y `comentario`/`origen` de ARISTAS no
//      tienen campo homólogo en el esquema real (additionalProperties:false en
//      todos los objetos). No se inventan campos nuevos. Esa información —
//      incluyendo los comentarios "cruza a X", que son los más valiosos del
//      lote— se preserva en `data/revision_otros_ejes.csv`, lista para que
//      Francisco aplique el test A2 y decida promociones a consenso_experto.
//      `confianza` de ARISTA sí existe en el esquema (enum) y se preserva ahí.
//
//   3. Los 4 nodos "_c" (paraguas de eje) son zoom 2 con padre: null, tal como
//      especifican las instrucciones — NO análogos a decimales_c/fracciones_c
//      en cuanto a padre (esos SÍ cuelgan de "numero"). Consecuencia visual:
//      al alejar del todo la cámara ("lejano"), solo "numero" es zoom 1 y por
//      tanto el único territorio siempre visible; los 4 ejes nuevos aparecen
//      recién en el nivel "medio". Se reporta como hallazgo, no se corrige
//      unilateralmente (ver informe final).
//
//   4. Coordenadas: los nodos existentes NO se tocan (ni un byte). Los nodos
//      nuevos no traían coordenada — se computan aquí seleccionando el mismo
//      patrón que ya usa el dataset real (verificado empíricamente, no soy yo
//      quien lo inventa): zoom1 y=-520, zoom2 y=-260, zoom3 y=profundidad*120
//      (longest-path sobre el grafo COMPLETO, para que las aristas cruzadas
//      pesen en la profundidad); x por región en bandas de ancho 900,
//      continuando la progresión real de los centros existentes
//      (…2700, 3600, 4500 → 5400, 6300, 7200, 8100), con barrido de baricentro
//      SOLO entre nodos nuevos (los existentes se leen como ancla, no se mueven).
//
//   5. `oa_relacionados`: la fuente solo da códigos. `curso` se deriva del
//      prefijo (MA0N -> "NB", igual convención que el dataset real). `eje` se
//      asigna con el nombre humano de la región. `texto` y `cobertura` NO se
//      inventan (no vienen en la fuente): se omiten (son opcionales).

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chequeosEstructurales } from './validate.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(__dirname, '..')
const RUTA_ATLAS = resolve(RAIZ, 'data/atlas.numero.json')
const RUTA_NODOS_NUEVOS = process.argv[2]
const RUTA_ARISTAS_NUEVAS = process.argv[3]
const RUTA_CSV = resolve(RAIZ, 'data/revision_otros_ejes.csv')

if (!RUTA_NODOS_NUEVOS || !RUTA_ARISTAS_NUEVAS) {
  console.error('Uso: node tools/merge-otros-ejes.mjs <nodos.json> <aristas.json>')
  process.exit(1)
}

const atlas = JSON.parse(readFileSync(RUTA_ATLAS, 'utf8'))
const nodosNuevos = JSON.parse(readFileSync(RUTA_NODOS_NUEVOS, 'utf8'))
const aristasNuevas = JSON.parse(readFileSync(RUTA_ARISTAS_NUEVAS, 'utf8'))

// ── 0. Guardas de seguridad ──────────────────────────────────────────────
const idsExistentes = new Set(atlas.nodos.map((n) => n.id))
const colisiones = nodosNuevos.filter((n) => idsExistentes.has(n.id))
if (colisiones.length) {
  console.error('✗ Colisión de ids, abortando:', colisiones.map((n) => n.id))
  process.exit(1)
}
const idsNuevos = new Set(nodosNuevos.map((n) => n.id))
const todos = new Set([...idsExistentes, ...idsNuevos])
const rotas = aristasNuevas.filter((e) => !todos.has(e.a) || !todos.has(e.b))
if (rotas.length) {
  console.error('✗ Aristas con extremo desconocido, abortando:', rotas)
  process.exit(1)
}

// ── 1. Regiones nuevas ────────────────────────────────────────────────────
const REGION_SLUG = {
  'Patrones y Álgebra': 'patrones_algebra',
  Geometría: 'geometria',
  Medición: 'medicion',
  'Datos y Probabilidades': 'datos_probabilidades',
}
const ordenXExistente = Math.max(...atlas.regiones.map((r) => r.orden_x ?? 0))
const tokensUsados = new Set(atlas.regiones.map((r) => r.color_token))
const alfabetoTokens = 'ghijklmnop'.split('')
let cursorToken = 0
const nuevaRegionToken = () => {
  while (tokensUsados.has(`region-${alfabetoTokens[cursorToken]}`)) cursorToken++
  const t = `region-${alfabetoTokens[cursorToken]}`
  tokensUsados.add(t)
  return t
}
const nombresRegion = [...new Set(Object.keys(REGION_SLUG))]
const regionesNuevas = nombresRegion.map((nombre, i) => ({
  id: REGION_SLUG[nombre],
  nombre,
  orden_x: ordenXExistente + 1 + i,
  color_token: nuevaRegionToken(),
}))

// ── 2. Nodos nuevos → forma del esquema ──────────────────────────────────
function cursoDeCodigo(codigo) {
  const m = codigo.match(/^MA0([1-6]) OA/)
  return m ? `${m[1]}B` : undefined
}

const nodosMapeados = nodosNuevos.map((n) => {
  const esContenedor = n.id.endsWith('_c')
  const slug = REGION_SLUG[n.region]
  if (esContenedor) {
    return {
      id: n.id,
      nombre: n.nombre,
      nivel_zoom: 2, // explícito en las instrucciones, pese al padre:null (ver nota 3)
      padre: null,
      region: slug,
      completitud: 'esbozo',
    }
  }
  const metadatos = { definicion: n.definicion }
  if (n.oa_relacionados?.length) {
    metadatos.oa_relacionados = n.oa_relacionados.map((codigo) => ({
      codigo,
      curso: cursoDeCodigo(codigo),
      eje: n.region,
    }))
  }
  if (n.referencias) metadatos.bibliografia = [n.referencias]
  return {
    id: n.id,
    nombre: n.nombre,
    nivel_zoom: 3,
    padre: n.padre,
    region: slug,
    completitud: 'basica',
    metadatos,
  }
})

// ── 3. Aristas nuevas → forma del esquema (ojo con la trampa a/b, nota 1) ──
const aristasMapeadas = aristasNuevas.map((e) => ({
  de: e.a,
  a: e.b,
  justificacion: e.justificacion,
  clausula: null,
  confianza: e.confianza,
}))

// ── 3b. Decisiones de Francisco sobre las 5 aristas redundantes ───────────
// 4 son reducción transitiva genuina (se descartan; se registra el camino que
// ya las implica). La 5ª (conteo_a_saltos→escala_grafica) era un OR mal
// registrado como dos AND: se conserva esa y se descarta la otra rama
// (multiplicacion→escala_grafica, juicio de dominio: no es prerrequisito
// estricto — se puede leer una escala contando a saltos sin saber multiplicar).
const ELIMINADAS_POR_TRANSITIVIDAD = [
  {
    de: 'composicion_aditiva',
    a: 'ecuacion_formal',
    camino_implicante: ['composicion_aditiva', 'suma', 'reversibilidad_aditiva', 'ecuacion_un_paso', 'ecuacion_formal'],
  },
  {
    de: 'figuras_2d',
    a: 'relacion_2d_3d',
    camino_implicante: ['figuras_2d', 'figuras_3d', 'relacion_2d_3d'],
  },
  {
    de: 'correspondencia_uno_a_uno',
    a: 'registro_conteo',
    camino_implicante: ['correspondencia_uno_a_uno', 'cardinalidad', 'registro_conteo'],
  },
  {
    de: 'particion_equitativa',
    a: 'promedio',
    camino_implicante: ['particion_equitativa', 'division', 'promedio'],
  },
]
const ELIMINADA_POR_JUICIO_DOMINIO = {
  de: 'multiplicacion',
  a: 'escala_grafica',
  razon:
    'OR mal registrado como dos AND independientes: multiplicacion no es prerrequisito estricto de ' +
    'escala_grafica (se puede leer una escala contando a saltos sin saber multiplicar). Se conserva ' +
    'conteo_a_saltos→escala_grafica y se descarta esta rama.',
}
const CLAVES_A_DESCARTAR = new Set([
  ...ELIMINADAS_POR_TRANSITIVIDAD.map((x) => `${x.de}->${x.a}`),
  `${ELIMINADA_POR_JUICIO_DOMINIO.de}->${ELIMINADA_POR_JUICIO_DOMINIO.a}`,
])
const aristasMapeadasFinal = aristasMapeadas.filter((e) => !CLAVES_A_DESCARTAR.has(`${e.de}->${e.a}`))
console.log(`── ${aristasMapeadas.length - aristasMapeadasFinal.length} aristas descartadas por decisión de revisión ──`)

// ── 4. Draft y verificación estructural ANTES de asignar coordenadas ──────
const draft = {
  ...atlas,
  regiones: [...atlas.regiones, ...regionesNuevas],
  nodos: [...atlas.nodos, ...nodosMapeados],
  aristas: [...atlas.aristas, ...aristasMapeadasFinal],
}

const chequeo = chequeosEstructurales(draft)
console.log('── Chequeo estructural del draft (antes de coordenadas) ──')
console.log('nodos estructurales:', chequeo.nodos_estructurales)
for (const w of chequeo.advertencias) console.warn('  ⚠', w)
if (!chequeo.ok) {
  console.error('\n✗ El merge introduce problemas estructurales. Se reporta, no se corrige en silencio:')
  for (const e of chequeo.errores) console.error('  ✗', e)
  process.exit(1)
}
console.log('✓ acíclico, reducción transitiva intacta, clausula null en todo\n')

// ── 5. Coordenadas SOLO para nodos nuevos (nota 4) ─────────────────────────
// Profundidad por longest-path sobre el grafo COMPLETO (para que las aristas
// cruzadas pesen), pero solo se ESCRIBE la y de los nodos nuevos.
const succ = new Map(draft.nodos.map((n) => [n.id, []]))
const gradoEntrada = new Map(draft.nodos.map((n) => [n.id, 0]))
for (const e of draft.aristas) {
  succ.get(e.de)?.push(e.a)
  gradoEntrada.set(e.a, (gradoEntrada.get(e.a) ?? 0) + 1)
}
const profundidad = new Map(draft.nodos.map((n) => [n.id, 0]))
const colaTopo = draft.nodos.filter((n) => gradoEntrada.get(n.id) === 0).map((n) => n.id)
while (colaTopo.length) {
  const u = colaTopo.shift()
  for (const v of succ.get(u) ?? []) {
    profundidad.set(v, Math.max(profundidad.get(v), profundidad.get(u) + 1))
    gradoEntrada.set(v, gradoEntrada.get(v) - 1)
    if (gradoEntrada.get(v) === 0) colaTopo.push(v)
  }
}

const yPorZoom = { 1: -520, 2: -260 } // igual que el dataset real (verificado empíricamente)
const UNIDAD_Y = 120
function yDeNuevo(nodo) {
  if (nodo.nivel_zoom !== 3) return yPorZoom[nodo.nivel_zoom] ?? 0
  return profundidad.get(nodo.id) * UNIDAD_Y
}

const CENTRO_X = new Map(regionesNuevas.map((r) => [r.id, 4500 + 900 * (r.orden_x - ordenXExistente)]))
const SEP_NODO = 96
const SWEEPS = 8

const pred = new Map(draft.nodos.map((n) => [n.id, []]))
for (const e of draft.aristas) pred.get(e.a)?.push(e.de)

// x inicial: centro de la región (contenedores también parten ahí).
const xNuevo = new Map()
for (const n of nodosMapeados) xNuevo.set(n.id, CENTRO_X.get(n.region))

// x de los nodos EXISTENTES: se leen como ancla fija (nunca se escriben).
const xAncla = new Map(atlas.nodos.map((n) => [n.id, n.coordenada.x]))
const xDe = (id) => xNuevo.get(id) ?? xAncla.get(id) ?? 0

// Baricentro solo entre contenido nuevo (zoom 3), agrupado por región+y.
const regionMapeadaPorId = new Map(nodosMapeados.map((n) => [n.id, n.region])) // ya es slug
const buckets = new Map()
for (const n of nodosMapeados) {
  if (n.nivel_zoom !== 3) continue
  const clave = `${n.region}@${yDeNuevo(n)}`
  if (!buckets.has(clave)) buckets.set(clave, [])
  buckets.get(clave).push(n.id)
}
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
for (let s = 0; s < SWEEPS; s++) {
  for (const [, ids] of buckets) {
    const bary = (id) => {
      const vecinos = [...(pred.get(id) ?? []), ...(succ.get(id) ?? [])]
      return vecinos.length ? media(vecinos.map(xDe)) : xDe(id)
    }
    ids.sort((a, b) => bary(a) - bary(b) || (a < b ? -1 : a > b ? 1 : 0))
    const centro = CENTRO_X.get(regionMapeadaPorId.get(ids[0]))
    ids.forEach((id, i) => xNuevo.set(id, centro + (i - (ids.length - 1) / 2) * SEP_NODO))
  }
}
// Contenedores (_c): x = baricentro de sus hijos nuevos.
for (const n of nodosMapeados) {
  if (n.nivel_zoom !== 2) continue
  const hijos = nodosMapeados.filter((h) => h.padre === n.id).map((h) => h.id)
  if (hijos.length) xNuevo.set(n.id, media(hijos.map(xDe)))
}

for (const n of nodosMapeados) {
  n.coordenada = { x: Math.round(xNuevo.get(n.id)), y: Math.round(yDeNuevo(n)), fijada_a_mano: false }
}

// ── 6. Verificar que los nodos EXISTENTES quedan byte-idénticos ───────────
const finales = { ...draft, nodos: [...atlas.nodos, ...nodosMapeados] }
for (const nOriginal of atlas.nodos) {
  const nFinal = finales.nodos.find((n) => n.id === nOriginal.id)
  if (JSON.stringify(nFinal) !== JSON.stringify(nOriginal)) {
    console.error('✗ Un nodo existente cambió, abortando:', nOriginal.id)
    process.exit(1)
  }
}
console.log(`✓ ${atlas.nodos.length} nodos existentes verificados byte-idénticos`)

writeFileSync(RUTA_ATLAS, JSON.stringify(finales, null, 2) + '\n')
console.log(`✓ escrito: +${nodosMapeados.length} nodos, +${aristasMapeadasFinal.length} aristas, +${regionesNuevas.length} regiones`)

// ── 7. Planilla de revisión (campos sin hogar en el esquema, nota 2) ──────
function csvCampo(v) {
  if (v == null) return ''
  const s = String(v).replace(/"/g, '""')
  return /[",\n]/.test(s) ? `"${s}"` : s
}
// Anotación acordada tras la revisión de la redundancia (ver informe): se
// conserva esta arista, no la alternativa por multiplicación (OR mal
// registrado como AND — asunto de v3, no de v1).
const ANOTACIONES_MANUALES = {
  'conteo_a_saltos->escala_grafica': 'OR con multiplicación — registrar como disyunción en v3',
}
const filasNodos = nodosNuevos.map((n) => [
  'nodo',
  n.id,
  '',
  'incluido',
  n.confianza,
  n.origen,
  '',
  n.referencias ?? '',
])
const filasAristas = aristasNuevas.map((e) => {
  const clave = `${e.a}->${e.b}`
  const descartada = CLAVES_A_DESCARTAR.has(clave)
  const comentario = ANOTACIONES_MANUALES[clave] ?? e.comentario ?? ''
  return [
    'arista',
    e.a,
    e.b,
    descartada ? 'descartada' : 'incluido',
    e.confianza,
    e.origen,
    comentario,
    '',
  ]
})
const encabezado = ['tipo', 'de_o_id', 'a', 'estado', 'confianza', 'origen', 'comentario', 'referencias']
const csv = [encabezado, ...filasNodos, ...filasAristas].map((f) => f.map(csvCampo).join(',')).join('\n') + '\n'
writeFileSync(RUTA_CSV, csv)
console.log(`✓ planilla de revisión: data/revision_otros_ejes.csv (${filasNodos.length + filasAristas.length} filas)`)

// ── 8. Log de aristas eliminadas (para poder restaurarlas si una arista ──
// intermedia del camino implicante es rechazada en la revisión A2) ────────
const RUTA_LOG_ELIMINADAS = resolve(RAIZ, 'data/aristas_eliminadas_por_reduccion.json')
const nombrePorId = new Map(draft.nodos.map((n) => [n.id, n.nombre]))
const logEliminadas = {
  generado: new Date().toISOString(),
  nota:
    'Aristas descartadas del merge de otros ejes por quedar implicadas por transitividad (A6), ' +
    'o por juicio de dominio tras la revisión. Si una arista del camino_implicante es rechazada ' +
    'en la revisión A2, esta arista debería reevaluarse para reincorporación.',
  por_transitividad: ELIMINADAS_POR_TRANSITIVIDAD.map((x) => ({
    de: x.de,
    a: x.a,
    de_nombre: nombrePorId.get(x.de),
    a_nombre: nombrePorId.get(x.a),
    justificacion_original: aristasNuevas.find((e) => e.a === x.de && e.b === x.a)?.justificacion,
    camino_implicante: x.camino_implicante,
    camino_implicante_nombres: x.camino_implicante.map((id) => nombrePorId.get(id)),
  })),
  por_juicio_dominio: [
    {
      de: ELIMINADA_POR_JUICIO_DOMINIO.de,
      a: ELIMINADA_POR_JUICIO_DOMINIO.a,
      de_nombre: nombrePorId.get(ELIMINADA_POR_JUICIO_DOMINIO.de),
      a_nombre: nombrePorId.get(ELIMINADA_POR_JUICIO_DOMINIO.a),
      justificacion_original: aristasNuevas.find(
        (e) => e.a === ELIMINADA_POR_JUICIO_DOMINIO.de && e.b === ELIMINADA_POR_JUICIO_DOMINIO.a,
      )?.justificacion,
      razon: ELIMINADA_POR_JUICIO_DOMINIO.razon,
      arista_conservada_en_su_lugar: 'conteo_a_saltos->escala_grafica',
    },
  ],
}
writeFileSync(RUTA_LOG_ELIMINADAS, JSON.stringify(logEliminadas, null, 2) + '\n')
console.log(`✓ log de aristas eliminadas: data/aristas_eliminadas_por_reduccion.json`)

console.log('\n=== Regiones nuevas (agregar tokens de color en styles.css) ===')
for (const r of regionesNuevas) console.log(` ${r.id} · ${r.color_token} · orden_x=${r.orden_x}`)
