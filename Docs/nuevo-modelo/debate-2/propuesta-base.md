# Tindivo Entregas: producto y experiencia de usuario

> **v1 · 2026-09-30 · propuesta de Claude para debate.** Continúa el *Plan consolidado v1* (Claude + Codex) y se enfoca **solo en producto y UX de Tindivo Entregas**. Compras aparece como anexo opcional.
>
> **Qué se le pide a Codex:**
> - criticar la experiencia propuesta;
> - verificar en el repo todo lo marcado como *[verificar en código]*;
> - proponer el camino de implementación más corto.
>
> El filtro de siempre: ¿lo puede sostener una sola persona?

---

## 0. Qué cambió desde el plan consolidado (decisiones de Jesús)

1. **El centro es persona a persona**, no solo negocio → persona. Tindivo Entregas es un "inDrive para cosas": cualquier cosa que ya esté lista, de un punto a otro de San Jacinto.
2. **Las tiendas no van a compartir enlaces.** El "enlace o QR por negocio" deja de ser el canal principal. La tienda solo tiene que entregar la bolsa lista y pagada.
3. **Hay dos puertas de entrada:**
   - **Web:** el usuario crea la entrega él mismo.
   - **WhatsApp:** el usuario le escribe a Tindivo y **Jesús crea la entrega con su propia cuenta**, igual que los restaurantes cargan sus pedidos (`business_manual`). El motorizado solo mira la plataforma, nunca WhatsApp.
4. **Buscador de negocios** dentro del flujo, **sin teléfonos visibles**: la única forma de que te traigan algo de un negocio es pedirlo por Tindivo.
5. **Compras (encargos) es opcional.** Se atiende por WhatsApp como "encargo asistido", sin flujo propio en la V1 (ver anexo).

**Se mantiene del plan consolidado:**
- Solo de lunes a viernes, de 6 a 11 pm.
- La comida siempre va primero.
- 1 entrega activa por motorizado.
- "Listo y pagado" es condición obligatoria.
- La comida preparada no va por Entregas.
- Piloto de 2 semanas con los criterios del §7 del plan.

---

## 1. Principios de experiencia

1. **Una decisión por pantalla, con botones grandes.** El usuario típico no es tecnológico y pide desde el celular.
2. **Tocar antes que escribir.** Se usan chips y opciones; el texto libre solo donde no hay alternativa.
3. **Referencias, no mapas.** El pueblo se ubica por "frente a la iglesia". El pin es opcional; el **celular de contacto es obligatorio**, porque es la verdadera dirección.
4. **El precio se ve siempre antes de pedir.**
5. **Nunca prometer lo que no se puede cumplir.** Nada está confirmado hasta que un motorizado acepta, y si no hay motorizado, se avisa rápido.
6. **Un solo objeto para ambos canales.** La entrega que crea Jesús desde WhatsApp y la que crea el usuario en la web son lo mismo, con el mismo seguimiento.

---

## 2. La idea central: "Mandar algo" o "Traerme algo"

En lugar de un formulario genérico de punto A a punto B, la primera pregunta es **qué papel tiene quien pide**:

| | **Mandar algo** | **Traerme algo** |
|---|---|---|
| Ejemplo | "Le mando unos cuadernos a mi hermana" | "Recógeme el táper donde mi mamá" · "Tráeme lo que pagué en la botica" |
| Quien pide está en | El origen | El destino |
| Se completa solo | Origen = yo | Destino = yo |
| Se le pregunta | ¿A quién y a dónde? | ¿De dónde? (una persona o un **negocio**, con buscador) |
| Se cobra | **Al recoger** | **Al entregar** |

**Ventajas:**

- Los envíos persona a persona y los de negocio a persona salen del mismo flujo.
- **No hace falta preguntar "¿quién paga?"**: paga quien pide, y el momento del cobro sale de su papel. El motorizado ve "Cobrar S/2.50 al recoger" o "Cobrar S/2.50 al entregar".
- El buscador de negocios aparece justo donde tiene sentido: en "¿De dónde lo recogemos?".

**Caso borde:** quien pide no es ni quien entrega ni quien recibe ("mi mamá le manda algo a mi tía"). En ese caso, el lado "yo" se cambia con un enlace "No soy yo" y se cobra al recoger.

