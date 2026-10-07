La mayor fricción está en **Detalles**: el usuario llega con la ruta definida, pero los campos pendientes quedan fuera de vista. El fallo de código más urgente permite cambiar de lugar conservando el celular del contacto anterior.

Revisé `d585c91`, el diseño acordado y las 12 capturas. Verifiqué casos puntuales ejecutando funciones en memoria. No modifiqué archivos, consulté bases ni ejecuté los e2e.

**1. Hallazgos de UX/UI, por impacto**

1. **Detalles exige demasiado desplazamiento — 08, 09, 10.** Las dos tarjetas de contactos ocupan casi toda la hoja; «Qué llevamos» y la casilla obligatoria quedan abajo. Tras «Repetir», el aviso pide marcar una casilla que no se ve. **Arreglo:** mostrar los contactos completos como resúmenes editables, plegar el nombre opcional y mantener los pendientes visibles. Cambiar el botón gris por «Completar: qué llevamos» mientras falten datos, haciendo explícita su acción actual de llevar al campo. **M.**

2. **«Mi dirección» todavía exige trabajo evitable — 06, 07, 08.** Está escondida detrás de la lupa y solo completa coordenadas y referencia: después hay que tocar «Soy yo». **Arreglo:** ofrecer «Mi dirección» directamente en B y, al elegirla expresamente, completar nombre y celular del perfil, editables. No deducir el contacto por estar cerca del GPS. **S/M.**

3. **La búsqueda no distingue ausencia de datos de carga o error — 03, 04; confirmado en código.** Con 4G irregular puede indicar que no encuentra un lugar antes de tener los datos. El estado sin resultados solo explica cómo volver. **Arreglo:** distinguir «Cargando», «No pudimos cargar» y «Sin coincidencias»; agregar «Marcar en el mapa» y reintento. **M.**

4. **«Repetir» desplaza la tarea principal y cambia demasiado el mapa — 01, 02, 05 frente a 06.** El mapa pasa aproximadamente de 593 a 495 px de alto. Desplegar anteriores sigue agrandando un panel sin límite ni scroll propio. **Arreglo:** conservar una tarjeta compacta; mostrar anteriores en una lista con altura limitada y posibilidad de cerrar. Quitar la segunda flecha de volver en B. **S.**

5. **La búsqueda promete encontrar casas que no conoce — 03, 04, 07.** «Una casa» sugiere búsqueda general, pero solo encuentra lugares cargados y puntos recientes. Dos «Botica Central» tampoco explican qué contacto se recuperará. **Arreglo:** «Busca un lugar o contacto anterior»; distinguir «Tus lugares» de «Lugares del pueblo» y mostrar una referencia útil cuando se repita el nombre. **S.**

6. **Accesibilidad desigual — 01–11.** Los botones principales tienen tamaño suficiente, pero «Ver anteriores» carece de altura táctil definida; los estados usan 11 px. El blanco sobre el degradado naranja da aproximadamente **2,26–2,80:1**, insuficiente incluso para texto grande según [WCAG](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). **Arreglo:** oscurecer el botón, usar estados de 13–14 px y áreas táctiles de 44–48 px para acciones secundarias. Corregir el foco de búsqueda descrito abajo. **S/M.**

7. **El registro pierde el contexto de Entregas — 00.** «Crea tu cuenta» domina y «Empiezas a pedir al instante» omite el celular que falta completar. **Arreglo:** explicar «Crea tu cuenta para pedir una entrega» y anticipar brevemente el siguiente requisito. Mantener el login al principio. **S.**

**2. Hallazgos de código**

Rutas bajo `apps/customer/features/courier/`:

- **Contacto anterior asociado al lugar nuevo.** [courier-map-host.tsx:334](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/components/map/courier-map-host.tsx:334) mezcla campos parciales. Los lugares y «Mi dirección» no traen contacto: elegir Botica San José después de Mamá conserva su nombre y celular. Reproducción en memoria: `contactName="Mamá"`, `label="Botica San José"`. Definir explícitamente qué contacto se reemplaza o limpia.

- **Datos privados anteriores durante una nueva apertura.** [courier-map-host.tsx:93](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/components/map/courier-map-host.tsx:93) conserva `shortcuts` mientras carga. Si cambia la cuenta sin recargar, puede mostrar temporalmente rutas y teléfonos anteriores. Vincular los datos al usuario y limpiar al cerrar sesión.

- **Historial leído dos veces.** [shortcuts-data.ts:54](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/lib/shortcuts-data.ts:54) y [use-courier-request.ts:48](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/hooks/use-courier-request.ts:48) consultan los últimos 20 pedidos por separado. Compartir una lectura para rutas, puntos y contactos. Actualmente los errores se convierten en listas vacías.

- **GPS fresco innecesario y carrera pendiente.** [courier-map-host.tsx:224](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/components/map/courier-map-host.tsx:224) solicita nuevamente alta precisión en B; el helper no acepta posiciones cacheadas. Reutilizar el fix reciente de A. Además, el GPS manual de línea 283 no comprueba `gpsRun` al regresar: podría sobreescribir una selección posterior de la lupa.

- **Entrada dependiente del montaje inicial.** [courier-host.tsx:22](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/components/courier-host.tsx:22) procesa parámetros una sola vez, aunque vive en el layout persistente. Una navegación cliente posterior a `/entregas` puede no abrir el flujo. Observar los parámetros y consumir cada intención una vez.

- **Foco de búsqueda incompleto.** [point-search-sheet.tsx:48](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/components/map/point-search-sheet.tsx:48) declara otro modal, pero el ciclo de foco sigue incluyendo controles del pin ocultos detrás. Al cerrar tampoco devuelve foco a la lupa. Limitar el modal activo y restaurar el foco.

- **Deduplicación por cuadrícula, no distancia.** [routes.ts:51](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/lib/routes.ts:51): `toFixed(4)` puede separar puntos prácticamente iguales o fusionar puertas distintas. Reproduje dos rutas separadas unos 2 cm ofrecidas como diferentes. Comparar distancia y referencia/contacto.

**3. Los cinco cambios que haría ya**

1. Corregir el reemplazo de contactos al elegir otro lugar.
2. Poner «Mi dirección» en B y completar el perfil al seleccionarla.
3. Compactar Detalles y mostrar los pendientes inmediatamente.
4. Unificar la carga de historial, separada por usuario, con errores visibles.
5. Corregir contraste, foco y áreas táctiles secundarias.

**4. Lo que no cambiaría**

La entrada única; A → B → Detalles; login previo; búsqueda local sin tildes; confirmación del pin después de elegir; GPS inicial en ambos puntos; repetir únicamente entregas realizadas y volver a exigir «listo y pagado». Tampoco añadiría selección persona/negocio ni acceso a la agenda.