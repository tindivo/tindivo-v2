## Dónde los datos me hacen cambiar

**Sí firmaría ahora un piloto orientado a negocios que originan entregas.** El 89% manual cambia la prioridad: aprovechar un comportamiento existente tiene más sentido que lanzar “Comprar” y enseñar otro flujo al consumidor.

También retiro mi objeción a **40 entregas semanales como posibilidad física**. La unión de intervalos reportada apunta a bastante más espacio que los 40 minutos inicialmente supuestos. Mantengo la objeción a usar 40 como requisito para considerar exitoso el piloto.

Y corrijo mi énfasis anterior: **S/120 semanales brutos adicionales sí serían relevantes** para esta operación. Falta demostrar cuánto queda y cuánto trabajo exigen.

Estas conclusiones parten de [los resultados reportados por Claude](< /Users/jesuscastillo/Developer/tindivo-v2/Docs/nuevo-modelo/debate/03-claude.md>); no ejecuté consultas propias contra producción.

## Dónde los datos todavía no alcanzan

- **Mediana no es promedio.** Una mediana de 11.5 minutos no demuestra por sí sola que el supuesto promedio de 20 esté inflado. Para capacidad prefiero la unión de intervalos, bien calculada.
- **121 minutos ocupados no equivalen automáticamente a 179 vendibles.** Hay que incluir intentos cancelados, retornos y huecos entre viajes. Importa cuántos huecos permiten completar una entrega, no solo cuánto suman.
- **¿Qué significa “salida”?** Si son bloques de intervalos solapados, no necesariamente son recorridos compartidos. Los porcentajes de simultaneidad tampoco indican si ponderan pedidos, tiempo o eventos.
- **Falta separar a Jesús.** Una mediana por motorizado puede bajar si mezcla al titular con alguien que apoya una hora. Necesitamos ocupación del turno contratado.
- **442 clientes no son 442 hogares.** Puede haber varios teléfonos por hogar, visitantes y registros duplicados. Retiraría el 35–40% de penetración y la conclusión de abandonar captación.
- **830 versus 835 entregados:** reconciliar filtros, ventanas, nulos y modalidades. Para identificar valles, aclarar si la hora corresponde a creación, asignación o entrega.

La medición mejora mucho el debate, pero **“el límite ya es demanda, no capacidad” sigue siendo una hipótesis**.

## Dónde sigo discrepando

**La desintermediación no desaparece.** El teléfono visible facilita comprar; no obliga a la botica a elegir Tindivo. Puede mandar el viaje a Zorritos. Hay que ganar por disponibilidad, cumplimiento y facilidad de despacho.

**“Uno en pico, dos fuera” necesita unidad:** propongo límite por motorizado y considerar también comida asignada y próxima a estar lista. Dos entregas activas en direcciones opuestas pueden perjudicar más que tres paquetes juntos.

**El prepago cambia el canal.** El éxito del pedido manual de restaurantes no demuestra que clientes de bodegas acepten pagar el artículo antes. Esa conversión debe medirse.

## Respuestas a las preguntas 1–4

**1. ¿Seguir auditando o construir?**

Ambas cosas en paralelo. Reduciría la revisión a unas horas: consultas reproducibles, turnos realmente pagados y separación del apoyo de Jesús. No frenaría el diseño; sí frenaría prometer ocho entregas adicionales diarias.

**2. ¿Qué mínimo necesita el negocio?**

Reutilizaría del [flujo manual](</Users/jesuscastillo/Developer/tindivo-v2/apps/negocios/features/nuevo/components/nuevo-form.tsx>) teléfono, búsqueda de dirección, confirmación del destinatario y patrón de envío. Recortaría cocina, monto del producto, pagos mixtos, vuelto y bandas.

Formulario: origen precargado; destinatario, celular y dirección; descripción breve; confirmación de “pagado y listo”; tarifa y solicitud. Después, lista de entregas, estado y cancelación permitida.

Pero **no basta agregar ese formulario**:

- El panel actual consulta `businesses`; `directory_businesses` no tiene vínculo de acceso para su operador.
- El endpoint courier exige rol `customer`; necesita entrada autorizada para negocios y permisos sobre sus entregas.
- Hay que registrar negocio originador y usuario operador, con límite comercial propio; no quitar globalmente el límite por teléfono.
- El manual permite referencia sin GPS; courier exige coordenadas. Reutilizar ubicaciones confirmadas y pedir pin cuando falten: no inventarlas.

Mantendría pago en destino inicialmente. Claude dice que pagar en origen ya está decidido, pero `04` reserva esa elección al envío entre personas. Extenderla al negocio sería otra decisión.

**3. ¿Aguanta S/3? ¿Descuento frecuente?**

No lo sabemos: es **50% más que S/2**. Probaría precio completo y registraría oportunidades perdidas por precio, demora o prepago.

Diez entregas mensuales son apenas 2.5 semanales: no justifican descuento automáticamente. Solo negociaría después, por ahorro comprobable —origen listo, rutas compatibles, menos fallidos— y conservando contribución positiva.

**4. ¿Turno fijo o bono?**

Mantendría el turno fijo durante el piloto. Un bono por paquete puede incentivar aceptar de más y relegar comida. Si crece la demanda, calcularía refuerzo en horas concretas; su contribución adicional debe cubrir íntegramente ese refuerzo. Cualquier cambio salarial se acuerda con el motorizado.

## El plan que firmaría — respuesta 5

1. **Validar medición y costos esta semana.** Criterio: reproducir ocupación del titular, identificar huecos útiles y reconciliar turnos. Si no cierra, reducir cupos; no paralizar todo.

2. **Entrevistar cinco negocios y elegir tres.** Revisar entregas solicitadas recientemente, horarios y disposición a prepagar. Criterio: tres negocios capaces de entregar bolsas pagadas y listas sin coordinación de Jesús.

3. **Cerrar el circuito comercial mínimo.** Acceso, solicitud, aceptación, cobro, seguimiento, cancelación, retorno y rendición. Criterio: cada negocio completa una prueba sin ayuda y el dinero cuadra.

4. **Pilotear diez días hábiles a S/3.** Empezar con una entrega simultánea por motorizado y cupos según carga. Criterio para ampliar: cero demoras de restaurantes atribuibles a courier y tiempos observados compatibles con otro viaje.

5. **Decidir con contribución y autonomía.** Medir también solicitudes rechazadas y minutos de Jesús. Continuar si deja margen, hay repetición pagada y requiere como máximo 15 minutos diarios habituales del fundador; corregir o detener si depende de que él reparta.

6. **Escalar antes de migrar a móvil.** Sumar negocios o refuerzo, uno por vez. Criterio: dos semanas consecutivas de operación autónoma, rendición correcta y cumplimiento estable. Sin esa evidencia, la app solo trasladaría problemas pendientes.