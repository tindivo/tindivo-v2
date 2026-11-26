# Pruebas de punta a punta de la app Android del cliente (Maestro)

Maestro maneja la app instalada como lo haría una persona: toca textos que ve en pantalla. Los flujos no usan `testTag`:
se apoyan en los textos de `apps/android/customer/src/main/res/values/strings.xml`. Si cambias un texto, cambia el flujo.

> Estado (2026-11-26): `flows/invitado-hasta-identificacion.yaml` corrió en el emulador `tindivo_phone` (Pixel 7,
> Android 15 con Google Play) con el APK dev de la rama: EXIT=0. Es el único flujo que hay aquí. Los flujos que
> necesitan una cuenta de Google (Mis pedidos, pedido contraentrega, pedido prepago hasta el comprobante) se
> sacaron hasta que haya una cuenta de prueba en el emulador y se puedan ejecutar y corregir: estaban sin ejecutar y
> sin cotejar con la app actual.

> Trampa medida: la app expone los botones con la `content-desc` completa (por ejemplo «Ver mi bolsa, 1 unidad · S/ 25.00»)
> y Maestro exige que el regex coincida **entero**. Por eso el flujo usa `"Ver mi bolsa.*"` y
> `"Continuar(?! con| sin).*"` (este último no toca «Continuar con Google» ni «Continuar sin ubicación»).

## Requisitos

| Qué | Cómo |
|---|---|
| Maestro CLI | <https://maestro.mobile.dev> (`maestro --version`). Necesita Java 17+. |
| Dispositivo | Emulador `tindivo_phone` (Android 15, Google Play) o un dispositivo por USB con depuración activada (`adb devices`). |
| APK de staging | `cd apps/android && ./gradlew :customer:assembleDevDebug`. Paquete: `com.tindivo.customer.dev` (apunta a `tindivo-dev`). |
| Datos en staging | Negocio abierto hoy «La Florencia E2E» con el plato «Medio pollo». |

Nunca contra producción: la variante `prod` (`com.tindivo.customer`) no se prueba con Maestro.

## Cómo correrlo (Git Bash, emulador)

Si hay otro dispositivo por adb (`<serial-de-otro-dispositivo>`), no lo toques: usa siempre `--device emulator-5554`.

```bash
export MSYS_NO_PATHCONV=1
SDK="$(cygpath -u "$LOCALAPPDATA")/Android/Sdk"
export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
export JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"
export PATH="$HOME/tools/maestro-dl/maestro/bin:$SDK/emulator:$SDK/platform-tools:$PATH"

# 1. Emulador (el primer arranque tarda minutos; añade -no-window para ir sin ventana)
emulator -avd tindivo_phone -no-snapshot -no-audio -gpu swiftshader_indirect &
adb -s emulator-5554 wait-for-device
until [ "$(adb -s emulator-5554 shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 5; done

# 2. APK dev e instalación (desde la raíz del repo)
(cd apps/android && ./gradlew :customer:assembleDevDebug)
adb -s emulator-5554 install -r apps/android/customer/build/outputs/apk/dev/debug/customer-dev-debug.apk

# 3. Flujo (tarda más de 2 minutos: sin tope de tiempo)
cd apps/android/maestro
maestro --device emulator-5554 test --test-output-dir ../../../scratch/maestro-<fecha> flows/invitado-hasta-identificacion.yaml

# Apagar
adb -s emulator-5554 emu kill
```

El flujo empieza con `clearState`: borra los datos de la app dev en el emulador (y cierra la sesión si la había).

## Qué cubre

| Archivo | Cubre | Crea datos |
|---|---|---|
| `flows/invitado-hasta-identificacion.yaml` | Sin sesión: portada → carta → plato → bolsa → «Entra para pedir»; volver conserva la bolsa. | No |

## Lo que Maestro no cubre bien: prueba MANUAL

1. **Push real (FCM):** que llegue el aviso con la app cerrada y en segundo plano, y que el toque abra el pedido correcto.
2. **Google Sign-In real:** el selector de cuentas es de Google Play services.
3. **Verificación de celular por SMS:** requiere un código real.
4. **Cámara/galería del comprobante:** elegir captura, vista previa, «Cambiar», enviar, imagen pesada o ilegible.
5. **Sin conexión:** modo avión en el checkout, en el envío del comprobante y al reabrir la app.
6. **Actualización obligatoria (426):** con una versión por debajo de la mínima debe salir «Actualiza la app».
7. **Mapa y GPS:** pin de la dirección y permiso de ubicación (concedido, denegado, GPS apagado).

## Trampas conocidas

- `adb devices` vacío = nada que probar; Maestro no arranca emuladores solo.
- Si el emulador muestra «X isn't responding» en el primer arranque, ciérralo (va lento al inicio).
