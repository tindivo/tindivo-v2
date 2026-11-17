# ACC · Cuenta

> Maquetas: tableros `Cuenta` (perfil completo) y `Cuenta-incompleta` (faltan pasos). Es la pestaña «Cuenta» de la barra inferior.

| | |
|---|---|
| **Tarea de la persona** | Ver y completar su perfil, administrar sus direcciones y el interruptor de notificaciones, pedir ayuda, leer lo legal y salir o borrar la cuenta. |
| **Se llega desde** | Barra inferior → «Cuenta». Aviso de perfil incompleto en el checkout. |
| **Se sale hacia** | «Verificar» → `AUT-celular`. Una dirección o «+ Agregar dirección» → hoja `ADR-mapa` / `ADR-elegir-direccion`. «Ayuda por WhatsApp» → WhatsApp de soporte. «Términos y condiciones» y «Privacidad» → web en el navegador. «Cerrar sesión» → `CAT-inicio` como invitado. «Eliminar mi cuenta» → pantalla de borrado (confirmar escribiendo `BORRAR`). Barra inferior → otras pestañas. |
| **Requisitos** | CUS-ACC-001, 002, 004 · CUS-AUT-007, 013, 014, 015, 017 · CUS-ADR-009, 010 · CUS-SUP-001, 002, 003 · (requisito nuevo: interruptor único «Notificaciones» con «Pedidos y novedades») · (requisito nuevo: tarjeta «Completa tu perfil» con dos pasos que se tachan) |
| **Endpoints** | `GET /customer/profile` · `PUT /customer/profile` (nombre) · `GET /customer/addresses` · `PATCH /customer/addresses/{id}` (predeterminada) · `DELETE /customer/account` · `POST /customer/phone/send-code`, `POST /customer/phone/verify` · (endpoint nuevo: guardar la preferencia de notificaciones; hoy no existe) |
| **Estado** | Android: 🟡 «Mi cuenta» con nombre, estado del teléfono, «Mis direcciones», «Mis pedidos», cerrar sesión y «Borrar mi cuenta»; sin interruptor de notificaciones, sin avatar ni correo, sin enlaces legales ni ayuda · iOS: ⬜ |

## Contenido, de arriba abajo

1. **Título:** «Cuenta».
2. **Tarjeta de perfil:** inicial en círculo («M»), nombre «María Quispe», correo con el ícono de Google («G»,
   «maria.quispe@gmail.com») y el celular «987 654 321» con la insignia «Verificado».
3. **«Mis direcciones»:** una fila por dirección con su etiqueta («Casa», «Trabajo»), la insignia «Principal» en la
   predeterminada y la línea («Jr. Bolognesi 245»). Al final «+ Agregar dirección».
4. **«Notificaciones»:** un solo interruptor con la línea «Pedidos y novedades» (decisión de Jesús: un solo permiso, como Yape; cubre estados del pedido y novedades).
5. **Ayuda y legal:** «Ayuda por WhatsApp» · «Términos y condiciones» · «Privacidad».
6. **Sesión:** «Cerrar sesión» y, aparte y con menos peso, «Eliminar mi cuenta».
7. **Versión:** «Tindivo 1.0.0».
8. **Barra inferior fija:** «Inicio» · «Entregas» · «Pedidos» · «Cuenta» (activa).

### Variante `Cuenta-incompleta`

