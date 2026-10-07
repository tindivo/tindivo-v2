1. **Buscador: priorizar negocios, mantener las referencias públicas y empezar sin chips de categoría.**

   En el pueblo, alguien puede conocer «Inkafarma», pero también ubicarse por «la losa» o «la entrada de la fábrica». Quitar estos lugares dificultaría encontrar una casa cercana. Buscar una referencia tampoco significa que ahí exista un negocio que atiende entregas.

   **Cómo quedaría:** conservar «Buscar un lugar». Al tocar, mostrar solo sus lugares recientes; al escribir, hasta cinco coincidencias, separando «Tus lugares», «Negocios» y «Referencias del pueblo». Buscar por nombre y tipo: «botica» debe encontrar las boticas aunque su nombre no contenga esa palabra. Incluir restaurantes, conforme a lo decidido.

   Al elegir, llevar el pin ahí, llenar la referencia y permitir ajustar la puerta. **No completar un celular que el lugar no tiene.** En el mapa conservar negocios y referencias útiles, mostrando más nombres al acercarse, sin llenar la vista de chapas.

   Con los datos actuales, «salud» incluye boticas y establecimientos públicos; «otro» mezcla negocios y referencias. Hay que distinguirlos antes de filtrar. Los chips agregarían decisiones y ocuparían espacio junto al teclado; primero probaría la búsqueda directa.

2. **«Ver anteriores»: abrir una hoja modal desde abajo, sin agrandar el panel del mapa.**

   Desplegar la lista dentro del panel encoge el mapa y mueve el contexto donde la persona estaba trabajando. Una hoja temporal deja más claro que está eligiendo una entrega anterior.

   **Cómo quedaría:** mantener el acceso en la esquina derecha. Al tocar, abrir «Entregas anteriores», con hasta tres entregas completadas: origen, destino, qué se llevó y fecha. Cada fila debe decir «Usar estos datos», para explicar la consecuencia.

   Al elegir, cerrar la hoja y abrir Detalles con los datos cargados para revisar; «Listo y pagado» queda desmarcado. Cerrar o pulsar Atrás en Android devuelve al mismo mapa, sin cambiar nada. Mientras esté abierta, el mapa de atrás no responde a toques.

3. **Paso 2: quitar la tarjeta grande de «Mi dirección» y convertirla en un atajo discreto.**

   Hoy el panel presenta título, origen, instrucción, dirección guardada y campo vacío. Son demasiados mensajes antes de la acción principal. Además, la tarjeta azul puede parecer una dirección ya seleccionada, aunque todavía hay que tocarla.

   **Cómo quedaría:** fila superior «Ubicación 2 de 2», con «Usar mi dirección» a la derecha, solo si existe. Debajo, «¿Dónde entregamos?» y una línea secundaria «Recojo: mi casa». Luego, un único campo con etiqueta breve «Referencia para llegar» y ejemplo «Casa celeste, segundo piso».

   Tocar «Usar mi dirección» mueve el pin, llena ese campo y coloca al titular como contacto; todavía requiere confirmar. No agrega otra tarjeta. Mantendría la etiqueta del campo cuando ya tiene texto: ayuda a entender qué se está editando. [Guía de etiquetas de W3C](https://www.w3.org/WAI/tutorials/forms/labels/).

   **Error en captura 7:** «Mueve el mapa…» parece una alerta por su color y tipografía. Debe ser una instrucción tranquila de al menos 14 px, mostrada una sola vez. «Paso 2 de 2» también sugiere que todo termina ahí, aunque falta Detalles.

4. **Paneles: unificar el ancho según la pantalla y usar retroceso en Detalles.**

   La consistencia debe mantenerse en celular y escritorio. Estirar un formulario a 2 000 px separa demasiado el contenido de sus acciones.

   **Cómo quedaría:** los tres paneles ocupan el 100 % del ancho en celular; en pantallas grandes, comparten un máximo cercano a 640 px y quedan centrados. El mapa conserva todo el lienzo. Mismos márgenes y posición del botón principal.

   En Detalles, cambiar la X por «← Volver», que regresa al punto B conservando todo lo escrito. «Cambiar ubicación» permite corregir A o B y vuelve directamente a Detalles. Atrás en Android sigue la misma lógica.

   **Errores en capturas 8–9:** el pie corta visualmente el contenido; debe poder desplazarse hasta mostrar completo el último campo, también con teclado. El botón gris «Completar…» sí funciona según el código, pero parece deshabilitado: darle apariencia de acción secundaria y reservar el gris apagado para acciones realmente inactivas.

5. **Contactos: quitar las filas de sugerencias y conservar únicamente «Usar mi celular» junto al campo.**

   «Soy yo» ahorra escribir nueve dígitos, pero mezclado con nombres y negocios pierde claridad. Tres «Botica Central» iguales obligan a adivinar cuál contiene el número correcto.

   **Cómo quedaría:** en cada sección, mostrar «Celular de quien entrega/recibe» y el enlace «Usar mi celular». Al tocar, completar celular y nombre del perfil; permitir corregirlos sin que un segundo toque borre los datos. El nombre sigue siendo opcional. Los contactos traídos por una entrega anterior aparecen resumidos con opción «Editar contacto».

   **Errores en captura 9:** los contactos repetidos son indistinguibles aunque puedan tener números diferentes. «Quien recibe» es un nombre de respaldo del sistema, no un contacto reconocible, y debe excluirse de las sugerencias. Además, las etiquetas de los campos desaparecen al escribir: celular obligatorio y nombre opcional deben seguir identificados.