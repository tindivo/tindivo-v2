# AUT · Verificar el celular

> **Decisiones de Jesús del 2026-11-17 que cambian esta pantalla** (donde choquen con el texto de abajo, manda esto):
> - El celular que ya pertenece a otra cuenta se resuelve por soporte de WhatsApp, sin traslado automático (CUS-AUT-028). El endpoint `POST /customer/phone/transfer` no se llama desde la app en el lanzamiento; controlarlo en servidor sin romper clientes instalados.

> Maquetas: `Celular` (hoja «Tu celular», paso del número) y `Celular-codigo` (hoja «Escribe el código»). Ambas son hojas
> sobre el checkout atenuado: el celular se pide dentro del checkout, nunca obligando a ir a Cuenta (PATRONES-V2 §11).

| | |
|---|---|
| **Tarea de la persona** | Dar su celular, recibir un código por SMS y confirmarlo para poder pedir. |
| **Se llega desde** | `CHK-confirmar-pedido` (botón «Verifica tu celular» o «Cambiar» junto al celular, CUS-AUT-009) · `ACC-cuenta` («Verificar») · `ENT-pedir-entrega` («Verificar mi celular»). |
| **Se sale hacia** | Código correcto → la hoja se cierra sola a los 600 ms y se vuelve a quien la abrió (checkout, cuenta o entregas) con el celular verificado. «Cambiar número» → paso del número. Cerrar → quien la abrió, sin cambios. |
| **Requisitos** | CUS-AUT-007 ★, CUS-AUT-008, CUS-AUT-009, CUS-CHK-002, CUS-ACC-001 · (requisito nuevo: traspaso del número verificado en otra cuenta, decisión D-63) |
| **Endpoints** | `POST /customer/phone/send-code` (máx. 3 envíos por usuario en 24 h; 429 con `Retry-After`) · `POST /customer/phone/verify` (6 dígitos) · `POST /customer/phone/transfer` (usar aquí el número verificado en otra cuenta) |
| **Estado** | Android: 🟡 pantalla «Verificar mi número» con tres pasos (número, código, listo) y diálogo de traspaso; no es hoja del checkout ni tiene el diseño v3 · iOS: ⬜ |

## Contenido, de arriba abajo

### Paso 1 · «Tu celular»

1. **Título:** «Tu celular» y la línea «Te enviamos un código por SMS».
2. **Campo:** prefijo fijo «+51» y «Celular», valor «987 654 321»: el número se agrupa de 3 en 3 al escribir y abre el teclado numérico.
3. **Botón primario:** «Enviar código»; deshabilitado (`#E0E4E8`) hasta tener 9 dígitos que empiecen con 9; entonces naranja.

### Paso 2 · «Escribe el código»

