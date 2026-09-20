# Home del cliente — hacia un inicio tipo Rappi

> **Actualización 2026-09-19:** el servicio se llama **«Tindivo Entregas»** (antes «Encargos»). Donde este archivo diga **«Encargos»**, léase **«Tindivo Entregas»**, con la bajada *«Recogemos lo que ya pagaste y lo llevamos»*. Precio **S/ 3**. **Aliados en naranja**, otros negocios gris, moto **azul** (`Encargos/08`). Manda `Encargos/08-ux-conversion.md`.

> v0.1 · 2026-09-19 · **A la espera de la imagen de referencia de Jesús.** Lo de Rappi está descrito de memoria y se ajustará con la imagen.
> Relacionado: `docs/Encargos/` (Encargos necesita una puerta de entrada en el home).

---

## 1. Cómo funciona hoy (comprobado en `apps/customer`)

`app/page.tsx` es un componente de servidor: trae `/public/businesses` (con `revalidate: 15`) y el usuario, y los pasa a **`HomeShell`**. De arriba abajo, `HomeShell` pinta:

| # | Bloque | Componente | Qué hace |
|---|---|---|---|
| 1 | Cabecera fija | `HomeHeader` | Logo · **barra de dirección** · botón de carrito · cuenta o ingresar |
| 2 | Saludo | (en `HomeShell`) | «Buenas noches, {nombre} 🍕», o «¿Qué pedimos hoy en la noche?» si no hay sesión |
| 3 | Pedido en curso | `ActiveOrderBanner` | Solo con sesión y pedidos activos. Si no hay, puede salir el recordatorio de reseña |
| 4 | Buscador | `SearchBar` + `SearchResults` | Busca **negocios y platos**, insensible a tildes (`DECISIONS §20`) |
| 5 | Carrusel | `HomeCarousel` | 3 banners **escritos a mano en el componente** (una promo de un restaurante, «recojo en tienda», «califica») |
| 6 | Restaurantes | `BusinessGrid` | Título «Restaurantes»; 1, 2 o 3 columnas según ancho. Aparte, la sección «Próximamente pedidos por la plataforma» para los negocios solo-WhatsApp (`catalog_only`) |
| 7 | Pie | (en `HomeShell`) | «Pedidos directos desde San Jacinto» |

Además, `BottomNav` (Inicio · Pedidos · Cuenta) con un **badge de pedidos activos**.

**Lo que hay que saber de esa estructura:**

- **El home solo conoce restaurantes.** No existe la idea de «servicios» (restaurantes, encargos…): la palabra «Restaurantes» está clavada como título de la lista.
- **Todo el estado de «lo que tengo en curso» sale de `orders`.** `lib/active-orders.ts` consulta esa tabla con Realtime y alimenta el badge, el banner del home, el bloqueo de «un pedido activo por restaurante» y `/cuenta`. **Un encargo no aparecería en ninguno de esos sitios** sin tocarlo.
- **Los textos ya son nocturnos** («Buenas noches», «hoy en la noche», «esta noche»). Encajan con Encargos solo de noche.
- **El muro del piloto está apagado** (`PilotWall` devuelve `null`); el gate real está en el API, sobre el teléfono verificado.
- **Los iconos** vienen de Google Fonts completo, no de un subset: en el `customer` se pueden usar libremente.
- **Los banners del carrusel no son configurables**: cambiarlos exige tocar código y desplegar.

---

## 2. Lo que quiere Jesús

- En el **inicio**, **dos botones grandes**: **Encargos** y **comprar en restaurantes**, para que quede claro desde el primer segundo qué se puede hacer.
- Al **bajar**, se siguen encontrando los restaurantes y lo demás.
- La referencia es el **home de Rappi**. Jesús pasará su imagen.

---

## 3. Propuesta preliminar (antes de ver la imagen)

```
┌──────────────────────────────────────────┐
│ Tindivo   📍 Jr. Grau 123        🛒  (J) │  ← HomeHeader (igual)
├──────────────────────────────────────────┤
│ Buenas noches, Jesús                     │
│ [ 🔎 ¿Qué se te antoja?               ]  │  ← buscador (igual)
│                                          │
│ ┌──────────────────┐ ┌─────────────────┐ │
│ │  🛵  Encargos     │ │  🍽  Restaurantes│ │  ← NUEVO: dos tarjetas grandes
│ │  Recogemos y     │ │  Pide comida a  │ │
│ │  llevamos        │ │  domicilio      │ │
│ │  S/ 3            │ │  3 abiertos     │ │
│ └──────────────────┘ └─────────────────┘ │
│                                          │
│ [ banner del carrusel               • ]  │  ← igual, con un banner de Encargos
│                                          │
│ Restaurantes abiertos ahora              │  ← igual (BusinessGrid)
│ ┌──────────────────────────────────────┐ │
│ │ …                                    │ │
└──────────────────────────────────────────┘
   Inicio        Pedidos (2)        Cuenta
```

