# Atlas — Corrección de especificación: Fase 3.5 y Fase 4.5

> **Cómo usar este archivo.** Pégalo en la raíz del repo como `FASE-3.5-4.5.md` y dile a Claude Code:
> *"Lee FASE-3.5-4.5.md y ejecuta las dos fases en orden. Respeta los axiomas de CLAUDE.md."*
>
> Ninguna de las dos fases toca `/data`. Ambas son Capa 3 (interfaz).
> El dataset sigue siendo el contrato: se consume, no se define (A1–A8 intactos).
> Contexto del dataset actual: **v0.2.0 · 79 nodos (72 estructurales) · 106 aristas · 65 OA mapeados · profundidad máxima 9**.

---

## FASE 3.5 — Aristas inducidas (corrección de un defecto de la Fase 3)

### El defecto

La Fase 3 definió el zoom semántico como **filtro**: los niveles superiores ocultan los nodos de zoom 3. Como todas las aristas de prerrequisito viven entre microconocimientos (zoom 3), al alejarse el mapa pierde toda la estructura y los dominios quedan flotando sueltos en el vacío.

Eso viola el principio de oro: **la interfaz debe revelar la estructura, no esconderla**.

En Google Maps, alejarse no borra las carreteras: las **agrega** en autopistas. El zoom semántico debe ser **agregación, no filtro**. Un mapa alejado no muestra menos información: muestra la misma información resumida.

### La corrección

Derivar en el loader, **en memoria**, las aristas inducidas por la relación `padre`:

1. Para cada arista real `A → B` (ambos zoom 3), proyectar sus extremos hacia arriba usando `nodo.padre` hasta el nivel de zoom que se está mostrando.
2. Si los ancestros proyectados son **distintos**, existe una arista inducida entre ellos. Si son **el mismo** (la dependencia es interna a ese dominio), se descarta.
3. Sobre el conjunto de aristas inducidas de cada nivel, aplicar **reducción transitiva** (A6). El mapa alejado tampoco dibuja spaghetti.
4. Registrar en cada arista inducida cuántas aristas reales la sustentan (`peso`) y cuáles son (`origen: [{de, a}]`).

**Ejemplo esperado con el dataset actual:** existe `cardinalidad → composicion_aditiva` (Conteo → Numeración) y `composicion_aditiva → suma` (Numeración → Operaciones). En zoom 2 debe aparecer `Conteo → Numeración → Operaciones`. En zoom 1 no aparece nada, porque todos los nodos colapsan en `numero`, que es un único ancestro.

### Restricciones (críticas)

- **NO se escriben en `/data`.** Son derivadas, no contenido. Guardarlas contaminaría la Capa 1 con información redundante y rompería la reducción transitiva del dataset. Viven solo en memoria, calculadas por el loader.
- **`padre` sigue sin ser prerrequisito.** Es agregación visual. La arista inducida no nace de `padre`; nace de las aristas reales *proyectadas* a través de `padre`.
- Se calculan **una vez** al cargar (no por frame). El grafo de Sigma no se muta: la elección real/inducida se hace con reducers según el nivel de cámara.

### Presentación

- Aristas inducidas: **más gruesas y más difusas** que las reales — señalan que agregan varias dependencias. El grosor puede escalar (suavemente) con `peso`.
- Al pasar el cursor: *"N dependencias entre estos dominios"*.
- **Nunca coexisten** aristas reales e inducidas del mismo par en pantalla.

### Cierre

En vista lejana y media el mapa muestra estructura, no nodos sueltos. Alejarse resume; nunca vacía.

---

## FASE 4.5 — Buscador de OA (códex curricular)

### Por qué existe

El currículo chileno es la información más confiable y externa que tiene un profesor a mano. Casi todos conocen el eje **por sus OA**, no por sus conocimientos. El buscador es la puerta de entrada para ese lector.

Y hace algo más importante: **es la demostración visual de la tesis del proyecto**. Al buscar `MA01 OA 01` se iluminan **7 conocimientos dispersos**; al buscar `MA04 OA 08`, **6**. Cualquiera que conozca el currículo por los OA ve, de un vistazo y sin explicación, que **el OA no es una unidad: es una agrupación de conocimientos** (A3). El argumento del Atlas hecho interfaz.

Datos reales del dataset: 65 OA mapeados; **26 rinden un solo nodo** (OA genuinamente atómicos, como el ordinal o el cero en la adición); el resto rinde varios. Ese contraste es el hallazgo — hay que dejarlo ver.

### Comportamiento

**Entrada.** Un campo de búsqueda discreto en el lienzo (no un panel pesado). Acepta:
- código exacto o parcial: `MA01 OA 01`, `MA01`, `OA 08`
- **texto libre del OA**: "contar", "descomponer", "valor posicional" → busca en `metadatos.oa_relacionados[].texto` y en el nombre y definición de los nodos
- tolerante: sin acentos, sin mayúsculas, con o sin espacios (`ma01oa01` funciona)

**Sugerencias.** Al escribir, lista los OA que calzan con: código · curso · nº de conocimientos que lo componen. Ese contador ya educa antes de hacer clic.

**Al seleccionar un OA:**
1. Se iluminan **todos** los nodos que lo referencian; el resto se atenúa (misma maquinaria de reducers que la selección de prerrequisitos de la Fase 4 — reutilizar, no duplicar).
2. La intensidad del resaltado distingue la **`cobertura`**: `total` > `parcial` > `tangencial`. Un OA no pesa igual en todos sus nodos, y ese matiz es información real del códex.
3. Si los nodos iluminados están en varias regiones (frecuente: `MA01 OA 01` toca Conteo y Numeración), el mapa hace **zoom-to-fit** sobre ellos.
4. Aparece un rótulo discreto: código, curso, texto del OA si existe, y **"N conocimientos"**.
5. Si un nodo iluminado está en un nivel de zoom no visible, se **respeta el zoom-to-fit** hasta el nivel donde se ven — sin romper las reglas de la Fase 3.

**Al limpiar:** todo vuelve al estado normal. `Esc` limpia.

### Restricciones

- **El buscador NO toca la estructura.** Solo ilumina desde el códex — es la búsqueda de códex de un videojuego: documenta el mundo, no lo altera (A3).
- No filtra ni oculta nodos permanentemente: solo resalta y atenúa.
- Resaltado por OA y selección de nodo son **estados mutuamente excluyentes**: seleccionar un nodo limpia el OA activo y viceversa. Nunca dos capas de resaltado compitiendo.
- El estado del buscador **no** entra en `coordenada` ni en ningún dato persistido (A5).

### Vistas por usuario (Fase 7)

- **Profesor** y **PIE**: el buscador es prominente — es su puerta de entrada natural.
- **Estudiante**: oculto (los OA son lenguaje de adultos).
- **Investigador**: visible, y además muestra el nº de nodos y la distribución de `cobertura` del OA activo.

### Cierre

Buscar `MA01 OA 01` ilumina 7 conocimientos en dos regiones, con el rótulo "7 conocimientos", y el mapa encuadra sobre ellos. Buscar `MA01 OA 02` ilumina exactamente 1 (`numero_ordinal`). El contraste entre ambos casos debe ser evidente sin que nadie lo explique.

---

## Al cierre de ambas fases

`npm run validate` (verde) → `npm test` (verde) → `npm run layout -- --check` (**no debe cambiar nada**: ninguna de estas fases toca coordenadas) → `npm run build` → commit → `npm run deploy` → reportar URL.

**Verificación de que no se contaminó la Capa 1:** `git diff --stat data/` debe salir **vacío**. Si `/data` cambió, algo se hizo mal.
