# CRT · Bolsa

> Maqueta: tablero `Bolsa`.

| | |
|---|---|
| **Tarea de la persona** | Revisar lo que lleva, ajustar cantidades o quitar productos, y seguir al pago. |
| **Se llega desde** | Pastilla «Ver bolsa» en `CAT-inicio` o `CAT-negocio`. |
| **Se sale hacia** | «Continuar» → `CHK-confirmar-pedido` (deslizamiento lateral de 250 ms); si falta sesión, celular o dirección, antes pasa por `flujos/acceso-y-datos.md`. «Agregar más de [negocio]» → `CAT-negocio`. «Editar» una línea → `CAT-plato` con sus opciones. Bolsa vacía → «Ver negocios» → `CAT-inicio`. Volver → origen. |
| **Requisitos** | CUS-CRT-001 ★, 002, 003, 004, 005 ★, 006, 007, 008 ★, 009, 010, 011 · (requisito nuevo: aviso «Quitaste …» con «Deshacer» durante 5 s) · (requisito nuevo: «Editar» una línea de la bolsa) |
| **Endpoints** | Ninguno para armar la bolsa (vive en el dispositivo). Validación contra el catálogo vigente con `GET /public/businesses/{idOrSlug}` (CUS-CRT-005). |
| **Estado** | Android: 🟡 pantalla «Mi bolsa» con cantidades, quitar, vaciar, «+ Agregar más» y «Continuar»; sin «Editar» ni «Deshacer» · iOS: ⬜ |

## Contenido, de arriba abajo

1. **Barra superior (fija):** volver · «Tu bolsa» · «2 productos» · «Vaciar» (acción de texto).
2. **Negocio:** «La Florencia» y la forma de entrega «Delivery» con su plazo «[PLAZO]» (o «Recojo»).
3. **Productos.** Cada línea: nombre, precio de la línea «S/ 25.00», sus opciones y su nota («Nota: sin ají»), el selector
   de cantidad (− / n / +) y «Editar» si el plato tiene opciones. Con cantidad 1, el «−» pasa a tacho (rojo `#991B1B`) y
   quita la línea.
   Ejemplo de la maqueta: «Medio pollo a la brasa» S/ 25.00; «Papas fritas» · «Nota: sin ají» · 1 · «Editar»; «Inca Kola 1 L» S/ 6.00 · 1.
4. **«Agregar más de La Florencia»**: botón secundario (borde, sombra `e1`).
5. **Resumen:** «Subtotal» «S/ 31.00» y «Delivery» «Se calcula con tu dirección».
6. **Aviso con «Deshacer»** (snackbar carbón, acción blanca subrayada): «Quitaste "Papa a la huancaína"» · «Deshacer». Una raya
   naranja que se vacía en 5 s marca el plazo.
7. **Barra de acción (fija):** «Continuar» y la píldora con el total «S/ 31.00».

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Bolsa vacía | «Tu bolsa está vacía» y «Ver negocios» | CUS-CRT-003 |
| Quitar el último producto | Pasa a vacía con fundido de 200 ms, sin aviso | CUS-CRT-003 |
| Quitar un producto | La fila sale 24 px a la izquierda; aparece «Quitaste "…"» con «Deshacer» 5 s | (requisito nuevo: deshacer) |
| Vaciar | Diálogo «¿Vaciar tu bolsa?» · «Cancelar» / «Vaciar» (rojo `#991B1B`, 48 dp) | CUS-CRT-003 |
| Revalidando la bolsa | Se detecta plato eliminado, agotado, fuera de franja o con precio cambiado y se avisa antes de continuar | CUS-CRT-005 |
| «Continuar» deshabilitado | Siempre dice por qué: «Cargando…» o «El restaurante está cerrado ahora» | CUS-CRT-009 |
| Bolsa de recojo | Aviso de recojo (sin «Delivery») | CUS-CRT-010 |
| Tope de líneas o unidades | Se deshabilita «+» (≤ 50 líneas, cantidad 1–50, ≤ 20 opciones por línea) | CUS-CRT-011 |
| Guardado en el dispositivo | La bolsa sobrevive entre sesiones; la validación no | CUS-CRT-004 |

## Criterios de aceptación propios de la pantalla

```
CA-CRT-P1 · Quitar con «Deshacer»
  Dado una bolsa con 3 productos
  Cuando la persona toca el tacho de «Papa a la huancaína»
  Entonces la línea sale, el Subtotal y el total de «Continuar» bajan y aparece «Quitaste "Papa a la huancaína"» con «Deshacer»
  Y si toca «Deshacer» antes de 5 s, la línea vuelve en su sitio y los totales regresan

CA-CRT-P2 · De 1 a 0 no deja líneas fantasma
  Dado una línea con cantidad 1
  Entonces el botón «−» es un tacho y al tocarlo la línea se quita
  Y si era la última, la bolsa pasa al estado vacío y se limpian negocio, validación y método (CUS-CRT-003)

CA-CRT-P3 · El total de la barra coincide con el Subtotal
  Dado cualquier cambio de cantidad
  Entonces el monto de «Continuar» y el Subtotal muestran el mismo valor, con dos decimales
```

## Movimiento

Curva `cubic-bezier(.2,.8,.2,1)`, 150–250 ms; con «reducir movimiento» todo cambia al instante.
1. Tocar un botón (+, tacho, «Editar», «Agregar más»): escala 0,97 en 150 ms; en los que llevan sombra, baja a `e1` mientras se presiona.
2. Cambiar cantidad: el número sale 8 px (arriba si sube, abajo si baja) y entra el nuevo; el precio de la línea y el
   Subtotal cuentan al nuevo valor en 250 ms; la píldora de «Continuar» rebota (1,06 a 1, 220 ms).
3. De 2 a 1: el signo menos y el tacho se cruzan (fundido + escala 0,85 a 1, 180 ms) y el ícono pasa a rojo.
4. Quitar: la fila se desliza 24 px a la izquierda, se desvanece y colapsa su altura (220 ms). El aviso entra desde abajo
   (16 px + fundido, 200 ms) y su raya se vacía en 5 s. «Deshacer»: la fila vuelve con la animación inversa.
5. Vaciar: las filas se desvanecen y bajan 16 px en cascada (40 ms entre filas) y aparece el estado vacío.
6. «Continuar»: un brillo diagonal lo cruza una vez (600 ms) al entrar y cada vez que cambia el total, sin bucle.
   Presionado, una capa `#CF4A0C` sube de 0 a 1 en 150 ms. Al soltar, la flecha avanza 8 px.

## Pendiente (va a `decisiones-abiertas.md`)

- **Maqueta ↔ código:** título «Tu bolsa» + «2 productos» (maqueta) frente a «Mi bolsa» (código). La barra que lleva a la bolsa dice «Ver mi bolsa» en el código y «Ver bolsa» en la maqueta.
- **Maqueta ↔ código:** la maqueta dice «Delivery · Se calcula con tu dirección»; el código dice «El envío y el total final se calculan al confirmar el pedido.» No se elige.
- **Maqueta ↔ código:** «Editar» y «Deshacer» no existen en el código; hoy quitar una línea es definitivo.
- **Maqueta ↔ código:** el botón del código es «+ Agregar más» (sin nombre del negocio); la maqueta dice «Agregar más de La Florencia».
- ¿«Volver a pedir» (CUS-CRT-012) repone la bolsa o solo abre el negocio? Hoy solo abre el negocio, aunque el servidor tiene `POST /customer/orders/{id}/reorder`.
