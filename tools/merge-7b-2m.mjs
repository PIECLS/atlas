// Merge de la extensión 7º básico - 2º medio (los cuatro ejes: Números,
// Álgebra y funciones, Geometría, Probabilidad y estadística) al dataset del
// Atlas. Script de un solo uso, documentado y committeado como registro de
// las decisiones de mapeo — misma lógica que tools/merge-otros-ejes.mjs.
//
// Uso: node tools/merge-7b-2m.mjs <nodos.csv> <aristas.csv> <metadatos.json>
//
// Es un MERGE, no una regeneración (instrucción explícita del usuario):
//   - Los CSV no traen códex (definiciones, OA, errores). Si se reconstruyera
//     el dataset SOLO desde los CSV se perderían los metadatos de los 146
//     nodos existentes. El JSON del repo es la base; los CSV solo aportan
//     estructura (ids, nivel_zoom, region, padre, completitud, coordenadas)
//     y las 156 aristas nuevas.
//   - Nodos existentes: se tocan ÚNICAMENTE coordenada.x/y (si no están
//     fijada_a_mano) y, para los 17 nodos de oa_para_nodos_existentes, se
//     AGREGAN OA a su lista actual sin borrar los que ya tenían. Todo lo
//     demás (nombre, metadatos, region, padre, completitud) queda intacto.
//   - Nodos nuevos (90): estructura del CSV + códex desde
//     metadatos.nodos_nuevos (ya viene con la forma exacta del esquema:
//     oa_relacionados con codigo/curso/eje/cobertura/texto — a diferencia
//     del merge de "otros ejes", acá no hay trampa de nombres de campo).
//   - Aristas nuevas (156 de 334): se agregan solo las que no estén ya en el
//     dataset por (de,a). Ninguna arista existente se toca.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chequeosEstructurales } from './validate.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(__dirname, '..')
const RUTA_ATLAS = resolve(RAIZ, 'data/atlas.numero.json')

const [RUTA_NODOS_CSV, RUTA_ARISTAS_CSV, RUTA_METADATOS_JSON] = process.argv.slice(2)
if (!RUTA_NODOS_CSV || !RUTA_ARISTAS_CSV || !RUTA_METADATOS_JSON) {
  console.error('Uso: node tools/merge-7b-2m.mjs <nodos.csv> <aristas.csv> <metadatos.json>')
  process.exit(1)
}

// ── Parser CSV (RFC4180: comillas, comas y comillas escapadas "" dentro) ───
function parseCSV(texto) {
  const filas = []
  let fila = []
  let campo = ''
  let enComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ }
        else enComillas = false
      } else campo += c
    } else if (c === '"') {
      enComillas = true
    } else if (c === ',') {
      fila.push(campo); campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo); campo = ''
      if (fila.some((x) => x !== '')) filas.push(fila)
      fila = []
    } else campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo); if (fila.some((x) => x !== '')) filas.push(fila) }
  const encabezado = filas[0]
  return filas.slice(1).map((f) => Object.fromEntries(encabezado.map((h, i) => [h, f[i] ?? ''])))
}

const nodosCSV = parseCSV(readFileSync(RUTA_NODOS_CSV, 'utf8'))
const aristasCSV = parseCSV(readFileSync(RUTA_ARISTAS_CSV, 'utf8'))
const metadatos = JSON.parse(readFileSync(RUTA_METADATOS_JSON, 'utf8'))
const atlas = JSON.parse(readFileSync(RUTA_ATLAS, 'utf8'))

console.log(`── Merge 7B-2M ── CSV: ${nodosCSV.length} nodos, ${aristasCSV.length} aristas. Dataset actual: ${atlas.nodos.length} nodos, ${atlas.aristas.length} aristas.\n`)

// ── 0. Guardas de seguridad ─────────────────────────────────────────────
const idsExistentes = new Set(atlas.nodos.map((n) => n.id))
const idsCSV = new Set(nodosCSV.map((n) => n.id))
for (const id of idsExistentes) {
  if (!idsCSV.has(id)) { console.error(`✗ Nodo existente ${id} no aparece en el CSV. Abortando (no debería perder cobertura).`); process.exit(1) }
}
const nodosNuevosCSV = nodosCSV.filter((n) => !idsExistentes.has(n.id))
console.log(`Nodos nuevos detectados: ${nodosNuevosCSV.length}`)

const idsTodos = new Set([...idsExistentes, ...nodosNuevosCSV.map((n) => n.id)])
const aristasRotas = aristasCSV.filter((e) => !idsTodos.has(e.de) || !idsTodos.has(e.a))
if (aristasRotas.length) { console.error('✗ Aristas con extremo desconocido:', aristasRotas); process.exit(1) }