**Riesgo a debatir:** "Traerme algo" puede invitar a pedir "cómprame esto". Se controla con la pregunta "¿Ya está pagado?" (ver §3.3).

---

## 3. Flujo web (lo crea el usuario)

### 3.1 Inicio

La pantalla de inicio tiene solo dos entradas:

```
¿Qué necesitas hoy?

[ Comida ]
  De restaurantes aliados

[ Tindivo Entregas ]
  Mandamos o traemos lo que ya está listo · S/2.50
```

### 3.2 Paso 1: ¿mandas o recibes?

```
Tindivo Entregas · Lun–Vie 6–11 pm · S/2.50

[ Mandar algo ]
  Lo recogemos donde estás y lo llevamos

[ Traerme algo ]
  Lo recogemos de otro lugar y te lo traemos

¿Prefieres escribirnos? Pide por WhatsApp (S/3) →
```

**Fuera de horario:** los botones aparecen desactivados con el mensaje "Abrimos el lunes a las 6 pm". En la V1 no hay pedidos programados.

### 3.3 Paso 2: el otro punto

**Si eligió "Mandar algo", la pantalla pregunta "¿A quién se lo llevamos?":**
- Nombre y celular de quien recibe (obligatorios).
- Referencia de la dirección en texto, con pin opcional.
- El origen ("Desde: tu dirección") sale de su última dirección guardada o de "Usar mi ubicación", y se puede editar.

**Si eligió "Traerme algo", la pantalla pregunta "¿De dónde lo recogemos?":**
- Un buscador con el texto "Busca un negocio o escribe una dirección".
  - Si elige un negocio, ve su nombre, rubro, zona y si está **abierto o cerrado**, pero no su teléfono. Al elegirlo, el origen queda completo: referencia, pin y un teléfono privado que solo ve el motorizado.
  - Si elige "Una persona", llena nombre, celular y referencia.
- Una pregunta obligatoria: **"¿Ya está pagado y listo para recoger?"**
  - **Sí:** sigue el flujo.
  - **No, quiero que lo compren:** aparece "Eso lo coordinamos por WhatsApp (S/3.50)" y se abre WhatsApp con el mensaje ya escrito (ver anexo).
- El destino ("Hasta: tu dirección") sale de su dirección guardada o de su ubicación.

### 3.4 Paso 3: ¿qué llevamos?

- Chips para tocar: Paquete · Documentos · Ropa · Llaves · Táper · Útiles · Otro.
- Descripción corta opcional ("bolsa azul", "sobre manila").
- Dos casillas de confirmación:
  - ☐ Pesa menos de 5 kg (cabe en una mochila).
  - ☐ No es comida preparada, dinero ni nada prohibido.
- Nota para el motorizado (opcional).

### 3.5 Paso 4: confirmar

```
Resumen
Desde: casa de Rosa, frente al colegio (Rosa · 9XX XXX XXX)
Hasta: tú, calle 2, casa verde
Qué: útiles, bolsa azul
Pagas S/2.50 al recibir · efectivo exacto o Yape al motorizado
Tenlo listo: el motorizado espera máximo 5 minutos.

[ Pedir entrega ]
```

### 3.6 Después de pedir

1. **"Buscando motorizado…"** con un contador. Si nadie acepta en 5 minutos, el pedido se cancela solo, no se cobra nada y aparece el mensaje: "Ahora no tenemos motorizado libre. Intenta en 15 minutos o escríbenos por WhatsApp."
2. **Cuando un motorizado acepta:** "Tu motorizado va a recoger el envío", con el botón **"Avisar a [nombre] por WhatsApp"**, que abre un mensaje ya escrito con el link de seguimiento. Así cada envío le presenta Tindivo a alguien nuevo.
3. **Seguimiento por estados, sin GPS**, en un link público que no pide cuenta:
   `Buscando motorizado → Va a recoger → Recogido → En camino → Entregado`,
   además de "No se pudo entregar" (con motivo) y "Cancelado".
4. **Al terminar:** botón "Repetir esta entrega"; las direcciones quedan guardadas.

### 3.7 Primera vez y cuenta

Recomendación: pedir **solo nombre y celular**, sin contraseña, y guardar las direcciones después del primer pedido.

*[verificar en código: qué exige hoy el flujo de `apps/customer` para crear un `courier_order`, y si el límite de "1 pedido activo por teléfono" se aplica al celular de la cuenta o al celular de contacto.]*

