# Reglas móviles propuestas

Estas reglas son un punto de partida para revisar con el build y el sistema web.

| Tema | Regla para el piloto | Cómo verificar |
| --- | --- | --- |
| Marca | Extraer naranja oficial y neutrales de una fuente vigente. Nombrar tokens por función. | El código del tema indica la fuente del color y cada estado usa el rol previsto. |
| Jerarquía | Una acción principal por paso. En bolsa, productos y cantidades primero, costos juntos y acción visible. | La persona puede indicar costo y siguiente acción con la pantalla abierta. |
| Iconos y texto | Reusar el set vigente y etiquetar acciones que puedan confundirse. | Editar, cerrar y retroceder tienen nombres accesibles y comportamiento previsible. |
| Fotos | Priorizar fotos reales de los platos donde ayudan a elegir. Definir proporción por componente y fallback. | El catálogo conserva alineación y sentido con fotos ausentes. |
| Lectura y tacto | Validar texto ampliado y contraste. Diseñar áreas táctiles de 48 × 48 dp en Android y 44 × 44 pt en iOS. | Probar en pantalla pequeña, con lector de pantalla y tamaño de texto aumentado. |
| Estado y navegación | Restaurar bolsa, cantidades y opciones tras identificarse, volver atrás o resolver un error. | Completar el recorrido con sesión nueva, cancelar el acceso y repetir. |
| Barras del sistema | Ninguna acción principal queda bajo la barra de tareas, la navegación de 3 botones ni la de gestos. Toda barra inferior fija deja el espacio de la barra de navegación (`navigationBarsPadding()` o equivalente). | Correr los flujos de Maestro en la tablet Samsung con la barra de tareas visible: el toque en la acción principal debe llevar a la pantalla siguiente. Antes: `capturas/actual/04-bolsa-ANTES-barra-tapa-continuar.png`. |
| Costo | Mostrar total y cargos antes de confirmar. Explicar qué falta para calcular el envío cuando corresponda. | Probar ubicación disponible, desconocida y fuera de cobertura. |
| Confirmación | Dar respuesta clara al accionar y conservar el estado ante error. Verificar el contrato de reintento de la API. | Simular respuesta lenta y pérdida de red. Comprobar si hay pedido y cómo se recupera. |

Para cada componente aprobado documenta sus variantes, estados e interacción por plataforma. Empieza por botón principal, tarjeta de restaurante o plato, fila de bolsa y resumen de costos. Usa los patrones de navegación y accesibilidad de Android e iOS y adapta sus componentes a la marca.
