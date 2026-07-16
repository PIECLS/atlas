// Vista de nodo (Fase 4). El nodo deja de ser nodo y se vuelve objeto.
// Nueve pestañas de códex. Las vacías se muestran con su completitud (A7),
// no se ocultan. Los `nodo_implicado` de los errores son puentes diagnósticos.

import { useMemo, useState } from 'react'
import type { Nodo, Habilidad } from '../types/atlas'
import { getNodo, pred, reach, reachInv, todasLasAristas } from '../data/loadAtlas'
import { getRegion } from '../data/loadAtlas'
import { defVista, type Vista } from '../vistas'

interface Props {
  id: string
  vista: Vista
  onCerrar: () => void
  onIrANodo: (id: string) => void
}

const ETIQUETA_HABILIDAD: Record<Habilidad, string> = {
  resolver_problemas: 'Resolver problemas',
  representar: 'Representar',
  modelar: 'Modelar',
  argumentar_comunicar: 'Argumentar y comunicar',
}

const NOMBRE_COMPLETITUD = {
  esbozo: 'Esbozo',
  basica: 'Básica',
  completa: 'Completa',
} as const

interface Pestana {
  id: string
  nombre: string
  cuenta: number
  render: () => React.ReactNode
}

export default function VistaNodo({ id, vista, onCerrar, onIrANodo }: Props) {
  const nodo = getNodo(id)
  const def = defVista(vista)
  const m = nodo?.metadatos ?? {}

  const pestanas = useMemo<Pestana[]>(() => {
    if (!nodo) return []
    return construirPestanas(nodo, onIrANodo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Ordena según el énfasis de la vista; el resto en orden canónico.
  const ordenadas = useMemo(() => {
    const enf = def.enfasis
    return [...pestanas].sort((a, b) => {
      const ia = enf.indexOf(a.id)
      const ib = enf.indexOf(b.id)
      if (ia === -1 && ib === -1) return 0
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
  }, [pestanas, def])

  const [activa, setActiva] = useState(ordenadas[0]?.id ?? 'representaciones')
  const pest = ordenadas.find((p) => p.id === activa) ?? ordenadas[0]

  if (!nodo) return null
  const region = getRegion(nodo.region)

  return (
    <div className="vista-nodo-fondo" onClick={onCerrar}>
      <section
        className="vista-nodo"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Nodo ${nodo.nombre}`}
      >
        <header className="vn-cabecera">
          <button className="vn-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
          <div className="vn-region">
            {region && (
              <span
                className="punto"
                style={{ background: colorRegion(nodo.region) }}
              />
            )}
            {region?.nombre ?? 'Sin región'}
          </div>
          <h2 className="vn-titulo">{nodo.nombre}</h2>
          {m.definicion && <p className="vn-def">{m.definicion}</p>}
          <CompletitudInsignia c={nodo.completitud} />
          {def.muestraPropiedades && <PropiedadesEstructurales id={id} />}
        </header>

        <nav className="vn-tabs" role="tablist">
          {ordenadas.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={p.id === activa}
              onClick={() => setActiva(p.id)}
            >
              {p.nombre}
              {p.cuenta > 0 && <span className="cuenta">{p.cuenta}</span>}
            </button>
          ))}
        </nav>

        <div className="vn-cuerpo" role="tabpanel">
          {pest?.cuenta ? pest.render() : <Vacio completitud={nodo.completitud} />}
        </div>
      </section>
    </div>
  )
}

// ── Bloques ────────────────────────────────────────────────────────────────

function CompletitudInsignia({ c }: { c: Nodo['completitud'] }) {
  return (
    <div className="insignia-completitud">
      <span className="punto" style={{ background: `var(--${c})` }} />
      Códex: {NOMBRE_COMPLETITUD[c]}
    </div>
  )
}

function Vacio({ completitud }: { completitud: Nodo['completitud'] }) {
  return (
    <div className="vacio">
      <div className="icono">🌫️</div>
      <p>Aún sin cartografiar.</p>
      <small>
        Este nodo está en estado <b>{NOMBRE_COMPLETITUD[completitud].toLowerCase()}</b>. El
        mapa se publica incompleto: el códex se llena con el tiempo.
      </small>
    </div>
  )
}

function PropiedadesEstructurales({ id }: { id: string }) {
  const prereqDirectos = pred(id).length
  const prereqTotales = reachInv(id).size
  const posteriores = reach(id).size
  const confianzas = todasLasAristas()
    .filter((e) => e.a === id)
    .map((e) => e.confianza ?? 'hipotesis')
  const conf = confianzas.length
    ? [...new Set(confianzas)].join(', ')
    : '—'
  return (
    <div className="chips" style={{ marginTop: 12 }}>
      <span className="chip">prereq. directos: {prereqDirectos}</span>
      <span className="chip">prereq. totales: {prereqTotales}</span>
      <span className="chip">posteriores: {posteriores}</span>
      <span className="chip">confianza entrante: {conf}</span>
    </div>
  )
}

// Color de región resuelto desde CSS (para el punto). Sin hex en el componente.
function colorRegion(regionId: string | null | undefined): string {
  const reg = getRegion(regionId)
  const token = reg?.color_token
  const mapa: Record<string, string> = {
    'region-a': 'var(--region-a)',
    'region-b': 'var(--region-b)',
    'region-c': 'var(--region-c)',
  }
  return (token && mapa[token]) || 'var(--region-fallback)'
}

function construirPestanas(
  nodo: Nodo,
  onIrANodo: (id: string) => void,
): Pestana[] {
  const m = nodo.metadatos ?? {}
  return [
    {
      id: 'representaciones',
      nombre: 'Representaciones',
      cuenta: m.representaciones?.length ?? 0,
      render: () => (
        <div className="bloque">
          {m.representaciones!.map((r, i) => (
            <div className="tarjeta" key={i}>
              <span className="etiqueta">{r.tipo}</span>
              {r.nombre && <h4>{r.nombre}</h4>}
              {r.descripcion && <p>{r.descripcion}</p>}
              {r.ancla_visual && (
                <p style={{ marginTop: 6 }}>
                  <span className="oa-codigo">ancla: {r.ancla_visual}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'habilidades',
      nombre: 'Habilidades',
      cuenta: m.habilidades?.length ?? 0,
      render: () => (
        <div className="chips">
          {m.habilidades!.map((h) => (
            <span className="chip" key={h}>
              {ETIQUETA_HABILIDAD[h] ?? h}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: 'actitudes',
      nombre: 'Actitudes',
      cuenta: m.actitudes?.length ?? 0,
      render: () => (
        <div className="chips">
          {m.actitudes!.map((a) => (
            <span className="chip" key={a}>
              {a}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: 'errores',
      nombre: 'Errores frecuentes',
      cuenta: m.errores_frecuentes?.length ?? 0,
      render: () => (
        <div className="bloque">
          {m.errores_frecuentes!.map((err, i) => {
            const destino = err.nodo_implicado ? getNodo(err.nodo_implicado) : undefined
            return (
              <div className="tarjeta" key={err.id ?? i}>
                {err.naturaleza && <span className="etiqueta">{err.naturaleza}</span>}
                <p>{err.descripcion}</p>
                {err.retroalimentacion_sugerida && (
                  <p style={{ marginTop: 8, color: 'var(--texto-debil)' }}>
                    ↳ {err.retroalimentacion_sugerida}
                  </p>
                )}
                {destino && (
                  <button
                    className="enlace-puente"
                    onClick={() => onIrANodo(destino.id)}
                    title="Puente diagnóstico"
                  >
                    → Ir a «{destino.nombre}»
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ),
    },
    {
      id: 'oa',
      nombre: 'OA relacionados',
      cuenta: m.oa_relacionados?.length ?? 0,
      render: () => (
        <div className="bloque">
          {m.oa_relacionados!.map((oa, i) => (
            <div className="tarjeta" key={i}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span className="oa-codigo">{oa.codigo}</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {oa.curso && <span className="etiqueta">{oa.curso}</span>}
                  {oa.cobertura && <span className="cobertura">{oa.cobertura}</span>}
                </span>
              </div>
              {oa.eje && (
                <p style={{ marginTop: 6, color: 'var(--texto-debil)' }}>{oa.eje}</p>
              )}
              {oa.texto && <p style={{ marginTop: 6 }}>{oa.texto}</p>}
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'evaluacion',
      nombre: 'Evaluación',
      cuenta: m.evidencias?.length ?? 0,
      render: () => (
        <div className="bloque">
          <p style={{ color: 'var(--texto-debil)', fontSize: 12, marginBottom: 10 }}>
            Evidencias de dominio. No notas, no calificaciones.
          </p>
          <ul className="lista-limpia">
            {m.evidencias!.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      id: 'pie',
      nombre: 'PIE',
      cuenta: m.adaptaciones_pie?.length ?? 0,
      render: () => (
        <div className="bloque">
          <p style={{ color: 'var(--texto-debil)', fontSize: 12, marginBottom: 10 }}>
            Apoyos didácticos, indexados por barrera de acceso. Nunca por diagnóstico.
          </p>
          {m.adaptaciones_pie!.map((a, i) => (
            <div className="tarjeta" key={i}>
              {a.barrera && <h4>{a.barrera}</h4>}
              <p>{a.descripcion}</p>
              {a.tipo && (
                <span className="etiqueta" style={{ marginTop: 8 }}>
                  {a.tipo}
                </span>
              )}
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'recursos',
      nombre: 'Recursos',
      cuenta: m.recursos?.length ?? 0,
      render: () => (
        <div className="bloque">
          {m.recursos!.map((r, i) => (
            <div className="tarjeta" key={i}>
              <h4>{r.titulo}</h4>
              {r.tipo && <span className="etiqueta">{r.tipo}</span>}
              {r.url && (
                <p>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--acento)' }}
                  >
                    Abrir recurso ↗
                  </a>
                </p>
              )}
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'bibliografia',
      nombre: 'Bibliografía',
      cuenta: m.bibliografia?.length ?? 0,
      render: () => (
        <ul className="lista-limpia">
          {m.bibliografia!.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ),
    },
  ]
}
