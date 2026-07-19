// Auditoría del ICA (tools/ica.mjs) sobre el dataset publicado. Imprime la
// tabla completa (impacto_bruto, I, B, ICA, radio) por nodo, ordenada de mayor
// a menor, y corre la "verificación rápida" de la especificación:
//   · los cuellos de botella tempranos quedan entre los mayores
//   · las hojas terminales quedan en R_MIN o cerca
//   · algún nodo-puente de baja descendencia pero alto tránsito queda en
//     tamaño medio, no en el mínimo (si cae en el mínimo, betweenness no se
//     está aplicando)
//
// Uso: node tools/audit-ica.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { calcularICA, R_MIN, R_MAX } from './ica.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const atlas = JSON.parse(readFileSync(resolve(__dirname, '..', 'data', 'atlas.numero.json'), 'utf8'))

const ica = calcularICA(atlas.nodos, atlas.aristas)
const nombrePorId = new Map(atlas.nodos.map((n) => [n.id, n.nombre]))

const filas = [...ica.entries()]
  .map(([id, r]) => ({ id, nombre: nombrePorId.get(id), ...r }))
  .sort((a, b) => b.ICA - a.ICA)

console.log(`── ICA · ${filas.length} nodos zoom 3 (R_MIN=${R_MIN}, R_MAX=${R_MAX}) ──\n`)
const col = (s, w) => String(s).padEnd(w).slice(0, w)
console.log(
  col('nodo', 32) + col('impacto', 9) + col('I', 7) + col('B', 7) + col('ICA', 7) + col('radio', 6),
)
for (const f of filas) {
  console.log(
    col(f.id, 32) +
      col(f.impacto_bruto, 9) +
      col(f.I.toFixed(3), 7) +
      col(f.B.toFixed(3), 7) +
      col(f.ICA.toFixed(3), 7) +
      col(f.radio.toFixed(1), 6),
  )
}

// ── Verificación rápida (de la especificación) ─────────────────────────────
console.log('\n── Verificación rápida ──')
const porId = new Map(filas.map((f) => [f.id, f]))
const rango = (id) => {
  const i = filas.findIndex((f) => f.id === id)
  return i === -1 ? null : i + 1
}

const cuellosDeBottella = ['cardinalidad', 'composicion_aditiva', 'valor_posicional']
console.log('Cuellos de botella tempranos (deberían estar entre los mayores):')
for (const id of cuellosDeBottella) {
  const f = porId.get(id)
  if (!f) { console.log(`  ? ${id}: no está en el dataset`); continue }
  const r = rango(id)
  const ok = r <= Math.ceil(filas.length * 0.15) // entre el 15% más grande
  console.log(`  ${ok ? '✓' : '⚠'} ${id}: puesto ${r}/${filas.length}, radio=${f.radio.toFixed(1)}`)
}

const hojasTerminal = ['numero_mixto', 'volumen_paralelepipedo', 'division']
console.log('\nHojas terminales (deberían quedar en R_MIN o cerca):')
for (const id of hojasTerminal) {
  const f = porId.get(id)
  if (!f) { console.log(`  ? ${id}: no está en el dataset`); continue }
  const ok = f.radio <= R_MIN + (R_MAX - R_MIN) * 0.2
  console.log(`  ${ok ? '✓' : '⚠'} ${id}: radio=${f.radio.toFixed(1)} (impacto_bruto=${f.impacto_bruto})`)
}

const puentes = ['multiplicacion', 'estructura_arreglo_area']
console.log('\nNodos-puente (deberían quedar en tamaño medio, no en el mínimo):')
for (const id of puentes) {
  const f = porId.get(id)
  if (!f) { console.log(`  ? ${id}: no está en el dataset`); continue }
  const enMinimo = f.radio <= R_MIN + (R_MAX - R_MIN) * 0.1
  console.log(
    `  ${enMinimo ? '✗' : '✓'} ${id}: radio=${f.radio.toFixed(1)}, B=${f.B.toFixed(3)}, impacto_bruto=${f.impacto_bruto}` +
      (enMinimo ? '  ← en el mínimo: revisar si betweenness se está aplicando' : ''),
  )
}
