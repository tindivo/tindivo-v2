# 08 · Acuerdo Claude + Codex sobre los puntos de Jesús

> 2026-10-07. Sobre `07-claude-ronda-jesus.md` y `07-codex-ronda-jesus.md`.

| # | Punto de Jesús | Acuerdo | Cómo queda |
|---|---|---|---|
| 1 | ¿El buscador, solo negocios? | **Negocios primero; las referencias públicas se quedan, pero debajo.** Sin chips de categoría (Claude los proponía; Codex no, porque con el teclado abierto le quitan espacio a los resultados, y gana). **Se busca también por tipo**: «botica» trae las boticas aunque su nombre no lo diga. Eso hace de filtro sin botones | Al tocar: tus lugares. Al escribir: hasta 5, en «Tus lugares» · «Negocios» · «Referencias del pueblo». Negocio = salud, mercado, restaurante u hotel |
| 2 | «Ver anteriores» en ventana aparte | **Sí, una hoja desde abajo.** No agranda el panel ni encoge el mapa | «Entregas anteriores»: hasta 3, con qué se llevó y la fecha. Tocar una abre Detalles con todo puesto |
| 3 | «Mi dirección» más limpio | **Sale la tarjeta grande y pasa a la esquina**, como «Ver anteriores»: «Usar mi dirección» a la derecha de la fila del paso. «Recogemos en…» se queda como una línea discreta (Claude lo quitaba; Codex no, porque en el paso 2 es el único recordatorio de dónde se recoge, y gana). El estado deja de parecer una alerta | Fila: «Ubicación 2 de 2 · Usar mi dirección». Debajo: título, «Recojo: …», estado tranquilo, el campo y el botón |
| 4 | Mismo ancho; ¿Detalles con flecha? | **Mismo ancho máximo (~640 px) y centrados en pantalla ancha; en el celular, 100 %.** **Flecha de volver en Detalles** que lleva al mapa de B sin perder nada; sale la X | El botón gris «Completar: …» deja de parecer apagado: es una acción, se ve como tal |
| 5 | Quitar los chips de contacto | **Fuera los recientes; «Soy yo» se queda**, pero a la esquina de cada tarjeta, no en una fila de chips. Los nombres por defecto («Quien recibe») ya no se ofrecen | «Recogemos de ············ Soy yo» |
| — | «Paso 2 de 2» engaña: después viene Detalles | **«Ubicación 1 de 2» / «Ubicación 2 de 2»** (Codex) | — |
| — | Seed de lugares | Los 60 lugares de producción, con sus mismos `id`: `pnpm db:seed:lugares` | — |

**Pendiente de datos (para Jesús, desde el admin):** «salud» mezcla boticas con
Essalud y la Posta, y «otro» mezcla negocios (librería, pastelería, grifo, spa)
con referencias («Entrada fábrica», Hidrandina). Hasta corregirlo, los
negocios de «otro» salen como referencias.