// ── 1. Regiones nuevas ───────────────────────────────────────────────────
const slugsRegionExistentes = new Set(atlas.regiones.map((r) => r.id))
const slugsRegionNuevos = [...new Set(nodosNuevosCSV.map((n) => n.region).filter((s) => !slugsRegionExistentes.has(s)))]
const ordenXBase = Math.max(...atlas.regiones.map((r) => r.orden_x ?? 0))
const tokensUsados = new Set(atlas.regiones.map((r) => r.color_token))
const alfabeto = 'klmnopqrstuvwxyz'.split('')
let cursor = 0
const nuevoToken = () => { while (tokensUsados.has(`region-${alfabeto[cursor]}`)) cursor++; const t = `region-${alfabeto[cursor]}`; tokensUsados.add(t); return t }
const nombreRegionCSV = new Map(nodosNuevosCSV.map((n) => [n.region, n.region_nombre]))
const regionesNuevas = slugsRegionNuevos.map((slug, i) => ({
  id: slug,
  nombre: nombreRegionCSV.get(slug),
  orden_x: ordenXBase + 1 + i,
  color_token: nuevoToken(),
}))
console.log(`Regiones nuevas: ${regionesNuevas.map((r) => `${r.id} (${r.nombre})`).join(', ')}`)

// ── 2. Nodos nuevos → forma del esquema ──────────────────────────────────
const faltantesMetadata = []
const nodosNuevosFinal = nodosNuevosCSV.map((n) => {
  const base = {
    id: n.id,
    nombre: n.nombre,
    nivel_zoom: Number(n.nivel_zoom),
    padre: n.padre || null,
    region: n.region,
    completitud: n.completitud,
    coordenada: { x: Number(n.x), y: Number(n.y), fijada_a_mano: false },
  }
  if (base.nivel_zoom === 2) return base // contenedor de región: sin metadatos, como el resto de los "_c"
  const md = metadatos.nodos_nuevos?.[n.id]
  if (!md) { faltantesMetadata.push(n.id); return base }
  const metadatosNodo = {}
  if (md.definicion) metadatosNodo.definicion = md.definicion
  if (md.descripcion) metadatosNodo.descripcion = md.descripcion
  if (md.oa_relacionados?.length) metadatosNodo.oa_relacionados = md.oa_relacionados
  if (md.representaciones?.length) metadatosNodo.representaciones = md.representaciones
  if (md.errores_frecuentes?.length) metadatosNodo.errores_frecuentes = md.errores_frecuentes
  return { ...base, metadatos: metadatosNodo }
})
if (faltantesMetadata.length) {
  console.error(`✗ Nodos zoom3 nuevos sin entrada en metadatos.nodos_nuevos: ${faltantesMetadata.join(', ')}`)
  process.exit(1)
}
console.log(`✓ Metadatos resueltos para los ${nodosNuevosFinal.filter((n) => n.nivel_zoom === 3).length} nodos zoom3 nuevos`)

// ── 3. Aristas nuevas → forma del esquema ────────────────────────────────
const clavesExistentes = new Set(atlas.aristas.map((e) => `${e.de}->${e.a}`))
const aristasNuevasFinal = []
const confianzasSorpresa = []
for (const e of aristasCSV) {
  const clave = `${e.de}->${e.a}`
  if (clavesExistentes.has(clave)) continue // ya está: no se toca, no se duplica
  if (e.confianza !== 'hipotesis') confianzasSorpresa.push(clave + ':' + e.confianza)
  aristasNuevasFinal.push({ de: e.de, a: e.a, justificacion: e.justificacion, clausula: null, confianza: e.confianza })
}
console.log(`Aristas nuevas detectadas: ${aristasNuevasFinal.length}`)
if (confianzasSorpresa.length) console.warn(`  ⚠ confianza distinta de 'hipotesis' en aristas nuevas: ${confianzasSorpresa.join(', ')}`)

// ── 4. Coordenadas actualizadas para nodos EXISTENTES (respeta fijada_a_mano) ──
const coordCSVporId = new Map(nodosCSV.map((n) => [n.id, { x: Number(n.x), y: Number(n.y) }]))
let coordsActualizadas = 0
let coordsRespetadas = 0
const nodosExistentesFinal = atlas.nodos.map((n) => {
  if (n.coordenada?.fijada_a_mano === true) { coordsRespetadas++; return n }
  const c = coordCSVporId.get(n.id)
  if (!c) return n // no debería pasar (ya se validó arriba)
  coordsActualizadas++
  return { ...n, coordenada: { ...n.coordenada, x: c.x, y: c.y } }
})
console.log(`Coordenadas actualizadas: ${coordsActualizadas} · respetadas por fijada_a_mano: ${coordsRespetadas}`)

