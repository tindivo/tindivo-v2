---
canvas: [Cuenta, Onboarding-3-entrar]
requisitos: [CUS-SUP-001, CUS-SUP-002, CUS-SUP-003, CUS-SUP-004]
operaciones: [getPublicConfig]
textos: []
tokens: []
codigo:
  web: [apps/customer/app/terminos/page.tsx, apps/customer/app/privacidad/page.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/profile/ProfileScreen.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/account/AccountScreen.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/signin/SignInScreen.kt]
  ios: []
---

# Ayuda y legal

| | |
|---|---|
| **Tarea de la persona** | Escribir a Tindivo sin tener un pedido, leer los Términos y la Privacidad, ejercer sus derechos sobre sus datos y hacer un reclamo. |
| **Se llega desde** | La sección «Ayuda y legal» de la pestaña «Cuenta»; los enlaces junto a la casilla de la pantalla de entrada; la ventana de reaceptación de Términos. |
| **Se sale hacia** | «Ayuda por WhatsApp» → WhatsApp de soporte. «Términos y condiciones» y «Privacidad» → el documento legal (a dónde apunta, ver la decisión abierta del PR sobre D-27). |

No es una pantalla nueva: es una sección de «Cuenta» más dos enlaces en la entrada. La casilla de aceptación (CUS-AUT-020) y la ventana de reaceptación (CUS-AUT-027) son de la capacidad de acceso; aquí solo se define que sus enlaces son los mismos de «Cuenta».

## Contenido, de arriba abajo (sección de «Cuenta»)

1. **«Ayuda por WhatsApp»:** soporte general, sin pedido. Abre WhatsApp con un mensaje de saludo prellenado. Dentro de un pedido, la fila es «Ayuda con este pedido».
2. **«Términos y condiciones»** y **«Privacidad»:** enlaces de al menos 48 dp.
3. **«Ejercer mis derechos»** (acceso, rectificación, cancelación y oposición): cómo se hace dentro de la app está por decidir (decisión abierta del PR). «Eliminar mi cuenta» es otro derecho y vive en «Cuenta», aparte y con menos peso.
4. **«Reclamos»:** lleva al WhatsApp de Tindivo. El enlace al Libro de Reclamaciones virtual se agrega cuando exista.

## En la pantalla de entrada

- Antes de «Continuar con Google»: la casilla «Acepto los Términos y la Privacidad», **siempre, desmarcada**. «Términos» y «Privacidad» son enlaces de al menos 48 dp que abren el documento sin perder lo marcado.
- La casilla es de la capacidad de acceso (CUS-AUT-020); la capacidad de soporte garantiza que el enlace funcione igual que en «Cuenta».

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Sin poder leer el número | «Ayuda por WhatsApp» sigue activa con el número de respaldo | CUS-SUP-001 |
| Términos desactualizados | Se puede abrir «Cuenta» solo para consultar y pedir ayuda; la reaceptación se pide al actuar (CUS-AUT-027) | CUS-SUP-002 |
| Libro de Reclamaciones sin construir | No aparece su enlace | CUS-SUP-004 |

## Diferencias por plataforma

- La web hoy muestra los enlaces legales en el pie del sitio y la política dice «escríbenos por WhatsApp» para los derechos ARCO (`privacidad/page.tsx`); se apaga y no se corrige.
- Android ya tiene «Al continuar aceptas los Términos y la Política de privacidad» en el paso del nombre (`ProfileScreen.kt`), pero no en la entrada ni en «Cuenta»: ver «Estado en Android hoy».
