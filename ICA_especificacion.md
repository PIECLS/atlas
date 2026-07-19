# Índice de Centralidad del Atlas (ICA) — especificación para implementar

## Qué es

Una métrica **puramente visual** que fija el tamaño de cada nodo al dibujar el
grafo. NO altera la estructura, ni las aristas, ni el orden topológico. Es una
capa de presentación: nodos más grandes = más importantes estructuralmente, para
que el lector se oriente de un vistazo. Se recalcula cuando cambia el grafo; no
se persiste como propiedad epistémica del nodo.

## Fórmula

```
ICA(n) = 0.70 · I(n) + 0.30 · B(n)
```

donde I y B están ambos normalizados a [0, 1] sobre el grafo completo (ver abajo).

### I — Impacto (peso 0.70)

Cantidad de **descendientes** de `n` en el DAG: la clausura transitiva hacia
adelante (todo lo que `n` desbloquea, directa o indirectamente), no solo los
hijos inmediatos.

```
impacto_bruto(n) = |descendientes(n)|      # BFS/DFS siguiendo aristas salientes
I(n) = log(1 + impacto_bruto(n)) / log(1 + max_n impacto_bruto)
```

El logaritmo es obligatorio: la descendencia en un DAG jerárquico es de cola
larga (unos pocos nodos raíz desbloquean casi todo). Sin log, esos nodos
aplastarían visualmente al resto.

### B — Betweenness (peso 0.30)

Betweenness centrality estándar (fracción de caminos más cortos que pasan por
`n`). Corrige a favor de los nodos-puente: los que conectan regiones aunque su
descendencia propia sea corta (ej. cruces entre ejes como `recta_numerica` o
`multiplicacion`).

```
B(n) = betweenness(n) / max_n betweenness      # normalización lineal, no log
```

Si usas networkx: `nx.betweenness_centrality(G)` ya devuelve valores
normalizados; basta reescalar dividiendo por el máximo para que el nodo más
alto quede en 1.0.

## Reglas de cálculo (críticas)

1. **Calcular sobre el grafo REDUCIDO transitivamente**, no sobre el que tiene
   las aristas redundantes. Impacto no cambia con las redundantes (los
   descendientes son los mismos), pero betweenness sí se distorsiona. Ambas
   métricas sobre el mismo grafo reducido.

2. **Normalizar UNA SOLA VEZ sobre el grafo completo**, nunca por región. Si se
   normaliza dentro de cada eje, el nodo mayor de Datos se vería igual de grande
   que `cardinalidad` y los tamaños dejarían de ser comparables entre regiones.
   Los máximos de las fórmulas de I y B son globales.

3. **Los nodos de región** (`*_c`, zoom 2) se excluyen del cálculo: no son
   conocimientos, son paraguas organizativos.

## Mapeo a tamaño visual

El ojo lee **área**, no radio. Para que el área sea proporcional al ICA, el
radio va con la raíz:

```
radio(n) = R_MIN + (R_MAX − R_MIN) · sqrt( ICA(n) / max_n ICA )
```

**Mantener el rango angosto.** El tamaño debe insinuar la jerarquía, no
dominarla: una hoja terminal no debe desaparecer y el nodo mayor no debe tapar a
sus vecinos. Parámetros sugeridos:

```
R_MIN = 18
R_MAX = 34      # razón 1.9× entre el mayor y el menor
```

Son los dos únicos números a tocar para calibrar. No subir R_MAX/R_MIN más allá
de ~2.2× o el grafo se vuelve ruidoso. (En pruebas, 14–46 = 3.3× resultó
demasiado agresivo.)

## Salida esperada

Por cada nodo (excluidas las regiones): `impacto_bruto`, `I`, `B`, `ICA`,
`radio`. El `radio` es lo único que consume el renderizador; el resto es para
inspección y para poder auditar por qué un nodo quedó de cierto tamaño.

## Verificación rápida

Tras implementar, revisar que:
- Los cuellos de botella tempranos (`cardinalidad`, `composicion_aditiva`,
  `valor_posicional`) queden entre los mayores.
- Las hojas terminales (`numero_mixto`, `volumen_paralelepipedo`, `division`)
  queden en R_MIN o cerca.
- Algún nodo-puente de baja descendencia pero alto tránsito (p. ej.
  `multiplicacion`, `estructura_arreglo_area`) quede en tamaño medio y no en el
  mínimo — si queda en el mínimo, betweenness no se está aplicando bien.
