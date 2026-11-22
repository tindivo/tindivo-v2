---
name: auditar-ui-mobile
description: Audita la UX y consistencia visual de la app móvil de Tindivo con evidencia del repo, capturas y datos disponibles.
disable-model-invocation: true
---

# Auditoría de UI y UX móvil

Alcance solicitado: $ARGUMENTS

1. Lee las instrucciones vigentes del repo y `Docs/trabajo/mobile-ux/evidencia.md`, `reglas.md` y `revisores.md`. Si cambió la ubicación del kit, resuelve las rutas indicadas por el usuario. Verifica plataforma, stack, build, rutas de navegación, tema, componentes, reglas del negocio y fuentes disponibles. Empieza con lectura del código y, cuando haya entorno de prueba y autorización, ejecuta el flujo con datos de prueba. Mantén esta auditoría en modo de solo lectura.
2. Reconstruye el recorrido de una persona sin sesión. Para cada paso documenta pantalla y estado, acción visible, datos pedidos, condición que los exige y cómo volver o recuperarse. Comprueba si entrar a la carta, armar la bolsa, conocer el costo de entrega y conservar la bolsa dependen de la sesión. Busca en la API el primer paso que requiere identidad. Revisa cobertura, edición de dirección o pago, cambio de sesión, red intermitente, error tras confirmar y prevención de pedidos duplicados. Distingue requisitos actuales de propuestas.
3. Audita pantallas y componentes. Revisa jerarquía y orden del contenido, texto, iconos, fotografía, espaciado, consistencia de acciones y estados, accesibilidad, teclado, barras del sistema y navegación hacia atrás. Localiza valores de marca en tokens, código o assets. Convierte decisiones repetidas en reglas comprobables y marca como propuesta cualquier regla nueva.
4. Usa datos agregados fechados si existen. Identifica fuente, población, ventana y denominador. Distingue métricas de la web, pedidos manuales y sesiones de la app. Cada hallazgo debe marcarse como observado en ejecución, respaldado por código o dato, o hipótesis pendiente. Si faltan fuentes, avanza e indica qué evidencia permitiría resolver cada duda.
5. Entrega un mapa del recorrido actual, el recorrido propuesto, hasta cinco hallazgos prioritarios con evidencia y criterio de aceptación, y una propuesta de reglas reutilizables. Para el piloto, muestra una dirección visual concreta por pantalla con orden de contenido, acción primaria y estados. Si se solicita mockup o implementación, usa datos ficticios y la UI existente como punto de partida. Identifica cualquier parte cuya apariencia aún dependa de ejecutar el build.
6. Para cada decisión abierta, aporta alternativas viables, dependencias y cómo probarla. Incluye el registro de decisión definido en `revisores.md`. Prioriza la facilidad para pedir, luego la consistencia y el acabado visual.
