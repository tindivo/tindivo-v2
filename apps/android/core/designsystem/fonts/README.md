# Geist en la app Android

`src/main/res/font/geist.ttf` es Geist, la letra de la marca, recortada para pesar poco (D-57). Esta carpeta guarda su
licencia y cómo se hizo; no puede ir dentro de `res/font/`, donde Android solo acepta fuentes.

- **Origen:** release oficial [`vercel/geist-font` v1.8.2](https://github.com/vercel/geist-font/releases/tag/v1.8.2),
  `geist-font-v1.8.2.zip` (SHA-256 `43ffb66912b1c49e40c371d96e86b3b3dab42db83eb2d0c8a17321210394c4c7`, el mismo
  digest que publica GitHub), archivo `geist-font/Geist/variable/Geist[wght].ttf` (169 056 bytes, SHA-256
  `98c7f53f48cb74b8b89e012e3902f0c11d12ae361c67db8da35d5969cfaa610d`).
- **Licencia:** SIL Open Font License 1.1, en `OFL.txt` (copia del zip). No declara *Reserved Font Name*, así que la
  versión recortada puede seguir llamándose Geist. El propio `.ttf` conserva el aviso de copyright y la licencia en su
  tabla `name` (IDs 0, 13 y 14), que es como la OFL pide acompañar a la fuente dentro del APK.
- **Resultado:** un solo TTF variable, eje `wght` de 400 a 700 (los pesos que usa la app: 400, 500, 600 y 700), con
  Basic Latin, Latin-1, Latin Extended-A, puntuación general y símbolos de moneda. 71 888 bytes, SHA-256
  `4eb942584c87a88ed71810e36cda0c65e8797bc89f4ab916b8f3b64df1eaf20f` (fonttools 4.63.0).

## Cómo regenerarlo

Con Python 3 y `pip install fonttools==4.63.0`, desde la carpeta donde se descomprimió el zip:

```bash
pyftsubset 'geist-font/Geist/variable/Geist[wght].ttf' \
  --unicodes='U+0020-007E,U+00A0-00FF,U+0100-017F,U+2000-206F,U+20A0-20CF' \
  --layout-features='*' --name-IDs='*' --name-languages='*' \
  --output-file=geist-latin.ttf
fonttools varLib.instancer geist-latin.ttf wght=400:700 -o geist.ttf
```

El recorte del eje no cambia el dibujo: entre 400 y 700 la fuente no tiene másters intermedios (el único está cerca de
800), así que 500, 600 y 700 salen como en el original, salvo el redondeo de los deltas a la unidad de diseño. Un peso fuera de ese rango (300, 800) exige regenerarla.
