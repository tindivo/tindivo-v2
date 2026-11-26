---
canvas: [Celular, Celular-codigo]
requisitos: [CUS-AUT-007, CUS-AUT-008, CUS-AUT-009, CUS-AUT-024, CUS-AUT-028]
operaciones: [sendPhoneCode, verifyPhoneCode]
textos: []
tokens: []
codigo:
  web: [apps/customer/components/auth-onboarding/steps/phone-step.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/phone/**]
  ios: []
---

# Verificar el celular

| | |
|---|---|
| **Tarea de la persona** | Dar su celular, recibir un código por SMS y confirmarlo para poder pedir. |
| **Se llega desde** | El checkout («Verifica tu celular» o «Cambiar» junto al celular), Cuenta («Verificar») y la solicitud de Entregas («Verificar mi celular»). |
| **Se sale hacia** | Código correcto: la hoja se cierra sola y se vuelve a quien la abrió (checkout, cuenta o entregas) con el celular verificado. «Cambiar número»: el paso del número. Cerrar: quien la abrió, sin cambios. |

El celular se pide **dentro del checkout**, como hoja sobre la pantalla atenuada, nunca obligando a ir a Cuenta. Los
tableros `Celular` (número) y `Celular-codigo` (código) son esas dos hojas.

## Contenido, de arriba abajo

### Paso 1 · «Tu celular»

1. Título «Tu celular» y la línea «Te enviamos un código por SMS».
2. Campo con prefijo fijo «+51» y «Celular»; el número se agrupa de 3 en 3 al escribir y abre el teclado numérico.
3. Botón «Enviar código»: deshabilitado hasta tener 9 dígitos que empiecen con 9; entonces, naranja.

### Paso 2 · «Escribe el código»

1. Título «Escribe el código» y «Enviado al +51 [número]».
2. Seis casillas para el código; el SMS se autocompleta con la sugerencia del sistema sobre el teclado. La maqueta
   dibuja cuatro: hay que redibujarla con seis.
3. «Cambiar número» (vuelve al paso 1) y «Reenviar en [tiempo]», que al llegar a 0 pasa a «Reenviar código».
4. Al escribir el sexto dígito se verifica sola: el campo se bloquea y aparece el progreso en lugar de «Reenviar».
   Correcto: check verde y la hoja se cierra sola.

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Número incompleto o inválido | Borde de error y «Escribe un celular de 9 dígitos que empiece con 9.» | CUS-AUT-007, CA-AUT-P7 |
| Enviando el código | Botón con progreso «Enviando»; campo bloqueado | CUS-AUT-007 |
| Código enviado | «Enviamos un código de 6 dígitos al +51 [número].» y casillas activas | CUS-AUT-007 |
| Código incorrecto | Las casillas tiemblan, borde de error y «Escribe el código de 6 dígitos.» | CUS-AUT-007, CA-AUT-P8 |
| Código vencido | «Pasó demasiado tiempo. Pide un código nuevo.» | CUS-AUT-007 |
| Reenvío en espera | «Podrás reenviar el código en [N] s» | CUS-AUT-007, CA-AUT-P9 |
| Demasiados envíos (429) | El mensaje del servidor con el tiempo de espera, o «escríbenos por WhatsApp» | CUS-AUT-007, CA-AUT-P9 |
| Número en otra cuenta (409) | «Este número ya está asociado a otra cuenta» · «Contactar soporte» / «Usar otro número»; sin traslado, sin datos de la otra cuenta | CUS-AUT-008, CUS-AUT-028, CA-AUT-09 |
| Verificado | «Número verificado» · «Tu número [número] quedó verificado. Ya puedes pedir.» | CUS-AUT-007 |
| Cambió el celular en el checkout | No se puede confirmar el pedido hasta verificar el nuevo | CUS-AUT-009, CA-AUT-P10 |
| Sin conexión | «Sin conexión. Revisa tu internet e inténtalo de nuevo.» | CUS-AUT-007 |
| Servicio no disponible (503) | Mensaje del servidor; no se puede enviar el código | CUS-AUT-007 |
| Verificación local en desarrollo | Si el servidor responde `verified = true` al enviar, se salta el código | CUS-AUT-007 |
| Sesión vencida (401) | Se cierra la hoja y se pide entrar | CUS-AUT-012 |

## Movimiento

La hoja sube con el teclado numérico del sistema abierto (150–250 ms). Al llegar el SMS se autocompleta; la casilla del
sexto dígito se llena con un rebote leve; si falla, las casillas tiemblan 200 ms; si es correcto, check verde y cierre
a los 600 ms. Con «reducir movimiento»: sin temblor ni rebote.

## Pendiente

- Hoy Android es una pantalla completa («Verificar mi número») con un paso final «Número verificado» y «Listo», y en el
  checkout se abre como hoja; la maqueta es una hoja que se cierra sola. No se elige.
- El tiempo de espera del reenvío que ve la persona es el que la app cuenta; el valor «0:42» de la maqueta es de ejemplo.
