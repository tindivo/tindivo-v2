---
id: ejemplo
nombre: Ejemplo
actores: [CUS]
lineas: [restaurantes]
depende_de: []
dinero: false
codigo:
  web: []
  android: []
  ios: []
  backend: []
operaciones: []
reglas: []
---

# Ejemplo

> Verificado: AAAA-MM-DD · entorno: develop@abc1234 · Aprobado por Jesús el AAAA-MM-DD (medio)

<!-- Plantilla de una capacidad (Docs/README.md §2.4). Copia la carpeta `_plantilla/` a `Docs/producto/<id>/`,
     reemplaza todo lo de ejemplo y borra estos comentarios. El validador (`pnpm spec:validar`) ignora `_plantilla/`.

     Cabecera (entre las líneas ---), una clave por línea; listas en corchetes:
     - id: igual al nombre de la carpeta, en minúsculas y con guiones.
     - actores: CUS (cliente), NEG (negocio), MOT (motorizado), ADM (admin).
     - lineas: líneas de negocio que usan esta capacidad (restaurantes, entregas, store…), según Docs/negocio/servicios/.
     - depende_de: ids de otras capacidades de Docs/producto/. Sin ciclos.
     - dinero: true si alguna regla citada toca dinero; entonces todo cambio de esta capacidad pasa por Codex.
     - codigo: globs del código que no pertenece a ninguna pantalla (por plataforma). Lo de cada pantalla va en su ficha.
     - operaciones: operationId de packages/contracts/openapi/v1.json que no usa ninguna pantalla.
     - reglas: símbolos de packages/contracts (ADDRESS_REFERENCE_MIN) o claves de app_settings (app_settings:prepay_threshold).
       Aquí NO se escriben valores: el valor vive en su casa.
     El estado por plataforma no se escribe en ningún lado: lo calcula `pnpm spec:traza` desde las pruebas. -->

## Antes de tocar

<!-- Máximo 15 líneas. Lo que un agente debe saber antes de cambiar algo aquí: qué es, de qué depende, dónde vive su
     código por plataforma, qué reglas de dinero cita, qué dispara Codex y qué trampas conocidas tiene. -->

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-XXX-001 | Cuando …, la app debe … | `DECISIONS.md §N` · `ADR 0039` · `movil:D-NN` | ★ |

## Criterios de aceptación

<!-- Cada criterio se comprueba con una prueba que lleva su ID en el nombre: `it('CA-XXX-01 …')`, `fun ca_XXX_01_…`,
     `func test_CA_XXX_01_…`. Si un criterio cambia de significado, recibe un ID nuevo y el viejo queda «retirado → nuevo». -->

| CA | Criterio | Requisitos |
|---|---|---|
| CA-XXX-01 | Dado …, cuando …, entonces … | CUS-XXX-001 |

## Reglas

<!-- Solo referencias que resuelven: `ADDRESS_REFERENCE_MIN` (packages/contracts), `app_settings:prepay_threshold`,
     o un enlace a Docs/negocio/<archivo>.md. Ningún número escrito a mano. -->

## Defectos conocidos

<!-- Solo si los hay. -->
