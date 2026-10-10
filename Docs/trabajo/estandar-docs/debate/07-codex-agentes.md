Rama auditada: `docs/agentes-unificados`. Commit: `c315e81`.

**Veredicto: firmo con cambios.** La unificación conserva los invariantes principales, pero corregiría lo siguiente:

1. **Reglas arquitectónicas y de datos omitidas.** Estaban en `7e03038:AGENTS.md` y `CLAUDE.md`, y siguen respaldadas por `DECISIONS.md §3` y §5. Añadir:
   > `packages/core` contiene dominio puro: hexagonal solo en `orders`; services + repos para el resto. `packages/contracts` es la fuente canónica de primitivas, enums, transiciones y errores. Coordenadas: `numeric(10,7)`.

2. **Se perdió la regla sobre el idioma del producto.** Los dos archivos anteriores exigían contenido y UI en español peruano; «responde y documenta» no cubre la UI. Reemplazar esa línea por:
   > Responde, documenta y escribe el contenido de la UI en **español peruano**; el dueño es **Jesús**. Código, base y ramas en inglés.

3. **Se debilitó la verificación del trabajo.** `.agents/AGENTS.md §2.3` exigía evidencia cruda; §2.4 y §3 exigían verificar cada paso y todos los criterios antes de cerrar. No pertenecen al baseline eliminado. Añadir:
   > Verifica cada paso antes del siguiente y no declares completa una tarea hasta comprobar todos sus criterios de aceptación. Adjunta la evidencia cruda pertinente, no solo tu conclusión.

   También falta el requisito de entrada de §3, actualizado al estándar:
   > Antes de implementar, lee el canon y el plan aplicables; si falta una definición vigente necesaria, pregunta antes de implementar esa parte.

4. **La afirmación sobre caché es falsa.** `Cached: 0` no es requisito para que se haya ejecutado algo: Turbo puede mezclar tareas ejecutadas y cacheadas (`turbo.json`). Reemplazar el comentario por:
   > `# revisa qué tareas se ejecutaron y cuáles salieron de caché; para verificar de nuevo, usa --force`

5. **El mapa necesita cubrir a los consumidores de la base.** Permite encontrar los locales, incluidos los iconos compartidos, pero las pruebas de `apps/api` usan la base aunque no editen `supabase/`. Reemplazar la primera fila por:
   > | `supabase/`, cualquier SQL contra una base, pruebas de integración de `apps/api` o scripts que usen la base | `supabase/AGENTS.md` |

   No hace falta duplicar esas reglas en otra carpeta. Además, la carga automática de Antigravity al trabajar dentro **no está acreditada** por el estándar §6.1: allí se comprobó hasta el directorio de lanzamiento. Reemplazar la frase por:
   > Codex lanzado desde la raíz **no** carga los locales automáticamente. Claude los carga mediante los `CLAUDE.md` anidados. Todos deben seguir este mapa, independientemente de la carga automática.

Los scripts esenciales existen en `package.json`; `db:cycle` sí implementa reset → seed → tests de API bajo candado. No detecté otra falsedad demostrada contra el repo; esto no certifica el estado vivo de producción.

Del raíz sobra la enumeración de versiones del stack: ya está en `pnpm-workspace.yaml`. Borraría exactamente «(TS 6) · Zod **v4** · Next **16** + React **19** + Tailwind **v4**», conservando «TypeScript **strict**» y las convenciones que requieren juicio.

No cambié archivos.