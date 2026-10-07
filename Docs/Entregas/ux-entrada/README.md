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

## 7. Auditoría (7-oct, después de construirlo)

Codex auditó la primera versión como experto en UX/UI y en código, sobre 12
capturas a 390×844 y el diff (`02-codex-auditoria.md`). Claude respondió qué
tomaba y qué no (`03-claude-respuesta.md`), lo aplicó, y Codex lo verificó en
tres pasadas hasta dar **«listo para commit»** (`04` a `06`). Se probó además en
Chrome real (Escape con la lupa abierta, «Repetir», consola sin errores).

**Lo que cambió por la auditoría:**

- Elegir en la lupa **reemplaza** el contacto (antes, la botica podía quedarse
  con el celular de «Mamá»).
- **«Mi dirección»** a la vista en el paso 2, y llena también quién recibe.
- **«Recogemos en …»** en el paso 2: B arranca en tu GPS y A puede quedar fuera.
- **Detalles:** los contactos que llegan completos se ven en una línea con
  «Cambiar», y el botón gris dice qué falta («Completar: qué llevamos») y lleva
  hasta ahí.
- La lupa separa **«Tus lugares»** de **«Lugares del pueblo»**, muestra el
  celular de cada reciente, dice cuándo carga, cuándo falló la red y ofrece
  «Marcar en el mapa» si no encuentra nada.
- **Una sola carga por apertura** (`lib/flow-context.ts`): identidad,
  historial y dirección, compartida por el mapa y las hojas, **atada a la
  cuenta** (cambiar de sesión no muestra datos de la anterior).
- **El GPS se lee una vez:** B reutiliza la ubicación de A si tiene menos de
  1 min; el botón de ubicación ya no pisa lo elegido en la lupa.
- `/entregas` abre también con navegación interna, no solo al cargar la página.
- Foco: la lupa aísla el pin de detrás (`inert`, y `useDialogFocus` lo respeta)
  y devuelve el foco al cerrar.

**Pendiente, acordado con Codex:**

- **Contraste del botón naranja** (blanco sobre el degradado: ~2,3–2,8:1). Es el
  botón de marca de toda la app: va en un cambio propio de `packages/ui`.
- Estados de 11 px y contexto de «Crea tu cuenta» («para pedir tu entrega»):
  componentes compartidos, su propia pasada.
- Probar con **cinco personas en Android modestos** (§6).

## 8. Ajustes de Jesús al probarlo (7-oct)

- **«Repetir» ya no es una tarjeta fija.** Queda solo **«Ver anteriores (n)»**,
  a la derecha de «Paso 1 de 2»; al tocarlo se despliegan las entregas
  anteriores. La fila del paso tiene alto fijo, así que el mapa no pierde
  alto por un atajo que no se usa.
- **La búsqueda no tapa la pantalla.** Se escribe en la misma barra del pin y
  salen **hasta 5 coincidencias** debajo, con el mapa a la vista. Mientras se
  escribe, «Mapa / Satélite» se esconde para dejarle el ancho al campo.
- Arreglado: dos sitios recientes en el mismo punto exacto (vecinos con otro
  celular) repetían la clave de React.

## 9. Segunda tanda de Jesús (7-oct), debatida con Codex

Acuerdo en `08-acuerdo-ronda-jesus.md`; verificación en `09` y `10`.

- **Búsqueda:** negocios antes que referencias públicas; también **por tipo**
  («botica» trae Inkafarma; «pollo», las pollerías), sin chips. Un nombre
  completo («Restaurant La Florencia») trae ese lugar, no todos los del tipo.
- **«Ver anteriores»** abre una hoja aparte, con qué se llevó y la fecha.
- **Paso 2 más limpio:** «Usar mi dirección» en la esquina, «Recojo: …» en una
  línea y el estado sin aspecto de alerta. «Ubicación 1 / 2 de 2» en lugar de
  «Paso», porque después viene Detalles.
- **Detalles:** flecha de volver (al mapa de B, sin perder nada) en lugar de la
  X; «Soy yo» en la esquina de cada tarjeta; fuera los chips de contactos
  recientes; «Completar: …» se ve como acción, no apagado.
- **Mismo ancho:** en pantalla ancha el panel del pin se centra a 768 px, el
  de las hojas de la app.
- **Seed:** `pnpm db:seed:lugares` copia a local los 60 lugares de producción.

**Pendiente:** corregir categorías desde el admin (boticas frente a Essalud y
la Posta; negocios dentro de «otro») y bajar la densidad de nombres en el mapa
con los 60 lugares (se ve cargado); probar con teclado abierto en un Android
pequeño.

## 10. El mapa detrás del panel (7-oct)

- En el pin, el mapa ocupa **toda la pantalla, también detrás del panel**, y el
  pin sube la mitad del alto del panel (`pinOffsetY` en `MapCanvas`, 0 en el
  checkout). En pantalla ancha se ve el mapa a los costados del panel; en el
  celular, por sus esquinas. La coordenada guardada es la del punto bajo el pin:
  un e2e lo comprueba contra la base con ~1 m de tolerancia.
- El crédito de OpenStreetMap se sube encima del panel (lo exige la licencia).
- La fila «Ubicación n de 2» (flecha, «Ver anteriores», «Usar mi dirección») ya
  no desaparece al volver desde Detalles.

**Hallazgo con los 60 lugares reales:** `e2e/mapa-reparto-de-rotulos.spec.ts`
falla con `pnpm db:seed:lugares` cargado (pasa sin él): los nombres del mapa
se pisan entre sí («Bodega Aida Mota» con «Losa del Pozo Hermoso»). Es lo que
ve hoy el cliente en producción. Pendiente, junto con la densidad del §9.
`happy-path-order.spec.ts` también falla, pero igual sin estos cambios (el
cliente de prueba queda en «validando»): no es de este trabajo.
