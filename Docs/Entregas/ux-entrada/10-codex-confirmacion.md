- **Búsqueda: RESUELTO.** Los nombres completos ya no activan el filtro por tipo; dentro de negocios, las coincidencias por nombre salen primero. Tests nuevos cubren ambos casos.
- **«Soy yo»: RESUELTO.** Al apagarlo abre la edición del contacto. El e2e comprueba que aparece el campo de celular.
- **Seed: RESUELTO.** La excepción en `.gitignore` funciona: el JSON aparece como archivo nuevo en `git status`. Debe incluirse junto con el script en el commit.
- **Celular sin +51: RESUELTO.** «Usar mi dirección» y «Soy yo» comparan ahora el mismo formato.

**Acepto 768 px:** iguala los paneles usando el ancho existente de `BottomSheet`, sin ampliar el alcance.

No encontré bloqueos nuevos. `git diff --check` limpio; las 276 unitarias y 16 e2e son resultados reportados, no reejecutados.

**LISTO PARA COMMIT.**