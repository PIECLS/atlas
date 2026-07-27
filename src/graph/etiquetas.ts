// Etiquetas centradas debajo del nodo (Fase 3.7-B1), no al costado.
// La posición por defecto de Sigma (drawDiscNodeLabel) dibuja el texto a la
// DERECHA del nodo — eso consume ~165px de ancho justo en la banda horizontal
// donde vive el vecino de la misma capa, compitiendo directo por el espacio.
// Debajo, el mismo ancho de texto ya no invade esa banda.
import type { NodeLabelDrawingFunction } from 'sigma/rendering'

const MARGEN = 4

export const dibujarEtiquetaDebajo: NodeLabelDrawingFunction = (context, data, settings) => {
  if (!data.label) return
  const tamano = settings.labelSize
  const fuente = settings.labelFont
  const peso = settings.labelWeight
  const color = settings.labelColor.attribute
    ? (data as unknown as Record<string, string>)[settings.labelColor.attribute] ||
      settings.labelColor.color ||
      '#000'
    : settings.labelColor.color
  context.fillStyle = color as string
  context.font = `${peso} ${tamano}px ${fuente}`
  context.textAlign = 'center'
  context.fillText(data.label, data.x, data.y + data.size + tamano + MARGEN)
  context.textAlign = 'start' // Sigma no resetea esto entre llamadas; otros dibujos asumen 'start'
}
