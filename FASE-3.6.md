# Atlas — Fase 3.6: rendimiento y doble proyección

> **Cómo usar este archivo.** Pégalo en la raíz del repo como `FASE-3.6.md` y dile a Claude Code:
> *"Lee FASE-3.6.md y ejecuta las tres partes en orden. Respeta los axiomas de CLAUDE.md."*
>
> **El orden importa.** La parte A es un bug de rendimiento; B y C son de layout. Un selector de proyección con transición animada sobre una app lenta se evalúa mal y exagera cualquier problema de frames. No empieces por B.
>
> Estado actual del dataset: **236 nodos (221 estructurales) · 334 aristas · 14 regiones · profundidad máxima 15**.
>
> A diferencia de la Fase 3.5, aquí **sí se toca `/data`**, pero solo coordenadas. Ver el guardarraíl al final.

---

## PARTE A — Auditoría de rendimiento

### El diagnóstico

236 nodos y 334 aristas es **diminuto** para WebGL: Sigma maneja decenas de miles sin problema. Si la app se pone lenta con esto, **no se alcanzó un límite: hay un bug**. No optimices el grafo ni reduzcas nodos. Encuentra el trabajo que se está haciendo de más.

El síntoma reportado — "se pone más lenta mientras más nodos y aristas aparecen en pantalla" — apunta a trabajo proporcional a lo visible, ejecutado por frame.

### Sospechosos, en orden de probabilidad

1. **Trabajo dentro de los reducers.** `nodeReducer` y `edgeReducer` corren **por cada nodo y cada arista, en cada frame**. Si adentro se recorre la clausura transitiva, se filtran arrays, se busca qué OA tiene un nodo o se construyen objetos nuevos, eso es trabajo cuadrático por frame. Es el culpable más común.
2. **`sigma.refresh()` atado al movimiento de cámara.** Si un listener de zoom o pan llama a `refresh()`, cada píxel de scroll reindexa el grafo completo.
3. **Etiquetas.** Se dibujan en canvas 2D, no en WebGL: son el costo número uno de Sigma y escalan con lo visible.
4. **Aristas curvas.** Cuestan bastante más geometría que las rectas.
5. **El grafo en estado de React.** Si el objeto `Graph` vive en `useState` y se recrea en cada render, todo se reindexa.
6. **Aristas inducidas recalculadas.** Si la Fase 3.5 las deriva al cambiar de nivel en vez de precomputar las de los tres niveles al cargar.

### Requisitos

- **Todo se precomputa una vez al cargar**, en `Map` y `Set`: clausura transitiva de ancestros y descendientes, aristas inducidas por nivel, índice OA → nodos, visibilidad por nivel de zoom. Los reducers hacen **solo consultas O(1)** y no asignan memoria.
- **Nunca llamar `refresh()` en respuesta al movimiento de cámara.** El zoom semántico cambia settings; no reindexa.
- Cuando solo cambia la apariencia (selección, resaltado de OA): `refresh({ skipIndexation: true })`.
- El `Graph` vive en un `useRef`, no en estado de React. Ningún estado de React debe cambiar durante pan o zoom continuo.
- Ajustar `labelRenderedSizeThreshold`, `labelDensity` y `labelGridCellSize` para acotar la carga de etiquetas.
- Evaluar `edgeType: 'line'` en los niveles lejanos y curvas solo en el cercano.

### Cierre — criterios verificables

- Pan continuo en el nivel cercano, con todos los nodos visibles, se mantiene fluido y sin tirones perceptibles.
- Ningún reducer construye arrays u objetos nuevos: revisar y dejarlo escrito en el commit.
- Cambiar de nivel de zoom no dispara reindexación del grafo.
- Reporta qué resultó ser el cuello de botella real. Ese hallazgo importa más que la corrección.

---

## PARTE B — Doble proyección con selector animado

### Qué se agrega

Un selector de **proyección** con dos opciones: **En capas** (por defecto) y **Radial**. La misma estructura vista de dos maneras.

Esto es Google Maps con mapa / satélite / relieve: la misma geografía, distintas proyecciones. Y rima con A1 — el rigor no está en no proyectar, sino en declarar la proyección.

### Por qué "En capas" es el defecto

En la vista por capas, la profundidad es altura: se lee de un vistazo que la cardinalidad está en la base y que todo se complejiza hacia abajo, y se pueden **comparar profundidades entre regiones distintas**. En radial la profundidad es radio, y comparar radios a ojo es mucho más difícil. La vista por capas es la que responde "qué viene antes"; ese es el argumento del Atlas y debe ser lo primero que alguien vea.

### Cambio de esquema (aditivo, no rompe nada)

Añadir a cada nodo un campo hermano del existente:

```
coordenada         → geografía canónica (proyección en capas). NO cambia de rol.
coordenada_radial  → proyección alternativa. Mismos subcampos: x, y, fijada_a_mano.
```

Es aditivo: las apps subordinadas que leen `coordenada` siguen funcionando sin cambios. Actualizar `atlas.schema.json` y subir `schema_version` a `1.1.0`.

### A5 sigue intacto

**Las dos proyecciones se computan offline en `tools/layout.mjs` y se congelan en el dataset.** Lo que A5 prohíbe es calcular posiciones en tiempo real, no que existan dos conjuntos de posiciones curadas. El explorador **lee** ambas y alterna entre ellas; no calcula ninguna. `--check` debe seguir siendo idempotente para las dos.

