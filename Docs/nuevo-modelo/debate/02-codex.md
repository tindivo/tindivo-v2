## Datos (qué medí y qué dicen)

**No tengo acceso al MCP de Supabase:** no consulté ninguna base, ni local ni `tindivo-prod`. No pude verificar entregados por día/hora, duraciones, solapamientos ni filas reales de courier. Revisé documentos y código; no modifiqué archivos.

Los datos disponibles cubren **8 de agosto–16 de septiembre**, no las ocho semanas solicitadas:

- L–V promedia **13.3 pedidos diarios**. No sabemos cuántos consumieron flota de Tindivo, cuánto manejó Jesús ni cómo se distribuyeron.
- **13 × 20 minutos = 260 minutos**: quedarían 40 de un turno de 300, **solo bajo esos supuestos**. No demuestra capacidad disponible.
- Hay una inconsistencia económica: [DECISIONS.md](/Users/jesuscastillo/Developer/tindivo-v2/DECISIONS.md:97) indica **S/1 de comisión**; la propuesta, S/1.50. Sin configuración viva, el arbitraje exacto queda pendiente.
- La semana de S/428.50 deja S/178.50 después de S/210 y S/40. Pero, aplicando la dotación acordada —uno L–V, dos sábado/domingo— a S/30 por turno, personal sería **S/270** y quedarían **S/118.50**, antes de mantenimiento, sistemas y trabajo de Jesús. Hay que reconciliar turnos efectivamente pagados.

Lo construido usa **`courier_orders`**, no `courier_requests`: solicitud, seguimiento y marcas de tiempo existen. La `0232` deja cobro operativo y rendiciones para otra fase. Su comprobación de motorizado “disponible” **no consulta su carga de pedidos**.

## Dónde coincido con Claude

- Jesús manejando toda la noche **no es capacidad ociosa**.
- Primero terminar Entregas; compras después de probar la operación.
- Mantener **S/3**, sin promociones iniciales, respeta lo acordado y permite comprobar disposición real de pago.
- Captar pocos negocios que originen entregas es más sostenible que educar individualmente a decenas de consumidores.
- Descartaría grupos, rankings, puntos, referidos y catálogo detallado: demasiado mantenimiento para una persona.

## Dónde discrepo de Claude (y de la propuesta original)

**1. Los 40 minutos tampoco están demostrados.** Claude corrige una exageración con otra estimación. Sumar tiempos de pedidos simultáneos duplica ocupación; medir solo desde recojo omite desplazamiento y espera. Necesitamos intervalos por motorizado y separar a Jesús, flota propia del restaurante y recojos en mostrador.

**2. “Cola vacía” no garantiza cero perjuicio.** Una moto puede salir y recibir comida cinco minutos después. Recomiendo franjas comprobadas, viajes cortos y un límite inicial de una entrega simultánea; conservar “cero demoras atribuibles” como regla de suspensión, no promesa matemática.

**3. S/ por minuto debe ser contribución, no ingreso.** Hay que descontar combustible, desgaste, fallidos y coordinación. Un encargo de S/3.50 durante 40 minutos factura apenas **S/5.25 por hora**, antes de esos costos. No esperaría al lanzamiento para advertir que ese precio puede ser insuficiente.

**4. El fondo propio no equivale automáticamente a retener fondos ajenos.** El problema concreto es financiar compras y absorber rechazos. Una pérdida irrecuperable de S/30 consume el ingreso bruto de **nueve encargos de S/3.50**. Lo descartaría inicialmente por economía y carga operativa.

**5. La compra coordinada no elimina trabajo: lo redistribuye.** Si Jesús confirma stock, precio y pago, creó una central de atención. Solo probaría tiendas que lo resuelvan directamente con el cliente. Además, necesita teléfonos visibles: ocultarlos contradice ese modelo y lo ya construido.

**6. Rechazo el umbral de 40 entregas semanales como requisito inicial.** Son ocho por día L–V: a 20 minutos, **160 minutos adicionales diarios**. Sumados a 260 de comida, requieren siete horas. Ese objetivo presupone capacidad que todavía no existe.

