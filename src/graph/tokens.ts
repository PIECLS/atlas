// Puente entre el sistema de diseño (CSS custom properties) y Sigma (WebGL, que
// necesita colores concretos). Ningún hex vive aquí: se leen de styles.css.
// Así el `color_token` de una región se resuelve a color sin filtrar hex a la app.

export interface RGB {
  r: number
  g: number
  b: number
}

function leerVar(nombre: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim()
}

function hexARgb(hex: string): RGB {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  // ignora canal alfa si viniera en 8 dígitos
  const n = parseInt(h.slice(0, 6), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgba({ r, g, b }: RGB, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
}

// Traducción color_token -> variable CSS. La región trae el token; aquí se resuelve.
const TOKEN_A_VAR: Record<string, string> = {
  'region-a': '--region-a',
  'region-b': '--region-b',
  'region-c': '--region-c',
}

export interface Paleta {
  region(token: string | null | undefined): RGB
  selNodo: RGB
  selPre: RGB
  selPost: RGB
  atenuado: RGB
  arista: RGB
  aristaViva: RGB
}

// Se reconstruye al leer (y cuando cambia el esquema claro/oscuro).
export function leerPaleta(): Paleta {
  const regiones: Record<string, RGB> = {}
  for (const [token, cssvar] of Object.entries(TOKEN_A_VAR)) {
    regiones[token] = hexARgb(leerVar(cssvar))
  }
  const fallback = hexARgb(leerVar('--region-fallback'))
  return {
    region: (token) => (token && regiones[token]) || fallback,
    selNodo: hexARgb(leerVar('--sel-nodo')),
    selPre: hexARgb(leerVar('--sel-pre')),
    selPost: hexARgb(leerVar('--sel-post')),
    atenuado: hexARgb(leerVar('--atenuado')),
    arista: hexARgb(leerVar('--arista')),
    aristaViva: hexARgb(leerVar('--arista-viva')),
  }
}
