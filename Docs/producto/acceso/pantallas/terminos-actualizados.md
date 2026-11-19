---
canvas: [Terminos-actualizados]
requisitos: [CUS-AUT-021, CUS-AUT-023, CUS-AUT-027]
operaciones: [acceptTerms]
textos: []
tokens: []
codigo:
  web: []
  android: []
  ios: []
---

# Términos actualizados

| | |
|---|---|
| **Tarea de la persona** | Leer y aceptar la nueva versión de los Términos y la Privacidad para seguir pidiendo, o cerrar sesión. |
| **Se llega desde** | Una acción que lo exige (pedir una entrega o un pedido, o editar datos de Cuenta) cuando la versión vigente de los Términos o la Privacidad es distinta de la que la persona aceptó (con sesión), o cuando su aceptación es implícita. **No** al abrir la app. |
| **Se sale hacia** | «Aceptar y continuar»: sigue en la acción que la disparó, con la bolsa intacta (se guarda versión y fecha en UTC). «Cerrar sesión»: el Inicio como invitado. «Términos» y «Privacidad»: la web, en el navegador. |

El tablero `Terminos-actualizados` dibuja la ventana sobre el Inicio atenuado; en la app aparece sobre la acción que la
dispara. Esta pantalla **no existe todavía** en ninguna app: el servidor ya guarda `terms_acceptance` por versión.

## Contenido, de arriba abajo

Ventana centrada sobre la pantalla atenuada, sin forma de descartarla:

1. Título «Actualizamos los términos».
2. Texto «Léelos y acéptalos para seguir pidiendo.»
3. Enlaces «Términos» y «Privacidad».
4. Botón primario «Aceptar y continuar».
5. Acción secundaria «Cerrar sesión».

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Visible | La ventana; no se descarta tocando fuera ni con «atrás» | CUS-AUT-027, CA-AUT-P4 |
| Guardando | «Aceptar y continuar» con progreso; sin doble toque | CUS-AUT-021 |
| Error al guardar | «Algo salió mal. Inténtalo de nuevo.» o «Sin conexión. Revisa tu internet e inténtalo de nuevo.»; la ventana sigue | CUS-AUT-021 |
| Sin sesión | No aparece: un invitado acepta al entrar | CUS-AUT-020 |
| Pedido en curso, cancelación en los primeros minutos, soporte, cerrar sesión, consultar Cuenta | No aparece | CUS-AUT-027, CA-AUT-07 |
| Cuenta con aceptación implícita | Aparece en el siguiente acceso o pedido | CUS-AUT-023, CA-AUT-08 |
| Versión obsoleta de la app (426) | Prevalece «Actualiza la app» | |

## Movimiento

Entra con fundido y escala de 0,96 a 1 en 200 ms. Con «reducir movimiento»: aparece sin animación.

## Pendiente

- Qué cambio es «sustancial» y obliga a reaceptar lo decide Jesús con asesoría legal (decisión 3 del PR).
- La vigencia de los Términos v3 es el 15 de diciembre de 2026: ¿la ventana sale desde esa fecha o desde que se publican?
- Falta una operación que diga la versión vigente y la última aceptada por la persona, y un error estructurado del
  servidor que dispare la ventana sin perder la bolsa; el cliente envía la versión que mostró (defecto 3).
- Texto del aviso por notificación: sin redactar.
