# Pruebas de punta a punta de la app Android del cliente (Maestro)

Maestro maneja la app instalada como lo haría una persona: toca textos que ve en pantalla. Los flujos no usan `testTag`:
se apoyan en los textos de `apps/android/customer/src/main/res/values/strings.xml`. Si cambias un texto, cambia el flujo.

> Estado (2026-11-26): `flows/invitado-hasta-identificacion.yaml` corrió en el emulador `tindivo_phone` (Pixel 7,
> Android 15 con Google Play) con el APK dev de la rama: EXIT=0. Los otros 7 flujos de `flows/` necesitan una cuenta de Google de prueba ya añadida al
> emulador: siguen `NO_EJECUTADO` y sin cotejar con la app actual (pueden fallar por la trampa de abajo) hasta que haya
> esa cuenta y se corran y corrijan.

> Trampa medida: la app expone los botones con la `content-desc` completa (por ejemplo «Ver mi bolsa, 1 unidad · S/ 25.00»)
> y Maestro exige que el regex coincida **entero**. Por eso el flujo usa `"Ver mi bolsa.*"` y
> `"Continuar(?! con| sin).*"` (este último no toca «Continuar con Google» ni «Continuar sin ubicación»).

## Requisitos

| Qué | Cómo |
|---|---|
| Maestro CLI | <https://maestro.mobile.dev> (`maestro --version`). Necesita Java 17+. |
| Dispositivo | Emulador `tindivo_phone` (Android 15, Google Play) o un dispositivo por USB con depuración activada (`adb devices`). |
| APK de staging | `cd apps/android && ./gradlew :customer:assembleDevDebug`. Paquete: `com.tindivo.customer.dev` (apunta a `tindivo-dev`). |
| Datos en staging | Negocio abierto hoy «La Florencia E2E» con el plato «Medio pollo» (salen de `apps/api/scripts/e2e-fixtures.ts` y `seed-world.ts`). Si el negocio está cerrado, el flujo falla en la portada: abre su horario o espera a su turno. Los flujos con sesión piden además una cuenta Google de prueba ya añadida al dispositivo, con **celular verificado** (el SMS no se automatiza), y `-e GOOGLE_EMAIL=<cuenta-de-prueba>`; opcionales `NEGOCIO`, `PLATO`, `NOMBRE_CLIENTE`. |

Nunca contra producción: la variante `prod` (`com.tindivo.customer`) no se prueba con Maestro.

## Cómo correrlo (Git Bash, emulador)

Si hay otro dispositivo por adb (`<serial-de-otro-dispositivo>`), no lo toques: usa siempre `--device emulator-5554`.

```bash
export MSYS_NO_PATHCONV=1
SDK="$(cygpath -u "$LOCALAPPDATA")/Android/Sdk"
export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
export JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"
# Ajusta la ruta de Maestro a donde lo instalaste (comprueba con `command -v maestro`; el instalador oficial usa ~/.maestro/bin)
export PATH="$HOME/.maestro/bin:$SDK/emulator:$SDK/platform-tools:$PATH"

# 1. Emulador (el primer arranque tarda minutos; añade -no-window para ir sin ventana)
emulator -avd tindivo_phone -no-snapshot -no-audio -gpu swiftshader_indirect &
adb -s emulator-5554 wait-for-device
until [ "$(adb -s emulator-5554 shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 5; done

# 2. APK dev e instalación (desde la raíz del repo)
(cd apps/android && ./gradlew :customer:assembleDevDebug)
adb -s emulator-5554 install -r apps/android/customer/build/outputs/apk/dev/debug/customer-dev-debug.apk

# 3. Flujo (tarda más de 2 minutos: sin tope de tiempo)
cd apps/android/maestro
maestro --device emulator-5554 test --test-output-dir "../../../scratch/maestro-$(date +%F)" flows/invitado-hasta-identificacion.yaml

# Apagar
adb -s emulator-5554 emu kill
```

El flujo empieza con `clearState`: borra los datos de la app dev en el emulador (y cierra la sesión si la había).

## Qué cubre

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
2. **Google Sign-In real:** el selector de cuentas es de Google Play services.
3. **Verificación de celular por SMS:** requiere un código real.
4. **Cámara/galería del comprobante:** elegir captura, vista previa, «Cambiar», enviar, imagen pesada o ilegible.
5. **Sin conexión:** modo avión en el checkout, en el envío del comprobante y al reabrir la app.
6. **Actualización obligatoria (426):** con una versión por debajo de la mínima debe salir «Actualiza la app».
7. **Mapa y GPS:** pin de la dirección y permiso de ubicación (concedido, denegado, GPS apagado).

## Trampas conocidas

- Con `--device emulator-5554` Maestro no arranca el emulador: arráncalo antes (paso 1). `adb devices` vacío = nada que probar.
- Si el emulador muestra «X isn't responding» en el primer arranque, ciérralo (va lento al inicio).
- Un cliente solo puede tener un pedido activo por negocio: un pedido colgado bloquea la siguiente corrida.
