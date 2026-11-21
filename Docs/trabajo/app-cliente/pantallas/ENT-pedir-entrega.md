# ENT · Tindivo Entregas (pedir, mis entregas y seguimiento)

> **Migrado a `Docs/producto/entregas/` (2026-11-18).** Lo vigente está allí; este archivo queda como borrador de origen.

> **Decisiones de Jesús del 2026-11-17 que cambian esta pantalla** (donde choquen con el texto de abajo, manda esto):
> - Se prohíbe lo que prohíbe inDrive: alcohol, tabaco y vapeadores; joyas, metales y piedras preciosas; efectivo, billetes y moneda; armas, municiones y armas blancas; explosivos, pólvora, fuegos artificiales y venenos; drogas; material obsceno; artículos de venta restringida. Los documentos sí (CUS-ENT-022).
> - El texto «Sin alcohol, sin nada que necesite receta especial ni refrigeración» (punto 5 de «Contenido») y la categoría «Medicinas» se ajustan a esa lista; medicamentos queda por decidir (punto X). Se retira la declaración de efectivo o joyas al pedir.
> - La maqueta `Entregas` dice «Que entre en una mochila y pese hasta [PESO MÁXIMO]»: coincide con CUS-ENT-010.

> **Diseño v3 pendiente.** Esta spec recoge **solo lo que hace hoy el código Android** (`feature/courier`). No es un diseño
> nuevo. La maqueta `Entregas` existe en el canvas pero es de la versión anterior y **no manda** hasta que se rediseñe.

| | |
|---|---|
| **Tarea de la persona** | Pedir que un motorizado lleve algo ya pagado de un punto A a un punto B, y seguir la entrega. |
| **Se llega desde** | Tarjeta «Tindivo Entregas» de `CAT-inicio` («Llevar algo de un lugar a otro»). |
| **Se sale hacia** | «Pedir una entrega» → formulario «Detalles de la entrega». Una entrega de «Mis entregas» → «Tu entrega». Direcciones → `ADR-mapa`. «Verificar mi celular» → `AUT-celular`. «Iniciar sesión» → `AUT-entrar`. «Completar mi nombre» → hoja de nombre. |
| **Requisitos** | ENT (requisitos de `requisitos/ENT.md`; sin IDs citables aún) · CUS-AUT-007 · CUS-ADR-003 · (requisito nuevo: ninguno propuesto en esta spec) |
| **Endpoints** | `GET /public/courier/status` (¿abierto hoy?, horario y precio base; sin sesión) · `POST /customer/courier-orders` con `Idempotency-Key` · `GET /customer/courier-orders` (página, la más reciente primero) · `GET /public/courier/{shortId}` (seguimiento, sin teléfonos) · `POST /customer/courier-orders/{id}/cancel` (409 = ya la tomó un motorizado) · `GET /customer/addresses` · `GET /public/config` |
| **Estado** | Android: 🟡 funciona con el diseño anterior; rediseño v3 ⬜ · iOS: ⬜ |

## Contenido, de arriba abajo (lo que hace hoy el código)

### Inicio de Entregas
1. Barra con volver y «Tindivo Entregas». Subtítulo «Llevamos tus cosas de un lugar a otro».
2. Datos: «Desde [tarifa] · Hasta 5 kg» y, con horario, «Desde [tarifa] · Hasta 5 kg · [horario]» (por ejemplo «[HORA] a [HORA] [días]»).
3. Si está cerrado: «Cerrado ahora.» y «Abre a las [hora] [días]». Si el servicio está apagado: «Tindivo Entregas no está disponible ahora.»
4. Botón «Pedir una entrega». Sin sesión: «Inicia sesión para pedir una entrega y ver las tuyas.» + «Iniciar sesión».
5. **«Mis entregas»:** lista con «[origen] → [destino]», «#[código] · [fecha] · [importe]» (o «Sin cobro»), estado («Buscando motorizado», «Confirmado», «En camino», «Entregado», «Cancelado», «En curso») y «Ver más». Sección «Entrega en curso» arriba si hay una.

### Formulario «Detalles de la entrega»
1. «Recogemos de» → «Elegir dónde recogemos»; «Entregamos a» → «Elegir dónde entregamos». Cada punto: dirección, «Cómo llegar (referencia)», «Celular (+51)» y el nombre opcional de quien entrega o recibe; «Soy yo» rellena con los datos propios. Se elige entre «Mis direcciones», «Sitios anteriores», «Agregar una dirección» o «Marcar en el mapa» (con «Confirmar recojo» / «Confirmar entrega»; «Dentro de la zona de reparto» o «Esta ubicación está fuera de la zona de reparto de San Jacinto»).
2. «¿Qué llevamos?» con descripción («Ej.: Un sobre con documentos») y categoría: «Documentos», «Comida», «Medicinas», «Ropa».
3. «¿Quién paga?»: «Quien entrega · Al recoger» o «Quien recibe · Al entregar»; «Al motorizado: efectivo exacto o Yape. Transporte desde [tarifa].»
4. «Indicaciones para el motorizado (opcional)».
5. Casilla «Ya está listo y pagado. Tindivo no compra ni adelanta dinero. Máx. 5 kg.» y texto «Hasta 5 kg, sin foto. Sin alcohol, sin nada que necesite receta especial ni refrigeración. El motorizado puede rechazar la entrega si al recoger no cumple esto.»
6. Botón «Pedir entrega · [tarifa]».

