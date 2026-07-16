// El lienzo (Fases 2–4). Sigma sobre el grafo de graphology.
// - Coordenadas leídas del dataset (A5); sin layout de fuerza en runtime.
// - Zoom semántico por fundidos, vía nodeReducer (no se agregan/quitan nodos).
// - Selección tipo árbol tecnológico: ancestros y descendientes se iluminan;
//   los ancestros transitivos se ILUMINAN pero sus aristas no se dibujan (A6).

import { useEffect, useRef } from 'react'
import Sigma from 'sigma'
import EdgeCurveProgram from '@sigma/edge-curve'
import { construirGrafo, reach, reachInv } from '../data/loadAtlas'
import { leerPaleta, rgba, type Paleta, type RGB } from './tokens'
import { alphaNivel } from './zoom'

interface Props {
  seleccion: string | null
  onSeleccion: (id: string | null) => void
  onAbrir: (id: string) => void
  foco: { id: string; nonce: number } | null
  onRatio?: (r: number) => void
}

type Grupo = 'sel' | 'pre' | 'post' | 'atenuado' | 'normal'

export default function MapaAtlas({
  seleccion,
  onSeleccion,
  onAbrir,
  foco,
  onRatio,
}: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)

  // Estado vivo leído por los reducers (evita recrear Sigma en cada cambio).
  const ratioRef = useRef(1)
  const selRef = useRef<string | null>(null)
  const ancRef = useRef<Set<string>>(new Set())
  const descRef = useRef<Set<string>>(new Set())
  const palRef = useRef<Paleta | null>(null)

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

    // Estado visual de un nodo (alfa + grupo) combinando zoom y selección.
    const estadoNodo = (
      node: string,
      nivelZoom: number,
    ): { alpha: number; base: RGB; grupo: Grupo } => {
      const pal = palRef.current!
      const sel = selRef.current
      let alpha = alphaNivel(nivelZoom, ratioRef.current)
      const regionColor = (attr: unknown) => pal.region(attr as string | null)
      let base = regionColor(grafo.getNodeAttribute(node, 'region'))
      let grupo: Grupo = 'normal'
      if (sel) {
        if (node === sel) {
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
      }
      return { alpha, base, grupo }
    }

    const sigma = new Sigma(grafo, contenedorRef.current, {
      allowInvalidContainer: false,
      renderLabels: true,
      zIndex: true,
      labelColor: { color: getComputedStyle(document.documentElement).getPropertyValue('--texto-tenue').trim() || '#9aa6b8' },
      labelFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      labelSize: 12,
      labelWeight: '500',
      labelDensity: 1.2,
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
        const mostrarEtiqueta = grupo !== 'atenuado' && (grupo !== 'normal' || alpha > 0.5)
        res.forceLabel = mostrarEtiqueta
        if (!mostrarEtiqueta) res.label = ''
        return res
      },

      edgeReducer: (edge, data) => {
        const pal = palRef.current!
        const [s, t] = grafo.extremities(edge)
        const a = estadoNodo(s, grafo.getNodeAttribute(s, 'nivelZoom'))
        const b = estadoNodo(t, grafo.getNodeAttribute(t, 'nivelZoom'))
        const res: Record<string, unknown> = { ...data }
        let alpha = Math.min(a.alpha, b.alpha)
        let color = pal.arista
        let size = 1.4
        if (selRef.current) {
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

    // Reaccionar al cambio de esquema claro/oscuro.
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const alCambiarTema = () => {
      palRef.current = leerPaleta()
      sigma.setSetting(
        'labelColor',
        { color: getComputedStyle(document.documentElement).getPropertyValue('--texto-tenue').trim() || '#9aa6b8' },
      )
      sigma.refresh()
    }
    mq.addEventListener('change', alCambiarTema)

    onRatioRef.current?.(camara.ratio)

    return () => {
      mq.removeEventListener('change', alCambiarTema)
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

  return <div ref={contenedorRef} className="mapa" />
}
