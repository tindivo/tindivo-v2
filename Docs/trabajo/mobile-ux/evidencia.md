# Carpeta de evidencia

Registra la ruta de la app, código web, API de pedidos, tema y tokens, fixtures y documentación de UX. Añade el brief de Store como referencia visual y el reporte de Android como pista para localizar el checkout. La revisión del código y del build actual determina su vigencia.

## Capturas que tomaría primero

Usa una instalación limpia o cierra sesión. Registra plataforma, teléfono o emulador, versión del build y fecha. Captura con datos ficticios o enmascarados. Un video de 30 a 60 segundos ayuda a ver retrocesos, teclado y saltos de pantalla.

| Archivo en `capturas/actual/` | Qué debe verse |
| --- | --- |
| `01-inicio-invitado.png` | Primera pantalla tras abrir la app |
| `02-carta.png` | Restaurante, categorías y lista de platos |
| `03-plato.png` | Opciones, cantidad y acción de agregar |
| `04-bolsa.png` | Productos, subtotal, envío si está disponible y siguiente acción |
| `05-identificacion.png` | Pantalla y acción exacta que disparan el acceso o la verificación |
| `06-direccion-pago.png` | Datos solicitados, edición y retorno a la bolsa |
| `07-revisar.png` | Resumen y total final antes de confirmar |
| `08-confirmacion.png` | Resultado del pedido y cómo seguirlo |

Si un paso falta, anota «no disponible en este build» en este archivo. Si puedes, agrega un error recuperable y una captura con texto ampliado.

En `capturas/referencias/`, guarda de dos a tres ejemplos de flujos de apps reales. Usa una nota por captura con fuente, pantalla y patrón deseado. Ejemplo: «Pedido: me interesa que el envío aparezca junto al subtotal. Mantener la identidad y la terminología de Tindivo».

En `capturas/propuestas/`, guarda únicamente bocetos que quieras comparar. Nombra cada imagen con plataforma, flujo y estado.

## Datos agregados

Agrega un CSV o una nota con ventana, plataforma, versión y población. Si tienes embudo, registra sesiones con visita a carta, agregado, apertura de bolsa, inicio y fin de identificación, confirmación y creación de pedido. Para cada porcentaje indica su denominador. Mientras falte instrumentación móvil, usa pruebas observadas del recorrido y registra qué eventos hacen falta. Puedes incluir motivos de abandono o consultas frecuentes anonimizadas. Evita credenciales, nombres, teléfonos y direcciones reales.
