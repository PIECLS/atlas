// Validador del dataset del Atlas (prototipo JS del verificador R, Fase 6).
// Uso CLI:   node tools/validate.mjs
// Uso test:  import { validarSchema, chequeosEstructurales } from './validate.mjs'
//
// Falla (exit code 1) si el schema no valida o si hay errores estructurales.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(__dirname, '..')

// ── Validación contra el JSON Schema ───────────────────────────────────────
export function validarSchema(atlas, schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  // Formatos que el esquema declara; los aceptamos sin validación estricta.
  ajv.addFormat('date-time', true)
  ajv.addFormat('uri', true)
  const validate = ajv.compile(schema)
  const ok = validate(atlas)
  const errores = ok
    ? []
    : validate.errors.map((e) => `schema: ${e.instancePath || '/'} ${e.message}`)
  return { ok, errores }
}

// ── Grafo de precedencia (Capa 1) ──────────────────────────────────────────
// Los "nodos estructurales" son los que participan en alguna arista.
// Los nodos contenedores (zoom 1/2) son agregación visual, no estructura.
function construirGrafo(atlas) {
  const ids = new Set(atlas.nodos.map((n) => n.id))
  const succ = new Map() // a -> [b, ...]
  const pred = new Map() // b -> [a, ...]
  for (const id of ids) {
    succ.set(id, [])
    pred.set(id, [])
  }
  const estructurales = new Set()
  for (const { de, a } of atlas.aristas) {
    if (succ.has(de)) succ.get(de).push(a)
    if (pred.has(a)) pred.get(a).push(de)
    estructurales.add(de)
    estructurales.add(a)
  }
  return { ids, succ, pred, estructurales }
}

// Detección de ciclos por DFS con colores (blanco/gris/negro).
function detectarCiclo(ids, succ) {
  const color = new Map([...ids].map((id) => [id, 0])) // 0 blanco, 1 gris, 2 negro
  const pila = []
  let ciclo = null
  const visitar = (u) => {
    color.set(u, 1)
    pila.push(u)
    for (const v of succ.get(u)) {
      if (color.get(v) === 1) {
        const i = pila.indexOf(v)
        ciclo = pila.slice(i).concat(v)
        return true
      }
      if (color.get(v) === 0 && visitar(v)) return true
    }
    pila.pop()
    color.set(u, 2)
    return false
  }
  for (const id of ids) {
    if (color.get(id) === 0 && visitar(id)) break
  }
  return ciclo
}

// ¿b es alcanzable desde a? (BFS sobre succ, sin usar la arista directa a->b)
function alcanzable(a, b, succ, ignorarDirecta = false) {
  const visto = new Set([a])
  const cola = [...succ.get(a)]
  if (ignorarDirecta) {
    // primer nivel: saltar la arista directa a->b una sola vez
    const idx = cola.indexOf(b)
    if (idx !== -1) cola.splice(idx, 1)
  }
  while (cola.length) {
    const x = cola.shift()
    if (x === b) return true
    if (visto.has(x)) continue
    visto.add(x)
    for (const y of succ.get(x)) cola.push(y)
  }
  return false
}

// Aristas implicadas por transitividad: A->B redundante si hay otro camino A~>B.
function aristasRedundantes(atlas, succ) {
  const redundantes = []
  for (const { de, a } of atlas.aristas) {
    if (alcanzable(de, a, succ, true)) redundantes.push(`${de} -> ${a}`)
  }
  return redundantes
}

// Ancestros (prerrequisitos transitivos) de cada nodo estructural.
function ancestros(id, pred, cache = new Map()) {
  if (cache.has(id)) return cache.get(id)
  const acc = new Set()
  for (const p of pred.get(id) || []) {
    acc.add(p)
    for (const pp of ancestros(p, pred, cache)) acc.add(pp)
  }
  cache.set(id, acc)
  return acc
}

// n_estados = nº de conjuntos descendentes (order ideals) del orden parcial.
// Fuerza bruta sobre subconjuntos de nodos estructurales. Solo dominios pequeños.
function contarEstados(estructurales, pred) {
  const elems = [...estructurales]
  const n = elems.length
  if (n === 0) return { n_estados: 1, calculado: true }
  if (n > 20) return { n_estados: null, calculado: false } // 2^20 es el techo prudente
  const cache = new Map()
  const anc = elems.map((id) => ancestros(id, pred, cache))
  const idx = new Map(elems.map((id, i) => [id, i]))
  let cuenta = 0
  for (let mask = 0; mask < 1 << n; mask++) {
    let esIdeal = true
    for (let i = 0; i < n && esIdeal; i++) {
      if (!(mask & (1 << i))) continue
      // si i está, todos sus prerrequisitos deben estar
      for (const a of anc[i]) {
        if (!(mask & (1 << idx.get(a)))) {
          esIdeal = false
          break
        }
      }
    }
    if (esIdeal) cuenta++
  }
  return { n_estados: cuenta, calculado: true }
}

