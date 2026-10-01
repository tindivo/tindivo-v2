# Tindivo Entregas · Plan de producto (Claude + Codex)

> **v1 · 2026-09-30.** Sale del debate `debate-2/01` a `04`, sobre
> `plan-final.md` y `debate-2/propuesta-base.md`, con revisión estática del
> código de la rama `tindivo-courier` (sin consultar bases). **Pendiente de
> aprobación de Jesús:** las decisiones del §8 son suyas.

## 1. En una frase

**Pedir una entrega es como en inDrive: punto A en el mapa, punto B en el
mapa, qué es y quién paga. Tres pantallas, sin OTP y con Google.** Lunes a
viernes de 6 a 11 pm, S/ 3, solo cosas **listas** (y pagadas, si fueron una
compra), dentro de San Jacinto.

## 2. El flujo del cliente (3 pantallas)

El mapa va primero, como pidió Jesús. Cada contacto va junto a su lugar.

**Pantalla 1 · ¿Dónde recogemos?**
- Mapa con el pin fijo al centro («arrastra el mapa, no el pin»).
- Encima del mapa, atajos: **Recientes**, **Usar mi ubicación** y los
  **negocios del directorio**. Elegir uno ahorra mover el mapa.
- **Referencia** obligatoria («frente a la iglesia, puerta verde»).
- **Quien entrega:** nombre y celular. **«Soy yo»** lo llena solo.
- Una línea fija: *«Avísale a quien entrega que irá un motorizado de
  Tindivo.»*

**Pantalla 2 · ¿Dónde entregamos?**
- Lo mismo: mapa, atajos, referencia y **quien recibe** (nombre y celular,
  con «Soy yo»).

**Pantalla 3 · ¿Qué llevamos?**
- Chips: Paquete · Documentos · Ropa · Llaves · Útiles · Otro (**sin
  «Comida»**). Descripción corta opcional («bolsa azul»).
- **Precio grande: S/ 3.**
- **Dos botones visibles:** «Paga Rosa (quien entrega)» / «Paga María (quien
  recibe)». Sin desplegables: es una obligación de dinero y tiene que verse.
- Una sola casilla: **«Está listo; si es una compra, ya está pagada. Pesa
  menos de 5 kg y no es comida preparada ni dinero.»**
- **[ Pedir entrega ]**

**Después:** «Buscando motorizado…» → «Va a recoger» → «Recogido» →
«Entregado», en un link público que se puede reenviar. Si nadie acepta en el
tiempo configurado, se cancela sola y sin cobro. Botón «Repetir».

«Mandar / Traerme» **no** es una pantalla: «Soy yo» ya cumple ese papel.

## 3. Acceso: Google, sin OTP en Entregas

- **Se pide la cuenta al final**, al tocar «Pedir entrega». El borrador (y el
  paso en que iba) se guarda en `sessionStorage` y se recupera al volver de
  Google.
- **Google es la vía principal**; correo y contraseña quedan en «Otras
  opciones».
- **Sin OTP para Entregas.** Un SMS de Twilio Verify a Perú sale a unos
  **US$ 0.30 por verificación** (tarifa pública, no factura real), y lo que
  cubría se cubre de otra forma:

| Riesgo | Cómo se cubre |
|---|---|
| Pedir con el celular de un vecino para gastarle el límite | Límite de **1 activa por cuenta**, en el servidor y con bloqueo |
| Pedido falso para hacer ir al motorizado | Celulares de A y B **obligatorios**; el motorizado llama a A antes de salir |
| Abuso repetido | Incidentes registrados por cuenta; **Jesús bloquea a mano**, nunca de forma automática |

- **Comida no cambia:** sigue exigiendo el celular verificado.
- **El modo invitado** (sesión anónima) solo entra si la prueba con 5
  vecinos muestra que Google es la barrera.

**Riesgo aceptado:** sin OTP nadie verifica el celular propio ni impide abrir
varias cuentas. Para un piloto de 2 semanas con cobro contra entrega, se
asume. Si aparece abuso, se enciende el OTP solo para esa cuenta.

## 4. Negocios y Zorritos

| Caso | ¿Entra? | Por qué |
|---|---|---|
| El cliente pide recoger algo **listo y pagado** en una tienda que trabaja con Zorritos | **Sí**, como punto libre en el mapa | El cliente es de Tindivo. Coordinar el recojo le toca a él, no a Jesús |
| Ir a convencer a los negocios de Zorritos de que se cambien | **No en el piloto** | Zorritos cobra S/ 0 al negocio y S/ 2 al cliente. Se pierde en precio y se abre una guerra que no se puede financiar |
| Restaurantes (de Zorritos o no) vía Entregas | **No** | Es comida preparada, y además abre un arbitraje contra los partners, que pagan S/ 1.50 |

- **Solo aparecen en el directorio los negocios que aceptaron** entregarle
  bolsas a un motorizado de Tindivo. Jesús los elige.
- **No se promociona como «el delivery de los negocios»**, sino como mandar y
  traer cosas. Un directorio lleno de negocios de Zorritos sin su permiso es
  justo lo que se puede leer como provocación.
- Si una tienda se niega a entregar la bolsa, el pedido termina en «No se pudo
  · el negocio no entregó», sin cobro.

## 5. Canal WhatsApp asistido

Entra en la V1, porque así lo decidió Jesús, pero **en su mínima expresión**:

- **La misma pantalla**, en una ruta protegida por el rol `admin`, que ya
  existe. Se agrega arriba el campo **«Cliente: nombre y WhatsApp»**.
