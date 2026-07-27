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
import { dibujarEtiquetaDebajo } from './etiquetas'

export interface OAResaltado {
  codigo: string
  nodos: { id: string; cobertura?: string }[]
}

export type Proyeccion = 'capas' | 'radial'

interface Props {
  seleccion: string | null
  onSeleccion: (id: string | null) => void
  onAbrir: (id: string) => void
  foco: { id: string; nonce: number } | null
  oa: OAResaltado | null
  proyeccion: Proyeccion
  onAnimandoProyeccion?: (activo: boolean) => void
  onRatio?: (r: number) => void
}

// Transición entre proyecciones (Fase 3.6-B): nunca un salto, siempre un
// desplazamiento (A5: preserva la memoria espacial).
const DURACION_PROYECCION_MS = 700
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

type Grupo = 'sel' | 'pre' | 'post' | 'oa' | 'atenuado' | 'normal'

// Umbral de ratio bajo el cual se dibujan curvas (banda "cercano"); por
// encima, rectas (menos geometría en lejano/medio, Fase 3.6-A).
const T_RATIO_CURVA = 0.6
// Cambio mínimo de ratio para considerar que el zoom semántico debe
// re-evaluarse. El paneo puro (x/y sin cambio de ratio) nunca lo cruza:
// cero refrescos durante un arrastre (Fase 3.6-A).
const PASO_RATIO_REFRESCO = 0.03

