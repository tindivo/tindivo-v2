# Graphify: el mapa del repo para gastar menos tokens

> Verificado: 2026-10-10 · entorno: Windows de Jesús, `graphify 0.9.11`, worktree de `develop@7d00aa4`

Graphify convierte el repo en un grafo (`graphify-out/graph.json`) que se consulta sin leer decenas de archivos. Las
consultas no cuestan nada; solo la extracción semántica de documentos usa un modelo (DeepSeek).

## Antes de buscar a lo ancho, pregunta al grafo

```bash
graphify query "¿cómo se liquida la deuda de Entregas?" --budget 1500   # subgrafo acotado a ~1500 tokens
graphify explain "advance_order"                                         # un símbolo o archivo y sus vecinos
graphify path "pedido-detail.tsx" "advance_order"                         # cómo se conectan dos piezas
```

Lee archivos **después**, y solo los que el grafo señala. Lo que sugiere el grafo **no es evidencia**: se confirma en el
archivo antes de afirmarlo. `--budget` corta la salida; si se queda corta, súbelo o pregunta más estrecho.

## Mantenerlo al día

- **`graphify update .`** — reextrae el código por AST. Sin coste, ~1-2 min. Tras cambios de código, o si
  `graphify-out/` no existe (no se versiona desde el 2026-10-10: cada worktree tiene el suyo).
- **`pnpm graphify:hooks`** — instala un hook `post-commit` que lo actualiza solo en este worktree.
- **`graphify . --backend deepseek`** y luego **`graphify cluster-only .`** — reextracción completa, incluida la
  semántica de los documentos. Céntimos. Se corre tras reescribir cada área del canon.

## Qué entra en el grafo

Solo lo que manda: código, canon y planes. `.graphifyignore` excluye `Docs/trabajo/` (además de lo que excluya
`.gitignore`). Medido el 2026-10-10: 10.193 nodos, 0 de `Docs/trabajo/`.

## Instalación y credenciales

- Instalado con `uv`, en Python 3.13 aislado: `uv tool install "graphifyy[openai,anthropic]" --python 3.13 --force`.
- La extracción semántica lee `DEEPSEEK_API_KEY` de las variables de entorno del usuario de Windows. La clave no se
  escribe nunca en el repo.

## Trampas conocidas

- **`graphify label` falla con DeepSeek** en la 0.9.11 (incompatibilidad con `ThinkingBlock`): las comunidades se
  quedan con nombres basados en su archivo principal, que sirven igual.
- **No genera `graph.html`** por encima de 5.000 nodos (hoy hay más del doble). Para verlo: `--no-viz` lo omite sin
  aviso, o sube `GRAPHIFY_VIZ_NODE_LIMIT`.
- **Las consultas sobre negocio pueden devolver documentos viejos** mientras dure la reorganización de `Docs/`: lo que
  esté fuera de las zonas del estándar no es norma aunque el grafo lo traiga.