- **Se guardan por separado el solicitante real y el operador (Jesús).** El
  límite de 1 activa aplica **al WhatsApp del cliente**, no a la cuenta de
  Jesús. Si alguien da el teléfono de otro, no se bloquean cuentas ajenas.
- Al crearla, botón **«Copiar mensaje para el cliente»**, con el resumen, el
  precio y el link de seguimiento.
- **No se promete tiempo de respuesta.** Tope de ~15 minutos diarios de Jesús,
  medidos. Si se pasa, se empuja la web.

## 6. Lo que el código contradice hoy (hay que corregirlo)

Hallazgos de Codex, con archivo y línea en `debate-2/02` y `04`:

| # | Problema | Dónde | Arreglo |
|---|---|---|---|
| 1 | **Los teléfonos y el WhatsApp de los negocios llegan al navegador.** La UI no los muestra, pero cualquiera los ve en el inspector: la policy pública filtra filas, no columnas | `features/courier/lib/directory.ts:42`, `0232:163` | Que el cliente no pueda leer esas columnas; el teléfono solo lo recibe el motorizado asignado |
| 2 | El horario no tiene días, y la API dice «todos los días» | `0232:401`, `courier-orders/route.ts:26` | Agregar días a `app_settings.courier.hours` y quitar el texto hardcodeado |
| 3 | «Disponible» no mira la carga del motorizado | `0232:425` | Comprobar la capacidad **al crear y al aceptar**, con bloqueo |
| 4 | El límite de 1 activa cuenta el `requester_phone` que envía el cliente, sin bloqueo | `0232:525` | Por cuenta (web) o por WhatsApp del cliente (asistido), atómico |
| 5 | Los celulares de A y B son opcionales en el contrato | `contracts/src/courier.ts:17` | Obligatorios, o resueltos desde el directorio |
| 6 | Sin sesión, «Pedir» muestra un texto en vez de abrir el login | `use-courier-request.ts:126` | Abrir el login |
| 7 | El borrador vive en memoria y `openSheet` lo reinicia | `lib/store.ts:75`, `:87` | `sessionStorage` + recuperar el paso |
| 8 | La UI ofrece «Comida», permite «listo en X min» y la casilla de pagado habla de otra cosa | `trip-items-sheet.tsx:19`, `:126` | Lo del §2 |
| 9 | El tiempo de espera está en 15 min, y los textos dicen 5 | `0232:338` | Probar **10 min** (ver §8.3) y alinear los textos |

## 7. Orden de trabajo (consensuado)

| Paso | Qué | Listo cuando |
|---|---|---|
| **0 · Privacidad** | Hallazgo 1. **No se despliega nada antes** | Ningún teléfono de negocio llega al cliente |
| **1 · Reglas en config** | Hallazgos 2 y 9; S/ 3; L–V | Fuera de horario, el flujo lo dice antes de empezar |
| **2 · Motorizado y cobro** | Ver, aceptar, soltar y avanzar la entrega; capacidad (hallazgo 3); cobro de S/ 3 y rendición diaria; «No se pudo» con motivo y retorno | Varias entregas de prueba y el dinero **cuadra al centavo** |
| **3 · Acceso y borrador** | Hallazgos 4 a 7; Google al final, sin OTP | Volver de Google no pierde nada |
| **4 · Pantallas** | El §2 (hallazgo 8) | Tres pantallas hasta pedir |
| **5 · Asistido** | El §5 | Jesús crea una entrega para un cliente de WhatsApp en menos de 1 minuto |
| **6 · Prueba con 5 vecinos** | Desde un enlace de WhatsApp, incluyendo volver de Google y abrir el seguimiento | **4 de 5 completan sin ayuda** |

Después sigue el piloto de 2 semanas del `plan-final.md` §5–§7.

## 8. Decisiones que quedan para Jesús

1. **Precio por canal.** *Recomendación común:* **S/ 3 único**, también por
   WhatsApp. Una sola cifra se explica mejor y el motorizado cobra siempre lo
   mismo. (La propuesta base tenía S/ 2.50 web y S/ 3 WhatsApp.)
2. **Acceso.** *Recomendación común:* Google principal, sin OTP en Entregas,
   límite por cuenta, bloqueos a mano. ¿Lo aceptas con el riesgo del §3?
3. **Espera.** *Recomendación común:* probar **10 min** para que un
   motorizado acepte (tú habías fijado 15), con 1 entrega activa por
   motorizado y la comida primero. Sin prometer cupos ni tiempos de llegada.
4. **Fallas y retorno.** **Sin acuerdo cerrado.** Hay que definir antes del
   piloto:
   - Si no estaba listo o nadie recibe y el motorizado ya fue, ¿se cobra?
     (Claude: sí, el servicio; Codex: sin cobro antes de recoger.)
   - Si ya se recogió y no hay quien reciba, ¿vuelve al origen en el mismo
     turno? ¿Quién paga esa vuelta?
   - Nada de bloqueos automáticos (en esto sí coinciden).
5. **Directorio.** *Recomendación común:* solo negocios que aceptaron, 10–15
   para empezar; los de Zorritos, solo como punto libre y sin captarlos.
   ¿Qué tiendas pones primero?
6. **WhatsApp asistido.** ¿En qué horas lo atiendes y quién toma el celular si
   no puedes?
7. **Compras asistidas** (anexo de la propuesta base). *Codex:* fuera, porque
   buscar productos y confirmar pagos es otra coordinación. *Claude:* de
   acuerdo; se atienden a mano, se cuentan, y el flujo propio espera los
   ~5 por semana durante 2 semanas.
8. **Horario:** confirmar **L–V de 6 a 11 pm** (cambia el «todos los días» de
   `Docs/Encargos/04`).
