// Migración ÚNICA (se corre una sola vez): separa el códex (`metadatos`) del
// esqueleto (`data/atlas.numero.json`) hacia dos archivos nuevos.
//
//   data/codex.json             — { [id_nodo]: Metadatos }, liviano por nodo.
//   data/codex_diccionario.json — { oa: {...}, bibliografia: {...} }, el
//                                  texto duro que SÍ se reutiliza entre
//                                  nodos hoy (medido: 113/209 códigos OA en
//                                  más de un nodo, 8/20 citas). El resto de
//                                  las categorías (representaciones, errores
//                                  frecuentes, adaptaciones PIE, ítems,
//                                  actitudes, evidencias, recursos) no tiene
//                                  reutilización real hoy y se queda anidado
//                                  tal cual dentro de codex.json — extraerla
//                                  sería una capa de referencia sin beneficio.
//
// `atlas.numero.json` queda sin `metadatos` en ningún nodo: solo estructura
// y geografía, lo que toca `tools/layout.mjs`.
//
// Uso: node tools/separar-codex.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = resolve(__dirname, '..', 'data')
const RUTA_ATLAS = resolve(DATA, 'atlas.numero.json')

const atlas = JSON.parse(readFileSync(RUTA_ATLAS, 'utf8'))

if (!atlas.nodos.some((n) => n.metadatos)) {
  console.log('Nada que migrar: ningún nodo tiene `metadatos`. ¿Ya se corrió esta migración?')
  process.exit(0)
}

// ── Slug para claves de bibliografía ────────────────────────────────────
const DIACRITICOS = /[̀-ͯ]/g
function slug(texto) {
  const base = texto
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return `bib_${base}`
}

// ── Recolectar OA y bibliografía de todo el dataset, antes de tocar nada ──
const oaPorCodigo = new Map() // codigo -> {curso, eje, textos: Set}
const bibPorTexto = new Map() // texto completo -> clave (se llena al vuelo)
const clavesUsadas = new Set()

for (const n of atlas.nodos) {
  for (const oa of n.metadatos?.oa_relacionados ?? []) {
    let e = oaPorCodigo.get(oa.codigo)
    if (!e) {
      e = { curso: undefined, eje: undefined, textos: new Set() }
      oaPorCodigo.set(oa.codigo, e)
    }
    if (!e.curso && oa.curso) e.curso = oa.curso
    if (!e.eje && oa.eje) e.eje = oa.eje
    if (oa.texto) e.textos.add(oa.texto)
  }
  for (const cita of n.metadatos?.bibliografia ?? []) {
    if (bibPorTexto.has(cita)) continue
    let clave = slug(cita)
    let sufijo = 2
    while (clavesUsadas.has(clave)) clave = `${slug(cita)}_${sufijo++}`
    clavesUsadas.add(clave)
    bibPorTexto.set(cita, clave)
  }
}

// ── codex_diccionario.json ─────────────────────────────────────────────
const diccionarioOA = {}
const revisionOA = [] // códigos con 2+ textos distintos no vacíos: reportar, no inventar
for (const [codigo, e] of [...oaPorCodigo].sort(([a], [b]) => a.localeCompare(b))) {
  const textos = [...e.textos]
  const texto = textos.length ? textos.reduce((a, b) => (b.length > a.length ? b : a)) : undefined
  diccionarioOA[codigo] = { curso: e.curso, eje: e.eje, texto }
  if (textos.length > 1) revisionOA.push({ codigo, textos })
}

const diccionarioBibliografia = {}
for (const [texto, clave] of [...bibPorTexto].sort(([, a], [, b]) => a.localeCompare(b))) {
  diccionarioBibliografia[clave] = texto
}

const codexDiccionario = { oa: diccionarioOA, bibliografia: diccionarioBibliografia }

// ── codex.json + atlas.numero.json sin metadatos ───────────────────────
const codex = {}
for (const n of atlas.nodos) {
  if (!n.metadatos) continue
  const m = { ...n.metadatos }
  if (m.oa_relacionados) {
    m.oa_relacionados = m.oa_relacionados.map((oa) => {
      const limpio = { codigo: oa.codigo }
      if (oa.cobertura) limpio.cobertura = oa.cobertura
      return limpio
    })
  }
  if (m.bibliografia) {
    m.bibliografia = m.bibliografia.map((cita) => bibPorTexto.get(cita))
  }
  codex[n.id] = m
  delete n.metadatos
}
const codexOrdenado = Object.fromEntries(
  Object.keys(codex)
    .sort()
    .map((id) => [id, codex[id]]),
)

// ── Escritura ────────────────────────────────────────────────────────────
writeFileSync(resolve(DATA, 'codex.json'), JSON.stringify(codexOrdenado, null, 2) + '\n')
writeFileSync(resolve(DATA, 'codex_diccionario.json'), JSON.stringify(codexDiccionario, null, 2) + '\n')
writeFileSync(RUTA_ATLAS, JSON.stringify(atlas, null, 2) + '\n')

if (revisionOA.length) {
  const filas = revisionOA.map(
    ({ codigo, textos }) => `${codigo},"${textos.map((t) => t.replace(/"/g, '""')).join(' | ')}"`,
  )
  const csv = 'codigo,variantes_encontradas\n' + filas.join('\n') + '\n'
  writeFileSync(resolve(DATA, 'oa_texto_a_revisar.csv'), csv)
}

console.log(`✓ codex.json: ${Object.keys(codexOrdenado).length} nodos con contenido`)
console.log(`✓ codex_diccionario.json: ${Object.keys(diccionarioOA).length} códigos OA, ${Object.keys(diccionarioBibliografia).length} citas`)
console.log(`✓ atlas.numero.json: metadatos removido de todos los nodos`)
if (revisionOA.length) {
  console.log(`\n⚠ ${revisionOA.length} códigos OA con texto distinto entre nodos (fragmentos del mismo OA oficial, no error) —`)
  console.log(`  se usó el más largo como placeholder. Revisar y consolidar a mano: data/oa_texto_a_revisar.csv`)
}
