---
canvas: [Onboarding-3-entrar, Onboarding-3-entrar-aceptado]
requisitos: [CUS-AUT-001, CUS-AUT-002, CUS-AUT-003, CUS-AUT-006, CUS-AUT-010, CUS-AUT-011, CUS-AUT-012, CUS-AUT-019, CUS-AUT-020, CUS-AUT-021, CUS-AUT-025]
operaciones: [getCustomerProfile, acceptTerms, updateCustomerProfile]
textos: []
tokens: []
codigo:
  web: [apps/customer/components/auth-onboarding/steps/login-step.tsx, apps/customer/components/auth-onboarding/steps/google-name-step.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/signin/**, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/profile/**]
  ios: []
---

# Entrar a Tindivo

| | |
|---|---|
| **Tarea de la persona** | Aceptar los Términos y la Privacidad y entrar con su cuenta de Google (en iOS, también Apple). |
| **Se llega desde** | Al intentar pedir como invitado («Ir a pagar» en la bolsa o el checkout), «Entrar» en el Inicio o en Cuenta sin sesión, o una sesión que terminó. |
| **Se sale hacia** | Acceso completo: vuelve a donde estaba (la bolsa sigue intacta); si falta el nombre, la hoja «¿Cómo te llamas?»; si falta el celular, `acceso/celular`. «Ahora no»: vuelve a donde estaba, como invitado. «Términos» y «Privacidad»: la web, en el navegador. |

Es la **única** pantalla de acceso: sin barra de progreso ni «Saltar». El tablero `Onboarding-3-entrar` dibuja la casilla
vacía con el botón deshabilitado, y `Onboarding-3-entrar-aceptado`, la casilla marcada.

## Contenido, de arriba abajo

1. Título «Entra a Tindivo».
2. Subtítulo «Solo con tu cuenta de Google.» En iOS no vale: lleva también Apple (CUS-AUT-003).
3. Casilla «Acepto los Términos y la Política de privacidad», desmarcada. «Términos» y «Privacidad» son enlaces de 48 dp
   de alto que abren la web en el navegador.
4. Botón «Continuar con Google»: sin efecto mientras la casilla está vacía (se ve apagado, sin sombra); con la casilla
   marcada pasa a blanco con borde y se habilita.
5. «Ahora no»: texto; vuelve a donde estaba la persona, como invitado.
6. Enlace de ayuda a soporte por WhatsApp para quien perdió su cuenta de Google (CUS-AUT-025).

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Casilla vacía | El botón no abre el selector; tocarlo sacude la casilla y deja el foco en ella (TalkBack: «Acepta los Términos para continuar») | CUS-AUT-020, CA-AUT-P1 |
| Casilla marcada | Botón blanco con borde, habilitado | CUS-AUT-020 |
| Entrando | Indicador de progreso en el botón; botón bloqueado | CUS-AUT-002 |
| Google cancelado | La pantalla queda como estaba, sin mensaje | CUS-AUT-002 |
| Error al entrar | «No se pudo entrar. Inténtalo otra vez.» | CUS-AUT-002 |
| Sin cuenta de Google en el teléfono | «Agrega una cuenta de Google en Ajustes.» | CUS-AUT-002 |
| Falta el perfil | Tras entrar, se pide el nombre en una hoja (se sugiere el de Google) | CUS-AUT-010, CA-AUT-04 |
| No se pudo guardar la aceptación | «No pudimos guardar. Reintenta.»; no se sigue sin ella y la bolsa se conserva | CUS-AUT-021, CA-AUT-03 |
| Sin red al confirmar la sesión | Se conserva la sesión local | CUS-AUT-011, CA-AUT-05 |
| Sesión terminada | «Tu sesión terminó» y esta pantalla; al entrar, vuelve al mismo lugar | CUS-AUT-012 |
| Sin ID de cliente de Google | «El inicio de sesión aún no está disponible en esta versión.» | CUS-AUT-002 |

## Movimiento

Tocar «Continuar con Google» sin aceptar: la casilla se sacude y toma el foco. Al marcar la casilla, el botón pasa a
blanco con borde (fundido de 150 ms) y se habilita. Las notificaciones **no** se piden aquí: se piden después del primer
pedido confirmado. Con «reducir movimiento»: sin sacudida, solo cambio de color y foco.

## Pendiente

- Hoja «¿Cómo te llamas?»: el código la tiene (nombre con el largo y los caracteres del contrato) pero no tiene tablero.
  Falta la hoja diseñada dentro del checkout.
- Textos de la casilla: la maqueta dice «Acepto los Términos y la Privacidad»; el requisito y la decisión de Jesús, «Acepto
  los Términos y la Política de privacidad». Se escribe la segunda hasta que Jesús decida (decisión 2 del PR).
- Cómo se ve «sin efecto» el botón con la casilla vacía: apagado pero que responde al toque (CA-AUT-P1), o realmente
  deshabilitado (decisión 1 del PR).