## Respuestas a las 10 preguntas del §12

1. **Pago:** cliente paga directamente a la tienda. Fondo implica riesgo de compra; prepago a Tindivo implica conciliaciones y devoluciones. La tienda confirma recepción en sus movimientos, no mediante captura solamente, como recomienda [Yape](https://www.yape.com.pe/preguntas-frecuentes/enviar-y-recibir-yapeos/como-identifico-un-yapeo-falso).

2. **Precio:** S/3 inicial. Excluir comida preparada del piloto de Entregas; los partners siguen usando su flujo actual. No ofrecerles un atajo tarifario.

3. **Inicio:** dos entradas ahora: **Comida / Tindivo Entregas**. “Comprar” aparece cuando exista un servicio probado.

4. **Lanzamiento:** escalonado. Propongo piloto L–V, reconociendo que cambia el horario aprobado de todos los días.

5. **“¿Quién lo tiene?”:** no. Dos o tres tiendas, contacto directo y una sola tienda por solicitud. Sin respuesta, no se despacha.

6. **Gamificación:** ninguna. Automatizar completados, cancelaciones, repetición y tiempos registrados. Las respuestas por WhatsApp no se miden automáticamente con el sistema actual.

7. **Autocorrección:** pregunta explícita: “¿Ya está coordinado y pagado?”. Sin palabras clave ni reclasificación durante el viaje.

8. **Implementación:** panel del motorizado → cobro y rendición → control de capacidad → prueba completa. Recortar compras, directorio extenso y nuevo inicio.

9. **Programados/agrupación:** comunicar ventanas de atención; no construir agenda ni optimizador todavía. “Listo en…” no equivale a una reserva garantizada.

10. **Qué falta:** devolución cuando nadie recibe, responsabilidad por daño y disponibilidad real antes de que el cliente pague un producto que necesita recibir.

## Lo que ninguno de los dos está viendo

**El negocio como solicitante choca con el límite de un activo por teléfono.** Hoy necesita cuenta y queda bloqueado para una segunda solicitud mientras siga activa la primera. “Pedir en 20 segundos sin cuenta” es producto nuevo, no algo disponible.

**Cancelar después del recojo no resuelve quién custodia ni devuelve el paquete.** Definiría antes del piloto: contacto alternativo, retorno al origen y quién absorbe ese viaje.

**La ganancia posible tiene un techo pequeño:** dos entregas extra por noche a S/3 suman **S/30 semanales brutos**; cuatro, S/60. Sirve como ingreso adicional, pero difícilmente justifica que Jesús atienda chats permanentemente. La mensualidad por software tampoco debería depender de tener app móvil: depende del valor demostrado al restaurante.

## Mi plan de acción propuesto

1. **Días 1–2: corregir la base económica.** Reconciliar comisiones, turnos y cobros. Obtener 56 días completos por hora Lima, incluyendo días sin pedidos; duraciones mediana/p90 y solapamiento por motorizado, separando a Jesús. Decidir qué franjas realmente admiten viajes.

2. **Semana 1: cerrar Entregas operativamente.** Cobro, rendición, capacidad y retorno. Probar el ciclo completo. Reclutar **tres negocios**, no quince; pedidos registrados en web, WhatsApp solo para coordinación.

3. **Semanas 2–3: piloto a S/3.** Abrir cupos según minutos disponibles. Medir solicitudes rechazadas por capacidad, completados, fallidos, contribución, repetición y minutos de Jesús. Así distinguimos falta de demanda de falta de oferta.

4. **Día 14 del piloto: decidir.** Continuar si aporta contribución positiva, cuadra el dinero y no demora restaurantes. Propongo límite de **15 minutos diarios de Jesús** para coordinación/cierre y ninguna dependencia habitual de que maneje. Poca muestra exige extender la prueba, no bajar automáticamente el precio.

5. **Después: diez compras coordinadas con dos tiendas.** Exigir como criterio inicial ocho completadas sin intervención de Jesús. Si fallan, mantener solo Entregas. Pasar a móvil cuando dos semanas consecutivas demuestren una operación sostenible; la fecha del lanzamiento no debe decidir el modelo.