// ── Chequeos estructurales (el corazón; espejo del verificador R) ───────────
export function chequeosEstructurales(atlas) {
  const errores = []
  const advertencias = []

  // ids únicos
  const vistos = new Set()
  for (const n of atlas.nodos) {
    if (vistos.has(n.id)) errores.push(`id de nodo duplicado: ${n.id}`)
    vistos.add(n.id)
  }

  const { ids, succ, pred, estructurales } = construirGrafo(atlas)

  // referencias de aristas existen
  let refsValidas = true
  for (const { de, a } of atlas.aristas) {
    if (!ids.has(de)) {
      errores.push(`arista referencia nodo inexistente: ${de}`)
      refsValidas = false
    }
    if (!ids.has(a)) {
      errores.push(`arista referencia nodo inexistente: ${a}`)
      refsValidas = false
    }
  }

  // padre referencia un nodo existente
  for (const n of atlas.nodos) {
    if (n.padre != null && !ids.has(n.padre))
      errores.push(`nodo ${n.id}: padre inexistente ${n.padre}`)
  }

  // A1: clausula === null en todas las aristas
  for (const [i, e] of atlas.aristas.entries()) {
    if (e.clausula !== null && e.clausula !== undefined)
      errores.push(`arista #${i} (${e.de}->${e.a}): clausula debe ser null en v1 (A1)`)
  }

  // A2 (heurística ligera): la justificación no debe mencionar currículo/secuencia.
  // Ojo: se evitan términos matemáticos ambiguos ("unidad", ordinales de fracción)
  // que no son curriculares; solo se marcan señales claramente escolares.
  const prohibidas =
    /\b(curso|OA\s*\d|MA\d|clase|nivel escolar|año escolar|de enseñanza|currículo|curricular)\b/i
  for (const e of atlas.aristas) {
    if (e.justificacion && prohibidas.test(e.justificacion))
      advertencias.push(
        `arista ${e.de}->${e.a}: la justificación parece mencionar currículo/secuencia (A2). Revisar.`,
      )
  }

  // aciclicidad y reducción transitiva (solo si las referencias son válidas)
  let aciclico = true
  if (refsValidas) {
    const ciclo = detectarCiclo(ids, succ)
    if (ciclo) {
      errores.push(`ciclo detectado: ${ciclo.join(' -> ')}`)
      aciclico = false
    } else {
      const red = aristasRedundantes(atlas, succ)
      for (const r of red)
        errores.push(`arista redundante (implicada por transitividad, A6): ${r}`)
    }
  } else {
    aciclico = false
  }

  // huérfanos: nodos zoom 3 sin aristas → advertencia, no error
  for (const n of atlas.nodos) {
    if (n.nivel_zoom === 3 && !estructurales.has(n.id))
      advertencias.push(`nodo huérfano (zoom 3 sin aristas): ${n.id}`)
  }

  // n_estados (reportado, no validado). Solo tiene sentido sobre un DAG.
  const { n_estados, calculado } = aciclico
    ? contarEstados(estructurales, pred)
    : { n_estados: null, calculado: false }

  return {
    ok: errores.length === 0,
    errores,
    advertencias,
    nodos_estructurales: estructurales.size,
    n_estados,
    n_estados_calculado: calculado,
  }
}

// ── Runner CLI ──────────────────────────────────────────────────────────────
function main() {
  const schema = JSON.parse(
    readFileSync(resolve(RAIZ, 'data/atlas.schema.json'), 'utf8'),
  )
  const atlas = JSON.parse(
    readFileSync(resolve(RAIZ, 'data/atlas.numero.json'), 'utf8'),
  )

  const s = validarSchema(atlas, schema)
  const c = chequeosEstructurales(atlas)

  console.log('── Atlas · validación ──────────────────────────────')
  console.log(`schema:        ${s.ok ? 'OK' : 'FALLA'}`)
  console.log(`estructura:    ${c.ok ? 'OK' : 'FALLA'}`)
  console.log(`nodos estructurales: ${c.nodos_estructurales}`)
  console.log(
    `n_estados:     ${c.n_estados_calculado ? c.n_estados : '(dominio grande, no calculado)'}` +
      (c.n_estados_calculado ? ` de ${2 ** c.nodos_estructurales} posibles` : ''),
  )

  for (const w of c.advertencias) console.warn(`  ⚠ ${w}`)
  const errores = [...s.errores, ...c.errores]
  if (errores.length) {
    console.error('\nERRORES:')
    for (const e of errores) console.error(`  ✗ ${e}`)
    console.error(`\n${errores.length} error(es). El dataset NO se publica.`)
    process.exit(1)
  }
  console.log('\n✓ Todo verde. El dataset respeta el contrato.')
}

// Ejecuta solo si se invoca directamente (no al importar desde los tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
