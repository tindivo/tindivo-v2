# 08 · UX: que pedir sea facilísimo, desde donde sea

> v0.2 · 2026-09-19 · A pedido de Jesús: *«necesitamos que sea mucho más fácil todo este tema de recojos… no basta que simplemente vayan a nuestro directorio y recojan llamadas, y nunca utilicen la sección de recojo».* **El directorio todavía no existe** (§0): esto es diseño preventivo.
> Este documento manda sobre lo visual de `01` §2 y `Home/README.md` cuando discrepen.

---

## 0. El punto de partida: es prevención, no diagnóstico

> **Corrección (2026-09-19, misma noche).** En la primera versión traté el directorio como algo **que ya existe y que la gente visita sin pedir recojos**. **No es así**: Jesús aclaró que **hoy no hay directorio ni captura**, y que hay que **pasar por cada negocio y cargar sus datos** (checklist de `origen-jesus/02` §5). Yo lo había entendido mal.

**Lo que Jesús pide, entonces:** que cuando el directorio exista —con **logo, notas y toda la información** de `origen-jesus/02`— **pedir que te lo lleven sea facilísimo desde cualquier sitio**, para que no pase lo que es tan común en un directorio: mucha gente mira, llama, y nadie usa el servicio.

**Cómo se lee este documento:** lo que sigue **no es un diagnóstico de una pantalla real**, sino **los riesgos que hay que evitar de fábrica**. Es más barato diseñar el botón junto al teléfono desde el primer día que corregirlo después de ver que nadie lo toca. Los datos reales llegarán con el embudo de §9.

**El principio que sí se puede afirmar sin datos:** un servicio que vive en *«una sección»* a la que el usuario tiene que *ir* pierde contra un botón de *Llamar* que ya está delante. La gente no va a secciones; **actúa donde está**.

---

## 1. Por qué podrían no usarlo: los cinco riesgos (de más a menos probable)

| # | Hipótesis | Cómo se ve | Cómo se comprueba |
|---|---|---|---|
| **H1** | **Llamar cuesta un toque; pedir cuesta un flujo.** Con el teléfono a la vista, llamar gana siempre | Muchas llamadas, pocos pedidos, desde la misma pantalla | `click_llamar` vs `click_pedir` por superficie |
| **H2** | **El servicio no está en el momento de decidir.** Está en una sección aparte | El que entra a ver un negocio nunca ve la oferta | Eventos por punto de entrada (`src`) |
| **H3** | **No saben qué hace ni cuánto cuesta.** «Recojo» no dice «te lo llevo a tu casa por S/ 3» | Poca apertura del flujo | Clics en el botón con y sin precio |
| **H4** | **Login y código por SMS antes de ver nada** | Abren el flujo y lo abandonan al pedir el celular | Embudo: abre → ve precio → login → envía |
| **H5** | **El nombre confunde** («Recojo» = ir a buscarlo yo; «Encargos» = comprar) | Nadie lo toca aunque lo vea | Prueba de 5 segundos (§7) |

**La consecuencia de diseño:** llevar más tráfico *hacia* el servicio no arregla nada. **Hay que poner el servicio donde ya está el tráfico**, es decir, en el directorio mismo, junto al teléfono.

---

## 2. Diez reglas

1. **Dos botones iguales, siempre, junto al teléfono:** `[📞 Llamar]` `[🛵 Te lo llevamos · S/ 3]`. En toda tarjeta, fila, pin y ficha de negocio. **El servicio no se busca: aparece.**
2. **El precio va dentro del botón.** «S/ 3» ahí mismo responde H3 sin una pantalla.
3. **Un toque abre y un toque confirma** (más el código del celular la primera vez). Para lograrlo, **todo llega relleno** (§3).
4. **No hay «ir a la sección».** El pedido se abre **encima de la página actual** (hoja inferior) y al cerrarla el usuario sigue donde estaba.
5. **El precio y todo el detalle se ven *antes* de iniciar sesión.** El login es lo último (§6).
6. **Una sola pantalla de confirmación, no un asistente de cuatro pasos.** Los cuatro pasos de `origen-jesus/01` son cuatro *bloques* de una pantalla, editables en su sitio.
7. **Solo se pregunta lo imprescindible.** Cada campo extra es una salida (`origen-jesus/01` §1 ya lo dice).
8. **La moto es la identidad:** un icono reconocible en botones, pins y seguimiento (§5).
9. **Lenguaje concreto y en positivo:** *«¿Ya pediste y no puedes ir? Te lo llevamos por S/ 3»*. Nunca criticar el delivery de un negocio (`origen-jesus/04` §7).
10. **Cada punto de entrada lleva `?src=`** para saber cuál funciona. Lo que no se mide, se adivina.

