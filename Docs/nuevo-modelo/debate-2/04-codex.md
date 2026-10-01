# Debate 2 · Ronda 4 · Codex

**Acepto el orden y el mapa primero, con precisiones.** El objetivo sigue siendo que un vecino complete el pedido sin ayuda y que Jesús pueda sostener la operación solo.

Revisión estática del repo; no consulté producción ni modifiqué archivos.

**Orden y pin**

Acepto: **privacidad → reglas → motorizado y cobro → acceso y borrador → pantallas → asistido → prueba con cinco personas**. La privacidad debe corregirse antes de desplegar; el circuito operativo debe funcionar antes de captar pedidos.

Acepto **mapa primero**, respetando lo pedido por Jesús, con «Recientes», «Usar mi ubicación» y negocios conocidos accesibles desde esa misma pantalla. Elegir un lugar guardado debe ahorrar mover el mapa. La referencia sigue visible y editable: el pin no explica cuál es la puerta.

Mantendría coordenadas obligatorias durante el piloto: hoy la cobertura valida ambos extremos ([0232:518](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:518)). Esto no demuestra que arrastrar un mapa sea fácil; lo decide la prueba con vecinos.

**Precisiones y objeciones pendientes**

- **Privacidad:** no existe aquí un endpoint intermediario que baste corregir. El navegador consulta directamente teléfonos y WhatsApp ([directory.ts:42](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/lib/directory.ts:42)); la política pública filtra filas visibles, no columnas ([0232:163](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:163)). Hay que impedir también la lectura directa de esos contactos.

- **Diez minutos:** acepto probarlos, no presentarlos como duración demostrada. Los quince eran una decisión registrada de Jesús ([04-decisiones-abiertas.md:18](/Users/jesuscastillo/Developer/tindivo-v2/Docs/Encargos/04-decisiones-abiertas.md:18)). Además, el vencimiento solo cancela solicitudes **sin aceptar** ([0232:746](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:746)); no garantiza llegada en diez minutos. Aceptar mientras se termina comida puede esconder la espera. La capacidad debe comprobarse también al aceptar.

- **Sin OTP:** mantengo mi aceptación condicionada al límite por cuenta e incidentes atribuibles. Eso no verifica el celular ni impide abrir varias cuentas. La llamada reduce viajes inútiles, pero consume tiempo y requiere un contacto válido: hoy el contrato permite omitir ambos teléfonos ([courier.ts:17](/Users/jesuscastillo/Developer/tindivo-v2/packages/contracts/src/courier.ts:17)). Deben exigirse o resolverse desde el directorio. Tampoco compararía el costo de una verificación inicial con cada entrega recurrente; ni afirmaría mayor abandono por SMS sin medirlo. Google no garantiza exactamente dos toques.

- **WhatsApp y límite:** estamos de acuerdo, pero falta definir al cliente asistido **sin cuenta**. Propongo identificarlo por su número de WhatsApp, registrado por el operador, y separar ese solicitante de Jesús. No bloquear cuentas ajenas porque alguien escribió su teléfono. Actualmente el conteo usa el teléfono recibido ([0232:525](/Users/jesuscastillo/Developer/tindivo-v2/supabase/migrations/0232_tindivo_entregas_recoge_lo_que_ya_pagaste.sql:525)); cambiarlo solo a cuenta no resuelve el canal asistido.

- **Borrador y confirmación:** `sessionStorage` sirve para volver en la misma pestaña, pero también hay que restaurar el paso y evitar que `openSheet` lo borre ([store.ts:87](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/lib/store.ts:87)). Para persona a persona, la casilla debe decir **«Está listo; si es una compra, ya está pagada»**: unas llaves no requieren compra previa.

**DECISIONES QUE QUEDAN PARA JESÚS**

1. **Precio por canal.** Codex: S/3 único también por WhatsApp. Claude recomienda S/3 mientras no exista asistencia; falta confirmar su postura ahora que sí entra. No doy por cerrado ese consenso.

2. **Acceso.** Recomendación común: Google principal, correo secundario, sin OTP en Entregas; comida conserva su verificación. Límite atómico por cuenta, revisión humana de incidentes e invitado postergado.

3. **Espera y capacidad.** Recomendación común, con mi condición de medir: probar diez minutos para aceptar, una entrega activa por motorizado y comida primero. Sin prometer cupos ni tiempos de llegada.

4. **Asistencia sostenible.** WhatsApp ya está autorizado. Falta fijar cuándo se atiende y su límite operativo. Codex recomienda conservar el techo de quince minutos diarios de Jesús y medirlo; no garantizar respuesta inmediata.

5. **Fallas, cobro y retorno.** Sigue sin acuerdo cerrado: quién paga si falta el destinatario, qué pasa con un cobro previo y cómo vuelve el objeto. Codex recomienda conservar cancelación sin cobro antes de recoger y cerrar una regla de retorno antes del piloto. Nada de bloqueos automáticos por dos fallas.

6. **Directorio y alcance.** Recomendación común: negocios que acepten entregar; otros puntos, coordinados por el solicitante. Sin captar agresivamente negocios de Zorritos ni comida preparada. Jesús elige los primeros participantes.

7. **Compras asistidas.** Sigue abierta la excepción del anexo. Codex recomienda dejarlas fuera: buscar productos y confirmar pagos añade coordinación distinta de cargar una entrega lista.

8. **Salida del piloto.** Ratificar L–V, 6–11 pm, dos semanas; cuatro de cinco vecinos completan sin ayuda, dinero cuadrado, comida sin demoras atribuibles y minutos de Jesús registrados. El orden y las tres pantallas quedan consensuados.