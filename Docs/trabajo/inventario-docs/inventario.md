# Inventario de la documentación — propuesta para aprobar

> 2026-10-10 · `docs/estandar-agentes` sobre `develop@7d00aa4` · Paso 2 de `Docs/planes/estandar-docs/estandar.md` §9.
> Clasificó Antigravity (`gemini-3.8-flash-high`, 7 lotes); auditó y decidió Claude. **Nada se ha borrado ni movido.**
> Este archivo se borra cuando sus movimientos estén hechos (§2.3).

## Resumen

| Grupo | Archivos | Qué pasa |
|---|---|---|
| BORRAR | 87 | **Se borra ya** (paso 3), si lo apruebas. Queda en git. |
| JESUS | 32 | **Decides tú** si el tema sigue abierto. |
| FUENTE | 67 | Parece normativo. Se rescata su porqué al reescribir su área (paso 5) y entonces se borra. |
| PLANES | 62 | Plan en ejecución. Lo aprobado pasa a `Docs/planes/` en la ventana coordinada con el `/loop`; el resto se borra. |
| TRABAJO | 12 | Tema abierto: pasa a `Docs/trabajo/`. |
| AGENTES | 8 | Instrucciones de agentes: se unifican en el paso 4. |
| QUEDA | 3 | Se queda (runbooks y README del repo). |
| **Total** | **271** | |

## 1. Lo que se borra ya — pide tu aprobación

Ninguno está citado desde el código. Las menciones que les hacen otros documentos que se quedan (5 en
`DECISIONS.md`, el resto en documentos que también se irán) se reescriben al borrar para apuntar al commit.

| Carpeta | Archivos | Por qué |
|---|---|---|
| `(raíz)` | `tindivo-landing-v2.png`, `tindivo-menu-v2.png` | capturas del demo de mayo; nadie las enlaza |
| `(raíz)` | `AUDITORIA_ANTIFRAUDE_ACTUAL.md`, `IMPLEMENTACION_ANTIFRAUDE_LOG.md` | junio, contra el proyecto abandonado |
| `Docs/` | `CHECKLIST-VERIFICACION.md`, `DOCUMENTACION_PANELES_TINDIVO.md`, `HALLAZGOS_OLD_NEGOCIOS.md`, `INVENTARIO_ESTADO_ACTUAL.md`, `auditoria-legacy-parte2-codigo.md`, `auditoria-legacy-parte2-resultados.md` | auditorías y referencias del v1, mayo-agosto |
| `Docs/` | `ui-kit-exploration.html`, `ui-kit-v2.html`, `ui-kit-v3.html` | exploraciones de UI de julio; el tema vive en packages/ui |
| `Docs/Encargos/` | `00-retomar-sesion.md`, `07-integracion-recojo.md`, `09-analisis-documentos-v2.md`, `Flujo UX_UI inDrive Entregas.md` | historia del diseño de Entregas (lo dice el propio 00) |
| `Docs/Encargos/compras/` (borrado; en git: `8f26aed`) | **toda la carpeta** (8) | Encargos descartado por Jesús el 2026-10-07 |
| `Docs/Encargos/compras/historico-v1/` (borrado; en git: `8f26aed`) | **toda la carpeta** (10) | Encargos descartado por Jesús el 2026-10-07 |
| `Docs/Encargos/historico-pre-v2/` (borrado; en git: `8f26aed`) | **toda la carpeta** (11) | versión sustituida por la v1.0 del 19-sep |
| `Docs/Encargos/origen-jesus/` (borrado; en git: `8f26aed`) | `00-maestro.md`, `01-flujo-recojo.md`, `02-negocios-campos-categorias.md`, `03-mapa.md`, `04-visibilidad-y-adquisicion.md`, `05-precio-promos-metricas.md` | v1 de los documentos de Jesús; sustituida por origen-jesus-v2 |
| `Docs/Entregas/` | `estado-actual.md` | foto del 30-sep |
| `Docs/Store/` | `ACEPTACION.md`, `IMPLEMENTACION.md`, `Tindivo Store — PRD v1 (MVP).md`, `Tindivo_Store_Prompt_Maestro_Desarrollo_FullStack.md`, `Tindivo_Store_UI_V3_Prompt_Claude_Design.md` | PRD v1 sustituido, prompts usados y entrega/aceptación de una rama ya en producción |
| `Docs/context/` | 13 de 14; se quedan: `debt-liquidation-audit.md` | auditorías de julio, fotos de un momento |
| `Docs/handoff/` (borrado; en git: `8f26aed`) | **toda la carpeta** (9) | relatos de sesión de agosto |
| `Docs/spec/` | `spec-motorizados-rendimiento.md` | auditoría de agosto |
| `Docs/spec/` | `rollback-0123.sql`, `rollback-0124.sql`, `rollback-0125.sql`, `rollback-0126.sql`, `rollback-0127.sql`, `rollback-0128.sql` | revierte migraciones de agosto; hoy sería destructivo |