---

## 3. La pantalla de pedido

**Una hoja inferior sobre el mapa** (el mapa es lo principal, decisión de Jesús). Desde el botón de un negocio ya casi no hay nada que escribir:

```
┌──────────────────────────────────────────┐
│          [ mapa de San Jacinto ]          │
│      🏪 Elmer ─ ─ ─ ─ ─ ─ ─ ─ ─ 📍 Tu casa │  ← línea recta punteada
│                                          │
├──────────────────────────────────────────┤
│  Te lo llevamos                       ✕  │
│  Solo recogemos y llevamos. No compramos.│
│                                          │
│  🏪 Recogemos en   Elmer · Chaufa      ⌄ │  ← fijo, ya elegido
│  📍 Llevamos a     Jr. Grau 123 · GPS  ⌄ │  ← de tu perfil, o «usar mi ubicación»
│  🕒 Estará listo   [Ya] [10] [20] [30]   │  ← el chip típico ya marcado
│  👤 A nombre de    Jesús                 │  ← el único texto que puede pedirse
│                                          │
│  Pagas al motorizado al recibir: S/ 3    │
│  (efectivo exacto o Yape)                │
│                                          │
│  [        Pedir · S/ 3        ]          │
└──────────────────────────────────────────┘
```

**Todo llega relleno de dónde ya está:**

| Dato | De dónde sale |
|---|---|
| Punto A | El negocio del que se viene (o «Otro lugar o persona» → selector en mapa) |
| Punto B | `customer_profiles.default_address` y coordenadas (ya existen), o el botón «usar mi ubicación» (`lib/geolocation.ts`) |
| Hora de listo | El chip más cercano a `prep_tipico_min` del negocio; si no hay, «Ya está listo» |
| «A nombre de» | El nombre del perfil, editable |
| Teléfono | El del perfil verificado |
| Cobro | Una línea de información, **no una elección** en v1 (`07` C2) |

**Pasos reales para pedir desde una tarjeta de negocio:** tocar el botón → tocar «Pedir». **Dos toques.** Si es la primera vez, se suma el código del celular.

**«Otro lugar o persona»** (persona a persona) sí abre el selector de mapa para el punto A y pide la referencia escrita: es el único caso con algo de trabajo.

---

## 4. Dónde aparece (todas las superficies)

Ordenadas por **cuánto tráfico y cuánta intención** concentran. Las primeras cuatro son las que resuelven el problema de Jesús.

| # | Superficie | Qué se ve | Prioridad |
|---|---|---|---|
| **1** | **Cada fila o tarjeta de negocio** (directorio, lista, buscador) | Los **dos botones**; bajo el teléfono, la línea *«¿Para llevar? Te lo llevamos por S/ 3»* | **Primera** |
| **2** | **El mapa** | Pin del negocio con **insignia de moto**; al tocarlo, la ficha con los dos botones; una **pastilla flotante** *«🛵 Te lo llevamos · S/ 3»* siempre visible para «otro lugar o persona» | **Primera** |
| **3** | **La ficha de un negocio** (su página) | **Barra inferior fija** con `Llamar` y `Te lo llevamos · S/ 3` | **Primera** |
| **4** | **Aviso al volver de «Llamar»** | Hoja discreta: *«¿Ya hiciste tu pedido a Elmer? Que Tindivo lo recoja · S/ 3»* (`origen-jesus/04` §4) | **Primera** |
| 5 | **El home** | Tarjeta grande del servicio junto a la de restaurantes (`Home/README.md`) | Segunda |
| 6 | **Buscador sin resultados** | *«¿No lo encuentras? Escríbelo y lo recogemos»* | Segunda |
| 7 | **Fin de un pedido de restaurante** | *«¿Necesitas que recojamos algo más?»* | Segunda |
| 8 | **Enlaces y QR** (`/r/<slug>`, afiche, estado de WhatsApp) | **Abren la hoja de pedido directamente**, con el negocio ya elegido | Según fase |

**Aliados y negocios con perfil en Tindivo** (petición de Jesús). En el buscador de recojo, un negocio que **ya tiene su perfil y su carta en Tindivo** muestra **«Ver carta en Tindivo»**, que lleva a su página (`/negocio/<id>`, donde está todo el catálogo). Es mejor para todos los aliados: **el cliente puede pedir de la carta y no solo pedir que se lo lleven**. Los negocios `catalog_only` (WhatsApp) aparecen así: `[Ver carta]` `[Te lo llevamos]`. Un **aliado con delivery propio en Tindivo** muestra solo `[Pedir en Tindivo]`.