---

## 4. Flujo WhatsApp (Jesús lo crea con su cuenta)

El objetivo es **cero sobreingeniería**: Jesús usa el mismo formulario de la web, con su cuenta en "modo operador".

### 4.1 Recepción por WhatsApp Business (sin código)

Respuesta rápida para que el cliente mande la información ordenada:

> "¡Hola! Te lo llevamos. Envíanos: 1) dónde recogemos, 2) a dónde lo llevamos, 3) qué es, 4) nombre y celular de quien entrega y de quien recibe, 5) si pagas al recoger o al entregar. S/3 por WhatsApp · S/2.50 si pides en la web: [enlace]. Lunes a viernes, de 6 a 11 pm."

### 4.2 Modo operador (lo mínimo)

Una marca en la cuenta de Jesús (rol o flag) que cambia el mismo formulario así:

- Agrega arriba el campo **"Cliente: nombre y celular"** de quien pidió por WhatsApp.
- Reemplaza "Mandar / Traerme" por un selector explícito: **"Cobrar al recoger / al entregar"**, porque Jesús no es parte de la entrega.
- Pone **canal = WhatsApp** y precio **S/3** automáticamente.
- **Exime a su cuenta del límite de "1 pedido activo por teléfono"**. Sin esto, no podría atender a dos clientes de WhatsApp a la vez. *(Esto modifica el plan consolidado, que decía "no quitar el límite": aquí solo se exime la cuenta de operador.)*
- Al crear, muestra el botón **"Copiar mensaje para el cliente"**, con el resumen, el precio y el link de seguimiento, para pegarlo en WhatsApp.

Para el motorizado, la entrega que crea Jesús se ve igual que cualquier otra, con una etiqueta "WhatsApp".

*[verificar en código: si ya existe un rol de administrador que se pueda reutilizar, y dónde se aplica el límite de 1 activo.]*

### 4.3 Reglas de operación

- Durante el turno, WhatsApp se responde en menos de 2 minutos. Si Jesús no puede, se activa un mensaje automático de ausencia.
- Jesús le confirma al cliente **solo cuando el motorizado acepta**, y eso lo ve en el panel.
- Se mide cuánto tiempo al día le toma esto a Jesús (tope: 15–20 minutos). Si se pasa, es la señal para empujar la web (con el descuento de S/0.50) o para pasar el celular de pedidos al motorizado de turno.

---

## 5. App del motorizado

Tarjeta de entrega, en azul para distinguirla de la comida:

```
ENTREGA · WhatsApp              Cobrar S/3 al entregar
Recoger: Botica X · frente a la plaza          [Llamar]
Llevar:  María · calle 2, casa verde           [Llamar]
Qué: útiles, bolsa azul
Nota: tocar la puerta de atrás
[ Aceptar ]   [ Soltar ]
```

**Botones según el estado:**
1. **Llegué al recojo**: inicia un contador de 5 minutos.
2. **Recogido**.
3. **Entregado**: marca cómo cobró (efectivo o Yape).
4. **No se pudo**: con motivo (no estaba listo · no contestan · no está quien recibe · contenido no permitido).

**Reglas:**
- **Comida primero.** *[a debatir]* ¿El motorizado no puede aceptar una entrega si tiene comida activa, o puede si el destino queda en la misma ruta?
- Una sola entrega activa a la vez.
- El teléfono del negocio solo lo ve el motorizado.

---

## 6. Casos borde

| Caso | Qué pasa |
|---|---|
| No estaba listo al llegar | El motorizado espera 5 minutos y marca "No se pudo · no estaba listo". Si se cobra o no, lo decide Jesús (§9) |
| Quien recibe no está | El motorizado llama. Si no contesta en 5 minutos, devuelve el envío al origen dentro del mismo turno |
| Contenido no permitido | El motorizado puede revisar. Si no lo dejan, no lo lleva |
| Piden "cómprame esto" en Entregas | La pregunta "¿Ya está pagado?" lo manda a WhatsApp (encargo asistido) |
| Fuera de horario | Botones desactivados con "Abrimos el lunes a las 6 pm" |
| No hay motorizado libre | Cancelación automática a los 5 minutos, sin cobro |
| Cambio de dirección en camino | Solo por llamada al motorizado, y dentro de San Jacinto |

---

## 7. Qué medir desde el día 1

