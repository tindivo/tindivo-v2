---
canvas: [Cuenta, Cuenta-incompleta]
requisitos: [CUS-ACC-001, CUS-ACC-002, CUS-ACC-003, CUS-ACC-004, CUS-ACC-005, CUS-ACC-006, CUS-ACC-007, CUS-ACC-008, CUS-AUT-013, CUS-AUT-014, CUS-AUT-015, CUS-AUT-017]
operaciones: [getCustomerProfile, updateCustomerProfile, deleteCustomerAccount]
textos: []
tokens: []
codigo:
  web: [apps/customer/features/account/components/*.tsx, apps/customer/features/account/hooks/*.ts]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/account/**]
  ios: []
---

# Cuenta

| | |
|---|---|
| **Tarea de la persona** | Ver y completar su perfil, administrar sus direcciones y el interruptor de avisos, pedir ayuda, leer lo legal y salir o borrar la cuenta. |
| **Se llega desde** | La barra inferior, «Cuenta»; el aviso de perfil incompleto en el checkout. |
| **Se sale hacia** | «Verificar»: `acceso/celular`. Una dirección o «+ Agregar dirección»: `direcciones/mapa` y `direcciones/elegir-direccion`. «Ayuda por WhatsApp»: el soporte. «Términos y condiciones» y «Privacidad»: la web, en el navegador. «Cerrar sesión»: el Inicio como invitado. «Eliminar mi cuenta»: la pantalla de borrado. La barra inferior: las otras pestañas. |

Es la pestaña «Cuenta» de la barra inferior. Los tableros son `Cuenta` (perfil completo) y `Cuenta-incompleta` (faltan pasos).

## Contenido, de arriba abajo

1. Título «Cuenta».
2. Tarjeta de perfil: inicial en círculo, nombre, correo con el ícono de Google y el celular con la insignia «Verificado».
3. «Mis direcciones»: una fila por dirección con su etiqueta (Casa, Trabajo), la insignia «Principal» en la
   predeterminada y la línea; al final, «+ Agregar dirección».
4. «Notificaciones»: un solo interruptor con la línea «Avisos de tus pedidos». Sin interruptor de promociones.
5. Ayuda y legal: «Ayuda por WhatsApp» (soporte general; dentro de un pedido es «Ayuda con este pedido»), «Términos y
   condiciones» y «Privacidad».
6. Sesión: «Cerrar sesión» en este dispositivo y, aparte, «cerrar en todos»; y, con menos peso, «Eliminar mi cuenta».
7. Versión de la app, tomada del build.
8. Barra inferior fija: «Inicio» · «Entregas» · «Pedidos» · «Cuenta» (activa).

### Variante `Cuenta-incompleta`

Sin celular verificado y sin direcciones, arriba aparece la tarjeta **«Completa tu perfil»** con un botón por paso
pendiente («Verifica tu celular» con «Verificar», y agregar una dirección). «Mis direcciones» dice «Aún no tienes
ninguna.». Al completar un paso, su círculo se marca con un rebote leve y la fila se tacha; al completar todos, la
tarjeta se contrae y desaparece.

### Borrar la cuenta

Pantalla aparte, sin vuelta atrás: explica qué se elimina, qué se conserva sin el nombre de la persona y cuándo no se
puede todavía; pide escribir `BORRAR` y recién entonces habilita «Borrar mi cuenta definitivamente».

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Cargando | «Cargando» | CUS-ACC-001 |
| Error al cargar | «Sin conexión. Revisa tu internet e inténtalo de nuevo.» o «Algo salió mal. Inténtalo de nuevo.» y «Reintentar» | CUS-ACC-001 |
| Perfil sin nombre | «Falta tu nombre» · «Completa tu perfil para que el negocio y el motorizado sepan a quién entregar.» y «Completa tu perfil»; la hoja se abre sola la primera vez | CUS-ACC-007, CA-ACC-P1 |
| Celular sin verificar | «Falta verificar tu teléfono para pedir» y «Verifica tu celular» con «Verificar» | CUS-ACC-001, CUS-ACC-007 |
| Celular verificado | «Verificado»; «Cambiar número» | CUS-ACC-001 |
| Sin direcciones | «Aún no tienes ninguna.» | CUS-ACC-006 |
| Dirección sin punto en el mapa | «Sin ubicación» · «Sin punto en el mapa. Márcalo para que el motorizado no se pierda.» | CUS-ACC-002 |
| Avisos desactivados | Interruptor apagado; con el permiso del sistema denegado, el interruptor lleva a Ajustes | CUS-ACC-005, CA-ACC-P2 |
| Sesión terminada por otra cuenta | La pantalla se cierra sin tocar la sesión nueva | CUS-AUT-013 |
| Borrar con pedido en curso | «Si tienes un pedido en curso, o una apelación o devolución sin resolver, tienes que esperar a que termine.»; la sesión sigue abierta | CUS-AUT-017, CA-ACC-04 |
| Borrar: escribir | El botón está deshabilitado hasta escribir `BORRAR` (sin importar mayúsculas ni espacios) | CUS-AUT-017, CA-ACC-P3 |
| Cuenta borrada | «Tu cuenta fue borrada», en la portada y solo si la sesión que la borró sigue siendo la actual | CUS-AUT-017, CA-ACC-05 |

## Movimiento

La pantalla desplaza; la barra inferior es lo único fijo. Al abrir, las tarjetas entran en cascada (fundido y subida de
8 px en 200 ms, 40 ms entre cada una). El interruptor desliza la perilla 200 ms con un rebote leve y una vibración corta.
Botones: escala 0,97. La dirección principal destella suave al volver de editarla. Con «reducir movimiento», todo es
instantáneo.

## Pendiente

- Hoy Android no tiene barra inferior: Cuenta es una pantalla a la que se llega desde el Inicio, y lista «Mis pedidos»
  dentro de ella; en el diseño es otra pestaña. Lo decide la capacidad de navegación, no esta ficha.
- No hay tablero de cómo se edita el nombre (CUS-AUT-014); el código lo valida con el largo y los caracteres del contrato.
- «Eliminar mi cuenta» (diseño) se llama «Borrar mi cuenta» en el código; el texto final está sin decidir.
- ¿La dirección «Principal» se cambia desde esta lista? El diseño solo la marca; la capacidad `direcciones` ya permite elegirla.
- «Cambiar número» y el aviso del número en otra cuenta no están en el tablero (`acceso/celular`).
