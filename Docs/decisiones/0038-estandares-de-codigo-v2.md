# 0038. Estándares de código v2: transversales y por lenguaje

Estado: Vigente · 2026-10-12 · Aprobada por Jesús el 2026-10-12 (conversación con Claude Code)

## Contexto

- La propuesta 05 (v2.1), escrita por el agente y revisada por Codex en dos rondas, definía reglas de desacoplamiento, API, TypeScript, base de datos, migraciones, pruebas y operación, con tres niveles (OBLIGATORIA, ALERTA, GUÍA) y excepciones registradas.
- No cubría las apps nativas, que pasan a ser la prioridad (`Docs/planes/movil/`).
- Contradecía el estándar de Docs aprobado el 2026-10-10: ponía los ADR en otra carpeta y mandaba el resumen a `CLAUDE.md`, que Codex y Antigravity no cargan.
- El contrato REST v1 (`Docs/planes/movil/contrato-rest.md`) ya fija en producción las rutas por actor, los códigos de error, las cabeceras `x-tindivo-*`, la actualización obligatoria y `GET /api/v1/config`. Unos estándares que los redefinieran romperían clientes en uso (API-3).

## Decisión

- Se adoptan los estándares v2.2 en `Docs/arquitectura/estandares/`: las reglas transversales en `README.md` y una por lenguaje (`typescript.md`, `sql.md`, `swift.md`, `kotlin.md`). Cada regla se define en un solo archivo.
- Se conservan de la 05 los niveles, las excepciones y los identificadores de regla.
- Cambios principales:
  - Los estándares no redefinen valores del contrato REST ni de las decisiones vigentes: dicen cómo se diseña, se cambia y se verifica el contrato, y remiten a él.
  - DES-1: en las apps nativas, el SDK de Supabase vive detrás de interfaces propias; Realtime como aviso, según el contrato.
  - DES-7: el registro de propiedad es obligatorio desde ya.
  - API-3: añadir valores a un enum de respuesta exige lector tolerante en las apps (CLI-2).
  - MIG-3: verificable con el tráfico por versión.
  - OPS-6: vuelta atrás para apps que no se pueden revertir.
  - Nuevas: DES-8 a DES-11, API-10 a API-12, TS-17, la sección CLI, DB-13 a DB-19, MIG-6, TST-5, TST-6, OPS-9, OPS-10, SW y KT.
- La regla de los tres usos sale de `CLAUDE.md`; su única fuente es TS-6. El resumen de los estándares va en `AGENTS.md`.
- Las decisiones y la documentación se rigen por `Docs/README.md`; la sección «Decisiones y documentación» de la 05 (DOC-1 y DOC-2) se elimina.

## Alternativas

- **Un solo archivo de estándares**: descartado. Cada agente cargaría reglas de lenguajes que no toca, con más gasto de tokens.
- **Aprobar la 05 tal cual**: descartado. Contradice el estándar de Docs y no cubre apps instaladas.

## Consecuencias

- Las OBLIGATORIAS sin mecanismo exigen evidencia en el PR hasta que el mecanismo exista (estándares §8).
- Lo existente que incumple va a `Docs/arquitectura/excepciones.md`; esa cuenta solo puede bajar.

## Verificación

Cada identificador de regla se define una sola vez:

```sh
grep -rhoE '^\| [A-Z]{2,3}-[0-9]+ \|' Docs/arquitectura/estandares | sort | uniq -d
```

La salida debe estar vacía.

Discusión: `archive/estandares-v2:Docs/trabajo/arquitectura/05-estandares.md`
