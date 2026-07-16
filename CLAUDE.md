# Atlas del Conocimiento — Especificación del MVP

**Este archivo es la especificación completa.** Ejecuta las fases en orden. No inventes features fuera de esta especificación. Ante ambigüedad, elige la opción más simple y respeta los axiomas.

---

## Qué es esto

Una plataforma visual que representa el conocimiento escolar chileno como un espacio de conocimiento navegable. **No es** un mapa conceptual, ni un currículo digital, ni una plataforma de ejercicios. Es un **atlas**.

**Principio de oro:** la estructura es primero; la interfaz la revela, no la reemplaza.

**Analogía operativa:** Google Maps. No modifica la geografía; permite verla mediante capas. Aquí la geografía es el espacio de conocimiento.

**Analogía del códex:** los Objetivos de Aprendizaje (OA) del currículo son entradas de códex de videojuego. Documentan el mundo; no alteran sus reglas.

### Arquitectura de tres capas

```
Capa 1  Estructura (espacio cuasi-ordinal: nodos + aristas)   ← núcleo, sin pedagogía
   ↓
Capa 2  Metadatos / códex (definición, OA, errores, PIE...)   ← cuelga de cada nodo
   ↓
Capa 3  Interfaces (este repositorio)                         ← consume, nunca define
```

Nunca al revés. Este repositorio es Capa 3 y **consume** el dataset. No lo genera, no lo muta, no lo reordena.

### Rol en el ecosistema

El Atlas define el espacio. Las apps de aprendizaje se subordinan a él: el dataset publicado es el **contrato**. Una app como *Eslabones* (una cadena de 10 módulos secuenciales) es, en términos formales, **un camino dentro de este espacio** — una cadena maximal de estados. El Atlas contiene todos los caminos admisibles; las apps instancian uno.

Por eso los `id` de nodo son permanentes: son la clave que las apps referencian.

---

## AXIOMAS (no negociables)

Estos axiomas gobiernan cada decisión. Si una tarea parece requerir violarlos, **detente y pregunta**.

### A1 — El Atlas v1 modela un espacio cuasi-ordinal
Los estados son los **conjuntos descendentes** del orden parcial (cerrado bajo unión e intersección, vía teorema de Birkhoff). Todas las aristas entrantes de un nodo son **conjuntivas (AND)**.
El campo `clausula` está **reservado** para soportar *surmise systems* (caminos alternativos, OR) en v3. En v1 **siempre es `null`**; el verificador rechaza valores no-null.
Un mapa siempre elige una proyección. El rigor no está en no proyectar: está en declarar la proyección.

### A2 — Una arista es una implicación de dominio, jamás una secuencia de enseñanza
`A → B` significa: **"no es posible dominar B sin dominar A"**.
Toda `justificacion` debe poder redactarse con esa frase, **sin mencionar cursos, OA ni orden de enseñanza**. Si la justificación necesita nombrar el currículo, no es una arista: es metadato de códex.
Este es el axioma que más fácil se erosiona en la autoría. Vigílalo.

### A3 — Los OA son códex, no esqueleto
La unidad del sistema es el **conocimiento**, no el OA. Un OA es una agrupación curricular que típicamente cubre varios nodos. Los OA viven en `metadatos.oa_relacionados`. Nunca en la estructura. Un nodo sin ningún OA es perfectamente válido.

### A4 — Vocabulario CbKST
El grafo del Atlas **es la estructura de competencias**. Los ítems observables (problemas) viven en `metadatos.items` como mapeo competencia→desempeño.
En v1 **no se construyen ítems**: solo se reserva el campo y el lenguaje. No los inventes.
Referencia: Heller & Stefanutti (2024); paquetes R `CbKST` y `kst`.

### A5 — Geografía estable
Las coordenadas son **contenido editorial curado y versionado**, no salida de un algoritmo en runtime.
**Prohibido** todo layout de fuerza en tiempo real (estilo Obsidian). Se computan offline una vez, se ajustan a mano, se congelan. Agregar un nodo **no mueve las cordilleras**.
El explorador **lee** `nodo.coordenada` y punto.

