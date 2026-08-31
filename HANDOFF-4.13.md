# Handoff — revisión 4.13 (para Claude Code en Windows)

## Estado
Rama `revision-4.13`, commit `2bcde5b` (autor Redeus99), **sin pushear**.
Origen: https://github.com/PIECLS/atlas.git — `main` en `720e4dc`.

Bloqueo: el commit se hizo desde una sesión cloud con puente a la carpeta;
esa VM no tiene credenciales de GitHub. Además quedaron dos locks huérfanos
que hay que borrar antes de cualquier operación git:
`.git\HEAD.lock` y `.git\index.lock`.

## Tarea
1. `del .git\HEAD.lock .git\index.lock`
2. `git push -u origin revision-4.13`
3. Verificar que el CI (atlas-notario) corra `tools/certify.R`.
   `certificacion.verificado` quedó en `false` a propósito.
4. Si el CI no re-certifica: correr `certify.R` a mano y commitear antes de mergear a `main`.

NO tocar los archivos modificados fuera de `data/` (src/, package.json, FASE-3.5-4.5.md):
son trabajo en curso del usuario, ajenos a este commit.

## Qué contiene el commit
Fuente: planilla `atlas_revision_4.13.xlsx` (vista descendente del dataset).
Dataset: 239→242 nodos, 340→342 aristas. `node tools/validate.mjs` → todo verde.

Nodos nuevos (con ficha en codex.json):
- `teorema_euclides` (geometria, padre geometria_c, MA1M OA 10) — con representaciones y 3 errores_frecuentes
- `producto_vector_escalar` (geometria, padre geometria_c, MA1M OA 11)
- `valor_absoluto` (enteros, padre enteros_c, MA07 OA 01) — queda huérfano (warning), ver decisión 3

Aristas nuevas (todas `confianza: hipotesis`):
- `criterios_semejanza -> teorema_euclides`
- `vector -> producto_vector_escalar`
- `sector_circular -> superficie_volumen_cono`

Aristas RETIRADAS por reducción transitiva (A6), registradas en
`data/aristas_eliminadas_por_reduccion.json`:
- `razon_pi -> superficie_volumen_esfera` (preexistente)
- `area_circulo -> superficie_volumen_cono` (propuesta en la planilla, ya implicada
  vía razon_pi -> area_circulo -> sector_circular -> superficie_volumen_cono)

Coordenadas de los 3 nodos nuevos: derivadas de un vecino, `fijada_a_mano: false`.
Conviene correr `tools/layout.mjs` si el mapa queda feo.

## Decisiones PENDIENTES del usuario (no las tomes solo)
1. `cardinalidad -> suma`: la justificación de la planilla dice "puede existir
   comprensión inicial…", que es lo contrario de A2. Hay que reescribirla o descartarla.
2. `teorema_pitagoras -> superficie_volumen_cono`: el usuario la marcó "DUDOSA EN A2 ESTRICTO".
3. `valor_absoluto -> adicion_sustraccion_enteros`: el usuario la marcó "DÉBIL… Decidir".
   Mientras no se resuelva, `valor_absoluto` queda sin aristas entrantes.
4. Partir `sector_circular` ("Sector y segmento circular") en dos nodos para admitir
   `segmento_circular` + `formula_area_figuras -> segmento_circular`. Los `id` son
   permanentes (A3/A5): es un cambio de contrato, no un rename.

## Problema de schema, aparte del commit
La planilla trae 11 aristas revisadas con respaldo bibliográfico (Gelman & Gallistel 1986,
Peucker & Weißhaupt 2013, Fuson 1992): 10 con veredicto "✓ correcta" y
`comparacion_orden_numeros -> recta_numerica` marcada "revisar".
NO se promovieron a `consenso_experto` por dos razones:
- el schema define ese valor como "QUERY con especialistas", no validación bibliográfica;
- `$defs.arista` no tiene campo para la fuente, y `justificacion` tiene maxLength 300.
Requiere decidir: ¿campo `fuente`/`bibliografia` en arista, o un valor nuevo en el enum
de `confianza`? Es cambio de `atlas.schema.json` + bump de `schema_version`.

## Lo que NO entra al repo desde la planilla
- Columna "Habilidades" del Codex (176 celdas): son frases truncadas del minado de corpus
  ("Leer y", "Leer contar y"). El schema define un enum de 4 valores. Se descarta y se rehace.
- Columna "Evaluación" (141 celdas): A4 declara `items` RESERVADO en v1 ("no se construyen ítems").
- El `.xlsx` no se sube al repo: los datos canónicos son data/*.json, la planilla es una vista.

## Si "no aparecen los cambios"
No es el nombre del repo. El remoto ya es `https://github.com/PIECLS/atlas.git`
y `git ls-remote` responde bien; PIECLS es la organización dueña, Redeus99 es la
cuenta personal del usuario, y el clon local apunta a PIECLS desde hace tiempo.

Los cambios no aparecen por una de estas tres, en orden de probabilidad:
1. Estás parado en `main`. El commit `2bcde5b` vive SOLO en la rama `revision-4.13`.
   `git switch revision-4.13`, o `git log --oneline revision-4.13`.
2. Estás en otra carpeta. El commit está en `C:\Users\ReDeu\atlas`. Verificá con
   `git rev-parse --show-toplevel`.
3. Los `.lock` huérfanos están haciendo fallar tus comandos git en silencio.
   `del .git\HEAD.lock .git\index.lock` primero que nada.

Comprobación en una línea:
  git -C %USERPROFILE%\atlas log --oneline -1 revision-4.13
Debe devolver: 2bcde5b data: revision 4.13 - 3 nodos y 3 aristas nuevas (I medio y enteros)

Nota: este archivo (HANDOFF-4.13.md) está sin trackear a propósito. No lo commitees;
borralo cuando termines.
