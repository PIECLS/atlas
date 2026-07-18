# =============================================================================
# Atlas del Conocimiento — Certificador (Fase 6)
#
# R es el NOTARIO, no la base: sella la estructura antes de publicarla. El Atlas
# nunca ejecuta R en runtime. Este script corre en GitHub Actions ante cada push
# a /data. Si falla, el dataset NO se publica.
#
# Verifica (espejo formal de tools/validate.mjs):
#   · aciclicidad
#   · reducción transitiva (solo el diagrama de Hasse; A6)
#   · cierre bajo unión e intersección (espacio cuasi-ordinal; A1)
#   · clausula == null en toda arista (A1)
#   · computa n_estados (conjuntos descendentes del orden parcial)
# y escribe el bloque `certificacion` en el JSON.
#
# -----------------------------------------------------------------------------
# INSTALACIÓN (el autor no maneja R; estos son los pasos completos):
#
#   1. Instalar R >= 4.2 desde https://cran.r-project.org/
#   2. En una terminal de R (o RStudio), instalar los paquetes:
#
#        install.packages(c("jsonlite", "sets", "relations", "kst"))
#        # CbKST (Heller & Stefanutti, 2024) es opcional en v1 (no hay ítems):
#        install.packages("CbKST")   # si no está en CRAN, se omite sin error
#
#   3. Correr desde la raíz del repo:
#
#        Rscript tools/certify.R
#
#   En CI todo esto lo hace .github/workflows/certify.yml automáticamente.
#
#   kst  = operaciones de espacios de conocimiento (Hockemeyer)
#   CbKST = competence-based KST (Heller & Stefanutti, 2024)
# =============================================================================

suppressWarnings(suppressMessages({
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    stop("Falta el paquete 'jsonlite'. Instalá: install.packages('jsonlite')")
  }
  library(jsonlite)
}))

# --- Utilidades de log --------------------------------------------------------
ok   <- function(msg) cat(sprintf("  ✓ %s\n", msg))
bad  <- function(msg) cat(sprintf("  ✗ %s\n", msg))
info <- function(msg) cat(sprintf("  · %s\n", msg))

args <- commandArgs(trailingOnly = TRUE)
ruta <- if (length(args) >= 1) args[[1]] else "data/atlas.numero.json"

cat("── Atlas · certificación (R) ───────────────\n")
cat(sprintf("dataset: %s\n\n", ruta))

atlas <- fromJSON(ruta, simplifyVector = FALSE)

ids    <- vapply(atlas$nodos, function(n) n$id, character(1))
zoom   <- vapply(atlas$nodos, function(n) as.integer(n$nivel_zoom), integer(1))
names(zoom) <- ids

de <- vapply(atlas$aristas, function(e) e$de, character(1))
a  <- vapply(atlas$aristas, function(e) e$a,  character(1))

errores <- character(0)

# --- A1: clausula == null en toda arista -------------------------------------
clausulas_no_null <- Filter(function(e) !is.null(e$clausula), atlas$aristas)
if (length(clausulas_no_null) == 0) {
  ok("clausula == null en todas las aristas (A1)")
} else {
  bad(sprintf("%d arista(s) con clausula no-null (A1)", length(clausulas_no_null)))
  errores <- c(errores, "clausula no-null")
}

# --- Referencias de aristas existen ------------------------------------------
faltan <- setdiff(unique(c(de, a)), ids)
if (length(faltan) == 0) {
  ok("todas las aristas referencian nodos existentes")
} else {
  bad(sprintf("aristas a nodos inexistentes: %s", paste(faltan, collapse = ", ")))
  errores <- c(errores, "referencias rotas")
}

# --- Nodos estructurales (participan en alguna arista) -----------------------
estructurales <- sort(unique(c(de, a)))
k <- length(estructurales)
info(sprintf("nodos estructurales: %d", k))

# Matriz de adyacencia directa (sobre estructurales).
idx <- setNames(seq_along(estructurales), estructurales)
A <- matrix(0L, k, k, dimnames = list(estructurales, estructurales))
if (length(de) > 0) for (i in seq_along(de)) {
  if (de[i] %in% estructurales && a[i] %in% estructurales) A[idx[de[i]], idx[a[i]]] <- 1L
}

# --- Aciclicidad (clausura transitiva por Floyd-Warshall booleano) -----------
R <- A > 0
if (k > 0) for (m in seq_len(k)) for (i in seq_len(k)) if (R[i, m])
  R[i, ] <- R[i, ] | R[m, ]
aciclico <- k == 0 || !any(diag(R))
if (aciclico) ok("aciclicidad") else {
  bad("hay un ciclo en la precedencia")
  errores <- c(errores, "ciclo")
}

# --- Reducción transitiva: ninguna arista implicada por transitividad (A6) ----
reduccion_ok <- TRUE
if (aciclico && length(de) > 0) {
  for (i in seq_along(de)) {
    s <- idx[de[i]]; t <- idx[a[i]]
    # ¿existe un camino alternativo s ~> t sin usar la arista directa?
    B <- A; B[s, t] <- 0L
    Rr <- B > 0
    for (m in seq_len(k)) for (p in seq_len(k)) if (Rr[p, m]) Rr[p, ] <- Rr[p, ] | Rr[m, ]
    if (Rr[s, t]) {
      bad(sprintf("arista redundante (A6): %s -> %s", de[i], a[i]))
      reduccion_ok <- FALSE
    }
  }
}
if (reduccion_ok) ok("reducción transitiva (solo diagrama de Hasse, A6)")
if (!reduccion_ok) errores <- c(errores, "arista redundante")