### A6 — Solo se dibuja la reducción transitiva
La precedencia es transitiva en la estructura, pero el mapa dibuja únicamente el diagrama de Hasse. La transitividad se computa, no se dibuja. Dibujarla produce spaghetti y duplica la estructura en la interfaz — violando el principio de oro.

### A7 — El mapa se publica incompleto
`completitud` ∈ {`esbozo`, `basica`, `completa`} es un estado visible del nodo, no una vergüenza. Como un códex que se va llenando; como un mapa con niebla. Los nodos `esbozo` se ven, se navegan, e invitan a la exploración.

### A8 — Rigor ≠ validez
El Atlas v1 nace entero en `confianza: "hipotesis"`. La afirmación defendible es: *"hipótesis estructural consistente con los axiomas, verificada mecánicamente, y versionada"*. **Nunca** afirmes validación empírica. Esa llega el día que haya datos de respuesta (IITA/DAKS).

---

## Alcance del MVP

**Rebanada vertical:** eje Número, 1º a 6º básico (~100–150 nodos; la semilla trae 6).
Fuera de alcance: otras asignaturas, ítems, cuentas de usuario, backend, edición desde la web, analytics.

---

## Restricciones técnicas

- **React 18 + Vite + TypeScript.** Sin backend, sin cuentas, sin analytics, sin llamadas de red en runtime.
- **Grafo: `graphology` + `sigma` (WebGL).** Escala a miles de nodos. Los efectos de selección se hacen con **reducers** de Sigma (`nodeReducer`/`edgeReducer`), no mutando el grafo.
- **`d3-force` NO va en la app.** Solo en `/tools`, offline, para computar el layout que luego se congela (ver Fase 5).
- **Sin librería de UI, sin Tailwind.** CSS plano con custom properties en un solo `styles.css`.
- **Sin router**: navegación por estado + hash manual.
- **Estado:** React state local. Sin Redux/Zustand.
- **Datos:** el dataset se importa como JSON estático. Read-only en runtime.
- **Deploy:** GitHub Pages (`base: '/atlas/'` en `vite.config.ts`).

---

## FASE 0 — Bootstrap

```bash
npm create vite@latest atlas -- --template react-ts
cd atlas
npm install
npm install graphology graphology-traversal sigma
npm install -D gh-pages vitest ajv
git init && git add -A && git commit -m "Bootstrap Atlas"
gh repo create atlas --public --source=. --push
```

`vite.config.ts`: `base: '/atlas/'`.

`package.json` scripts:
```json
"predeploy": "npm run build",
"deploy": "gh-pages -d dist",
"test": "vitest run",
"validate": "node tools/validate.mjs"
```

**Al cierre de cada fase:** `npm run validate` (verde) → `npm run test` (verde) → `npm run build` (sin errores) → commit descriptivo → `npm run deploy` → reporta la URL.

**Criterio de cierre:** app por defecto desplegada y accesible.

---

## FASE 1 — Datos y contrato

Copia `atlas.schema.json` y `atlas.numero.json` a `/data`.

1. **Tipos**: genera `src/types/atlas.ts` desde el esquema. Los tipos son la traducción literal del esquema; no agregues campos.
2. **Validador** `tools/validate.mjs` (Node + ajv): valida `/data/atlas.numero.json` contra el esquema. Falla con exit code ≠ 0.
3. **Verificaciones estructurales** en el mismo script — este es el prototipo JS de lo que hará el verificador R (Fase 6):
   - ids únicos; referencias de aristas existentes
   - **aciclicidad** (DFS)
   - **reducción transitiva**: ninguna arista implicada por transitividad (A6)
   - `clausula === null` en todas las aristas (A1)
   - huérfanos: nodos zoom 3 sin aristas → warning, no error
   - reporta **n_estados** (conjuntos descendentes) para dominios pequeños