---

## 5. La moto en el mapa

Jesús pidió *«un icono de una moto en el mapa, lo que sea, pero que sea mucho más fácil»*. Se usa en tres sitios, con tres significados distintos:

1. **Insignia sobre el pin del negocio** que acepta encargos: dice *«aquí te lo llevamos»*. Es la pieza que **conecta el mapa con la acción** (`origen-jesus/03` §3, que solo distinguía por color).
2. **La pastilla flotante** del mapa: el acceso a «otro lugar o persona».
3. **En el seguimiento**, una moto **como identidad**, no como posición real: **no hay GPS del motorizado** (`07` T). Se coloca sobre A o B según el estado. Es honesto (no promete lo que no hay) y da la sensación de progreso.

**Icono:** `two_wheeler` de Material Symbols. Existe en el subset de `motorizados` y `negocios`, y el `customer` carga el set completo.

**Color en el mapa (decidido por Jesús): aliados en naranja.** En sus documentos eran rojo vibrante, pero el rojo del sistema es `Danger` (`#DC2626`) y **se lee como error o peligro**. Queda así: **aliados naranja de marca, demás negocios gris, y la moto en azul vibrante**: tres colores, tres significados, sin rojo. Los tonos exactos se afinan en Claude Design.

---

## 6. Iniciar sesión al final, sin perder lo escrito

Hoy el checkout ya usa **onboarding diferido** (`DECISIONS §15`): se puede armar el pedido sin cuenta y se exige al final. Se reutiliza:

- El usuario ve el **precio y todo el detalle sin iniciar sesión**.
- Al tocar **«Pedir · S/ 3»** sin sesión se abre el flujo de ingreso ya existente (`useOnboarding.openSheet({ next })`, verificación por código).
- **El borrador se conserva** (en `localStorage`, con el mismo cuidado de `try/catch` de `persistence.ts`) y, al terminar el ingreso, **el pedido se envía solo**: el usuario no vuelve a tocar nada.

**Cómo se dispara desde cualquier página sin acoplar módulos:** la regla del repo prohíbe que una *feature* importe de otra. Se resuelve como el ingreso: un **almacén global** (`lib/`) con `openErrandSheet({ placeId, src })` y **un anfitrión de la hoja montado una vez en el layout** (mismo patrón que `auth-onboarding/host.tsx`). Así el botón del directorio, el del mapa y el del home **son el mismo botón**, y no hay tres implementaciones que mantener.

---

## 7. El nombre

**Lo que dijo Jesús:** «Encargos» se confundiría con *«voy a ir a comprar algo»*; «Recojo» choca con el recojo en tienda. **Ambas objeciones son correctas** (`07` §2). Lo que hay que nombrar es *«Tindivo va, recoge lo que ya está listo y te lo lleva»*.

| Opción | Lo bueno | El riesgo |
|---|---|---|
| **«Te lo llevamos»** | Habla del **resultado para el cliente**; no sugiere comprar; no choca con nada; combina con el botón (`Te lo llevamos · S/ 3`) | Es una frase, no un sustantivo: no sirve como nombre de sección en un menú (pero no habrá sección, regla 4) |
| **«Envíos»** | Una palabra, universal, sirve para persona a persona | Suena a paquetería; **ya se usa** «envío gratis» para el costo de delivery de restaurantes |
| **«Encargos»** | Es la palabra de Jesús y de sus clientes | Sugiere compras. **Solo funciona si la bajada lo desmiente siempre**: *«Solo recogemos y llevamos. No compramos.»* |
| **«Recojo»** | — | **Choca** con «Recojo en tienda» (126 usos en `apps/customer`) |

**Recomendación:** **«Te lo llevamos»** como nombre y como texto de los botones, con la línea fija *«Solo recogemos y llevamos. No compramos ni pagamos por ti.»* **El nombre técnico en código y base de datos sigue siendo `errands`** (regla del repo: código en inglés), y **no se ve**: cambiarlo en pantalla es cambiar un texto.

**Cómo decidirlo sin discutirlo:** una **prueba de 5 segundos**. Pregunta a 5 clientes (o publica una encuesta en el estado de WhatsApp): *«Si ves un botón que dice "X · S/ 3", ¿qué crees que hace?»*. Con «Te lo llevamos» y con «Encargos», y mira cuál entiende «recogen algo y me lo traen» sin explicar nada.

---

## 8. Banco de textos (provisional, ajustable en el diseño)