### «Tu entrega» (detalle)
Titular según estado («Buscando motorizado», «Va a recoger», «Recogiendo», «En camino», «Entregado», «Cancelado»), pasos (Pedido, Confirmado, En camino, Entregado), «Motorizado de Tindivo: [nombre]», «Transporte: [importe]», quién paga, «Código: [código]»; mientras busca: «Avisamos a los motorizados disponibles. Si nadie la toma en [N] min, se cancela sola y no se cobra nada.» con cuenta atrás «Se cancela sola en [mm:ss]». «Cancelar solicitud» → «¿Cancelar esta solicitud? Los motorizados dejarán de verla.» · «No, esperar» / «Sí, cancelar». Entregado: «Tu entrega llegó.» y «Pedir otra entrega». Cancelado: motivo («No hubo motorizado disponible.», «El motorizado no pudo tomar esta entrega.», «El pedido no estuvo listo a tiempo.», «No se pudo cobrar el transporte.», «Cancelaste esta entrega.», «No pudimos contactar a quien recibe.», «Esta entrega se canceló.») + «No se cobró nada.» y «Volver a pedir».

## Estados

| Estado | Qué se ve |
|---|---|
| Cargando | «Cargando…», «Cargando tus entregas», «Preparando tu solicitud», «Cargando tu entrega» |
| Sin entregas | «Aún no has pedido ninguna entrega.» · «Cuando pidas una, aquí verás cómo va.» |
| Error de estado | «No pudimos ver si Entregas está abierto.» |
| Error de lista | «No pudimos cargar tus entregas.»; «No pudimos cargar más. Toca para reintentar.» |
| Error de detalle | «No pudimos cargar tu entrega.»; «No encontramos esa entrega, o ya no está disponible.» |
| Falta nombre | «Para pedir, dinos cómo te llamas.» + «Completar mi nombre» |
| Falta celular | «Verifica tu número de WhatsApp antes de hacer un pedido.» + «Verificar mi celular» |
| Faltantes del formulario | «Falta elegir dónde recogemos / entregamos», «Falta cómo llegar a donde recogemos / entregamos», «Falta decir qué llevamos», «Falta el celular de quien entrega / recibe», «Marca que está listo y pagado» |
| Enviando | «Enviando…»; no se puede tocar dos veces |
| Sin red al pedir | «No pudimos conectarnos. Revisa tu señal y vuelve a tocar «Pedir entrega».» |
| Solicitud en proceso | «Tu solicitud se está procesando. Espera un momento y vuelve a tocar.» |
| Ya creada | «Ya habíamos creado esta entrega. Revísala en «Mis entregas».» |
| Duda tras un corte | «No sabemos si tu última solicitud se creó. Revisa «Mis entregas» antes de pedir otra.» + «Ver mis entregas» / «Ya revisé, pedir» |
| Error al cancelar | «No pudimos cancelar: revisa tu conexión.» / «No se pudo cancelar.» |

## Criterios de aceptación propios de la pantalla

```
CA-ENT-P1 · Una entrega ya tomada no se cancela
  Dado una entrega con un motorizado asignado
  Cuando la persona intenta cancelar y el servidor responde 409
  Entonces la app muestra que ya no se puede cancelar y refresca el detalle

CA-ENT-P2 · Reintento tras un corte no duplica la entrega
  Dado un envío de «Pedir entrega» que se cortó sin respuesta
  Cuando la persona vuelve a intentar
  Entonces se usa la misma Idempotency-Key y no se crean dos entregas
```

## Movimiento

Sin especificar: este diseño es de la v1. No inventar hasta el rediseño v3.

## Pendiente (va a `decisiones-abiertas.md`)

- **Diseño v3 pendiente** de toda el área. La maqueta `Entregas` trae un diseño propio (pasos «1 Recoger en» y «2 Entregar en», «¿Qué llevamos?», casilla «Es frágil», «Que entre en una mochila y pese hasta [PESO MÁXIMO]. Lo que llevamos ya debe estar pagado.», «Pedir motorizado» y «S/ [TARIFA]»); el código es distinto en texto y en pasos. No se elige.
- **Maqueta ↔ código:** la maqueta dice «Pedir motorizado»; el código «Pedir entrega · [tarifa]» y «Pedir una entrega». La maqueta no tiene categorías ni «¿Quién paga?».
- **Documento ↔ código:** el peso máximo es «Hasta 5 kg» en el código y en las decisiones de Jesús («que quepa dentro de la mochila del motorizado» + 5 kg); la maqueta tiene `[PESO MÁXIMO]` por parámetro.
- Decisiones de Jesús sin pantalla: «cliente no está» (T7). La lista de prohibidos (la de inDrive, que **incluye** efectivo, joyas y alcohol) quedó decidida el 2026-11-17: ver `CUS-ENT-022`.
