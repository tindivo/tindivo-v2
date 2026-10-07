**Veredicto: NO LISTO PARA COMMIT.** Encontré tres problemas reproducibles que las pruebas reportadas no cubren.

| Fila del acuerdo | Estado |
|---|---|
| 1. Búsqueda | **PARCIAL:** grupos, prioridades y límite implementados; buscar un nombre completo puede ocultar el lugar correcto. |
| 2. Anteriores | **CUMPLIDO:** hoja independiente, hasta tres rutas, contenido y fecha; abre Detalles y exige reconfirmar «listo y pagado». |
| 3. Mi dirección | **CUMPLIDO:** atajo en la esquina, recordatorio del recojo y estado más tranquilo. |
| 4. Ancho y retroceso | **PARCIAL:** anchos iguales, flecha sin pérdida del borrador y CTA activo; máximo de 768 px, frente a los ~640 acordados. |
| 5. Contactos | **CUMPLIDO en presentación:** desaparecen los recientes y nombres de respaldo; «Soy yo» queda en la esquina, pero introduce un fallo funcional. |
| «Ubicación» | **CUMPLIDO:** reemplaza «Paso» en ambos puntos. |
| Seed | **PARCIAL:** JSON con 60 registros, 60 identificadores únicos y categorías coincidentes; el archivo está ignorado por Git. |

**Errores nuevos que corregir antes del commit:**

- **La búsqueda puede excluir una coincidencia exacta.** En [point-search.ts:64](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/lib/point-search.ts:64), `q.startsWith(w)` convierte «Restaurant La Florencia» en una búsqueda de *todos* los restaurantes. Reproduciendo la lógica con el fixture, devuelve siete; los primeros cinco excluyen La Florencia. Limitar los alias a consultas de tipo y priorizar coincidencias de nombre.

- **«Soy yo» puede dejar el celular vacío y oculto.** En [trip-details-sheet.tsx:368](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/components/trip-details-sheet.tsx:368), si el contacto llegó completo desde «Usar mi dirección», tocar «Soy yo» activo borra los datos sin salir del modo compacto. Queda una línea vacía; «Completar: celular…» tampoco encuentra el campo para enfocarlo. Al borrar, abrir la edición, o hacer que el atajo solo complete datos.

- **El seed no queda reproducible.** [seed-map-landmarks.ts:35](/Users/jesuscastillo/Developer/tindivo-v2/apps/api/scripts/seed-map-landmarks.ts:35) depende del JSON, ignorado por [.gitignore:75](/Users/jesuscastillo/Developer/tindivo-v2/.gitignore:75). Un checkout nuevo fallará por archivo ausente. Incluir explícitamente este fixture público.

**Después, mejoraría estas tres cosas:**

1. Separar boticas de establecimientos públicos: captura 3 ofrece Essalud y la Posta al buscar «botica». Es una limitación reconocida, pero confunde.
2. Mostrar etiquetas permanentes y referencias completas al revisar: en captura 6 la dirección termina en «frente al p…».
3. Probar búsqueda y Detalles con teclado abierto en Android pequeño: las capturas no demuestran que todos los resultados y campos sigan accesibles.

`git diff --check` pasó. Las 274 unitarias y 16 e2e son resultados reportados; no los volví a ejecutar.