// El lienzo (Fases 2–4.5). Sigma sobre el grafo de graphology.
// - Coordenadas leídas del dataset (A5); sin layout de fuerza en runtime.
// - Zoom semántico por fundidos, vía reducers (no se agregan/quitan nodos).
// - Selección tipo árbol tecnológico: se iluminan ancestros/descendientes; los
//   ancestros transitivos se ILUMINAN, pero sus aristas no se dibujan (A6).
// - Aristas inducidas (3.5): el zoom lejano AGREGA la estructura, no la esconde.
// - Resaltado por OA (4.5): ilumina los nodos de un OA; excluyente con la selección.

import { useEffect, useRef, useState } from 'react'
import Sigma from 'sigma'
import EdgeCurveProgram from '@sigma/edge-curve'
import { getCameraStateToFitViewportToNodes } from '@sigma/utils'
import { construirGrafo, reach, reachInv } from '../data/loadAtlas'
import { leerPaleta, rgba, type Paleta, type RGB } from './tokens'
import { alphaNivel, alphaAristaInducida } from './zoom'

export interface OAResaltado {
  codigo: string
  nodos: { id: string; cobertura?: string }[]
}

interface Props {
  seleccion: string | null
  onSeleccion: (id: string | null) => void
  onAbrir: (id: string) => void
  foco: { id: string; nonce: number } | null
  oa: OAResaltado | null
  onRatio?: (r: number) => void
}

type Grupo = 'sel' | 'pre' | 'post' | 'oa' | 'atenuado' | 'normal'

// Intensidad del resaltado de OA según cobertura (A3: un OA no pesa igual en todos).
function intensidadCobertura(cob?: string): number {
  switch (cob) {
    case 'total':
      return 1
    case 'parcial':
      return 0.75
    case 'tangencial':
      return 0.5
    default:
      return 0.7
  }
}

