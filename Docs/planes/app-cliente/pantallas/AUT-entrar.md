# AUT · Entrar a Tindivo

> Maquetas: `Onboarding-3-entrar` (casilla vacía, botón deshabilitado) y `Onboarding-3-entrar-aceptado` (casilla marcada).
> Es la **única** pantalla de acceso: sin barra de progreso ni «Saltar». Solo con Google (decisión del 2026-11-16).

| | |
|---|---|
| **Tarea de la persona** | Aceptar los Términos y la Privacidad y entrar con su cuenta de Google. |
| **Se llega desde** | Al intentar pedir como invitado («Ir a pagar» en `CRT-bolsa` / `CHK-confirmar-pedido`), «Entrar» en `CAT-inicio` o en `ACC-cuenta` sin sesión. |
| **Se sale hacia** | Acceso completo → vuelve a donde estaba (por ejemplo la bolsa, que sigue intacta); si falta el nombre, hoja «¿Cómo te llamas?»; si falta el celular, `AUT-celular`. «Ahora no» → vuelve a donde estaba, como invitado. «Términos» y «Privacidad» → web en el navegador. |
| **Requisitos** | CUS-AUT-001, 002, 006, 010, 011, 012 · CUS-SUP-002 · (requisito nuevo: casilla de aceptación en la pantalla de entrada, con versión y fecha UTC) · (requisito nuevo: «Ahora no» devuelve a la pantalla anterior como invitado) |
| **Endpoints** | Credential Manager de Google → servicio de autenticación (ID token con nonce) · `GET /customer/profile` (si responde 404 `customer_profile_not_found`, falta el perfil) · `POST /customer/terms-acceptance` (versión vigente) · `PUT /customer/profile` (nombre) · (endpoint nuevo: versión vigente de términos; hoy la app usa una constante `TERMS_VERSION`) |
| **Estado** | Android: 🟡 pantalla «Entrar a Tindivo» con «Continuar con Google»; sin casilla ni «Ahora no»; la aceptación ocurre después, en el paso «¿Cómo te llamas?» · iOS: ⬜ (con Sign in with Apple, CUS-AUT-003) |

## Contenido, de arriba abajo

1. **Título:** «Entra a Tindivo».
2. **Subtítulo:** «Solo con tu cuenta de Google.»
3. **Casilla de aceptación:** «Acepto los Términos y la Privacidad». «Términos» y «Privacidad» son enlaces (48 dp de alto) que abren la web en el navegador.
4. **Botón «Continuar con Google»:** deshabilitado mientras la casilla está vacía (`#E0E4E8` / `#50565D`, sin sombra); con la casilla marcada pasa a blanco con borde y se habilita.
5. **«Ahora no»:** acción de texto; vuelve a donde estaba la persona, como invitado.

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Casilla vacía | Botón deshabilitado; tocarlo sacude la casilla y deja el foco en ella (TalkBack: «Acepta los Términos para continuar») | (requisito nuevo: aceptación previa) |
| Casilla marcada | Botón blanco con borde, habilitado | idem |
| Entrando | Indicador de progreso en el botón; botón bloqueado | CUS-AUT-002 |
| Falta el perfil | Tras entrar, el servidor responde 404 `customer_profile_not_found`: se pide el nombre (se sugiere el de Google) | CUS-AUT-010 |
| Error al entrar | «No se pudo entrar. Inténtalo otra vez.» | CUS-AUT-002 |
| Sin ID de cliente de Google | «El inicio de sesión aún no está disponible en esta versión.» | CUS-AUT-002 |
| Sin red al confirmar la sesión | Se conserva la sesión local | CUS-AUT-011 |
| Versión vigente cambió | Se registra la versión que la persona vio al marcar; si cambia antes de terminar, se pide de nuevo | (requisito nuevo: reaceptación) |

## Criterios de aceptación propios de la pantalla

```
CA-AUT-P1 · Sin aceptar no se entra
  Dado la pantalla con la casilla vacía
  Cuando la persona toca «Continuar con Google»
  Entonces no se abre el selector de cuentas
  Y la casilla se sacude y recibe el foco

CA-AUT-P2 · Aceptar queda registrado con versión y fecha
  Dado la casilla marcada y un acceso con Google completado
  Entonces se registra la aceptación con la versión vigente de Términos y Privacidad y la fecha en UTC
  Y la persona vuelve a donde estaba

CA-AUT-P3 · «Ahora no» no pierde la bolsa
  Dado una bolsa con productos y la pantalla abierta desde «Ir a pagar»
  Cuando toca «Ahora no»
  Entonces vuelve a la bolsa, que sigue intacta, sin sesión
```

## Movimiento

Tocar «Continuar con Google» sin aceptar: la casilla se sacude y toma el foco. Al marcar la casilla, el botón pasa a blanco
con borde (fundido de 150 ms) y se habilita. Las notificaciones **no** se piden aquí: se piden después del primer pedido
confirmado (`NOT-activar-notificaciones`). Con «reducir movimiento»: sin sacudida, solo cambio de color y foco.

## Pendiente (va a `decisiones-abiertas.md`)

- **Maqueta ↔ código:** la maqueta acepta antes de entrar; el código registra la aceptación después, en «¿Cómo te llamas?» («Al continuar aceptas los Términos y la Política de privacidad de Tindivo.»), junto con el nombre, y solo si falta el perfil. Un usuario que ya tiene perfil no vuelve a aceptar. No se elige.
- **Maqueta ↔ código:** el código no tiene «Ahora no» (solo «Volver») ni la casilla.
- **Maqueta ↔ código:** la maqueta dice «Privacidad»; el código «Política de privacidad». Los enlaces del código usan `${WEB_BASE_URL}/terminos` y `/privacidad`.
- **Maqueta ↔ código:** el paso «¿Cómo te llamas?» (nombre, mínimo 2 letras, máximo 50) no está en las maquetas de esta pantalla; Jesús decidió pedirlo en hojas dentro del checkout. Falta la hoja diseñada.
- iOS requiere Sign in with Apple (CUS-AUT-003) además de Google: la leyenda «Solo con tu cuenta de Google» no vale en iOS.
- Recuperación de acceso si se pierde la cuenta de Google: soporte por WhatsApp verificando el celular (decisión de Jesús); sin pantalla.