## 2. Lo que decides tú

1. **`Docs/ingresos/` (borrado; en git: `8f26aed`)** (11) — conclusión «pendiente de aprobación» con una actualización tuya del 7-oct
2. **`Docs/nuevo-modelo/` (borrado; en git: `8f26aed`)** (21) — plan L–V del 30-sep «pendiente de aprobación»; ingresos (7-oct) parece haberlo superado

Si un tema está cerrado: se rescata lo decidido al canon y se borra. Si sigue abierto: pasa a `Docs/trabajo/`.

## 3. Fuente del squash, por área (paso 5)

| Área | Archivos |
|---|---|
| Entregas | 1: `mvp-entregas-v1.md` |
| Entregas (el diseño v1.0 de lo construido) | 8: `01-concepto-y-flujo.md`, `02-dinero-y-cuadre.md`, `03-plan-tecnico.md`, `04-decisiones-abiertas.md`, `05-que-se-puede-llevar.md`, `08-ux-conversion.md`, `README.md`, `Tindivo — Catálogo de negocios y Encargos (spec v1).md` |
| Entregas y catálogo de negocios (mapa) | 7: `00-maestro.md`, `01-flujo-recojo.md`, `02-negocios-campos-categorias.md`, `03-mapa.md`, `04-visibilidad-y-adquisicion.md`, `05-precio-promos-metricas.md`, `brief-publicidad-recoge-y-lleva.md` |
| Entregas: el acuerdo aprobado (README, 08) se rescata; el debate se va con él | 13: `01-claude.md`, `01-codex.md`, `02-codex-auditoria.md`, `03-claude-respuesta.md`, `04-codex-verificacion.md`, `05-codex-cierre.md`, `06-codex-confirmacion.md`, `07-claude-ronda-jesus.md` … |
| Store | 2: `Tindivo_Store_UI_V4_Brief_Final.md`, `tindivo-store-prd-v2.md` |
| admin | 1: `08-flujo-admin.md` |
| antifraude: propuesta de junio, citada desde el código | 1: `ANTIFRAUDE_PASO2_DESIGN.md` |
| arquitectura (push) | 1: `11-notificaciones-push.md` |
| arquitectura (referencia generada: OpenAPI) | 1: `05-api-rest.md` |
| arquitectura (referencia generada: tipos y migraciones) | 1: `04-base-de-datos.md` |
| cliente | 3: `07-flujo-cliente.md`, `FLUJO_TINDIVO.md`, `Tindivo Design Spec.html` |
| cliente (el home con tarjetas de servicio ya está construido) | 1: `README.md` |
| dinero | 8: `12-billing-y-liquidaciones.md`, `RIESGOS-LEDGER.md`, `PENDIENTES.md`, `SPEC_reglas_efectivo_b2c.md`, `etl-parte3-staging.sql`, `spec-0123-eliminar-contingencia.md`, `spec-efectivo-todo-vuelve.md`, `spec-fase-2-ledger-y-sprint.md` |
| dinero (promos: implementada en 0187, 0227–0230; su cabecera dice lo contrario) | 1: `spec-promo-envio-gratis-ago2026.md` |
| dinero: citado desde el código | 1: `debt-liquidation-audit.md` |
| operación | 1: `13-deploy-y-devops.md` |
| pedidos de restaurante | 7: `spec-edicion-pedido-manual.md`, `spec-horarios-y-apertura.md`, `spec-motorizados-bloques-A-F.md`, `spec_manual.md`, `spec_pickup.md`, `spec_resenas.md`, `spec_ui_cajera.md` |
| pedidos de restaurante (motorizado) | 1: `10-flujo-motorizados.md` |
| pedidos de restaurante (negocios) | 1: `09-flujo-negocios.md` |
| plataforma | 4: `00-vision.md`, `01-requerimientos-funcionales.md`, `02-requerimientos-no-funcionales.md`, `03-arquitectura.md` |
| plataforma, dinero y antifraude | 2: `FASE-1-TINDIVO.md`, `Tindivo_Documento_Maestro.md` |
| queda como índice de compatibilidad §N → destino | 1: `DECISIONS.md` |