4. **Loader** `src/data/loadAtlas.ts`: importa el JSON, lo valida en dev, construye el `Graph` de graphology y computa una vez: `pred(id)`, `succ(id)`, `reach(id)` (clausura transitiva, para iluminar ancestros/descendientes sin dibujar aristas).

> El dataset semilla ya pasa estas verificaciones: 4 nodos estructurales, 6 estados de 16 posibles.

**Cierre:** `npm run validate` en verde sobre la semilla, y un test que exige que un dataset con ciclo o con arista redundante **falle**.

---

## FASE 2 — Lienzo del mapa

Sigma sobre el grafo, con coordenadas leídas de `nodo.coordenada` (A5).

- Pan y zoom con inercia. Sin límites duros de pan; sí límites de zoom.
- Los nodos son círculos; el tamaño depende del `nivel_zoom`, no del grado.
- Color por `region` (token del sistema de diseño, no hex en los datos).
- Aristas: curvas suaves, dirigidas, sutiles. Sin flechas pesadas.
- **`allowInvalidContainer: false`**, y `renderLabels` gestionado por zoom (Fase 3).

**Cierre:** el mapa de la semilla se ve, se mueve, hace zoom. Se siente orgánico. Nada rígido.

---

## FASE 3 — Zoom semántico

Umbrales de cámara (`camera.ratio`) determinan qué nivel se muestra:

| ratio | muestra | oculta |
|---|---|---|
| lejano | zoom 1 (dominios) | 2, 3 |
| medio | 1 + 2 (conceptos) | 3 |
| cercano | 2 + 3 (microconocimientos) | — |

- Las transiciones son **fundidos**, no apariciones bruscas. Nada debe sentirse rígido.
- Las etiquetas aparecen progresivamente; jamás todas a la vez.
- Implementar con `nodeReducer` (`hidden`, alpha), **no** agregando/quitando nodos del grafo.
- El "zoom profundo" **no es un nivel de cámara**: es la vista de nodo (Fase 4), que se abre por interacción.

**Cierre:** los tres niveles se revelan y ocultan con fluidez.

---

## FASE 4 — Selección y vista de nodo

### Selección (en el mapa)
Al seleccionar un nodo:
- se iluminan sus **prerrequisitos** (ancestros, vía `reach` inverso) en un tono
- se iluminan sus **conocimientos posteriores** (descendientes) en otro
- **el resto se atenúa**

Debe sentirse como un árbol tecnológico de videojuego. Todo vía reducers.
Ojo con A6: se **iluminan** ancestros transitivos, pero **no se dibujan** aristas transitivas.

### Vista de nodo (zoom profundo)
El nodo deja de comportarse como nodo y se convierte en **objeto**. Ocupa el centro; alrededor, pestañas:

`Representaciones` · `Habilidades` · `Actitudes` · `Errores frecuentes` · `OA relacionados` · `Evaluación` · `PIE` · `Recursos` · `Bibliografía`

- **No son otros grafos.** Son información asociada.
- Pestañas sin datos: se muestran vacías con el estado de `completitud` (A7). No se ocultan.
- `Errores frecuentes`: si un error tiene `nodo_implicado`, ofrece un enlace que navega el mapa a ese nodo. **Puente diagnóstico** — conecta el error con la estructura sin crear arista.
- `PIE`: se indexa por **barrera**, nunca por diagnóstico. Son apoyos didácticos.
- `Evaluación`: muestra `evidencias`. **No notas, no calificaciones.**
- `OA relacionados`: presentación de códex — código, curso, texto, `cobertura`. Nunca sugiere secuencia.

**Cierre:** el nodo `cardinalidad` (completitud `completa`) muestra las nueve pestañas pobladas; `suma` (`basica`) muestra su estado con honestidad.

---

## FASE 5 — Herramienta de layout (offline)

`tools/layout.mjs`. **No es parte de la app** (A5).

