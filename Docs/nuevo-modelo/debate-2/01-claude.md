# Debate 2 · Ronda 1 · Claude

> 2026-09-30. Producto y flujo de **Tindivo Entregas**. Parte de
> `plan-final.md` y de `propuesta-base.md` (esta carpeta). Codex: critica,
> verifica en el repo lo marcado *[verificar]* y propone el camino más corto.

## 0. Lo nuevo que trae Jesús

1. **El foco es Entregas.**
2. **Quiere cubrir también a los negocios que hoy trabajan con Zorritos
   Delivery, también para recojo.** Sabe que eso puede subir la rivalidad y no
   sabe cómo lo va a tomar Zorritos.
3. **El modelo de referencia es inDrive:** punto A en el mapa, punto B en el
   mapa, tipo de producto y descripción, y los celulares de A y B. Nada más.
   **La facilidad manda sobre todo lo demás.**
4. **Login:** ¿OTP, o solo cuenta de Google?

## 1. Lo que ya hay en la rama (leído, no supuesto)

- El flujo por defecto **ya es el de inDrive**: `pin-drop (A) → pin-drop (B)
  → trip-details → trip-payer → trip-items → tracking`
  (`apps/customer/features/courier/types.ts`). El directorio de negocios
  (`route`/`confirm`) existe pero está **oculto**.
- Crear exige **sesión de cliente** (`requireRole(req, 'customer')` en
  `apps/api/app/api/v1/customer/courier-orders/route.ts`) e Idempotency-Key.
- El login de `apps/customer` es **Google o correo+contraseña**, y después un
  paso de **celular con OTP por SMS vía Twilio Verify** (hay modo simulacro
  sin Twilio). *[verificar: si el OTP es obligatorio para pedir Entregas o
  solo para el checkout de comida; cuánto cuesta cada SMS a Perú hoy.]*
- Los errores de la RPC dicen «Atendemos de 6 a 11 pm, **todos los días**»:
  contradice el L–V del plan. *[verificar: dónde vive el horario.]*

## 2. Mi postura

### 2.1 El flujo: quitar un paso, no añadir

El flujo de inDrive tiene **4 datos**: A, B, qué, y los dos celulares. El
nuestro tiene 5 pantallas porque suma **«¿Quién paga?»**. Propongo:

1. **A en el mapa** + referencia en la misma pantalla (ya está).
2. **B en el mapa** + referencia (ya está).
3. **Una sola pantalla «Confirma»**: celular de A, celular de B, chips de qué
   es (Paquete · Documentos · Ropa · Llaves · Útiles · Otro) + descripción
   corta, el precio grande, y **«Paga: quien recibe ▾»** como valor por
   defecto editable en una línea, no como paso aparte. Las dos casillas
   («menos de 5 kg» y «no es comida preparada ni dinero») se juntan en una
   sola frase aceptada al tocar «Pedir».
4. Seguimiento.

**Tres pantallas hasta pedir.** «Soy yo» sigue autocompletando el celular
propio en A o en B. Descarto «Mandar / Traerme» de la propuesta base: añade
una decisión antes del mapa, y el mapa ya responde esa pregunta.

**Login al final, no al principio.** El usuario llena A, B y qué **sin
cuenta**, y la cuenta se pide solo al tocar «Pedir entrega», con el borrador
guardado. *[verificar: si hoy el store sobrevive a la vuelta de OAuth de
Google.]*

### 2.2 Login: Google de un toque, sin OTP en Entregas

- **Google como vía principal.** En el pueblo casi todo celular es Android y
  ya tiene una cuenta de Google dentro: es un toque, sin escribir, sin SMS
  que no llega, sin contraseña que se olvida.
- **Sin OTP para Entregas en la V1.** Razones:
  - El antifraude es humano: el motorizado **llama a A antes de ir** (su
    celular ya está en la tarjeta). Un pedido falso cuesta una llamada, no un
    viaje.
  - Los dos celulares que importan son **los de A y B**, que el OTP no
    verifica de todos modos: verifica el de quien pide.
  - Cada SMS cuesta dinero y en el campo llega tarde o no llega. Cada pantalla
    extra es abandono medible.
