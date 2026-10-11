# apps/negocios — iconos: subset cerrado de Material Symbols

Se suma al `AGENTS.md` raíz. Aplica también a `apps/motorizados` y a `packages/ui`.

- `negocios` (y `motorizados`) **no usan el CDN de Google Fonts**: auto-hospedan
  `public/fonts/material-symbols-rounded.woff2` (~92 KB) por la mala conectividad del piloto.
- Esa fuente **solo** trae las ligaduras listadas en `apps/negocios/public/fonts/icons.txt`.
- Un `<Icon name="..." />` que no esté ahí **no falla en TypeScript ni en el linter**: el navegador pinta el nombre
  como texto cortado, un garabato roto (`st`…).
- **Antes de usar un icono**, comprueba que esté en `icons.txt`. Si no está, usa uno equivalente que sí esté, o
  regenera el `.woff2` siguiendo `apps/negocios/public/fonts/README.md`.
- **Siempre:** `pnpm --filter @tindivo/negocios test` (corre `icon-subset.test.ts`).
- `apps/customer` sí usa el Google Fonts completo: ahí cualquier icono funciona.
