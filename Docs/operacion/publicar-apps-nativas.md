# Publicar las apps nativas

> Verificado: 2026-10-13 · entorno: `develop@55d8eeba` · solo contrastado con las decisiones D-45, D-47 y D-48 del plan móvil; ningún paso se ha ejecutado todavía (no hay primera publicación)

Runbook de CLI-14 y OPS-6. Lo usan Jesús y los agentes. Alcance, fases y decisiones de las apps: `Docs/planes/movil/`. Una app instalada no se revierte: este procedimiento existe para no tener que hacerlo.

## Antes de cada versión

1. **Contrato**: `oasdiff` sin rupturas contra la versión publicada anterior; los fixtures de compatibilidad futura pasan en ambas apps (CLI-2, TST-5).
2. **Mínimos de sistema** (D-47): Android 8 (API 26) e iOS 17; no se baja el objetivo de despliegue sin una decisión nueva.
3. **Versión**: `MARKETING_VERSION` (iOS) y `versionName` (Android) semánticas; el número de build y el `versionCode` los pone la CI.
4. **Tiendas**: si cambió qué datos se recogen, actualizar los datos de privacidad de App Store Connect y el formulario de seguridad de datos de Google Play.
5. **Kill switch**: toda función nueva y arriesgada sale detrás de un *flag* de `GET /api/v1/config` (CLI-4).

## iOS

1. En la Mac, con Xcode 26 (los modelos de Swift se compilan en la CI a diario, no en cada PR: D-48, así que compila y prueba en local antes de archivar): Product › Archive con el esquema de producción.
2. Subir a App Store Connect y distribuir por TestFlight al grupo interno.
3. Probar el flujo crítico de compra (TST-6) en un iPhone real.
4. Enviar a revisión con **liberación gradual** activada. El revisor entra con un **negocio de demostración** (D-45); el vídeo es solo de respaldo.
5. Vigilar *crashes* y errores durante 48 h. Si suben, pausar la liberación gradual.

## Android

1. `./gradlew :app:bundleProdRelease`: el AAB se firma con la clave de subida; Play App Signing firma la versión final.
2. Subir a la pista de pruebas internas y probar el flujo crítico en un Android real de gama baja.
3. En la ficha de Google Play, indicar las credenciales del negocio de demostración para el revisor (D-45). Publicar en producción con **despliegue escalonado**, por ejemplo 10 % → 50 % → 100 %.
4. Vigilar *crashes* y errores durante 48 h. Si suben, detener el despliegue.

### Inicio de sesión con Google en prodRelease (lista de comprobación)

El ID de cliente **web** de Google (`googleWebClientIdProd` en `apps/android/customer/build.gradle.kts`) ya está puesto; no es secreto y es **distinto** del que usa el sabor `dev` (`googleWebClientIdDev`): cada entorno tiene su cliente web y cada proyecto de Supabase acepta solo el suyo; la tarea `verificarGoogleIdsDistintos` falla si los dos IDs vuelven a ser iguales. La tarea `verificarGoogleIdProd` sigue activa: si el ID queda vacío, `prodRelease` no se empaqueta. Antes de publicar, comprueba a mano (medido en 2026-11-25 solo el valor del ID; el resto sigue sin comprobar):

- [ ] **Supabase prod** (`zpnipajgwfthxhdtzhly`): Authentication › Sign In / Providers › Google en **ON**, con el Client ID de prod (`484245553841-rj0glhkf…`) como único valor y su Secret, sin el de staging (`Docs/operacion/deploy.md` §2.1).
- [ ] **Supabase staging** (tindivo-dev, `jgziumvrtogguljhpdos`): Authentication › Sign In / Providers › Google con el Client ID de staging (`t6tjlljq…`) como único valor y su Secret, sin el de prod. Comprobado por captura el 2026-11-26.
- [ ] **Cliente web de Google** (Google Cloud Console › Credentials): en el cliente de prod (`rj0glhkf…`) está `https://zpnipajgwfthxhdtzhly.supabase.co/auth/v1/callback` y solo ese; el cliente de staging (`t6tjlljq…`) lleva únicamente el callback de tindivo-dev (`https://jgziumvrtogguljhpdos.supabase.co/auth/v1/callback`).
- [ ] **Clientes Android de Google** (mismo proyecto de Cloud, tipo Android): un cliente identifica **una** combinación de paquete y certificado, así que se registran **dos clientes separados**, ambos con el paquete `com.tindivo.customer`: uno con el **SHA-1 del certificado de release** (clave de subida) y otro con el **SHA-1 de App Signing de Play** (Play Console › Integridad de la aplicación). No se pone una huella en lugar de la otra ni las dos en un mismo cliente. Sin el cliente de App Signing, el inicio de sesión falla solo en las builds instaladas desde Play. El ID web que lleva la app (`serverClientId`) sigue siendo el del cliente **web**, no el de ninguno de estos.
- [ ] Prueba en un teléfono real con la build de pruebas internas de Play: «Continuar con Google» abre el selector de cuentas y entra.

## Si algo sale mal

- Apagar la función con su *kill switch*: Admin → Apps, interruptor de la función (`app_settings.client_features`, que sale en `GET /api/v1/config`; las apps muestran su `message`). Una función nueva y arriesgada se declara con una migración que añade su clave a `client_features.features` (el admin no crea claves); una clave que la app no encuentra = usa su valor por defecto compilado.
- Corregir y publicar una versión nueva por este mismo procedimiento.
- Si la versión rota impide usar la app, subir la versión mínima, para que las rotas reciban `426 client_upgrade_required`, cuando la corregida esté disponible al 100 % en la tienda. Subir la mínima se registra en `Docs/trabajo/decisiones-abiertas.md` (CLI-15).

## Claves y cuentas

- La clave de subida de Android, los certificados de Apple y la clave de APNs viven en el gestor de secretos, con respaldo fuera del repo (OPS-3).
- App Store Connect, Google Play Console y Firebase, con doble factor y códigos de recuperación guardados fuera del teléfono (OPS-10).