1. **Título:** «Escribe el código» y «Enviado al +51 987 654 321».
2. **Casillas del código** (6 dígitos). El SMS se autocompleta con la sugerencia del sistema sobre el teclado.
3. **«Cambiar número»** (vuelve al paso 1) y **«Reenviar en 0:42»**, cuenta atrás que, al llegar a 0, pasa a enlace **«Reenviar código»**.
4. Al escribir el sexto dígito se verifica sola: la casilla se llena con un rebote leve, el campo se bloquea y aparece un
   indicador de progreso en lugar de «Reenviar». Correcto: check verde y la hoja se cierra sola a los 600 ms.

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Número incompleto o inválido | Borde `#B3261E` y la línea «Escribe un celular de 9 dígitos que empiece con 9.» | CUS-AUT-007 |
| Enviando el código | Botón con progreso «Enviando»; campo bloqueado | CUS-AUT-007 |
| Código enviado | «Enviamos un código de 6 dígitos al +51 [número].» y casillas activas | CUS-AUT-007 |
| Código incorrecto | Las casillas tiemblan 200 ms, borde `#B3261E` y «Escribe el código de 6 dígitos.» | CUS-AUT-007 |
| Código vencido | «Pasó demasiado tiempo. Pide un código nuevo.» | CUS-AUT-007 |
| Reenvío en espera | «Podrás reenviar el código en [N] s»; la app real espera 60 s | CUS-AUT-007 |
| Demasiados envíos (429) | Mensaje del servidor con el tiempo de espera, o «escríbenos por WhatsApp» | CUS-AUT-007 |
| Número en otra cuenta (409) | **Decisión 2026-11-17 (CUS-AUT-028):** «Este número ya está asociado a otra cuenta» · «Contactar soporte» / «Usar otro número»; sin traslado automático. (Antes: «Si lo usas aquí, la otra cuenta pierde la verificación…» · «Usar en esta cuenta».) | CUS-AUT-008 |
| Verificado | «Número verificado» · «Tu número [número] quedó verificado. Ya puedes pedir.» · «Listo» (código); la maqueta cierra sola | CUS-AUT-007 |
| Sin conexión | «Sin conexión. Revisa tu internet e inténtalo de nuevo.» | CUS-AUT-007 |
| Verificación local en desarrollo | Si el servidor responde `verified = true` al enviar, se salta el código | CUS-AUT-007 |
| Sesión vencida (401) | Se cierra la hoja y se pide entrar | CUS-AUT-012 |

## Criterios de aceptación propios de la pantalla

```
CA-AUT-P7 · El botón espera 9 dígitos que empiecen con 9
  Dado el paso «Tu celular»
  Cuando el número tiene menos de 9 dígitos o no empieza con 9
  Entonces «Enviar código» está deshabilitado y el campo muestra «Escribe un celular de 9 dígitos que empiece con 9»
  Y con 9 dígitos válidos pasa a naranja y se habilita

CA-AUT-P8 · El sexto dígito verifica solo
  Dado el paso «Escribe el código» con 5 dígitos escritos
  Cuando la persona escribe el sexto
  Entonces el campo se bloquea, aparece el progreso y se llama a la verificación sin tocar otro botón
  Y si es correcto, aparece el check verde y la hoja se cierra a los 600 ms

CA-AUT-P9 · El reenvío respeta la espera
  Dado un código recién enviado
  Entonces «Reenviar código» no está disponible hasta que la cuenta atrás llegue a 0 (60 s)
  Y el servidor no admite más de 3 envíos en 24 h por usuario

CA-AUT-P10 · Cambiar el celular exige verificar de nuevo
  Dado un celular ya verificado en el checkout
  Cuando la persona escribe uno distinto
  Entonces no se puede confirmar el pedido hasta verificarlo (CUS-AUT-009)
```

## Movimiento

La hoja sube con el teclado numérico del sistema abierto (150–250 ms). El número se agrupa de 3 en 3 al escribir. Código: al
llegar el SMS se autocompleta; la casilla del sexto dígito se llena con un rebote leve; si falla, las casillas tiemblan 200 ms; si
es correcto, check verde y cierre a los 600 ms. «Reenviar en 0:42» cuenta hacia atrás. Con «reducir movimiento»: sin temblor ni rebote.

## Pendiente (va a `decisiones-abiertas.md`)

- **Maqueta ↔ código:** la maqueta es una **hoja sobre el checkout**; el código es una pantalla completa («Verificar mi número») con su propia barra y un paso final «Número verificado» con botón «Listo». No se elige.
- **Maqueta ↔ código:** la maqueta dibuja **4 casillas** con «4 8 1 7» pero su propio comentario y su error dicen 6 dígitos; el código usa 6. Hay que redibujar con 6.
- **Maqueta ↔ código:** el valor «0:42» de la espera es de ejemplo; el código espera 60 s y muestra «Podrás reenviar el código en [N] s».
- **Maqueta ↔ código:** el diálogo de traspaso (409) no está en la maqueta.
- Recuperación sin Google: soporte por WhatsApp verificando el celular; no hay flujo propio (CUS-AUT-008).