### Especificación del layout radial

- **Ángulo = región.** Cada territorio ocupa un sector angular propio, en el mismo orden que `region.orden_x`. Los sectores se reparten los 360° proporcionalmente a la cantidad de nodos de cada región, no en partes iguales.
- **Radio = profundidad en el orden parcial.** Misma magnitud que la `y` de la vista en capas: derivada de la estructura, no del nivel escolar (A2).
- **Radio inicial 700, separación entre anillos 400.** El 700 no es arbitrario: el anillo central tiene 16 nodos y a radio 400 no caben.
- Respetar `fijada_a_mano` también aquí.

La distribución verificada de nodos por anillo — úsala para comprobar que el resultado es correcto:

| anillo | nodos | | anillo | nodos | | anillo | nodos |
|---|---|---|---|---|---|---|---|
| 0 | 16 | | 6 | 29 | | 11 | 9 |
| 1 | 11 | | 7 | 32 | | 12 | 3 |
| 2 | 10 | | 8 | 19 | | 13 | 1 |
| 3 | 15 | | 9 | 16 | | 14 | 3 |
| 4 | 23 | | 10 | 12 | | 15 | 1 |
| 5 | 21 | | | | | | |

Es un rombo: pocos cimientos, mucho desarrollo intermedio, pocas cumbres. Por eso el radial respira — en el anillo 7 se necesitan ~8.300 px de perímetro y hay ~20.100 disponibles.

### La transición debe animarse

**Al cambiar de proyección los nodos se desplazan; nunca saltan.** Si saltan se destruye la memoria espacial, que es justo lo que A5 protege. Si el usuario ve la transformación, conserva el mapa mental y además entiende que es la misma estructura vista de otro modo.

- Interpolar las posiciones de todos los nodos, ~700 ms, con easing suave.
- Las aristas siguen a sus nodos durante la animación.
- La animación no reindexa el grafo (ver Parte A).
- Bloquear el selector mientras la transición corre, para evitar animaciones encimadas.

### Nodos de zoom 1 y 2: layout propio en ambas proyecciones

**Este es el arreglo del problema más visible que hay hoy.** Actualmente los nodos de región se ubican en el centroide horizontal de sus hijos, todos a la misma `y`, y el resultado es **14 puntos en una sola línea recta** en la vista media. Eso no es escala: es que nunca tuvieron disposición propia.

- **En radial:** los nodos de zoom 2 se ubican en el centro de su sector angular, en un anillo interior propio, alrededor del nodo de zoom 1. Ahí el radial es ideal — son ~15 nodos y pocas aristas inducidas, sin problema de perímetro.
- **En capas:** distribuirlos en dos filas alternadas en vez de una, para que las etiquetas no se encimen.

### Vistas por usuario

El selector es visible en todas las vistas. En **Estudiante**, por defecto radial (más orgánico, menos analítico); en el resto, por defecto en capas.

### Cierre

- Alternar dos veces devuelve a los nodos a posiciones idénticas a las iniciales.
- `npm run layout -- --check` sigue en verde para ambas proyecciones.
- En la vista media, las etiquetas de las 14 regiones se leen sin encimarse en las dos proyecciones.

---

## PARTE C — Rebalance de la vista en capas

### El problema

Una columna por región, y las regiones pasaron de 6 a 14. Con `SEP_REG = 1400` el mapa mide ~19.600 de ancho contra ~2.250 de alto: proporción **9:1**. Objetivo: entre **1:1 y 2:1**.

### Tres arreglos, aplicar en orden y detenerse cuando alcance

1. **Rebalancear constantes.** `SEP_Y` de 150 a ~400 y `SEP_REG` de 1400 a ~700 da del orden de 1,6:1. Es cambiar dos números y correr la herramienta. Prueba esto primero: puede bastar.
2. **Empaquetar columnas por intervalo de profundidad.** Las regiones ocupan rangos distintos: `enteros` recién empieza en la profundidad 7, así que puede compartir banda horizontal con `conteo`, que termina en la 3. Es asignación de intervalos; podría bajar de 14 columnas a 7 u 8. **Restricción:** las regiones que comparten banda deben distinguirse claramente por color, y su separación vertical debe ser inequívoca.
3. **Escalonar dentro de la capa.** Una capa con 8 nodos mide 1.820 px con `SEP_NODE = 260`, y eso es lo que obliga a separar tanto las regiones. Si al superar ~5 nodos la capa alterna en media altura, cada región se angosta bastante.

### Cierre

- Proporción del mapa completo entre 1:1 y 2:1.
- Ninguna etiqueta encimada en el nivel cercano.
- La lectura epistémica se conserva: los cimientos arriba, la complejidad hacia abajo, comparable entre regiones.

---

## Al cierre de las tres partes

`npm run validate` (verde) → `npm test` (verde) → `npm run layout -- --check` (idempotente en ambas proyecciones) → `npm run build` → commit → `npm run deploy` → reportar URL.

**Guardarraíl de `/data`.** Esta fase sí modifica el dataset, pero **solo coordenadas**. `git diff data/` debe mostrar únicamente cambios en `coordenada`, el nuevo `coordenada_radial` y `schema_version`. Si aparece cualquier cambio en `id`, `nombre`, `padre`, `region`, `completitud`, `metadatos` o en las aristas, algo se hizo mal: la estructura y el códex no se tocan en esta fase.
