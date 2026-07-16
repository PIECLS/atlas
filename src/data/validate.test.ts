import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// @ts-expect-error — módulo .mjs sin tipos; se consume por su contrato de runtime.
import { validarSchema, chequeosEstructurales } from '../../tools/validate.mjs'

const RAIZ = resolve(__dirname, '../..')
const schema = JSON.parse(readFileSync(resolve(RAIZ, 'data/atlas.schema.json'), 'utf8'))
const semilla = JSON.parse(readFileSync(resolve(RAIZ, 'data/atlas.numero.json'), 'utf8'))

describe('semilla', () => {
  it('valida contra el esquema', () => {
    expect(validarSchema(semilla, schema).ok).toBe(true)
  })

  it('pasa los chequeos estructurales', () => {
    const c = chequeosEstructurales(semilla)
    expect(c.ok).toBe(true)
    expect(c.errores).toEqual([])
  })

  it('reporta 6 estados de 4 nodos estructurales', () => {
    const c = chequeosEstructurales(semilla)
    expect(c.nodos_estructurales).toBe(4)
    expect(c.n_estados).toBe(6)
  })
})

describe('el verificador rechaza datasets inválidos', () => {
  it('falla ante un ciclo', () => {
    const conCiclo = structuredClone(semilla)
    // suma -> secuencia_verbal cierra el ciclo secuencia_verbal ~> ... -> suma -> secuencia_verbal
    conCiclo.aristas.push({
      de: 'suma',
      a: 'secuencia_verbal',
      justificacion: 'arista tramposa que crea un ciclo',
      confianza: 'hipotesis',
      clausula: null,
    })
    const c = chequeosEstructurales(conCiclo)
    expect(c.ok).toBe(false)
    expect(c.errores.some((e: string) => e.includes('ciclo'))).toBe(true)
  })

  it('falla ante una arista redundante (viola reducción transitiva, A6)', () => {
    const conRedundante = structuredClone(semilla)
    // secuencia_verbal -> cardinalidad -> suma ya existe; agregar el atajo es redundante
    conRedundante.aristas.push({
      de: 'secuencia_verbal',
      a: 'suma',
      justificacion: 'atajo implicado por transitividad',
      confianza: 'hipotesis',
      clausula: null,
    })
    const c = chequeosEstructurales(conRedundante)
    expect(c.ok).toBe(false)
    expect(c.errores.some((e: string) => e.includes('redundante'))).toBe(true)
  })

  it('falla ante una clausula no-null (A1)', () => {
    const conClausula = structuredClone(semilla)
    conClausula.aristas[0].clausula = 'B || C'
    const c = chequeosEstructurales(conClausula)
    expect(c.ok).toBe(false)
    expect(c.errores.some((e: string) => e.includes('clausula'))).toBe(true)
  })

  it('falla ante una arista que referencia un nodo inexistente', () => {
    const conFantasma = structuredClone(semilla)
    conFantasma.aristas.push({ de: 'cardinalidad', a: 'fantasma', clausula: null })
    const c = chequeosEstructurales(conFantasma)
    expect(c.ok).toBe(false)
    expect(c.errores.some((e: string) => e.includes('inexistente'))).toBe(true)
  })
})
