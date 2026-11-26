# Pruebas de punta a punta de la app Android del cliente (Maestro)

Maestro maneja la app instalada como lo haría una persona: toca textos que ve en pantalla. No hay `testTag`: los flujos
se apoyan en los textos de `apps/android/customer/src/main/res/values/strings.xml`. Si cambias un texto, cambia el flujo.

> Estado (2026-11-25): `invitado-hasta-identificacion` corrió en el emulador `tindivo_phone` (Pixel 7, Android 15 con
> Google Play) con el APK dev de esta rama: EXIT=0. Los otros tres (`mis-pedidos`, `pedido-contraentrega`,
> `pedido-prepago-hasta-comprobante`) están `NO_EJECUTADO`: exigen una cuenta de Google de prueba añadida a mano al
> dispositivo, con celular ya verificado en `tindivo-dev` (el SMS no se automatiza). Nadie pone contraseñas por Jesús.

> Trampa medida: la app expone los botones con la `content-desc` completa (por ejemplo «Ver mi bolsa, 1 unidad · S/ 25.00»)
> y Maestro exige que el regex coincida **entero**. Por eso los flujos usan `"Ver mi bolsa.*"` y `"Continuar.*"`.

## Requisitos

| Qué | Cómo |
|---|---|
| Maestro CLI | <https://maestro.mobile.dev> (`maestro --version`). Necesita Java 17+. |
| Dispositivo | Emulador `tindivo_phone` (recomendado), o tablet o teléfono por USB con depuración activada (`adb devices` lo lista), o un emulador con Google Play (para Google Sign-In). |
| SDK Android | `ANDROID_HOME=C:\Users\Jesus\AppData\Local\Android\Sdk` (no está definido en el entorno; exportarlo). |
| APK de staging | `cd apps/android && ./gradlew :customer:assembleDevDebug`, luego `adb install -r customer/build/outputs/apk/dev/debug/*.apk`. Paquete: `com.tindivo.customer.dev` (apunta a `tindivo-dev`). |
| Datos en staging | Negocio abierto hoy «La Florencia E2E» con el plato «Medio pollo»; una cuenta Google de prueba ya añadida al dispositivo, con **celular verificado** (el SMS no se automatiza). |

Nunca contra producción: la variante `prod` (`com.tindivo.customer`) no se prueba con Maestro.

## Cómo correrlo (Git Bash, emulador)

Hay una tablet física por adb (`R52R80LCQWJ`): usa siempre `--device emulator-5554` y no la toques.

```bash
export MSYS_NO_PATHCONV=1
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" ANDROID_SDK_ROOT="$LOCALAPPDATA/Android/Sdk"
export JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"
export PATH="$HOME/tools/maestro-dl/maestro/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"

# 1. Emulador (el primer arranque tarda minutos; añade -no-window para ir sin ventana)
emulator -avd tindivo_phone -no-snapshot -no-audio -gpu swiftshader_indirect &
until [ "$(adb -s emulator-5554 shell getprop sys.boot_completed | tr -d '')" = 1 ]; do sleep 5; done

# 2. APK dev e instalación
(cd apps/android && ./gradlew :customer:assembleDevDebug)
adb -s emulator-5554 install -r apps/android/customer/build/outputs/apk/dev/debug/customer-dev-debug.apk

# 3. Flujo sin cuenta (tarda más de 2 minutos: sin tope de tiempo)
cd apps/android/maestro
maestro --device emulator-5554 test --test-output-dir ../../../scratch/maestro-<fecha> flows/invitado-hasta-identificacion.yaml

# 4. Flujos con Google (tras añadir la cuenta de prueba al emulador y entrar una vez en la app)
maestro --device emulator-5554 test -e GOOGLE_EMAIL=<cuenta-de-prueba>   --test-output-dir ../../../scratch/maestro-<fecha> flows/<flujo>.yaml

# Apagar
adb -s emulator-5554 emu kill
```

Cuenta de Google en el emulador (lo hace Jesús a mano): Ajustes > Contraseñas y cuentas > Añadir cuenta > Google, con una
cuenta de prueba (no la personal); luego abre la app Tindivo y entra con Google una vez. No uses `-wipe-data`: la cuenta
vive en el disco del AVD. No corras `invitado-...` antes de los demás: hace `clearState` y cierra la sesión. Los flujos de
pedido crean 1 pedido en `tindivo-dev`.

Variables opcionales: `NEGOCIO`, `PLATO`, `NOMBRE_CLIENTE`. Los flujos no usan `clearState` (salvo el del invitado):
la sesión de Google persiste entre corridas.

## Qué cubre cada flujo

| Archivo | Cubre | Crea datos |
|---|---|---|
| `flows/invitado-hasta-identificacion.yaml` | Sin sesión: portada → carta → plato → bolsa → «Entra para pedir»; volver conserva la bolsa. Corrido en el emulador (EXIT=0). | No |
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
- Si el emulador muestra «X isn't responding» en el primer arranque, ciérralo (va lento al inicio).
- Un cliente solo puede tener un pedido activo por negocio: un pedido colgado bloquea la siguiente corrida.
