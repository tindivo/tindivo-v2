# AUT · Términos actualizados

> **Decisiones de Jesús del 2026-11-17 que cambian esta pantalla** (donde choquen con el texto de abajo, manda esto):
> - La reaceptación se pide **al actuar** (pedir o editar datos de Cuenta), no al abrir la app, y nunca bloquea un pedido en curso, su cancelación en los primeros 2 min ni el soporte (CUS-AUT-027, que reemplaza a CUS-AUT-022). La maqueta dibuja la ventana sobre el Inicio; en la app aparece sobre la acción que la dispara, sin perder la bolsa.
> - «Se llega desde: Apertura de la app…» queda reemplazado por esto.

> Maqueta: tablero `Terminos-actualizados`: una ventana obligatoria sobre el Inicio atenuado.

| | |
|---|---|
| **Tarea de la persona** | Leer y aceptar la nueva versión de los Términos y la Privacidad para seguir pidiendo, o cerrar sesión. |
| **Se llega desde** | Apertura de la app cuando la versión vigente de Términos o Privacidad es distinta de la que la persona aceptó (con sesión). Aviso por notificación (decisión de Jesús). |
| **Se sale hacia** | «Aceptar y continuar» → `CAT-inicio` (se guarda versión y fecha UTC). «Cerrar sesión» → `CAT-inicio` como invitado. «Términos» y «Privacidad» → web en el navegador. |
| **Requisitos** | (requisito nuevo: reaceptación obligatoria cuando cambia la versión de Términos o Privacidad; tarea T1) · CUS-SUP-002 · CUS-AUT-006, 013 |
| **Endpoints** | `POST /customer/terms-acceptance` (versión) · (endpoint nuevo: versión vigente de Términos y Privacidad y última aceptada por la persona; ni `GET /public/config` ni `GET /customer/profile` la traen hoy, y la app la lleva fija en una constante `TERMS_VERSION`) |
| **Estado** | Android: ⬜ no existe · iOS: ⬜ |

## Contenido, de arriba abajo

Ventana centrada sobre el Inicio atenuado, sin forma de descartarla:

1. **Título:** «Actualizamos los términos».
2. **Texto:** «Léelos y acéptalos para seguir pidiendo.»
3. **Enlaces:** «Términos» y «Privacidad» (abren la web).
4. **Botón primario:** «Aceptar y continuar».
5. **Acción secundaria:** «Cerrar sesión».

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Visible | La ventana sobre el Inicio; no se descarta tocando fuera ni con «atrás» | (requisito nuevo) |
| Guardando | «Aceptar y continuar» con progreso; sin doble toque | (requisito nuevo) |
| Error al guardar | Mensaje «Algo salió mal. Inténtalo de nuevo.» o «Sin conexión. Revisa tu internet e inténtalo de nuevo.»; la ventana sigue | (requisito nuevo) |
| Sin sesión | No aparece (un invitado acepta al entrar, `AUT-entrar`) | CUS-AUT-001 |
| Cambia la versión con la app abierta | Aparece en el siguiente arranque o al volver a primer plano (a definir) | (requisito nuevo) |
| Versión obsoleta de la app (426) | Prevalece «Actualiza la app» | (requisito nuevo: actualización obligatoria) |

## Criterios de aceptación propios de la pantalla

```
CA-AUT-P4 · No se puede saltar
  Dado una versión de Términos distinta de la aceptada
  Cuando la persona abre la app
  Entonces ve «Actualizamos los términos» y no puede cerrarla con «atrás» ni tocando fuera
  Y las únicas salidas son «Aceptar y continuar» y «Cerrar sesión»

CA-AUT-P5 · Aceptar guarda versión y fecha
  Dado la ventana abierta
  Cuando la persona toca «Aceptar y continuar»
  Entonces se guarda la versión vigente y la fecha en UTC y se vuelve al Inicio

CA-AUT-P6 · Cerrar sesión no acepta nada
  Dado la ventana abierta
  Cuando toca «Cerrar sesión»
  Entonces no se registra aceptación y la app queda como invitado
```

## Movimiento

Entra con fundido y escala 0,96 a 1 en 200 ms. Con «reducir movimiento»: aparece sin animación.

## Pendiente (va a `decisiones-abiertas.md`)

- **Maqueta ↔ código:** no hay código; el servidor ya guarda `terms_acceptance(user_id, version)` único, pero la app no compara versiones al arrancar. La tarea de código es T1 de las decisiones de Jesús.
- Vigencia de los Términos v3: 15 de diciembre de 2026. ¿Se muestra desde esa fecha o desde que se publica?
- ¿Aparece antes de cualquier otra pantalla o sobre el Inicio? La maqueta lo dibuja sobre el Inicio.
- Texto del aviso por notificación («Actualizamos los términos»): sin redactar.
