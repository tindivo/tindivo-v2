# Fuente de iconos — Material Symbols Rounded (subset variable)

`material-symbols-rounded.woff2` es un **subconjunto** de la fuente variable de
Google: solo trae los iconos que el panel usa de verdad, listados en `icons.txt`.

- 92 KB (antes: 4.83 MB en cuatro TTF estáticos).
- Conserva los cuatro ejes — `FILL`, `GRAD`, `opsz`, `wght` — porque la primitiva
  `Icon` de `@tindivo/ui` los controla con `font-variation-settings`.
- `font-display: swap`, no `block`: los iconos no quedan invisibles mientras carga.

Negocios es la única app que auto-hospeda la fuente; `motorizados`, `customer` y
`admin` la traen del CDN de Google. Se mantiene así a propósito, para que el panel
funcione con mala conectividad en el piloto.

## Al añadir un icono nuevo

Si usas un `name` que no está en `icons.txt`, **no se renderiza**: hay que
regenerar el subset. El proceso completo:

```bash
pip install fonttools brotli

# 1. Recolectar todos los nombres de icono del código
cd apps/negocios
{
  grep -rohE 'name="[a-z_0-9]+"' . ../../packages/ui --include=*.tsx | sed 's/name="//;s/"//'
  grep -rohE "icon:\s*'[a-z_0-9]+'" . ../../packages/ui --include=*.tsx --include=*.ts | sed "s/.*'\(.*\)'/\1/"
  grep -rohE "name=\{[^}]*\}" . ../../packages/ui --include=*.tsx | grep -ohE "'[a-z_0-9]+'" | tr -d "'"
} | sort -u > public/fonts/icons.txt

# 2. Bajar la fuente variable completa (~15 MB, no se versiona)
curl -sL -o /tmp/MSR-var.ttf \
  'https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsRounded%5BFILL%2CGRAD%2Copsz%2Cwght%5D.ttf'
```

3. Resolver cada nombre a su glifo **por la tabla de ligaduras**, no por nombre de
   glifo: varios iconos (`location_on`, `smartphone`, `delivery_dining`,
   `report_problem`) son alias cuyo glifo se llama distinto, y `--glyphs=` con el
   nombre del icono falla. Ojo también con `ExtensionSubst`: las ligaduras vienen
   envueltas y hay que desenvolverlas para encontrarlas.

4. Subsetear con `--no-layout-closure`. Sin ese flag, incluir `a-z` en `--text`
   arrastra todas las ligaduras alcanzables y el resultado vuelve a pesar 5 MB.

```bash
python -m fontTools.subset /tmp/MSR-var.ttf \
  --glyphs="$GLIFOS_RESUELTOS" \
  --text="abcdefghijklmnopqrstuvwxyz_0123456789" \
  --layout-features+=liga,dlig,calt,rlig \
  --no-layout-closure \
  --flavor=woff2 \
  --output-file=public/fonts/material-symbols-rounded.woff2
```

5. Verificar antes de commitear: que `fvar` siga trayendo los cuatro ejes y que
   todos los nombres de `icons.txt` resuelvan en la tabla de ligaduras del subset.