| Sitio | Texto |
|---|---|
| Botón en un negocio | **Te lo llevamos · S/ 3** |
| Bajo el teléfono | ¿Para llevar? Te lo llevamos por S/ 3 |
| Mensaje fijo de la hoja | Solo recogemos y llevamos. No compramos ni pagamos por ti. |
| Aviso post-«Llamar» | ¿Ya hiciste tu pedido a **Elmer**? Que Tindivo lo recoja · S/ 3 |
| Home | ¿Pediste y no puedes ir? Nosotros vamos. |
| Sin resultados | ¿No lo encuentras? Escríbelo y lo recogemos. |
| Fin de pedido | ¿Necesitas que recojamos algo más? |
| Cobro | Pagas al motorizado al recibir: S/ 3 (efectivo exacto o Yape) |
| Fuera de horario | Te lo llevamos atiende de 6 pm a 11 pm |
| Pausado | Ahora no estamos recogiendo. Vuelve a las [hora] |

---

## 9. Cómo saber si funciona

**Embudo**, con un evento por paso y el `src` de cada uno:

`vio el botón → tocó Llamar / tocó «Te lo llevamos» → abrió la hoja → tocó «Pedir» → inició sesión → pedido enviado → aceptado → entregado`

| Qué se mira | Qué dice |
|---|---|
| **«Te lo llevamos» ÷ «Llamar»**, por superficie | Si H1/H2 se resuelven. **Es la métrica que importa** |
| **Abrió la hoja → «Pedir»** | Si la pantalla es corta y clara (H3, H6, H7) |
| **«Pedir» → sesión iniciada → enviado** | **Cuánta gente se pierde en el ingreso** (H4). Si es alta, el problema es el código del celular, no el botón |
| **Pedidos enviados → entregados** | Si la operación responde |

**Umbral provisional (una suposición mía, sin datos):** que **1 de cada 10 personas que llaman a un negocio toque «Te lo llevamos»**. Se fija la línea base la **primera semana** y se corrige. Reglas de decisión de `origen-jesus/05` §7 aplican tal cual (≥ 40/semana, 15–40, < 15).

**Dónde se guardan los eventos** (`07` Q): una tabla mínima `funnel_events`, escrita **por una ruta del API** (`anon` no inserta directo, por RLS).

---

## 10. Lo que queda por resolver con Jesús

1. **El nombre.** «Te lo llevamos» le parece bien pero busca algo **más fácil**: ver la lluvia de ideas de §11.
2. **Las «notas» del directorio** (`04` P-14): ¿son **internas** (`nota_interna`, solo Jesús) o hay también una **nota pública** que ve el cliente («solo efectivo», «pedir con 15 min de anticipación»)?
3. **Analítica:** no hay directorio, así que **no hay línea base**. El embudo de §9 la crea desde el primer día.

---

## 11. Lluvia de ideas (para seguir conversando)

### 11.1 Nombres, más fáciles de decir

Criterios: **se entiende solo**, **corto**, **no sugiere comprar**, **no choca** con lo que ya existe.

| Nombre | Se entiende | Corto | Sin choques | Comentario |
|---|:-:|:-:|:-:|---|
| **Te lo llevamos** | ✅ | 🟡 | ✅ | El favorito hasta ahora. Sirve para negocio y para persona a persona |
| **Lo llevamos** | ✅ | ✅ | ✅ | Más corto; pierde el «te» (menos cálido) |
| **Te lo traemos** | ✅ | 🟡 | ✅ | Muy claro para «que me lo traigan», **pero falla** para «que lleven algo a otra persona» |
| **Yo voy** / **Nosotros vamos** | 🟡 | ✅ | ✅ | Es el gancho del afiche («¿Pediste y no puedes ir? Nosotros vamos»); como nombre, no dice qué hace |
| **Mandaditos** | ✅ | ✅ | ✅ | Muy peruano y cercano; **arrastra la idea de «ir a comprar»**, justo lo que Jesús quiere evitar |
| **Delivery a cualquier negocio** | ✅ | ❌ | 🟡 | Todos entienden «delivery»; largo, y se confunde con el delivery de restaurantes aliados |
| **Envíos** | 🟡 | ✅ | 🟡 | Suena a paquetería; «envío gratis» ya significa el costo de delivery |
| **Tráelo** | ✅ | ✅ | ✅ | Imperativo, tú le hablas a la app; suena a «trae» al negocio, no al motorizado |
| **Moto Tindivo** | 🟡 | ✅ | ✅ | Fuerte visualmente; **se puede leer como mototaxi** (transporte de personas) |
| **Recogemos** | ✅ | ✅ | 🟡 | Dice la mitad («recogemos»), y suena a «Recojo» |