// Escalado de tamaño con el zoom (Fase 3.7-A). Por defecto Sigma crece el
// tamaño en pantalla con 1/sqrt(ratio) mientras la SEPARACIÓN entre nodos
// crece con 1/ratio (geometría pura, lineal): el radio siempre gana terreno
// sobre el hueco, y acercarse no despega nada — medido: a ratio=0.15 (máximo
// zoom permitido) el radio ya superaba la separación entre vecinos. Fix:
// `zoomToSizeRatioFunction` pasa a ser la identidad (ratio => ratio), así
// `size / ratio` queda bajo control total del reducer, que aplica su propia
// curva SUBLINEAL (EXPONENTE_TAMANO < 1, más chica que la lineal de las
// distancias) y un clamp duro en píxeles de pantalla — un nodo nunca
// desaparece ni ocupa media vista, sin importar cuánto se acerque o aleje la
// cámara.
const EXPONENTE_TAMANO = 0.3
const TAMANO_PANTALLA_MIN = 4
const TAMANO_PANTALLA_MAX = 30
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}
// tamanoBase ya es el tamaño "de referencia" a ratio=1 (ICA o agregación).
// maxPantalla se relaja un poco para el nodo seleccionado/resaltado por OA
// (nunca hay más de un puñado a la vez; conviene que sigan destacando incluso
// si el clamp ya "aplastó" el resto de la capa contra el techo).
function tamanoParaSigma(tamanoBase: number, ratio: number, maxPantalla = TAMANO_PANTALLA_MAX): number {
  const deseado = clamp(tamanoBase * ratio ** -EXPONENTE_TAMANO, TAMANO_PANTALLA_MIN, maxPantalla)
  return deseado * ratio
}

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
  proyeccion,
  onAnimandoProyeccion,
  onRatio,
}: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; texto: string } | null>(null)
  const proyeccionActualRef = useRef<Proyeccion>('capas')
  const animacionRef = useRef<number | null>(null)

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
    // Escribe en `out` en vez de retornar un objeto nuevo (dos scratch objects
    // reutilizables abajo, uno por extremo de arista) — Fase 3.6-A: cero
    // asignaciones dentro de los reducers, ni siquiera las auxiliares.
    interface EstadoNodo {
      alpha: number
      base: RGB
      grupo: Grupo
    }
    const calcularEstadoNodo = (out: EstadoNodo, node: string, nivelZoom: number): void => {
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
      out.alpha = alpha
      out.base = base
      out.grupo = grupo
    }
    // Scratch reutilizable: nodeReducer usa solo `estadoA`; edgeReducer (aristas
    // reales) necesita los dos extremos vivos a la vez, de ahí el segundo.
    const estadoA: EstadoNodo = { alpha: 0, base: { r: 0, g: 0, b: 0 }, grupo: 'normal' }
    const estadoB: EstadoNodo = { alpha: 0, base: { r: 0, g: 0, b: 0 }, grupo: 'normal' }

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
      // Fase 3.7-B1: centrada debajo del nodo, no al costado — la posición
      // lateral por defecto invade la banda horizontal del vecino de la misma
      // capa (~165px de ancho típico). El hover (drawDiscNodeHover, nativo de
      // Sigma) no se toca: siempre visible, no compite con nada más.
      defaultDrawNodeLabel: dibujarEtiquetaDebajo,
      // Fase 3.7-B2: menos etiquetas ambiente, y que Sigma las descarte por
      // colisión en vez de superponerlas. threshold más alto = en lejano/medio
      // solo los nodos grandes se etiquetan. La grilla de Sigma (LabelGrid)
      // NO mide el ancho real del texto: solo garantiza separación ≈
      // gridCellSize entre candidatos de celdas distintas. Medido en el
      // navegador con gridCellSize=90: colisiones reales de hasta 276 pares
      // en 24 etiquetas, porque el texto (165px promedio, hasta 340px) es
      // mucho más ancho que la celda. gridCellSize se sube a 260 (por encima
      // del ancho promedio real) para que celdas vecinas no se pisen; density
      // baja para compensar que, a mayor cellSize, cada celda cubre más área
      // y sigma.getLabelsToDisplay ya no la usa como filtro efectivo en zoom
      // cercano (density/ratio² crece rápido).
      labelDensity: 0.35,
      labelRenderedSizeThreshold: 16,
      labelGridCellSize: 260,
      defaultEdgeType: 'curve',
      edgeProgramClasses: { curve: EdgeCurveProgram },
      // El rango de zoom debe alcanzar para que, en el máximo acercamiento,
      // la separación en pantalla (que depende del tamaño ABSOLUTO del
      // layout) supere claramente el diámetro clampeado del nodo (3.7-A). El
      // layout de la Fase 3.7-C creció ~5x en escala (SEP_NODO 96->454); sin
      // bajar este piso, a ratio=0.15 el diámetro casi igualaba la
      // separación (60 vs 59.3px, medido) — técnicamente no se tocaban, pero
      // sin ningún margen real.
      // La proyección radial tiene ~2x la extensión (bounding box) de la
      // proyección en capas (mismo par mínimo, 453-454px en el grafo, se ve
      // a la mitad de píxeles en pantalla al mismo ratio) porque los anillos
      // se empujan hacia afuera para caber SEP_NODO. Un solo piso de zoom
      // debe cubrir el peor caso (radial), no solo capas — medido: a
      // ratio=0.03 el par mínimo radial SÍ se tocaba (58.2 vs 60px).
      minCameraRatio: 0.012,
      maxCameraRatio: 3.5,
      // Fase 3.7-A: el tamaño en pantalla lo decide el reducer (curva
      // sublineal + clamp), no la fórmula por defecto de Sigma. Con la
      // identidad, `size/ratio` reproduce exactamente lo que el reducer ya
      // calculó — ver tamanoParaSigma().
      itemSizesReference: 'screen',
      zoomToSizeRatioFunction: (ratio: number) => ratio,

      nodeReducer: (node, data) => {
        // Sigma ya entrega `data` como copia privada (Object.assign en su
        // interior) precisamente para que el reducer la mute con seguridad.
        // Mutar y devolver el mismo objeto evita una segunda asignación por
        // nodo, por refresco (Fase 3.6-A: "ningún reducer asigna memoria").
        const res = data as Record<string, unknown>
        calcularEstadoNodo(estadoA, node, data.nivelZoom as number)
        const { alpha, base, grupo } = estadoA
        if (alpha < 0.04) {
          res.hidden = true
          return res
        }
        const tamanoBase = data.size as number
        res.hidden = false
        res.color = rgba(base, alpha)
        if (grupo === 'sel') res.size = tamanoParaSigma(tamanoBase * 1.3, ratioRef.current, TAMANO_PANTALLA_MAX * 1.4)
        else if (grupo === 'oa') res.size = tamanoParaSigma(tamanoBase * 1.15, ratioRef.current, TAMANO_PANTALLA_MAX * 1.25)
        else res.size = tamanoParaSigma(tamanoBase, ratioRef.current)
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
        const res = data as Record<string, unknown>
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
          // Las inducidas viven en lejano/medio: rectas ahí (menos geometría);
          // las reales son las que aparecen en cercano y sí llevan curva.
          res.type = 'line'
          return res
        }

        // Aristas reales (zoom 3).
        const [s, t] = grafo.extremities(edge)
        calcularEstadoNodo(estadoA, s, grafo.getNodeAttribute(s, 'nivelZoom'))
        calcularEstadoNodo(estadoB, t, grafo.getNodeAttribute(t, 'nivelZoom'))
        const a = estadoA
        const b = estadoB
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
        // Rectas en lejano/medio (menos geometría); curvas solo en cercano,
        // donde importa distinguir aristas que comparten extremos visualmente.
        res.type = ratioRef.current > T_RATIO_CURVA ? 'line' : 'curve'
        return res
      },
    })

    sigmaRef.current = sigma
    if (import.meta.env.DEV) {
      ;(window as unknown as { __mapa?: unknown }).__mapa = sigma
    }

    // Listas fijas para el refresco "solo apariencia": pasarlas explícitas en
    // partialGraph es lo que hace que skipIndexation:true realmente evite el
    // reproceso espacial (bbox, quadtree, grilla de etiquetas) — sin
    // partialGraph, Sigma toma la rama de reindexación COMPLETA sin importar
    // el flag (Fase 3.6-A: este era el cuello de botella real, no los
    // reducers en sí, que ya eran O(1) con Sets/Maps precomputados).
    const todosLosNodos = grafo.nodes()
    const todasLasAristas = grafo.edges()
    const refrescarApariencia = () =>
      sigma.refresh({ skipIndexation: true, partialGraph: { nodes: todosLosNodos, edges: todasLasAristas } })

    // Fundidos del zoom: reejecutar reducers solo cuando el RATIO cambia lo
    // suficiente. El paneo puro (mover x/y sin zoom) nunca dispara nada, porque
    // alphaNivel solo depende de ratio — antes se refrescaba en cada tick de
    // cámara, incluido el paneo, reindexando el grafo completo 60 veces/seg.
    let pendiente = false
    let ultimoRatioProcesado = sigma.getCamera().ratio
    const camara = sigma.getCamera()
    camara.on('updated', () => {
      ratioRef.current = camara.ratio
      onRatioRef.current?.(camara.ratio)
      if (Math.abs(camara.ratio - ultimoRatioProcesado) < PASO_RATIO_REFRESCO) return
      if (pendiente) return
      pendiente = true
      requestAnimationFrame(() => {
        pendiente = false
        ultimoRatioProcesado = camara.ratio
        refrescarApariencia()
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

  // Selección -> actualizar refs y refrescar SOLO apariencia (sin reindexar:
  // ni la posición ni la estructura cambian, solo color/alpha/tamaño/label).
  useEffect(() => {
    selRef.current = seleccion
    ancRef.current = seleccion ? reachInv(seleccion) : new Set()
    descRef.current = seleccion ? reach(seleccion) : new Set()
    const sigma = sigmaRef.current
    if (!sigma) return
    const g = sigma.getGraph()
    sigma.refresh({ skipIndexation: true, partialGraph: { nodes: g.nodes(), edges: g.edges() } })
  }, [seleccion])

  // OA activo -> resaltar sus nodos y encuadrar (zoom-to-fit) sobre ellos.
  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma) return
    oaRef.current = oa?.codigo ?? null
    oaCobRef.current = new Map((oa?.nodos ?? []).map((n) => [n.id, n.cobertura]))
    const g = sigma.getGraph()
    sigma.refresh({ skipIndexation: true, partialGraph: { nodes: g.nodes(), edges: g.edges() } })
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

  // Proyección (Fase 3.6-B): anima TODOS los nodos hacia la geografía objetivo
  // (en capas o radial, ambas ya congeladas en el dataset — A5). Las aristas
  // siguen a sus nodos porque Sigma las dibuja a partir de la posición actual
  // de sus extremos en cada frame; no hay nada que animar en la arista misma.
  // Cambiar la posición SÍ exige reindexar (a diferencia de Parte A: acá la
  // geografía realmente cambia) — pero es una transición acotada y rara
  // (~700ms, disparada por clic), no un costo continuo atado al pan/zoom.
  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma) return
    if (proyeccionActualRef.current === proyeccion) return // primer montaje: ya arrancó en 'capas'
    const g = sigma.getGraph()
    const nodos = g.nodes()
    const inicioX = new Map(nodos.map((id) => [id, g.getNodeAttribute(id, 'x') as number]))
    const inicioY = new Map(nodos.map((id) => [id, g.getNodeAttribute(id, 'y') as number]))
    const attrX = proyeccion === 'capas' ? 'xCapas' : 'xRadial'
    const attrY = proyeccion === 'capas' ? 'yCapas' : 'yRadial'

    if (animacionRef.current !== null) cancelAnimationFrame(animacionRef.current)
    onAnimandoProyeccion?.(true)
    const inicio = performance.now()

    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / DURACION_PROYECCION_MS)
      const e = easeInOutCubic(t)
      for (const id of nodos) {
        const xObjetivo = g.getNodeAttribute(id, attrX) as number
        const yObjetivo = g.getNodeAttribute(id, attrY) as number
        g.setNodeAttribute(id, 'x', inicioX.get(id)! + (xObjetivo - inicioX.get(id)!) * e)
        g.setNodeAttribute(id, 'y', inicioY.get(id)! + (yObjetivo - inicioY.get(id)!) * e)
      }
      sigma.refresh()
      if (t < 1) {
        animacionRef.current = requestAnimationFrame(paso)
      } else {
        animacionRef.current = null
        proyeccionActualRef.current = proyeccion
        onAnimandoProyeccion?.(false)
      }
    }
    animacionRef.current = requestAnimationFrame(paso)

    return () => {
      if (animacionRef.current !== null) cancelAnimationFrame(animacionRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyeccion])

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
