Jesús, **mantendría mapa primero y pondría los atajos dentro de ese flujo**. Repetir una entrega merece prioridad; una lista de referencias del pueblo no debería convertirse en la puerta obligatoria para pedir.

Tomo los datos de producción que compartiste como base; revisé el código sin modificar archivos. Con tres entregas todavía no podemos demostrar qué uso predomina ni qué autocompletado generará hábito.

1. **Qué conservaría y qué cuestionaría de `place-pick`**

   Conservaría “Repetir una entrega” y la búsqueda sin distinguir tildes. Cuestionaría la pantalla completa: para mandar algo desde una casa añade **“Marcar en el mapa” antes de hacer exactamente lo que ya funcionaba**. Además, anuncia “Paso 1 de 2” y después aparecen A, B y detalles: el progreso resulta confuso.

   Las 60 referencias ayudan a ubicarse, pero no acreditan que haya alguien atendiendo un recojo. Un colegio, una cancha o una iglesia pueden orientar al motorizado; no necesariamente son el origen de una entrega.

   Hay una diferencia concreta: [`pickPlace`](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/lib/store.ts) completa coordenadas, referencia y nombre de quien entrega, pero deja el celular vacío. El cliente igual tendrá que conseguirlo. **Ubicar un lugar no equivale a completar un recojo.** Incluso el pin cargado podría señalar el centro del establecimiento y no su puerta.

2. **El flujo que propondría**

   **Entrada única.** La tarjeta del inicio y `/entregas` abren el mismo flujo. Mantendría por ahora el login al inicio, como resuelve `open-flow.ts`; volver de Google debe recuperar la intención de entrar y cualquier negocio precargado por enlace.

   **Mapa A: “¿Dónde recogemos?”.** Arriba, título y precio vigente. En la hoja inferior, una fila compacta “Repetir una entrega”, solo cuando exista historial elegible: mostrar la última y “Ver anteriores”, hasta tres. Tocarla lleva directamente a detalles con ambos puntos y contactos completos.

   Para una entrega nueva, el mapa ya está disponible. Encima de la referencia pondría **“Buscar un lugar”**: al tocarlo aparecen direcciones guardadas, puntos recientes y resultados de referencias del pueblo. Sin lista de 60 ni categorías abiertas por defecto. Elegir una referencia centra el mapa; permite ajustar la puerta. Abajo: referencia y “Confirmar recojo”. GPS como botón explícito.

   **Mapa B: “¿Dónde entregamos?”.** Misma estructura. Primero sugerir puntos recientes y “Mi dirección”, desde `customer_addresses`. Elegirlos completa coordenadas y referencia. No asumir que siempre se entrega en la casa del solicitante. “Confirmar entrega” abre detalles.

   **Detalles, una sola pantalla.** Arriba, tarjetas A/B con referencia, contacto y “Cambiar”. En cada contacto: “Soy yo” y recientes; celular obligatorio y nombre opcional. Después: qué llevamos, quién paga e indicaciones opcionales plegadas. Al final, confirmación de que está listo y, si corresponde, pagado; condiciones del paquete. Botón fijo “Pedir entrega · S/ …”. Repetir nunca marca estas confirmaciones automáticamente.

   **Seguimiento.** Estado real, ruta resumida, contacto del motorizado cuando esté asignado y cancelación cuando corresponda. Si falla el envío, conservar todo lo escrito. Evitar pedir nuevamente información del mismo proceso también coincide con el criterio de [entrada redundante de W3C](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html).

3. **“Recoger de un negocio”: prepararlo ahora, mostrarlo cuando tenga datos útiles**

   Sí vale la pena como atajo y canal de WhatsApp, pero **no lanzaría hoy una sección vacía ni la llenaría con `map_landmarks`**.

   Empezaría con tres comercios comprometidos: botica, bodega y tienda de ropa o vendedora local. Jesús o un operador los carga después de confirmar con el responsable: nombre, categoría, puerta exacta, referencia, contacto de recojo, horario, consentimiento para publicar el contacto comercial y habilitación para Entregas.

   Antes de cargar teléfonos, cerrar el acceso anónimo conocido y definir cuáles son públicos. No copiar teléfonos privados de los aliados.

   Con esos datos, “Recoger de un negocio” aparece como opción secundaria en A. Un enlace compartido por WhatsApp precarga A y su contacto, y abre B dentro del mismo flujo.

   Mientras tanto, cualquier recojo permitido se pide marcando A y completando el contacto. **La comida preparada queda fuera**, también si se ingresó manualmente. Mostrar esa regla antes de pedir; retirar el chip “Comida” que hoy aparece en [`trip-details`](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/components/trip-details-sheet.tsx). Los restaurantes aliados llevan a su canal habitual; la llamada operativa debe detectar y redirigir los casos que intenten pasar por Entregas.

4. **Autocompletados por velocidad y costo**

   | Atajo | Prioridad y alcance |
   |---|---|
   | **Soy yo** | Primero: nombre y celular del perfil, con un toque; no cambia ubicación. |
   | **Repetir ruta** | Mayor ahorro al repetir: A/B, referencias, contactos, descripción y pagador. |
   | **Puntos recientes / Mi dirección** | Alto valor inmediato: ahorran mover el mapa y escribir referencias. |
   | **Contactos recientes** | Alto valor: nombre y celular; sugerencias junto al campo correspondiente. |
   | **Qué llevamos** | Copiar al repetir; para nuevos pedidos bastan pocos chips permitidos. |
   | **GPS** | Útil si estás en el punto; opcional, sin bloquear ni asumir tu rol. |

   El historial de rutas actual no filtra por estado. Ofrecería primero entregas completadas y permitidas; **no promovería las dos entregas de comida anteriores**.

5. **Lo que no haría**

   No agregaría un selector obligatorio “persona o negocio”, diez categorías de lugares, acceso a toda la agenda, descripciones sugeridas sin contexto ni envío automático al repetir. Tampoco asumiría que GPS significa “quien entrega”.

   Antes de ampliar el directorio, probaría estos tres recorridos con cinco personas en Android modestos: entrega nueva, repetición y enlace de negocio. Mediría tiempo, dudas y si completan sin ayuda.