export default function MapaAtlas({
  seleccion,
  onSeleccion,
  onAbrir,
  foco,
  oa,
  onRatio,
}: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; texto: string } | null>(null)

  // Estado vivo leído por los reducers (evita recrear Sigma en cada cambio).
  const ratioRef = useRef(1)
  const selRef = useRef<string | null>(null)
  const ancRef = useRef<Set<string>>(new Set())
  const descRef = useRef<Set<string>>(new Set())
  const oaRef = useRef<string | null>(null)
  const oaCobRef = useRef<Map<string, string | undefined>>(new Map())
  const palRef = useRef<Paleta | null>(null)
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // Callbacks estables para los listeners de Sigma.
  const onSeleccionRef = useRef(onSeleccion)
  const onAbrirRef = useRef(onAbrir)
  const onRatioRef = useRef(onRatio)
  onSeleccionRef.current = onSeleccion
  onAbrirRef.current = onAbrir
  onRatioRef.current = onRatio

  // Crear Sigma una sola vez.
  useEffect(() => {
    if (!contenedorRef.current) return
    const grafo = construirGrafo()
    palRef.current = leerPaleta()

    // Estado visual de un nodo (alfa + grupo) combinando zoom, selección y OA.
    const estadoNodo = (
      node: string,
      nivelZoom: number,
    ): { alpha: number; base: RGB; grupo: Grupo } => {
      const pal = palRef.current!
      let alpha = alphaNivel(nivelZoom, ratioRef.current)
      let base = pal.region(grafo.getNodeAttribute(node, 'region') as string | null)
      let grupo: Grupo = 'normal'
      if (selRef.current) {
        if (node === selRef.current) {
          base = pal.selNodo
          alpha = 1
          grupo = 'sel'
        } else if (ancRef.current.has(node)) {
          base = pal.selPre
          alpha = Math.max(alpha, 0.92)
          grupo = 'pre'
        } else if (descRef.current.has(node)) {
          base = pal.selPost
          alpha = Math.max(alpha, 0.92)
          grupo = 'post'
        } else {
          base = pal.atenuado
          alpha = alpha * 0.16
          grupo = 'atenuado'
        }
      } else if (oaRef.current) {
        if (oaCobRef.current.has(node)) {
          base = pal.oa
          alpha = intensidadCobertura(oaCobRef.current.get(node)) // visible pese al zoom
          grupo = 'oa'
        } else {
          base = pal.atenuado
          alpha = alpha * 0.16
          grupo = 'atenuado'
        }
      }
      return { alpha, base, grupo }
    }

    const sigma = new Sigma(grafo, contenedorRef.current, {
      allowInvalidContainer: false,
      renderLabels: true,
      enableEdgeEvents: true,
      zIndex: true,
      labelColor: {
        color:
          getComputedStyle(document.documentElement).getPropertyValue('--texto-tenue').trim() ||
          '#9aa6b8',
      },
      labelFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      labelSize: 12,
      labelWeight: '500',
      labelDensity: 1.2,
      // Etiquetas ambiente: solo nodos grandes en pantalla (el tamaño ya viene
      // del ICA), sin encaballarse. Los resaltados (selección/OA) se fuerzan
      // aparte, sin pasar por este filtro. El resto queda disponible al hover
      // (Sigma lo dibuja aparte, siempre que no se vacíe el texto del label).
      labelRenderedSizeThreshold: 12,
      labelGridCellSize: 60,
      defaultEdgeType: 'curve',
      edgeProgramClasses: { curve: EdgeCurveProgram },
      minCameraRatio: 0.15,
      maxCameraRatio: 3.5,

      nodeReducer: (node, data) => {
        const { alpha, base, grupo } = estadoNodo(node, data.nivelZoom as number)
        const res: Record<string, unknown> = { ...data }
        if (alpha < 0.04) {
          res.hidden = true
          return res
        }
        res.hidden = false
        res.color = rgba(base, alpha)
        if (grupo === 'sel') res.size = (data.size as number) * 1.3
        else if (grupo === 'oa') res.size = (data.size as number) * 1.15
        const resaltado = grupo !== 'atenuado' && grupo !== 'normal'
        if (resaltado) {
          // Selección/OA: la etiqueta se fuerza, sin importar el tamaño en pantalla.
          res.forceLabel = true
        } else if (grupo === 'atenuado') {
          // Dimidos a propósito: nunca compiten por espacio de etiqueta ambiente.
          // El texto se vacía (no solo forceLabel:false) porque de lo contrario
          // seguirían siendo candidatos válidos para el sistema automático si
          // su tamaño (ICA) superara el umbral.
          res.forceLabel = false
          res.label = ''
        } else {
          // Ambiente: decide Sigma (labelRenderedSizeThreshold + labelGridCellSize).
          // data.label se conserva para que el hover siga funcionando siempre.
          res.forceLabel = false
        }
        return res
      },

      edgeReducer: (edge, data) => {
        const pal = palRef.current!
        const res: Record<string, unknown> = { ...data }
        const resaltando = !!selRef.current || !!oaRef.current

        // Aristas inducidas (3.5): agregación; más gruesas y difusas que las reales.
        if (data.tipo === 'inducida') {
          const nivel = data.nivel as number
          let alpha = alphaAristaInducida(nivel, ratioRef.current)
          if (resaltando) alpha *= 0.1 // no compiten con el resaltado
          if (alpha < 0.02) {
            res.hidden = true
            return res
          }
          res.hidden = false
          res.color = rgba(pal.arista, alpha * 0.85)
          const peso = (data.peso as number) ?? 1
          res.size = 3 + Math.min(peso, 10) * 0.55
          return res
        }

        // Aristas reales (zoom 3).
        const [s, t] = grafo.extremities(edge)
        const a = estadoNodo(s, grafo.getNodeAttribute(s, 'nivelZoom'))
        const b = estadoNodo(t, grafo.getNodeAttribute(t, 'nivelZoom'))
        let alpha = Math.min(a.alpha, b.alpha)
        let color = pal.arista
        let size = 1.4
        if (resaltando) {
          const activo = (g: Grupo) => g !== 'atenuado' && g !== 'normal'
          if (activo(a.grupo) && activo(b.grupo)) {
            color = pal.aristaViva
            alpha = Math.max(a.alpha, b.alpha) * 0.9
            size = 2.4
          } else {
            alpha *= 0.12
          }
        }
        if (alpha < 0.03) {
          res.hidden = true
          return res
        }
        res.hidden = false
        res.color = rgba(color, alpha)
        res.size = size
        return res
      },
    })

    sigmaRef.current = sigma
    if (import.meta.env.DEV) {
      ;(window as unknown as { __mapa?: unknown }).__mapa = sigma
    }

    // Fundidos del zoom: reejecutar reducers al mover la cámara (rAF-throttle).
    let pendiente = false
    const camara = sigma.getCamera()
    camara.on('updated', () => {
      ratioRef.current = camara.ratio
      onRatioRef.current?.(camara.ratio)
      if (pendiente) return
      pendiente = true
      requestAnimationFrame(() => {
        pendiente = false
        sigma.refresh({ skipIndexation: true })
      })
    })

    // Interacción: 1 clic selecciona; doble clic abre la vista de nodo.
    sigma.on('clickNode', ({ node }) => onSeleccionRef.current(node))
    sigma.on('doubleClickNode', (e) => {
      e.preventSigmaDefault()
      onAbrirRef.current(e.node)
    })
    sigma.on('clickStage', () => onSeleccionRef.current(null))

    // Tooltip de aristas inducidas: "N dependencias entre estos dominios".
    const alMover = (ev: MouseEvent) => {
      mouseRef.current = { x: ev.clientX, y: ev.clientY }
    }
    contenedorRef.current.addEventListener('mousemove', alMover)
    sigma.on('enterEdge', ({ edge }) => {
      if (grafo.getEdgeAttribute(edge, 'tipo') !== 'inducida') return
      const peso = grafo.getEdgeAttribute(edge, 'peso') as number
      setTip({
        x: mouseRef.current.x,
        y: mouseRef.current.y,
        texto: `${peso} ${peso === 1 ? 'dependencia' : 'dependencias'} entre estos dominios`,
      })
    })
    sigma.on('leaveEdge', () => setTip(null))

    // Reaccionar al cambio de esquema claro/oscuro.
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const alCambiarTema = () => {
      palRef.current = leerPaleta()
      sigma.setSetting('labelColor', {
        color:
          getComputedStyle(document.documentElement).getPropertyValue('--texto-tenue').trim() ||
          '#9aa6b8',
      })
      sigma.refresh()
    }
    mq.addEventListener('change', alCambiarTema)

    onRatioRef.current?.(camara.ratio)
    const contenedor = contenedorRef.current

    return () => {
      mq.removeEventListener('change', alCambiarTema)
      contenedor?.removeEventListener('mousemove', alMover)
      sigma.kill()
      sigmaRef.current = null
    }
  }, [])

  // Selección -> actualizar refs y refrescar reducers.
  useEffect(() => {
    selRef.current = seleccion
    ancRef.current = seleccion ? reachInv(seleccion) : new Set()
    descRef.current = seleccion ? reach(seleccion) : new Set()
    sigmaRef.current?.refresh()
  }, [seleccion])

  // OA activo -> resaltar sus nodos y encuadrar (zoom-to-fit) sobre ellos.
  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma) return
    oaRef.current = oa?.codigo ?? null
    oaCobRef.current = new Map((oa?.nodos ?? []).map((n) => [n.id, n.cobertura]))
    sigma.refresh()
    if (oa && oa.nodos.length) {
      const ids = oa.nodos.map((n) => n.id).filter((id) => sigma.getGraph().hasNode(id))
      if (ids.length) {
        try {
          const estado = getCameraStateToFitViewportToNodes(sigma, ids)
          sigma.getCamera().animate({ ...estado, ratio: Math.min(estado.ratio, 0.55) }, { duration: 650 })
        } catch {
          /* si el fit falla, no rompemos la interacción */
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oa?.codigo])

  // Foco: centrar la cámara en un nodo (p. ej. al saltar desde un puente diagnóstico).
  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma || !foco) return
    const disp = sigma.getNodeDisplayData(foco.id)
    if (!disp) return
    sigma.getCamera().animate(
      { x: disp.x, y: disp.y, ratio: Math.min(sigma.getCamera().ratio, 0.5) },
      { duration: 650 },
    )
  }, [foco])

  return (
    <>
      <div ref={contenedorRef} className="mapa" />
      {tip && (
        <div className="arista-tip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
          {tip.texto}
        </div>
      )}
    </>
  )
}
