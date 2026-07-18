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

export interface Paleta {
  /** Resuelve un `color_token` de región (p. ej. "region-d") a su color CSS. */
  region(token: string | null | undefined): RGB
  selNodo: RGB
  selPre: RGB
  selPost: RGB
  oa: RGB
  atenuado: RGB
  arista: RGB
  aristaViva: RGB
}

// Solo se aceptan tokens con forma region-*, para no leer variables arbitrarias.
const TOKEN_VALIDO = /^region-[a-z0-9]+$/

// Se reconstruye al leer (y cuando cambia el esquema claro/oscuro).
export function leerPaleta(): Paleta {
  const fallback = hexARgb(leerVar('--region-fallback'))
  const cache = new Map<string, RGB>()
  const region = (token: string | null | undefined): RGB => {
    if (!token || !TOKEN_VALIDO.test(token)) return fallback
    if (!cache.has(token)) {
      const valor = leerVar(`--${token}`)
      cache.set(token, valor ? hexARgb(valor) : fallback)
    }
    return cache.get(token)!
  }
  return {
    region,
    selNodo: hexARgb(leerVar('--sel-nodo')),
    selPre: hexARgb(leerVar('--sel-pre')),
    selPost: hexARgb(leerVar('--sel-post')),
    oa: hexARgb(leerVar('--oa')),
    atenuado: hexARgb(leerVar('--atenuado')),
    arista: hexARgb(leerVar('--arista')),
    aristaViva: hexARgb(leerVar('--arista-viva')),
  }
}
