import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// @ts-expect-error — módulo .mjs sin tipos; se consume por su contrato de runtime.
import { validarSchema, chequeosEstructurales } from '../../tools/validate.mjs'

const RAIZ = resolve(__dirname, '../..')
const schema = JSON.parse(readFileSync(resolve(RAIZ, 'data/atlas.schema.json'), 'utf8'))
const dataset = JSON.parse(readFileSync(resolve(RAIZ, 'data/atlas.numero.json'), 'utf8'))

// Fixture mínima e independiente del dataset publicado, para fijar la lógica del
// verificador aunque el Atlas crezca: 4 nodos estructurales -> 6 conjuntos descendentes.
//   secuencia_verbal ─┐
//                     ├─> cardinalidad ─> suma
//   correspondencia ──┘
function mini() {
  return {
    atlas_version: '0.0.0',
    schema_version: '1.0.0',
    dominio: { id: 'mini', nombre: 'Mini' },
    regiones: [{ id: 'r', nombre: 'R', orden_x: 0, color_token: 'region-a' }],
    nodos: [
      { id: 'secuencia_verbal', nombre: 'Secuencia', nivel_zoom: 3, region: 'r', completitud: 'basica', coordenada: { x: -40, y: 0 } },
      { id: 'correspondencia', nombre: 'Correspondencia', nivel_zoom: 3, region: 'r', completitud: 'basica', coordenada: { x: 40, y: 0 } },
      { id: 'cardinalidad', nombre: 'Cardinalidad', nivel_zoom: 3, region: 'r', completitud: 'completa', coordenada: { x: 0, y: 120 } },
      { id: 'suma', nombre: 'Suma', nivel_zoom: 3, region: 'r', completitud: 'basica', coordenada: { x: 0, y: 240 } },
    ],
    aristas: [
      { de: 'secuencia_verbal', a: 'cardinalidad', clausula: null },
      { de: 'correspondencia', a: 'cardinalidad', clausula: null },
      { de: 'cardinalidad', a: 'suma', clausula: null },
    ],
  }
}

describe('dataset publicado', () => {
  it('valida contra el esquema', () => {
    expect(validarSchema(dataset, schema).ok).toBe(true)
  })

  it('pasa los chequeos estructurales (aciclicidad, reducción transitiva, clausula null)', () => {
    const c = chequeosEstructurales(dataset)
    expect(c.errores).toEqual([])
    expect(c.ok).toBe(true)
  })
})

describe('lógica del verificador (fixture mínima)', () => {
  it('la fixture es válida y reporta 6 estados de 4 nodos estructurales', () => {
    expect(validarSchema(mini(), schema).ok).toBe(true)
    const c = chequeosEstructurales(mini())
    expect(c.ok).toBe(true)
    expect(c.nodos_estructurales).toBe(4)
    expect(c.n_estados).toBe(6)
  })

  it('falla ante un ciclo', () => {
    const x = mini()
    x.aristas.push({ de: 'suma', a: 'secuencia_verbal', clausula: null })
    const c = chequeosEstructurales(x)
    expect(c.ok).toBe(false)
    expect(c.errores.some((e: string) => e.includes('ciclo'))).toBe(true)
  })

  it('falla ante una arista redundante (viola reducción transitiva, A6)', () => {
    const x = mini()
    x.aristas.push({ de: 'secuencia_verbal', a: 'suma', clausula: null }) // atajo implicado
    const c = chequeosEstructurales(x)
    expect(c.ok).toBe(false)
    expect(c.errores.some((e: string) => e.includes('redundante'))).toBe(true)
  })

  it('falla ante una clausula no-null (A1)', () => {
    const x = mini()
    x.aristas[0].clausula = 'B || C'
    const c = chequeosEstructurales(x)
    expect(c.ok).toBe(false)
    expect(c.errores.some((e: string) => e.includes('clausula'))).toBe(true)
  })

  it('falla ante una arista que referencia un nodo inexistente', () => {
    const x = mini()
    x.aristas.push({ de: 'cardinalidad', a: 'fantasma', clausula: null })
    const c = chequeosEstructurales(x)
    expect(c.ok).toBe(false)
    expect(c.errores.some((e: string) => e.includes('inexistente'))).toBe(true)
  })
})