**Mi orden:** «Te lo llevamos» → «Lo llevamos» → «Delivery a cualquier negocio». Los tres se prueban con la **prueba de 5 segundos** de §7. Los que descarto por riesgo: «Mandaditos» (sugiere comprar), «Moto Tindivo» (mototaxi), «Recojo» (choque).

### 11.2 Ideas para que pedir sea aún más fácil

Ordenadas de **más barata** a **más ambiciosa**. Ninguna está decidida.

1. **Un toque desde el propio botón de «Llamar».** Al tocar «Llamar» en un negocio no aliado, en lugar de esperar a que vuelva, **el botón de llamar y el de «Te lo llevamos» comparten fila** (ya en las reglas), y la **hoja post-llamada** se prepara *mientras* el usuario habla (ya tiene todo relleno al volver).
2. **Compartir a WhatsApp con un enlace que ya trae el negocio.** El negocio (o Jesús) manda `tindivo.com/r/<slug>` por su estado; quien lo abre **cae directo en la hoja de pedido**, sin ver un solo menú.
3. **«Pedir lo mismo de la última vez».** Quien ya pidió un recojo a un negocio ve, al volver, un botón *«Otra vez en Elmer · S/ 3»*: **un toque**. Es la mejora de retención más barata (`origen-jesus/05` mide «segundo recojo»).
4. **Guardar «mi casa» y «mi trabajo».** El punto B ya sale de `customer_profiles`; con una segunda dirección guardada, elegir dónde recibirlo es un toque, no un mapa.
5. **Chips de hora inteligentes.** Preseleccionar el chip según `prep_tipico_min` del negocio, y, si el usuario **acaba de tocar «Llamar» hace menos de 5 min**, sugerir *«En 20 min»* (aún está preparándose).
6. **Compartir el seguimiento con quien va a recibir** con un botón de WhatsApp en la pantalla final (ya se planteó `wa.me`; no cuesta nada).
7. **Recordatorio de «Martes de Recojo»** en los estados de WhatsApp de Jesús, con el enlace del servicio (idea de `origen-jesus/04` §8).
8. **Que el negocio también lo pueda ofrecer en el mostrador:** un **QR pegado en la caja** que, al escanearlo, abre la hoja con ese negocio. Para quien **ya está ahí** y quiere que se lo lleven después.
9. **Pedir por voz de WhatsApp** (más ambicioso, fuera de v1): un número de WhatsApp de Tindivo donde escribir «recoge mi pedido en Elmer» y un flujo asistido. Es lo que hoy hace el competidor por llamada; conviene tenerlo presente, no construirlo ahora.

**Lo que NO haría:** un pop-up al cargar la página, ni un modal a pantalla completa, ni pedir el celular antes de ver el precio. Todo eso sube el rechazo, que es lo contrario de lo que se busca.

---

## 12. Modelo del directorio (lo que hay que cargar)

Lo definen `origen-jesus/02` §3 y §5. Aquí solo lo que hay que tener presente para construirlo bien: **logo, notas y toda la información**, cargados **a mano y en la calle**.

- Tabla **nueva y ligera** `catalog_places`, con el patrón de `map_landmarks` (`0208`): RLS calcada, **caja de sanidad geográfica** (lat -9.20…-9.10, lng -78.33…-78.23) y hoja de edición **pensada para el celular**.
- **El logo** se sube desde la cámara, se **redimensiona y comprime** al subir (256×256, WebP) y vive en un bucket propio.
- **Campos** (nombres en inglés, `07` §3 L): `slug`, `name`, `category`, `tags` (máx. 3), `logo_url`, `tagline` (≤ 80), `phone`, `alt_phone`, `has_whatsapp`, `lat`, `lng`, `reference`, `hours_text`, `typical_prep_min`, `is_partner`, `active`, `consent_ok` (interno), `internal_note` (interno) y, **si Jesús lo confirma, `public_note`** (≤ 80, visible).
- **Publicar exige poco:** nombre, teléfono, ubicación por GPS y logo. Todo lo demás se completa después. Un negocio incompleto se guarda como **borrador**, para poder registrar en la calle sin frenarse.
- **Los negocios con perfil en Tindivo** (aliados y `catalog_only`) **no se cargan dos veces**: el buscador los toma de `businesses` y los mezcla con los de `catalog_places`.
- **Teléfonos** con el formato peruano de 9 dígitos que ya usa el sistema (`^9[0-9]{8}$`).
- **Cuidado con los `slug`:** los negocios de `businesses` ya tienen el suyo (`/negocio/<slug>`); el de `catalog_places` no debe repetirlo.
