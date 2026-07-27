# Atlas — Fase 3.7: legibilidad de nodos y etiquetas

> **Cómo usar este archivo.** Pégalo en la raíz del repo como `FASE-3.7.md` y dile a Claude Code:
> *"Lee FASE-3.7.md y ejecuta las partes en orden. Respeta los axiomas de CLAUDE.md."*
>
> Estado: **236 nodos · 334 aristas · 14 regiones · profundidad máxima 15**. La Fase 3.6 cerró bien: el rendimiento quedó resuelto y las dos proyecciones funcionan.
>
> El problema que ataca esta fase: **los nodos y las etiquetas se encinan hasta en el zoom más cercano**, en ambas proyecciones.

---

## El diagnóstico, con números

Dos causas superpuestas. La segunda es la que hace que acercarse no sirva de nada.

**Causa 1 — las etiquetas son más anchas que la separación disponible.**
Medido sobre el dataset actual: la distancia mediana de un nodo a su vecino más cercano es **150 px**, y el ancho promedio de una etiqueta es de **~165 px** (24 caracteres). Las peores llegan a 48 caracteres, unos **340 px**. Las etiquetas son geométricamente más anchas que el hueco entre nodos; ningún ajuste de renderizado puede arreglar eso. Además hay pares a **100 px**, menos que `SEP_NODE`, por un defecto de centrado cuando la capa tiene un número par de nodos.

**Causa 2 — el tamaño del nodo escala con el zoom igual que las distancias.**
Si al acercar al máximo los círculos siguen encimados, es porque los nodos crecen junto con la cámara: la proporción entre radio y separación **nunca cambia**, y acercarse no despega nada. Esto lo controla `zoomToSizeRatioFunction` en Sigma. Es un bug de configuración, no de layout, y probablemente resuelve la mitad del problema por sí solo.

---

## PARTE A — Escalado del tamaño con el zoom

**Hacer primero.** Es el cambio más pequeño y el que altera cómo se evalúa todo lo demás.

- Configurar `zoomToSizeRatioFunction` para que el tamaño de los nodos crezca **sublinealmente** respecto al zoom de cámara. Al acercarse, los huecos deben abrirse y los nodos separarse visiblemente.
- Verificar también `itemSizesReference`: los tamaños deben interpretarse de modo coherente con la decisión anterior.
- Fijar un tamaño mínimo y uno máximo en píxeles de pantalla, para que un nodo nunca desaparezca ni ocupe media vista.
- Los nodos de zoom 1 y 2 siguen siendo mayores que los de zoom 3, pero la diferencia debe ser moderada: hoy se ven desproporcionados.

**Cierre:** al acercar al máximo, ningún par de círculos se toca en ninguna de las dos proyecciones. Al alejar, los nodos se achican pero siguen visibles.

---

## PARTE B — Etiquetas

### B1. Posición: debajo del nodo, no al costado

Es el cambio de mayor impacto por menor esfuerzo. Una etiqueta lateral consume ~165 px de ancho y compite directamente con el nodo vecino de la misma capa. Centrada debajo del nodo, ocupa el mismo ancho pero ya no invade la banda horizontal del vecino.

- Etiqueta centrada bajo el nodo, con un pequeño margen.
- Combinado con la separación vertical de la Parte C, esto elimina la mayor parte del encimado.

### B2. Mostrar menos etiquetas, y no todas a la vez

Es lo que hace cualquier mapa: nunca muestra todos los nombres de calle simultáneamente.

- Subir `labelRenderedSizeThreshold` para que en los niveles lejano y medio solo se etiqueten los nodos grandes.
- Bajar `labelDensity` y ajustar `labelGridCellSize` para que Sigma descarte etiquetas que colisionan en vez de superponerlas.
- La etiqueta del nodo bajo el cursor y la del nodo seleccionado se muestran **siempre**, aunque el filtro de densidad las haya descartado.

### B3. Campo `nombre_corto` en el esquema (aditivo)

Hay nombres que no caben en ningún layout razonable: *"El cero y el uno en la multiplicación y división"*, 48 caracteres.

- Añadir al nodo un campo opcional `nombre_corto`, hermano de `nombre`. Máximo 22 caracteres.
- La interfaz usa `nombre_corto` en el mapa cuando existe; si no existe, usa `nombre`. La ficha del nodo (zoom profundo) usa **siempre** el `nombre` completo.
- Actualizar `atlas.schema.json`. Es aditivo: nada que lea `nombre` se rompe.
- **No inventes los nombres cortos.** Deja el campo disponible y vacío; lo llena el autor. Sí puedes generar, como salida de la herramienta, la lista de nodos cuyo `nombre` supera los 25 caracteres, para que sepa cuáles priorizar.

**Cierre:** en el nivel cercano no hay etiquetas superpuestas en ninguna de las dos proyecciones.

---

## PARTE C — Separación en el layout (`tools/layout.mjs`)

### C1. Proyección en capas

- Subir `SEP_NODE` de 260 a **450**. La separación debe superar el ancho típico de etiqueta (~165 px) con holgura, no quedar por debajo.
- Corregir el centrado dentro de la capa: hoy hay pares a 100 px, menos que la propia constante. Ningún par de nodos de la misma capa puede quedar a menos de `SEP_NODE`.
- Reajustar `SEP_REG` y `SEP_Y` para conservar la proporción del mapa entre 1:1 y 2:1 que fijó la Fase 3.6. Al subir `SEP_NODE`, las regiones se ensanchan y las otras dos constantes deben acompañar.
- Mantener el escalonado dentro de la capa si ya se aplicó en la Fase 3.6; con `SEP_NODE` mayor puede volverse innecesario — evaluarlo.

### C2. Proyección radial

El reparto angular actual es proporcional a la cantidad de nodos de cada región, pero **no considera que en los anillos interiores hay mucho menos perímetro**. Por eso el centro se ve apretado y el borde holgado.

- Imponer una **separación angular mínima** tal que dos nodos vecinos del mismo anillo queden a no menos de `SEP_NODE` de distancia real (que depende del radio, no solo del ángulo).
- Cuando un anillo no alcance a cumplirla, **empujar ese anillo hacia afuera** en vez de usar incrementos de radio fijos. El radio de cada anillo pasa a ser una consecuencia de cuántos nodos contiene, no una constante.
- Mantener el radio inicial de 700 como mínimo del anillo 0.
- El orden de los anillos por profundidad no cambia: sigue siendo radio creciente con la profundidad en el orden parcial.

**Cierre:** la distancia mínima entre nodos vecinos es ≥ `SEP_NODE` en ambas proyecciones. La herramienta debe reportar esa distancia mínima al terminar, para poder verificarlo sin abrir la app.

---

## Al cierre

`npm run validate` (verde) → `npm test` (verde) → `npm run layout -- --check` (idempotente en ambas proyecciones) → `npm run build` → commit → `npm run deploy` → reportar URL.

Reportar también: distancia mínima entre nodos en cada proyección, proporción del mapa en la vista en capas, y la lista de nodos con `nombre` de más de 25 caracteres.

**Guardarraíl de `/data`.** Solo pueden cambiar coordenadas, el nuevo campo `nombre_corto` (vacío) y `schema_version`. `git diff data/` no debe mostrar cambios en `id`, `nombre`, `padre`, `region`, `completitud`, `metadatos` ni en las aristas.