// ── 5. OA agregados a nodos existentes (17), sin borrar los que ya tenían ──
let oaAgregados = 0
let oaDuplicadosOmitidos = 0
const idsConOAExtra = new Set(Object.keys(metadatos.oa_para_nodos_existentes ?? {}))
const nodosExistentesFinal2 = nodosExistentesFinal.map((n) => {
  const nuevosOA = metadatos.oa_para_nodos_existentes?.[n.id]
  if (!nuevosOA?.length) return n
  const actuales = n.metadatos?.oa_relacionados ?? []
  const codigosActuales = new Set(actuales.map((oa) => oa.codigo))
  const aAgregar = []
  for (const oa of nuevosOA) {
    if (codigosActuales.has(oa.codigo)) { oaDuplicadosOmitidos++; continue }
    aAgregar.push(oa)
    oaAgregados++
  }
  if (!aAgregar.length) return n
  return { ...n, metadatos: { ...n.metadatos, oa_relacionados: [...actuales, ...aAgregar] } }
})
console.log(`OA agregados a nodos existentes: ${oaAgregados} (en ${idsConOAExtra.size} nodos) · duplicados omitidos: ${oaDuplicadosOmitidos}`)

// ── 6. Draft y verificación estructural ──────────────────────────────────
const draft = {
  ...atlas,
  regiones: [...atlas.regiones, ...regionesNuevas],
  nodos: [...nodosExistentesFinal2, ...nodosNuevosFinal],
  aristas: [...atlas.aristas, ...aristasNuevasFinal],
}
const chequeo = chequeosEstructurales(draft)
console.log('\n── Chequeo estructural ──')
console.log('nodos estructurales:', chequeo.nodos_estructurales)
for (const w of chequeo.advertencias) console.warn('  ⚠', w)
if (!chequeo.ok) {
  console.error('\n✗ Problemas estructurales — se reporta, no se corrige en silencio:')
  for (const e of chequeo.errores) console.error('  ✗', e)
  process.exit(1)
}
console.log('✓ acíclico, reducción transitiva intacta, clausula null en todo')

// ── 7. Versión y certificación ────────────────────────────────────────────
const [maj, min, pat] = draft.atlas_version.split('.').map(Number)
draft.atlas_version = `${maj}.${min + 1}.0`
draft.dominio = {
  ...draft.dominio,
  descripcion:
    'Los cuatro ejes de la matemática escolar chilena (Números; Álgebra y funciones; Geometría; ' +
    'Probabilidad y estadística), 1º básico a 2º medio.',
}
draft.certificacion = {
  verificado: false,
  notas: `Extensión 7º básico-2º medio: +${nodosNuevosFinal.length} nodos, +${aristasNuevasFinal.length} aristas, +${regionesNuevas.length} regiones. Checks estructurales JS en verde; pendiente primera pasada del verificador R sobre este contenido.`,
}
delete draft.generado

// ── 8. Verificar que lo existente no se contaminó fuera de lo autorizado ──
for (const nOriginal of atlas.nodos) {
  const nFinal = draft.nodos.find((n) => n.id === nOriginal.id)
  const { coordenada: cO, metadatos: mO, ...restoO } = nOriginal
  const { coordenada: cF, metadatos: mF, ...restoF } = nFinal
  if (JSON.stringify(restoO) !== JSON.stringify(restoF)) {
    console.error('✗ Un campo no autorizado cambió en el nodo existente:', nOriginal.id); process.exit(1)
  }
  const oaO = mO?.oa_relacionados ?? []
  const oaF = mF?.oa_relacionados ?? []
  if (JSON.stringify(oaF.slice(0, oaO.length)) !== JSON.stringify(oaO)) {
    console.error('✗ Los OA existentes no quedaron intactos (deben ser prefijo) en:', nOriginal.id); process.exit(1)
  }
  const { oa_relacionados: _oaO, ...restoMdO } = mO ?? {}
  const { oa_relacionados: _oaF, ...restoMdF } = mF ?? {}
  if (JSON.stringify(restoMdO) !== JSON.stringify(restoMdF)) {
    console.error('✗ Metadatos (fuera de OA) cambiaron en el nodo existente:', nOriginal.id); process.exit(1)
  }
}
for (const eOriginal of atlas.aristas) {
  const clave = `${eOriginal.de}->${eOriginal.a}`
  const eFinal = draft.aristas.find((e) => `${e.de}->${e.a}` === clave)
  if (JSON.stringify(eFinal) !== JSON.stringify(eOriginal)) { console.error('✗ Una arista existente cambió:', clave); process.exit(1) }
}
console.log(`\n✓ ${atlas.nodos.length} nodos existentes verificados (solo coordenada/OA-agregado tocados) · ${atlas.aristas.length} aristas existentes byte-idénticas`)

writeFileSync(RUTA_ATLAS, JSON.stringify(draft, null, 2) + '\n')
console.log(`\n✓ escrito: atlas_version ${atlas.atlas_version} -> ${draft.atlas_version}`)
console.log(`  +${nodosNuevosFinal.length} nodos, +${aristasNuevasFinal.length} aristas, +${regionesNuevas.length} regiones`)
console.log(`  nodos finales: ${draft.nodos.length} · aristas finales: ${draft.aristas.length}`)