Sin celular verificado y sin direcciones, arriba aparece la tarjeta **«Completa tu perfil»** con dos pasos: «Verifica tu celular»
con el botón «Verificar» y el segundo paso (agregar una dirección). «Mis direcciones» dice «Aún no tienes ninguna.» y
«+ Agregar dirección». Al completar un paso, su círculo se marca con un pequeño rebote y la fila se tacha; al completar los dos,
la tarjeta se contrae y desaparece.

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Cargando | «Cargando» | CUS-ACC-001 |
| Error al cargar | «Sin conexión. Revisa tu internet e inténtalo de nuevo.» / «Algo salió mal. Inténtalo de nuevo.» + «Reintentar» | CUS-ACC-001 |
| Perfil sin nombre | «Falta tu nombre» · «Completa tu perfil para que el negocio y el motorizado sepan a quién entregar.» + «Completa tu perfil»; se abre solo la primera vez | CUS-AUT-010 |
| Celular sin verificar | «Falta verificar tu teléfono para pedir» + «Verificar mi número» (código) / «Verifica tu celular» + «Verificar» (maqueta) | CUS-AUT-007, CUS-AUT-015 |
| Celular verificado | «Teléfono verificado» (código) / «Verificado» (maqueta); «Cambiar número» | CUS-AUT-007 |
| Sin direcciones | «Aún no tienes ninguna.» (maqueta) / «Añade tu primera dirección» (código) | CUS-ADR-010 |
| Dirección sin punto en el mapa | «Sin ubicación» · «Sin punto en el mapa. Márcalo para que el motorizado no se pierda.» | CUS-ADR-003 |
| Notificaciones desactivadas | Interruptor apagado; si el permiso del sistema está denegado, el interruptor lleva a Ajustes | (requisito nuevo: notificaciones) |
| Sesión terminada por otra cuenta | La pantalla se cierra sin tocar la sesión nueva | CUS-AUT-012 |
| Borrar con pedido en curso | «Si tienes un pedido en curso, o una apelación o devolución sin resolver, tienes que esperar a que termine.» | CUS-AUT-017 |
| Cuenta borrada | «Tu cuenta fue borrada» en la portada, solo si la sesión que la borró sigue siendo la actual | CUS-AUT-017 |

## Criterios de aceptación propios de la pantalla

```
CA-ACC-P1 · «Completa tu perfil» se achica al completarse
  Dado una cuenta con celular sin verificar y sin direcciones
  Cuando la persona verifica su celular
  Entonces el paso «Verifica tu celular» se marca y se tacha con un rebote
  Y al agregar la primera dirección la tarjeta se contrae y desaparece

CA-ACC-P2 · Un solo interruptor de notificaciones
  Dado la sección «Notificaciones»
  Entonces hay un único interruptor con «Pedidos y novedades»
  Y no existe un interruptor aparte de «Avisos y novedades»

CA-ACC-P3 · «Eliminar mi cuenta» exige confirmar
  Dado la persona en «Eliminar mi cuenta»
  Entonces el botón de borrado está deshabilitado hasta escribir exactamente BORRAR
  Y borrar no se puede deshacer ni deja volver a la sesión anterior
```

## Movimiento

La pantalla desplaza; la barra inferior es lo único fijo. Al abrir, las tarjetas entran en cascada (fundido + subida 8 px, 200 ms,
40 ms entre cada una). El interruptor desliza la perilla 200 ms con rebote leve y vibración corta. Botones: escala 0,97. La
dirección principal destella suave al volver de editarla. Con «reducir movimiento» todo es instantáneo.

## Pendiente (va a `decisiones-abiertas.md`)

- **Maqueta ↔ código:** el código no muestra correo ni inicial ni el ícono de Google; no tiene interruptor de notificaciones, ayuda por WhatsApp ni enlaces legales dentro de la cuenta.
- **Maqueta ↔ código:** «Eliminar mi cuenta» (maqueta) frente a «Borrar mi cuenta» (código). «Cerrar sesión» está en el código; hay un «cerrar en todos» (CUS-AUT-013) que la maqueta no dibuja.
- **Maqueta ↔ código:** el código lista «Mis pedidos» dentro de Cuenta; en la maqueta es otra pestaña.
- **Maqueta ↔ código:** el nombre sale de «¿Cómo te llamas?» (máx. 50 caracteres) en el código; la maqueta no dibuja cómo se edita el nombre (CUS-AUT-014).
- «Cambiar número» y el aviso del número en otra cuenta no están en la maqueta (hoy: «Este número está en otra cuenta»).
- ¿La dirección «Principal» se puede cambiar desde esta lista (CUS-ADR-009)? La maqueta solo la marca.
- La versión «Tindivo 1.0.0» es la de la maqueta: debe salir del build.
