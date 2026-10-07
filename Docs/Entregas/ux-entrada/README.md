# Cómo se entra a pedir una entrega · Conclusión (Claude + Codex)

> **2026-10-07.** Cada uno propuso por separado (`01-claude.md`,
> `01-codex.md`) y llegamos a lo mismo en lo principal. **Aprobado por Jesús** con las decisiones del §5.

## 1. En una frase

**Una sola entrada (la tarjeta del inicio y `tindivo.com/entregas` abren lo
mismo), el mapa de A primero como hasta hoy, y los atajos dentro del mapa:
repetir una entrega, buscar un lugar por su nombre y, en el punto B, «Mi
dirección».** Recoger de un negocio llega después, cuando haya negocios
cargados con su contacto.

## 2. Lo que se descartó, y por qué

- **La pantalla «¿Dónde recogemos?» con la lista de lugares antes del mapa**
  (la empezó Claude hoy). Agrega un toque, «Marcar en el mapa», en el caso más
  común: mandar algo de una casa a otra. Y la lista no es de negocios: de los
  60 lugares cargados, la mayoría son canchas, iglesias o «otro», y ninguno
  tiene teléfono.
- **La página «Lugares» de `/entregas`.** Era un segundo camino distinto, y su
  «Recoger aquí» saltaba el login: al volver de Google se perdía lo escrito.
- **Un selector «persona o negocio»**, categorías abiertas por defecto, acceso
  a la agenda del celular y repetir un pedido sin revisarlo.

## 3. El flujo

**Paso 1 · Mapa de A: «¿Dónde recogemos?»**

- El mapa arranca en tu ubicación (GPS), como hoy.
- **«Repetir una entrega»**, solo si ya pediste antes y alguna se entregó.
  Muestra la última («Botica Santa Rosa → María») y «Ver anteriores», hasta 3.
  Un toque llena los dos puntos, los contactos, qué se lleva y quién paga, y
  salta a **Detalles**. «Listo y pagado» se vuelve a marcar siempre: es de este
  envío.
- **«Buscar un lugar»** (lupa): al escribir salen los lugares del pueblo que
  coinciden (sin tildes: «botica» encuentra «BÓTICA») y los puntos donde ya
  recogiste o entregaste. Al elegir uno, el mapa vuela ahí y la referencia
  queda escrita. La persona ajusta la puerta si hace falta y confirma.
- Referencia y «Confirmar recojo», como hoy.

**Paso 2 · Mapa de B: «¿Dónde entregamos?»**

- Lo mismo, y además **«Mi dirección»** (la dirección por defecto de
  `customer_addresses`: **67 clientes ya tienen una** guardada por sus pedidos
  de comida) y los puntos recientes.

**Paso 3 · Detalles**, como hoy. «Soy yo» y los contactos recientes ya
existen.

**El enlace de una tienda** (`tindivo.com/entregas?lugar=…`) entra al mismo
flujo con A ya puesto y abre B. Pide la cuenta al principio y no pierde la
tienda al volver de Google.

## 4. Recoger de un negocio: primero los datos

Lo que lo hace rápido es **no tener que escribir quién entrega ni su
celular**. Hoy no hay de dónde sacarlo: `directory_businesses` tiene 0 filas y
los lugares no tienen teléfono. En orden:

1. **Cerrar el hueco:** hoy cualquiera sin sesión puede leer el `phone` de
   `directory_businesses`.
2. **Jesús carga de 3 a 10 negocios que se comprometen**: botica, bodega,
   tienda o vendedora. **No restaurantes.** Campos: nombre, puerta exacta,
   referencia, celular de recojo y horario. **Con su permiso** para mostrar
   ese contacto.
3. Esos negocios salen **primero** en «Buscar un lugar», con su etiqueta, y al
   elegir uno quedan puestos el punto **y** «quién entrega».
4. Cada uno recibe su enlace para compartir por WhatsApp.

## 5. Decidido por Jesús (7-oct)

1. **Entregas recoge de cualquier negocio, también comida** («recoge de
   Chipi, recoge de esta farmacia, normal; no hay por qué exonerar»). **Esto
   cambia `Docs/nuevo-modelo/plan-final.md` §3**, que dejaba fuera la comida
   preparada para proteger a los aliados. Se queda la etiqueta «Comida», y las
   rutas de comida también salen en «Repetir».
2. **GPS:** el mapa de A arranca en tu ubicación, como hoy, **y el de B
   también**. Antes, B arrancaba al lado de A; con la búsqueda, A puede ser la
   botica, y lo normal es que B sea donde está quien pide. Si tu ubicación
   coincide con A (menos de ~20 m), B arranca un poco corrido para que los dos
   pines se distingan.
3. Qué negocios cargar primero (§4.2): pendiente.

## 6. Cómo se sabe que funciona

Antes de agregar más: **cinco personas con un Android modesto** prueban tres
recorridos: entrega nueva, repetir una entrega y entrar por el enlace de una
tienda. Se mide el tiempo, dónde dudan y si terminan sin ayuda.
