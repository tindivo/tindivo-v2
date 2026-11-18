---
canvas: [Bolsa]
requisitos: [CUS-CRT-001, CUS-CRT-003, CUS-CRT-005, CUS-CRT-007, CUS-CRT-009, CUS-CRT-010, CUS-CRT-011, CUS-CRT-013, CUS-CRT-014, CUS-CRT-015, CUS-CRT-016]
operaciones: [getBusiness]
textos: []
tokens: []
codigo:
  web: [apps/customer/features/cart/components/*.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/cart/CartScreen.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/cart/CartViewModel.kt]
  ios: []
---

# Bolsa

| | |
|---|---|
| **Tarea de la persona** | Revisar lo que lleva, ajustar cantidades o quitar productos, y seguir al pago. |
| **Se llega desde** | La pastilla «Ver bolsa» del inicio o de la carta del negocio. |
| **Se sale hacia** | «Continuar»: el checkout. «Agregar más de [negocio]»: la carta del negocio. «Editar»: el plato con lo elegido. Bolsa vacía: «Ver negocios», al inicio. Volver: de donde vino. |

## Contenido, de arriba abajo

1. Barra fija: volver · «Tu bolsa» · «[n] productos» · «Vaciar».
2. Negocio: nombre y etiqueta «Delivery» con su plazo, o «Recojo».
3. Líneas: nombre, precio de la línea, opciones, nota, selector de cantidad (− / n / +) y «Editar» si el plato tiene
   opciones. Con cantidad 1, «−» es un tacho rojo.
4. «Agregar más de [negocio]».
5. Resumen: «Subtotal» y, en delivery, «Delivery · Se calcula con tu dirección».
6. Barra fija: «Continuar» con la píldora del total.

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Vacía | «Tu bolsa está vacía» y «Ver negocios» | CUS-CRT-003, CA-CRT-03 |
| Validando | La bolsa se ve; «Continuar» dice «Cargando…» hasta que responde la carta | CUS-CRT-005, CUS-CRT-009 |
| Línea inválida | Aviso en la línea (agotado, ya no está, otro precio, fuera de horario) y «Continuar» no avanza | CUS-CRT-005, CA-CRT-05 |
| Negocio cerrado | «Continuar» dice «El restaurante está cerrado ahora» | CUS-CRT-009, CA-CRT-07 |
| Recojo | Etiqueta «Recojo», sin la fila del envío | CUS-CRT-010, CA-CRT-08 |
| Quitar una línea | «Quitaste "[plato]"» con «Deshacer» y una raya que se vacía en 5 s | CUS-CRT-013, CA-CRT-10 |
| Quitar la última | Pasa a vacía, sin aviso | CUS-CRT-003 |
| Vaciar | «¿Vaciar tu bolsa?» · «Cancelar» / «Vaciar» (rojo) | CUS-CRT-016, CA-CRT-13 |
| Tope alcanzado | «+» deshabilitado | CUS-CRT-011, CA-CRT-09 |
| Otro negocio | Hoja «¿Empezar una bolsa nueva?» al agregar desde otro negocio | CUS-CRT-001, CA-CRT-01 |

## Diferencias por plataforma

- La web del cliente se apaga: no recibe «Deshacer», «Editar», «Vaciar» con diálogo ni la píldora del total.
- Movimiento según el tablero «4 · Bolsa» (curva `cubic-bezier(.2,.8,.2,1)`, 150–250 ms); con «reducir movimiento»,
  todo cambia al instante, en todas.
