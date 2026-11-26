---
canvas: [Bolsa]
requisitos: [CUS-CRT-001, CUS-CRT-003, CUS-CRT-005, CUS-CRT-007, CUS-CRT-009, CUS-CRT-010, CUS-CRT-011, CUS-CRT-013, CUS-CRT-014, CUS-CRT-015, CUS-CRT-016]
operaciones: [getBusiness]
textos:
  - clave: bolsa.linea.plato_eliminado
    es: "Este producto ya no está en la carta"
  - clave: bolsa.linea.agotado
    es: "Agotado por ahora"
  - clave: bolsa.linea.fuera_de_franja
    es: "Hoy no se sirve a esta hora"
  - clave: bolsa.linea.precio_cambiado
    es: "El precio cambió. Quítalo y vuelve a agregarlo."
  - clave: bolsa.linea.opcion_retirada
    es: "Una opción que elegiste ya no está disponible"
  - clave: bolsa.continuar.reintentar
    es: "Reintentar"
  - clave: bolsa.carta.no_responde
    es: "No pudimos revisar la carta. Toca Reintentar."
  - clave: bolsa.linea.importe_no_mostrable
    es: "No podemos mostrar el precio por ahora"
  - clave: bolsa.importe_no_mostrable
    es: "No podemos mostrar un precio. Intenta de nuevo en un rato."
  - clave: bolsa.editar.guardar
    es: "Guardar · %s"
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
| Línea inválida | Aviso en la línea con el texto de `bolsa.linea.*` (plato eliminado, agotado, precio cambiado, fuera de franja, opción retirada) y «Continuar» no avanza | CUS-CRT-005, CA-CRT-05 |
| Carta no responde | «Continuar» no avanza y dice «Reintentar»; al tocarlo se vuelve a pedir la carta. Aviso: `bolsa.carta.no_responde` (se anuncia al aparecer y otra vez si el reintento vuelve a fallar) | CUS-CRT-005 |
| Importe no mostrable | Un importe roto del servidor se muestra «—» con la etiqueta hablada «Precio no disponible»; «Agregar» se bloquea. Aviso en la línea: `bolsa.linea.importe_no_mostrable`; aviso en la bolsa: `bolsa.importe_no_mostrable` | CUS-CRT-005 |
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

## Decisiones de Jesús del 2026-11-26

- **Textos de los avisos de línea:** se usan los de la frontmatter (`bolsa.linea.*`), que son los de Android en la
  rama de la bolsa. iOS los adopta; los textos de iOS de hoy quedan retirados.
- **Carta que no responde:** «Continuar» se bloquea con «Reintentar». No se deja pasar.
- **Importe no mostrable:** se muestra «—», «Agregar» se bloquea y la bolsa avisa. Android deja de cerrar la app.
- **Textos aprobados** (2026-11-26, con propuesta de criterio del asesor de producto): carta caída
  (`bolsa.carta.no_responde`), importe no mostrable en la línea y en la bolsa (`bolsa.linea.importe_no_mostrable`,
  `bolsa.importe_no_mostrable`) y el botón de edición «Guardar · %s» (`bolsa.editar.guardar`, el texto de Android; iOS lo adopta).
- **Pendiente:** no está dicho si «Continuar» se bloquea cuando hay un importe no mostrable en la bolsa, ni si el
  cliente puede quitar esa línea. Y «Guardar · —» en la edición de una línea con importe roto: se bloquea como «Agregar»
  o no. Jesús lo decide antes de cerrar el estado.
