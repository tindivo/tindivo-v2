# Pruebas de punta a punta de la app Android del cliente (Maestro)

Maestro maneja la app instalada como lo haría una persona: toca textos que ve en pantalla. No hay `testTag`: los flujos
se apoyan en los textos de `apps/android/customer/src/main/res/values/strings.xml`. Si cambias un texto, cambia el flujo.

> Estado (2026-11-16): los flujos están escritos y sus textos contrastados con `strings.xml`. **Solo
> `invitado-hasta-identificacion` se corrió en un dispositivo real** (capturas en `Docs/mobile-ux/capturas/actual/`).
> Los otros tres están `NO_EJECUTADO`: al escribirlos no había Maestro, emulador ni tablet en la máquina.

## Requisitos

| Qué | Cómo |
|---|---|
| Maestro CLI | <https://maestro.mobile.dev> (`maestro --version`). Necesita Java 17+. |
| Dispositivo | Tablet o teléfono por USB con depuración activada (`adb devices` lo lista), o un emulador con Google Play (para Google Sign-In). |
| SDK Android | `ANDROID_HOME=C:\Users\Jesus\AppData\Local\Android\Sdk` (no está definido en el entorno; exportarlo). |
| APK de staging | `cd apps/android && ./gradlew :customer:assembleDevDebug`, luego `adb install -r customer/build/outputs/apk/dev/debug/*.apk`. Paquete: `com.tindivo.customer.dev` (apunta a `tindivo-dev`). |
| Datos en staging | Negocio abierto hoy «La Florencia E2E» con el plato «Medio pollo»; una cuenta Google de prueba ya añadida al dispositivo, con **celular verificado** (el SMS no se automatiza). |

Nunca contra producción: la variante `prod` (`com.tindivo.customer`) no se prueba con Maestro.

## Cómo correrlo

```bash
cd apps/android/maestro
export ANDROID_HOME=/c/Users/Jesus/AppData/Local/Android/Sdk
maestro --device <serial> test -e GOOGLE_EMAIL=<cuenta-de-prueba> \
  --test-output-dir ../../../scratch/maestro-<fecha> flows/<flujo>.yaml
```

Variables opcionales: `NEGOCIO`, `PLATO`, `NOMBRE_CLIENTE`. Los flujos no usan `clearState` (salvo el del invitado):
la sesión de Google persiste entre corridas.

## Qué cubre cada flujo

| Archivo | Cubre | Crea datos |
|---|---|---|
| `flows/invitado-hasta-identificacion.yaml` | Sin sesión: portada → carta → plato → bolsa → «Entra para pedir»; volver conserva la bolsa. Corrido con capturas. | No |
| `flows/pedido-contraentrega.yaml` | Negocio abierto → plato → bolsa → checkout (hojas de nombre y dirección si faltan) → Efectivo → Confirmar → seguimiento inicial («Pedido recibido»). | 1 pedido en `tindivo-dev` |
| `flows/pedido-prepago-hasta-comprobante.yaml` | Igual, con «Yape o Plin adelantado»; espera a que el negocio acepte y verifica la pantalla «Paga tu pedido» / «Subir captura». | 1 pedido en `tindivo-dev` |
| `flows/mis-pedidos.yaml` | Mi cuenta → Mis pedidos → historial sin error de carga. | No |
| `subflows/` | `identificarse-google`, `agregar-plato-a-bolsa`, `checkout-hasta-pago`: piezas reutilizables. No se lanzan solos. | — |

## Pendiente de coordinación con #177 (`scripts/e2e/flujo-completo.ts`, rama `test/e2e-flujo-completo-api`)

El script hace de negocio y motorizado por API, pero **crea su propio pedido** con `cliente@e2e.local`; no continúa uno
hecho por la app. Para cerrar el ciclo (validar, aceptar, preparar, entregar) hace falta un modo
`--order-id`/`--short-id`, y que la cuenta Google de prueba de la app corresponda a un cliente que el script conozca. Los
puntos están marcados con `COORDINACION con #177` dentro de los flujos. En staging el script exige `--staging` y el
`cuentas.md` del seed; no usa SQL directo. Mientras tanto, el negocio acepta a mano desde su app.

## Lo que Maestro no cubre bien: prueba MANUAL

1. **Push real (FCM):** que llegue el aviso con la app cerrada y en segundo plano, y que el toque abra el pedido correcto.
2. **Google Sign-In real:** el selector de cuentas es de Google Play services; los flujos asumen la sesión ya iniciada.
3. **Verificación de celular por SMS:** requiere un código real.
4. **Cámara/galería del comprobante:** elegir captura, vista previa, «Cambiar», enviar, imagen pesada o ilegible.
5. **Sin conexión:** modo avión en el checkout («Sin conexión…»), en el envío del comprobante y al reabrir la app.
6. **Actualización obligatoria (426):** con una versión por debajo de la mínima debe salir «Actualiza la app».
7. **Mapa y GPS:** pin de la dirección y permiso de ubicación (concedido, denegado, GPS apagado).

## Trampas conocidas

- Los tests unitarios de Android fallan en esta máquina Windows (DataStore); la CI sí pasa. No son señal local.
- `adb devices` vacío = nada que probar; Maestro no arranca emuladores solo.
- Un cliente solo puede tener un pedido activo por negocio: un pedido colgado bloquea la siguiente corrida.