## 4. Planes, trabajo, agentes y lo que se queda

- **PLANES**: `Docs/trabajo/movil/02-auditoria-backend/` (9); `Docs/trabajo/movil/debate-rest/` (9); `Docs/trabajo/migraciones/debate/` (9); `Docs/trabajo/movil/03-requisitos/` (8); `Docs/trabajo/movil/` (5); `Docs/trabajo/movil/01-sistema-actual/` (5); `Docs/planes/migraciones/` (5); `Docs/trabajo/movil/anexos/scripts/` (4); `Docs/trabajo/movil/05-arranque/` (3); `Docs/trabajo/movil/anexos/` (3); `Docs/trabajo/migraciones/bitacora/` (2)
- **TRABAJO**: `Docs/trabajo/arquitectura/` (7); `Docs/Encargos/` (2); `Docs/` (1); `Docs/Entregas/` (1); `Docs/backlog/` (1)
- **AGENTES**: `.agents/` (3); `(raíz)` (2); `.agents/rules/` (2); `.agents/workflows/` (1)
- **QUEDA**: `(raíz)` (2); `Docs/Entregas/` (1)

## 5. Auditoría (estándar §7.3)

- **Cobertura:** 271/271 entradas clasificadas, rutas exactas, sin duplicados ni sobrantes.
- **Citas:** 264/271 literales comprobadas por script; las 7 restantes son de
  archivos que se deciden por su tipo (relatos de sesión, HTML), no por la cita.
- **Decisión fila por fila:** el veredicto lo pone Claude cruzando la clasificación con lo que Antigravity no podía
  ver al leer cada archivo por separado: enlaces entrantes, citas desde el código y decisiones posteriores.
- **En 130 de 271 filas el grupo final no coincide con la zona de Antigravity**, casi siempre por
  lo que él no podía ver (citas, decisiones posteriores) o porque los grupos de acción son más finos. Las de más peso:
  - `spec/rollback-0123…0128.sql`: «vigentes» para Antigravity; revierten migraciones de agosto y hoy serían destructivos.
  - `spec/spec-0123-eliminar-contingencia.md`: su cabecera dice «nada se ha ejecutado»; `RIESGOS-LEDGER.md` confirma
    que la 0123 se aplicó el 2026-08-05. Cabecera envejecida.
  - `Encargos/` de primer nivel: Antigravity lo trata como Encargos; es el diseño de **Entregas**, ya construido, y
    su propio `00-retomar-sesion.md` dice que la carpeta «queda como historia».
  - `Encargos/compras/`: varios archivos salen «vigentes»; la carpeta está ARCHIVADA desde el 2026-10-07.
  - `Store/Tindivo_Store_UI_V4_Brief_Final.md`: candidato a canon para Antigravity; es un prompt de diseño.
- **Hallazgos para el squash:** `.agents/how-to-use-graphify.md` dice 2.012 nodos (hoy 10.193);
  `context/negocios.md` lo citan 6 documentos fuente; `RIESGOS-LEDGER.md` lo citan 12 archivos de código.