# --- Conjuntos descendentes (order ideals) = estados del espacio -------------
# S es descendente si para todo x en S, sus prerrequisitos (ancestros) estan en S.
n_estados <- NA_integer_
estados <- list()
if (aciclico && k <= 20) {
  # ancestros[x] via la clausura transitiva inversa
  anc <- lapply(estructurales, function(x) estructurales[R[, idx[x]]])
  names(anc) <- estructurales
  cuenta <- 0L
  total <- bitwShiftL(1L, k)
  for (mask in seq_len(total) - 1L) {
    presente <- setNames(as.logical(bitwAnd(mask, bitwShiftL(1L, seq_len(k) - 1L))), estructurales)
    es_ideal <- TRUE
    for (x in estructurales[presente]) {
      if (length(anc[[x]]) && !all(presente[anc[[x]]])) { es_ideal <- FALSE; break }
    }
    if (es_ideal) {
      cuenta <- cuenta + 1L
      estados[[length(estados) + 1L]] <- estructurales[presente]
    }
  }
  n_estados <- cuenta
  info(sprintf("n_estados (conjuntos descendentes): %d de %d posibles", n_estados, total))
} else if (k > 20) {
  info("dominio grande (k > 20): n_estados no enumerado por fuerza bruta")
}

# --- Cierre bajo union e interseccion via kst (credencial CbKST) --------------
# El calculo base ya garantiza que los estados son los order ideals de un orden
# parcial (por construccion, cerrados bajo union e interseccion). kst lo confirma
# de forma independiente y con el vocabulario del area. Se envuelve en tryCatch
# para que un desajuste de API no rompa el gate: la verdad la da el calculo base.
cierre_ok <- aciclico  # los order ideals de un poset SIEMPRE forman un espacio cuasi-ordinal
if (requireNamespace("kst", quietly = TRUE) && requireNamespace("sets", quietly = TRUE) &&
    length(estados) > 0) {
  tryCatch({
    suppressWarnings(suppressMessages({ library(sets); library(kst) }))
    conjuntos <- lapply(estados, function(s) do.call(sets::set, as.list(s)))
    K <- kst::kstructure(do.call(sets::set, conjuntos))
    es_espacio <- tryCatch(kst::kstructure_is_kspace(K), error = function(e) NA)
    if (isTRUE(es_espacio)) ok("kst: la estructura es un espacio de conocimiento (cerrado bajo unión)")
    else info("kst cargado; verificación de espacio no concluyente (se usa el cálculo base)")
  }, error = function(e) info(sprintf("kst no disponible/compatible (%s); se usa el cálculo base", conditionMessage(e))))
} else {
  info("kst/sets no instalados: se certifica con el cálculo base (equivalente)")
}

# --- Huerfanos: nodos zoom 3 sin aristas (permitidos; se reportan) -----------
huerfanos <- ids[zoom[ids] == 3 & !(ids %in% estructurales)]
if (length(huerfanos)) info(sprintf("huérfanos (zoom 3 sin aristas): %s", paste(huerfanos, collapse = ", ")))

# --- Veredicto ----------------------------------------------------------------
cat("\n")
verificado <- length(errores) == 0 && aciclico && reduccion_ok && cierre_ok
if (!verificado) {
  bad(sprintf("CERTIFICACIÓN FALLIDA: %s", paste(unique(errores), collapse = "; ")))
  cat("\nEl dataset NO se publica.\n")
  quit(status = 1)
}

# --- Sellar el bloque certificacion y escribir --------------------------------
herramienta <- sprintf("R %s / kst %s",
  paste(R.version$major, R.version$minor, sep = "."),
  tryCatch(as.character(packageVersion("kst")), error = function(e) "n/d"))

cert <- list(
  verificado = TRUE,
  fecha = format(as.POSIXct(Sys.time(), tz = "UTC"), "%Y-%m-%dT%H:%M:%SZ"),
  herramienta = herramienta,
  aciclico = TRUE,
  reduccion_transitiva = TRUE,
  huerfanos = as.list(huerfanos),
  notas = "Hipótesis estructural consistente con los axiomas, verificada mecánicamente y versionada. Sin validación empírica (A8)."
)
# El esquema exige n_estados entero. En dominios grandes no se enumera: se OMITE
# el campo (no se escribe null, que violaría el contrato).
if (!is.na(n_estados)) cert$n_estados <- as.integer(n_estados)
atlas$certificacion <- cert
atlas$generado <- format(as.POSIXct(Sys.time(), tz = "UTC"), "%Y-%m-%dT%H:%M:%SZ")

writeLines(toJSON(atlas, auto_unbox = TRUE, pretty = TRUE, null = "null"), ruta)
ok("certificación escrita en el dataset (certificacion.verificado = true)")
cat("\nEl dataset queda listo para publicar.\n")
