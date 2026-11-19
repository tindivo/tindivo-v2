# Pruebas de punta a punta de la app Android del cliente (Maestro)

Maestro maneja la app instalada como lo haría una persona: toca textos que ve en pantalla. No hay `testTag`: los flujos
se apoyan en los textos de `apps/android/customer/src/main/res/values/strings.xml`. Si cambias un texto, cambia el flujo.

> Estado (2026-11-19): hay 8 flujos en `flows/`, escritos contra los textos de `strings.xml`. **Ninguno se ha corrido
> en CI ni en un emulador desde que se añadieron los cuatro nuevos**: en el PC del dueño no hay SDK de Android,
> emulador ni Maestro, y los flujos con sesión necesitan una cuenta de Google ya añadida al dispositivo. Todos están
> `NO_EJECUTADO` salvo que una corrida posterior diga lo contrario. En CI hay una propuesta que corre solo el del
> invitado (`.github/workflows/android-maestro.yml`, solo a mano, sin probar).

## Requisitos

| Qué | Cómo |
|---|---|
| Maestro CLI | <https://maestro.mobile.dev> (`maestro --version`). Necesita Java 17+. |
| Dispositivo | Tablet o teléfono por USB con depuración activada (`adb devices` lo lista), o un emulador con Google Play (para Google Sign-In). |
| SDK Android | `ANDROID_HOME` apuntando a tu SDK (en Windows suele estar en `%LOCALAPPDATA%\Android\Sdk`; puede no estar definido: exportarlo). |
| APK de staging | `cd apps/android && ./gradlew :customer:assembleDevDebug`, luego `ls customer/build/outputs/apk/dev/debug/` y `adb install -r` con ese único APK (un comodín que case con varios archivos rompe `adb`). Paquete: `com.tindivo.customer.dev` (apunta a `tindivo-dev`). |
| Datos en staging | Negocio abierto hoy «La Florencia E2E» con el plato «Medio pollo»; una cuenta Google de prueba ya añadida al dispositivo, con **celular verificado** (el SMS no se automatiza). |

Nunca contra producción: la variante `prod` (`com.tindivo.customer`) no se prueba con Maestro.

## Cómo correrlo

```bash
cd apps/android/maestro
export ANDROID_HOME=<ruta-a-tu-sdk>
maestro --device <serial> test -e GOOGLE_EMAIL=<cuenta-de-prueba> \
  --test-output-dir ../../../scratch/maestro-<fecha> flows/<flujo>.yaml
```

Variables opcionales: `NEGOCIO`, `PLATO`, `NOMBRE_CLIENTE`. Los flujos no usan `clearState` (salvo el del invitado):
la sesión de Google persiste entre corridas.

## Qué cubre cada flujo

| Archivo | Cubre | Crea datos |
|---|---|---|
| `flows/invitado-hasta-identificacion.yaml` | Sin sesión: portada → carta → plato → bolsa → «Entra para pedir»; volver conserva la bolsa. | No |
| `flows/pedido-contraentrega.yaml` | Negocio abierto → plato → bolsa → checkout (hojas de nombre y dirección si faltan) → Efectivo → Confirmar → seguimiento inicial («Pedido recibido»). | 1 pedido en `tindivo-dev` |
| `flows/pedido-prepago-hasta-comprobante.yaml` | Igual, con «Yape o Plin adelantado»; espera a que el negocio acepte y verifica la pantalla «Paga tu pedido» / «Subir captura». | 1 pedido en `tindivo-dev` |
| `flows/cancelar-pedido.yaml` | Pide en efectivo y cancela dentro de la ventana («Cancelaste tu pedido»). | 1 pedido (queda cancelado) |
| `flows/recojo-hasta-pago.yaml` | Checkout con «Recojo»: sin domicilio, con «Punto de recojo». No confirma. | No |
| `flows/mis-pedidos.yaml` | Mi cuenta → Mis pedidos → historial sin error de carga. | No |
| `flows/entregas-portada-y-solicitud.yaml` | Portada de Tindivo Entregas → «Pedir una entrega» → formulario. No crea nada. | No |
| `flows/borrar-cuenta-hasta-confirmar.yaml` | Mi cuenta → «Borrar mi cuenta» → pantalla de confirmación. Se detiene antes de borrar. | No |
| `subflows/` | `identificarse-google`, `agregar-plato-a-bolsa`, `checkout-hasta-pago`: piezas reutilizables. No se lanzan solos. | — |

## Cómo se cierra el ciclo de un pedido hecho por la app

Maestro solo maneja la app del cliente. Para que el negocio valide y acepte y el motorizado entregue, hoy se hace a
mano desde sus apps. El script `scripts/e2e/flujo-completo.ts` (`pnpm e2e:todo`) lleva por la API REST pedidos que él
mismo crea, con cuentas e2e; **no continúa un pedido nacido en la app**. Para eso haría falta un modo
`--order-id`/`--short-id` y que la cuenta de Google de prueba corresponda a un cliente que el script conozca: está en
la lista de pendientes de `Docs/trabajo/e2e/escenarios.md`.

## Lo que Maestro no cubre bien: prueba MANUAL

1. **Push real (FCM):** que llegue el aviso con la app cerrada y en segundo plano, y que el toque abra el pedido correcto.
2. **Google Sign-In real:** el selector de cuentas es de Google Play services; los flujos asumen la sesión ya iniciada.
3. **Verificación de celular por SMS:** requiere un código real.
4. **Cámara/galería del comprobante:** elegir captura, vista previa, «Cambiar», enviar, imagen pesada o ilegible.
5. **Sin conexión:** modo avión en el checkout («Sin conexión…»), en el envío del comprobante y al reabrir la app.
6. **Actualización obligatoria (426):** con una versión por debajo de la mínima debe salir «Actualiza la app».
7. **Mapa y GPS:** pin de la dirección y permiso de ubicación (concedido, denegado, GPS apagado).

## Trampas conocidas

- Los tests unitarios de Android fallan en la máquina Windows del dueño (DataStore); la CI sí pasa. No son señal local.
- `adb devices` vacío = nada que probar; Maestro no arranca emuladores solo.
- Un cliente solo puede tener un pedido activo por negocio: un pedido colgado bloquea la siguiente corrida.