### Decisiones de diseño propuestas

0. **Dos colores, para que no se confundan (decisión de Jesús):** los **restaurantes conservan el naranja** de la marca y **Encargos lleva su propio color, un azul vibrante** (ejemplo suyo; Claude Design lo afinará). El mismo azul identifica los encargos en el panel del motorizado y en «Pedidos». El sistema ya tiene un token `Info` (`#0EA5E9`, celeste), que puede ser el punto de partida (`DECISIONS §16`).
1. **Dos tarjetas grandes, no un menú de categorías.** Rappi tiene decenas de categorías y miles de tiendas, y por eso usa filas y filas de carruseles. Aquí hay **dos servicios y pocos restaurantes**; una lista vertical simple es la respuesta correcta. Lo que sí se copia de Rappi es **la jerarquía**: primero *qué quieres hacer*, después *dónde*.
2. **La tarjeta «Restaurantes» hace scroll hasta la lista** (ancla en la misma página). No hace falta una ruta nueva mientras Restaurantes sea el único servicio con catálogo.
3. **La tarjeta del servicio enseña el precio (`S/ 3`)** y su estado: *disponible*, *«Abre a las 6 pm»* o *no visible* si está apagado. Un precio en la tarjeta convierte más que una descripción.
4. **La tarjeta «Restaurantes» enseña cuántos hay abiertos** (dato que ya existe: `is_open_now`).
5. **El «pedido en curso» pasa a cubrir los dos tipos.** «Pedido en curso» y «Encargo en curso», con el mismo banner. El badge de «Pedidos» suma ambos, y `/pedidos` los muestra juntos (con pestañas si hace falta).
6. **No se rompe nada de lo actual**: buscador, carrusel, lista, sección de WhatsApp y pie siguen donde están. Es **añadir un bloque**, no reescribir el home.

### Cómo se construye sin bloquear Encargos

| Paso | Qué | Riesgo |
|---|---|---|
| **H-1** | Bloque `ServiceTiles` con solo la tarjeta de Encargos, detrás de `app_settings.courier.enabled` y de la lista de prueba | Muy bajo: es un componente nuevo entre el saludo y el buscador |
| **H-2** | `active-orders` cuenta también encargos (banner + badge + `/pedidos`) | Medio: es un store compartido por cuatro consumidores (`BottomNav`, home, ficha del negocio, `/cuenta`); **sin romper el bloqueo de «un pedido activo por restaurante»** |
| **H-3** | Las dos tarjetas grandes, ya con el diseño final de la imagen | Bajo, una vez decidido el diseño |
| **H-4** | Carrusel configurable (los banners salen de `app_settings`, no del código) | Opcional |

**Recomendación:** hacer **H-1 y H-2 junto con Encargos**, y **H-3 cuando llegue la imagen**. Así el rediseño no retrasa la feature ni al revés.

---

## 4. Datos que necesita el home

Un endpoint público y cacheable, **igual que `/public/businesses`** (`revalidate: 15`):

```
GET /api/v1/public/courier/status
→ { enabled: boolean, open_now: boolean, price: 3, opens_at: "18:00", closes_at: "23:00" }
```

Sin sesión también funciona: el botón se ve y el login se pide al continuar (`DECISIONS §15`). El horario sale de la misma fuente que el de la plataforma.

---

## 5. Preguntas para cerrar el diseño

1. **La imagen de referencia**, para ajustar tarjetas, jerarquía y espaciado. Si quieres, puedo dibujar el home en **Pencil** (`.pen`) a partir de ella antes de tocar código.
2. **Nombre de la tarjeta:** «Restaurantes», «Pedir comida» o «Comprar en restaurantes» (como lo dijiste). *Propuesta:* **«Restaurantes»**, con la línea «Pide comida a domicilio». Mantiene el vocabulario de todo el sistema.
3. **¿La tarjeta de Restaurantes baja a la lista o abre una página propia?** *Propuesta:* baja (ancla).
4. **¿El buscador sigue arriba del todo o baja debajo de las tarjetas?** *Propuesta:* arriba, como ahora; busca restaurantes y platos, y Encargos no se busca.
5. **¿Quieres ilustraciones o iconos propios en las tarjetas?** Necesito artes para «Encargos» y para el banner del carrusel.
6. **¿Aplica también a la vista de escritorio?** El home ya se ensancha hasta `max-w-7xl`; dos tarjetas grandes en escritorio se ven bien, pero conviene decidirlo.