- **El celular propio se pide una vez, sin verificar**, y queda guardado.
- **Correo+contraseña se esconde** tras «Otras opciones»: sirve al que no
  tiene Google, pero no compite en pantalla.
- **Salvaguarda:** si alguien acumula 2 «No se pudo · no contestan / no estaba
  listo», su cuenta pasa a pedir OTP (o a bloquearse). El control sube solo
  donde hubo abuso.

### 2.3 Los negocios de Zorritos: sí como origen, no como objetivo

Aquí veo **tres cosas distintas** que conviene no mezclar:

| Qué | ¿Entra? | Por qué |
|---|---|---|
| **A)** Un cliente pide recoger algo **ya pagado** en una tienda que usa a Zorritos (botica, bodega, ropa) | **Sí**, sin preguntarle a nadie | Es B2C: el cliente es el nuestro. La tienda solo entrega una bolsa. No hay contrato que romper |
| **B)** Ir a **convencer** a los negocios de Zorritos de que se pasen | **No en el piloto** | Zorritos cobra S/0 al negocio y S/2 al cliente; nosotros S/3. Se pierde en precio, y se abre una guerra que Tindivo no puede financiar |
| **C)** **Restaurantes** de Zorritos vía Entregas | **No** | Es comida preparada (fuera en el piloto) y es el arbitraje contra nuestros partners, que pagan S/1.50 |

Sobre **C**, dejo una idea para después del piloto: si algún día se abre
comida de no partners, que **el cliente pague al menos lo que Tindivo gana con
un partner** (S/3.50). Así un partner nunca sale ganando si se va, y no
competimos contra nosotros mismos.

**Sobre la rivalidad:** la mejor defensa es **no parecer un ataque**. Tindivo
Entregas se presenta como «mandar y traer cosas de persona a persona», no como
«el delivery de los negocios». El directorio **no muestra teléfonos** y no
dice «ahora con Tindivo»: solo sirve para ubicar el punto A. Si una tienda de
Zorritos se niega a darle la bolsa a nuestro motorizado, el pedido termina en
«No se pudo · el negocio no entregó», sin cobro, y esa tienda se oculta del
directorio. Riesgo que veo: **un directorio con los negocios de Zorritos sin
su permiso es exactamente lo que ellos pueden leer como provocación.**
*Propuesta:* en el piloto el directorio solo tiene negocios que Jesús
**avisó**, aunque sea con un «oye, puede venir un motorizado de Tindivo a
recoger lo que tu cliente ya pagó»; los demás se piden como punto libre en el
mapa.

### 2.4 Canal WhatsApp (de la propuesta base)

Lo mantengo, pero **después** del flujo web. La V1 del piloto es la web; el
«modo operador» de Jesús entra solo si la medición del paso 2 del plan (4 de 5
completan sin ayuda) sale mal. Si entra, es **la misma pantalla** con un campo
«Cliente» y exento del límite de 1 activo.

### 2.5 Precio

Sigue abierto entre **S/3 único** (plan final) y **S/2.50 web / S/3
WhatsApp** (propuesta base). Recomiendo **S/3 único** mientras no exista el
canal WhatsApp: un solo número es más fácil de explicar, y el motorizado cobra
una sola cifra.

## 3. Preguntas para Codex

1. ¿Tres pantallas (A · B · Confirma) aguantan, o meter los dos celulares y
   el «qué» en una sola pantalla la vuelve un formulario que asusta?
2. **Login:** ¿estás de acuerdo con Google sin OTP? ¿Qué riesgo concreto ves
   en el pueblo que el OTP sí cubra? ¿Y la alternativa de **no pedir cuenta**
   (sesión anónima de Supabase + celular) para el primer pedido?
3. **Zorritos:** ¿la separación A/B/C es correcta? ¿Te parece bien que el
   directorio solo muestre negocios avisados? ¿Qué harías distinto para no
   provocar sin renunciar a esos negocios como origen?
4. «Paga quien recibe» por defecto: ¿es el valor más común? ¿Cuándo falla?
5. Verifica en el repo los *[verificar]* del §1 y el §2.1.
6. Orden de trabajo más corto, dado lo que ya existe en `tindivo-courier`.
