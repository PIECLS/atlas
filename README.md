# Atlas del Conocimiento

Plataforma visual que representa el conocimiento escolar chileno como un **espacio
de conocimiento navegable** (no un mapa conceptual, no un currículo digital).
Analogía: Google Maps del conocimiento. Este repositorio es la **Capa 3** (interfaz):
consume el dataset, nunca lo define.

> Estado: **hipótesis estructural** verificada mecánicamente y versionada.
> Nunca se afirma validación empírica (A8). MVP: eje Número, 1º–6º básico.

![Certificación dataset](https://github.com/OWNER/atlas/actions/workflows/certify.yml/badge.svg)

*(Reemplazá `OWNER` por el usuario/organización de GitHub una vez creado el repo.)*

## Arquitectura de tres capas

```
Capa 1  Estructura (nodos + aristas de prerrequisito)   ← el contrato (data/)
Capa 2  Metadatos / códex (definición, OA, errores…)    ← cuelga de cada nodo
Capa 3  Interfaz (este repositorio)                      ← consume, nunca define
```

El dataset publicado es el contrato que consumen las apps subordinadas (p. ej.
*Eslabones*, que es un **camino** dentro de este espacio). Por eso los `id` de nodo
son permanentes.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Explorador en desarrollo (Vite). |
| `npm run build` | Type-check + build de producción. |
| `npm test` | Verifica el contrato del dataset (Vitest). |
| `npm run validate` | Validador JS: esquema + aciclicidad + reducción transitiva + `n_estados`. |
| `npm run layout` | **Offline.** Recomputa coordenadas (geografía estable, A5). Idempotente. |
| `npm run layout -- --check` | Falla si el layout cambiaría (útil en CI/pre-commit). |
| `npm run deploy` | Publica en GitHub Pages (`gh-pages`). |

## Estructura

```
data/          atlas.schema.json (contrato) + atlas.numero.json (semilla)
src/types/     tipos TS derivados del esquema
src/data/      loader graphology (pred/succ/reach) + tests del contrato
src/graph/     lienzo Sigma, zoom semántico, tokens de color
src/components/vista de nodo (códex, 9 pestañas) + selector de vistas
tools/         validate.mjs · layout.mjs · certify.R (notario, Fase 6)
```

## Axiomas (no negociables)

La estructura es primero; la interfaz la revela, no la reemplaza. Una arista `A→B`
significa *"no es posible dominar B sin dominar A"* — jamás una secuencia de
enseñanza (A2). Los OA son códex, no esqueleto (A3). La geografía es contenido
curado y versionado; sin layout de fuerza en runtime (A5). Solo se dibuja la
reducción transitiva (A6). El mapa se publica incompleto (A7). Ver `CLAUDE.md`
para la especificación completa.

## Certificación (Fase 6)

`tools/certify.R` es el **notario**: corre en GitHub Actions ante cada push a
`/data`, verifica la estructura con `kst`/`CbKST` y sella `certificacion.verificado`.
Si falla, el dataset no se publica. El Atlas nunca ejecuta R en runtime.
