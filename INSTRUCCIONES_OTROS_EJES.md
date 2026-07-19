# Integrar extracción de otros ejes al Atlas del Conocimiento

## Contexto para Claude Code

Este es un aporte al dataset del Atlas del Conocimiento (grafo de prerrequisitos
epistémicos de matemática escolar, currículo chileno 1º–6º básico). El dataset
real vive en JSON en este repo — localiza los archivos de nodos y aristas
(probablemente algo como `nodos.json` / `aristas.json`, o dentro de `data/`)
antes de tocar nada.

Adjunto dos archivos nuevos:

- `nodos_otros_ejes_v0_1.json` — 67 nodos (63 conocimientos + 4 nodos de región)
  de los ejes **Geometría, Medición, Datos y Probabilidades, y Patrones y Álgebra**.
  El Atlas hasta ahora solo cubría Números y Operaciones.
- `aristas_otros_ejes_v0_1.json` — 77 aristas de prerrequisito, algunas dentro
  de estos ejes nuevos y otras que cruzan hacia nodos que ya existen en Números
  y Operaciones (ej. `multiplicacion → estructura_arreglo_area`).

## ⚠️ Estado epistémico — léelo antes de escribir código

**TODO esto es hipótesis, sin pasar por revisión experta.** Cada nodo y cada
arista trae `"confianza": "hipotesis"` y `"origen": "extraccion_otros_ejes_v0.1"`.
En el vocabulario del proyecto: nada de esto es `consenso_experto` todavía.

Instrucciones para el merge:

1. **No sobrescribas nada existente.** Estos IDs son todos nuevos (verificado:
   cero colisión con los 79 nodos previos). Es una unión, no un reemplazo.
2. **Preserva el campo `confianza` tal cual.** Si el schema real del dataset
   usa otro nombre de campo para esto (revísalo en los nodos existentes), migra
   el valor, no lo borres ni lo subas a `consenso_experto` — esa promoción solo
   la da el profesional (Francisco) después de aplicar el test A2 en la planilla
   de revisión, igual que con las 106 aristas originales.
3. **Las aristas que cruzan de eje están comentadas** con `"cruza a Números"` (o
   Geometría/Medición según corresponda) en el campo `comentario`. Son las más
   valiosas del lote — conectan el nuevo territorio con el andamiaje ya validado
   — pero también las que más conviene mirar dos veces, porque tensionan la regla
   de "una arista por A2, nunca por currículo".
4. **Corre las verificaciones estructurales del pipeline** después del merge
   (aciclicidad, reducción transitiva, y lo que sea el equivalente del chequeo
   "A2" automatizado si existe) — igual que se corre al reimportar la planilla
   de revisión. Si algo genera ciclo o queda redundante bajo reducción
   transitiva, repórtalo en vez de resolverlo en silencio: puede ser una señal
   de que dos nodos deberían fusionarse (como pasó con `secuencia_verbal` y
   `orden_estable` en Conteo y cardinalidad).
5. **Cuatro nodos son "de región"** (`patrones_algebra_c`, `geometria_c`,
   `medicion_c`, `datos_probabilidades_c`, zoom 2, sin definición sustantiva,
   `padre: null`) — son paraguas organizativos, análogos a `decimales_c` o
   `fracciones_c` en el dataset original. No deberían llevar aristas de
   prerrequisito propias; existen para que el resto de los nodos de su eje
   cuelguen de ellos vía `padre`.
6. Varios nodos quedan sin aristas de entrada a propósito (`posicion_relativa`,
   `comparacion_directa_magnitudes`, `experimento_aleatorio`,
   `pregunta_estadistica`, `distincion_recta_curva`): son primitivos
   perceptuales o sociales, no derivados de otro nodo matemático — mismo
   estatus que `subitizacion` en el dataset actual.

## Qué pedirle a Claude Code, concretamente

- Leer el schema real de nodos/aristas del repo.
- Mapear los campos de estos dos JSON al schema real (los nombres de campo
  aquí son razonables pero no están garantizados a coincidir 1:1 con el repo).
- Insertar los 67 nodos y 77 aristas nuevas sin tocar los 79 nodos / 106
  aristas existentes.
- Correr las verificaciones del pipeline (aciclicidad, reducción transitiva)
  y reportar cualquier hallazgo antes de dar el merge por terminado.
- Dejar todo marcado como hipótesis / no revisado, listo para que salga una
  nueva planilla de revisión (misma lógica que `atlas_revision`) cuando
  Francisco quiera aplicarles el test A2.
