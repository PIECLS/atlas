// Traducción literal de atlas.schema.json (schema_version 1.0.0).
// NO agregar campos que no estén en el esquema. Los tipos son el contrato.

export type Completitud = 'esbozo' | 'basica' | 'completa'
export type NivelZoom = 1 | 2 | 3
export type Confianza = 'hipotesis' | 'consenso_experto' | 'validada_empiricamente'
export type Cobertura = 'total' | 'parcial' | 'tangencial'
export type TipoRepresentacion = 'concreto' | 'pictorico' | 'simbolico'
export type Habilidad =
  | 'resolver_problemas'
  | 'representar'
  | 'modelar'
  | 'argumentar_comunicar'
export type NaturalezaError =
  | 'conceptual'
  | 'procedimental'
  | 'representacional'
  | 'atencional'
export type FormatoItem =
  | 'respuesta_construida'
  | 'seleccion_multiple'
  | 'manipulativo'
  | 'observacional'
export type TipoAdaptacion = 'acceso' | 'presentacion' | 'respuesta' | 'tiempo' | 'entorno'
export type TipoRecurso = 'actividad' | 'video' | 'lectura' | 'manipulativo' | 'app'
export type Audiencia = 'profesor' | 'estudiante' | 'pie' | 'investigador'

export interface Coordenada {
  x: number
  y: number
  fijada_a_mano?: boolean
}

export interface Region {
  id: string
  nombre: string
  color_token?: string
  orden_x?: number
}

export interface Dominio {
  id: string
  nombre: string
  descripcion?: string
  asignatura?: string
}

export interface OA {
  codigo: string
  curso?: string
  eje?: string
  texto?: string
  cobertura?: Cobertura
}

export interface Representacion {
  tipo: TipoRepresentacion
  nombre?: string
  descripcion?: string
  ancla_visual?: string
}

export interface ErrorFrecuente {
  id?: string
  descripcion: string
  naturaleza?: NaturalezaError
  /** id de un nodo prerrequisito cuyo no-dominio explicaría el error. Puente diagnóstico; no crea arista. */
  nodo_implicado?: string | null
  retroalimentacion_sugerida?: string
}

export interface Item {
  id: string
  enunciado?: string
  formato?: FormatoItem
  /** ids de nodos. Esto ES el skill map de CbKST. */
  competencias_requeridas?: string[]
}

export interface Adaptacion {
  descripcion: string
  /** Se indexa por barrera, nunca por diagnóstico. */
  barrera?: string
  tipo?: TipoAdaptacion
}

export interface Recurso {
  titulo: string
  url?: string
  tipo?: TipoRecurso
  audiencia?: Audiencia[]
}

export interface Metadatos {
  definicion?: string
  descripcion?: string
  oa_relacionados?: OA[]
  representaciones?: Representacion[]
  habilidades?: Habilidad[]
  actitudes?: string[]
  errores_frecuentes?: ErrorFrecuente[]
  items?: Item[]
  evidencias?: string[]
  adaptaciones_pie?: Adaptacion[]
  recursos?: Recurso[]
  bibliografia?: string[]
}

export interface Nodo {
  id: string
  nombre: string
  nivel_zoom: NivelZoom
  completitud: Completitud
  region?: string
  /** Agregación visual, no prerrequisito. No participa en la estructura KST. */
  padre?: string | null
  coordenada?: Coordenada
  metadatos?: Metadatos
}

export interface Arista {
  de: string
  a: string
  justificacion?: string
  /** RESERVADO v3. En v1 siempre null. */
  clausula?: string | null
  confianza?: Confianza
}

export interface Certificacion {
  verificado?: boolean
  fecha?: string
  herramienta?: string
  aciclico?: boolean
  reduccion_transitiva?: boolean
  huerfanos?: string[]
  n_estados?: number
  notas?: string
}

export interface Atlas {
  atlas_version: string
  schema_version: '1.0.0'
  generado?: string
  certificacion?: Certificacion
  dominio: Dominio
  regiones?: Region[]
  nodos: Nodo[]
  aristas: Arista[]
}