- **Embudo de la web:** cuántos abren Entregas y cuántos completan cada paso hasta pedir. Sin medir el abandono por paso, el piloto puede quedar "inconcluso".
- **Canal de cada entrega** (web o WhatsApp) y su tendencia semanal.
- **Tiempos:** cuánto tarda un motorizado en aceptar, cuánto dura cada estado, y cuántas entregas se cancelan por falta de motorizado.
- **"No se pudo"**, separado por motivo.
- **Minutos diarios de Jesús** en WhatsApp (basta un registro manual simple).
- **Recompra:** cuántos usuarios hacen 2 o más entregas.

---

## 8. Qué NO entra en la V1

- Pedidos programados, agrupación por zona y negociación de precio tipo inDrive.
- Mapa público de negocios y perfiles de negocio con carta.
- Panel de entregas en `apps/negocios`.
- Flujo propio de Compras.
- Notificaciones push: la web no las tiene, y el seguimiento es por link.
- Leer o interpretar mensajes de WhatsApp de forma automática.

---

## 9. Decisiones de Jesús (con recomendación)

1. **Precios: S/2.50 en la web, S/3 por WhatsApp y S/3.50 el encargo asistido.** *Recomendación:* sí, presentándolo como "S/0.50 menos si pides en la web". Ojo: el plan consolidado proponía un precio único de S/3, sin promoción.
2. **Qué se cobra si no estaba listo o no estaba quien recibe.** *Recomendación:* si el motorizado ya fue, se cobra el servicio, y la vuelta al origen no se cobra aparte. Quien falle dos veces queda bloqueado.
3. **Horario: lunes a viernes, de 6 a 11 pm.** Esto cambia el "todos los días" de `Docs/Encargos/04`.
4. **Negocios del buscador.** *Recomendación:* los carga Jesús desde su panel (nombre, rubro, referencia, horario, pin y teléfono privado), empezando con 10–15.

---

## 10. Preguntas para Codex

1. ¿"Mandar algo / Traerme algo" es más claro que un formulario único de A a B? ¿Qué confusiones ves?
2. Para usuarios poco digitales en celular, ¿conviene un paso por pantalla o todo en una sola pantalla?
3. ¿Basta con deducir el momento de cobro a partir del papel del usuario, o hay que preguntarlo siempre?
4. Modo operador: ¿cuál es la implementación mínima en el repo actual? ¿Un rol, un flag o una ruta aparte?
5. Buscador de negocios: ¿cómo se modela y se carga con el menor esfuerzo? ¿Qué pasa si el usuario escribe un negocio que no está?
6. ¿Cómo se le avisa al usuario web que cambió el estado de su entrega, sin notificaciones push?
7. ¿El precio distinto entre web y WhatsApp confunde o ayuda? ¿Cómo se implementa sin complicarle el cobro al motorizado?
8. ¿Qué medición mínima hace falta para clasificar el piloto (§7 del plan consolidado) ahora que hay dos canales?
9. ¿Qué parte de esta propuesta le complica la vida al motorizado?
10. Con lo que ya existe en la rama `tindivo-courier`, ¿cuál es el orden de tareas más corto para tener esta V1?

---

## Anexo: Compras (opcional) como encargo asistido por WhatsApp

No tiene flujo propio en la V1. Cuando alguien pide "cómprame esto":

1. Jesús confirma con la tienda que tiene el producto y cuánto cuesta.
2. **El cliente le yapea directo a la tienda**: Jesús le pasa el QR de Yape de la tienda. Tindivo nunca toca la plata.
3. La tienda confirma el pago y arma la bolsa.
4. Jesús registra una **entrega normal** con la tienda como origen, la etiqueta "encargo asistido" y precio S/3.50.
5. El motorizado recoge una bolsa lista y pagada.

Si la tienda no contesta o no acepta Yape, se le avisa al cliente de inmediato y se le ofrece otra tienda. Este servicio no se publicita, pero sí se cuenta. **Si llegan más de ~5 encargos asistidos por semana durante 2 semanas seguidas**, se diseña el flujo propio de Compras (lista de productos, tienda, plan B y tope), como en `propuesta-claude.md`.

Mensaje ya escrito que se abre desde la web cuando el usuario marca "No, quiero que lo compren":

> "Hola, quiero un encargo: comprar ___ en ___ y llevarlo a ___."