1. `y` = **profundidad en el orden parcial** (longest path desde raíces). Derivada de la estructura, no del nivel escolar. Que correlacione con el curso es consecuencia, no causa (A2).
2. `x` = asignada por `region.orden_x`; dentro de la región, minimiza cruces (barycenter, estilo Sugiyama).
3. **Respeta `coordenada.fijada_a_mano: true`**: no las toca.
4. Escribe las coordenadas de vuelta al JSON. Se commitean. Son contenido.

Al agregar nodos, se insertan **localmente**. Nunca recomputes el mapa global.

**Cierre:** correr la herramienta dos veces seguidas produce el mismo archivo (idempotente).

---

## FASE 6 — Certificación (R)

`tools/certify.R`, corriendo en GitHub Actions en cada push a `/data`.

Usa **`kst`** (operaciones de espacios de conocimiento, Hockemeyer) y **`CbKST`** (Heller & Stefanutti 2024).

- Carga el dataset, construye el cuasi-orden, deriva el espacio.
- Verifica: aciclicidad, cierre bajo unión e intersección, reducción transitiva.
- Computa `n_estados`.
- Escribe el bloque `certificacion` en el JSON con `verificado`, `fecha`, `herramienta`, y publica.
- **Si falla, el dataset no se publica.**

El Atlas nunca ejecuta R en runtime. R es el **notario**, no la base: sella la estructura antes de publicarla.

> Nota: el autor no maneja R. Escribe este script completo, comentado, y con instrucciones de instalación.

**Cierre:** el badge de certificación pasa; el JSON publicado lleva `certificacion.verificado: true`.

---

## FASE 7 — Vistas por usuario

Un selector simple (sin cuentas):

| Vista | Énfasis |
|---|---|
| **Profesor** | acceso completo |
| **Estudiante** | simple: navegación y recursos |
| **Investigador** | grafo completo + propiedades (n_estados, profundidad, confianza de aristas) |
| **PIE** | errores frecuentes, adaptaciones, diagnóstico conceptual |

Las vistas **filtran la presentación**, jamás la estructura. El grafo es el mismo para todos.

---

## Estilo gráfico

No una interfaz escolar. Una mezcla entre Obsidian Graph View, Google Maps, el árbol tecnológico de Civilization VI, el árbol de habilidades de Path of Exile, Miro, Figma y los atlas científicos interactivos.

- Minimalista. **Mucho espacio.** Colores suaves. Conexiones elegantes. Animaciones fluidas.
- Mucho énfasis en el zoom. **Nada debe sentirse rígido.**
- Los nodos deben sentirse **vivos**. Las conexiones, claras.
- Debe transmitir **exploración del conocimiento**.

Todos los colores en custom properties de `styles.css`. Ningún hex en los datos ni en los componentes.

---

## Reglas de autoría del dataset

Para quien escriba nodos (probablemente con las Bases Curriculares en la otra pestaña — de ahí el riesgo):

1. **Antes de dibujar una arista, redacta la frase**: "no es posible dominar B sin dominar A". Si no sale sin mencionar cursos u OA, no es arista (A2).
2. Un `id` **nunca** se reutiliza ni se renombra. Si un nodo muere, su id queda quemado.
3. Un nodo puede tener cero OA. Existe igual (A3).
4. Nace todo en `confianza: "hipotesis"`. Subir a `consenso_experto` requiere consulta a especialistas; a `validada_empiricamente`, datos (A8).
5. Publica en `esbozo`. Llenar el códex es un proceso (A7).
6. Ante la duda entre "esto es estructura" o "esto es códex": **es códex**. La Capa 1 se contamina fácil y no se descontamina.

---

## Versionado

- `schema_version`: versión del contrato. Cambia solo con `atlas.schema.json`.
- `atlas_version`: versión del **contenido** (semver).
  - MAJOR: se elimina o reinterpreta un nodo/arista → **rompe apps subordinadas**
  - MINOR: se agregan nodos/aristas
  - PATCH: metadatos o coordenadas
- Cada publicación certificada lleva changelog. Las apps subordinadas fijan una versión.
