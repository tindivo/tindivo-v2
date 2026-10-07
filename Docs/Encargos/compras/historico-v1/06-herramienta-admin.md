# 06 · La herramienta de Jesús (admin)

> **Principio:** Jesús **mira**, no reparte. El admin le sirve para tres cosas:
> crear un encargo cuando alguien no puede usar la web, ver a tiempo lo que se
> está torciendo y cerrar la noche. **Meta: ≤ 15 min por noche.**
>
> Hoy Entregas **no tiene panel** (`Docs/Entregas/estado-actual.md` §5): Jesús
> mira la tabla en Supabase o corre `consultas.sql`. Con dinero de productos de
> por medio, eso no alcanza.

Todo vive en `apps/admin`, que ya tiene `deuda-entregas`, `mapa-referencias` y
`store`. Pantallas nuevas, en orden de importancia:

## 1. `/encargos`: el tablero en vivo

Una fila por encargo **activo** (y por entrega, con un filtro), ordenada por
urgencia. Cada fila: código, cliente, tienda, estado, minutos en ese estado,
total gastado contra el tope.

**Alertas** (la fila se pone ámbar y suena una vez):

| Alerta | Cuándo | Qué hace Jesús |
|---|---|---|
| **Nadie lo acepta** | Quedan 5 de los 15 min | Ver si el motorizado está con comida. Puede cancelar con aviso honesto |
| **Mucho tiempo en la tienda** | > 15 min en «Comprando» | Llamar al motorizado |
| **Pregunta sin respuesta** | El cliente no contesta y era el imprescindible | Nada: vence solo a los 3 min. Es aviso, no tarea |
| **Encargo largo** | > 60 min desde aceptado | Mirar qué pasó |
| **Cobro raro** | Lo cobrado ≠ total + servicio | Revisar en el cuadre |

Lo que **no** hace el tablero: asignar. El motorizado acepta desde su app, como
hoy. Asignar a mano es el camino directo a que Jesús vuelva a ser el centro de
llamadas.

## 2. `/encargos/nuevo`: crear un encargo desde WhatsApp

Para el cliente que escribe por WhatsApp y no va a usar la web (`02` §6). Tiene
que tomar **menos de un minuto**:

1. **Celular.** Al escribirlo, sale su historial: nombre, últimas direcciones
   de entrega (de `orders` y `courier_orders`), su nivel (`04` §3) y si está
   bloqueado.
2. **Tienda**, del directorio o a mano.
3. **Pegar la lista.** Jesús pega el mensaje tal cual (*«2 panadol antigripal y
   unos pañales huggies M porfa»*) y la app lo parte en renglones, uno por
   línea o por «y». Jesús corrige si hace falta. **Sin IA en v1**: partir por
   líneas y «y» resuelve la mayoría, y no se depende de nada externo.
4. **«Si no hay»** por renglón (viene «Pregúntame»), **tope** y **forma de
   pago**.
5. **Crear.** Sale el **enlace de seguimiento** con un botón «Copiar» para
   pegarlo en el WhatsApp del cliente. Desde ahí, el cliente decide las
   preguntas en el enlace, igual que en la web.

**Lo que corrige de Entregas:** hoy, un pedido por WhatsApp sale con el nombre
de Jesús en «a nombre de» (`estado-actual.md` §5). Aquí el encargo es **del
celular del cliente** (`requester_phone`) y Jesús queda como quien lo creó
(`created_by`). Su historial y sus bloqueos funcionan igual.

## 3. `/encargos/[id]`: la ficha

Todo el encargo en una pantalla: la lista con lo que pasó en cada artículo
(comprado, parecido, saltado, preguntado y qué contestó), la foto de la boleta,
el cobro, la línea de tiempo y quién hizo cada cosa (de `courier_order_events`).

Acciones, solo de Jesús:

- **Cancelar** con motivo (sin cobro antes de comprar).
- **Marcar pérdida** (cliente no pagó) y **bloquear el celular** de un toque.
- **Devolver** un monto al cliente (caso 26 de `03`): registra cuánto y por qué.

## 4. `/cuadre`: la noche de cada motorizado

Sale de `/deuda-entregas` y la absorbe: una sola pantalla por motorizado y
noche.

- **Fondo entregado** (lo registra Jesús al empezar el turno, o lo confirma si
  lo marcó el motorizado).
- Encargo por encargo: compra, cómo se pagó, cobro, cómo se cobró, foto.
- Entregas: lo cobrado de transporte (lo que ya muestra `/deuda-entregas`).
- **Lo esperado** en canguro y Yape (`04` §5.2) frente a **lo declarado** por el
  motorizado.
- **Confirmar**, o **anotar diferencia** con una nota.

## 5. `/clientes`: niveles y bloqueos

Buscar por celular: pedidos de comida, entregas y encargos; nivel; pérdidas;
**bloquear / desbloquear** con nota. Reutiliza lo que ya exista de
`customer_strikes` (`0002`) si encaja. **Se comprueba el miércoles** antes de
crear otra tabla.

## 6. `/directorio`: tiendas, aliados y productos

Hoy `directory_businesses` **no tiene ninguna pantalla de alta** y está vacía
en prod (0 filas). Sin esto no hay «Donde haya» ni catálogo. Mínimo para el
sábado:

- **Alta desde el celular, en la calle:** nombre, rubro, pin por GPS,
  referencia, teléfono (privado), horario, foto de fachada. Es la regla
  cerrada de Entregas: *«nombre, teléfono, ubicación por GPS y logo bastan
  para publicar»*.
- **Marcar aliado** y su compromiso (`07` §2), con fecha.
- **Productos de la tienda** (`07` §3): foto + nombre + precio de referencia,
  con **la cámara del celular**, varios seguidos.
- **Pasar de `map_landmarks` al directorio:** ya hay 60 lugares cargados, entre
  ellos Botica La Merced, Inkafarma, Tienda Mass, Bodega Kira, Bodega Aida Mota,
  Librería Leni y Pastelería Arlita. Un botón **«Hacer tienda»** copia nombre y
  pin, y Jesús completa lo demás. **No se cargan dos veces.**

## 7. `/reportes` → pestaña Encargos

Los números de `09` §5, por noche y por semana. **Sin gráficas en v1**: una
tabla con lo que hace falta para decidir el jueves 22. Lo que no se pueda
calcular desde las tablas no se pregunta a nadie.

## 8. Lo que el admin NO tiene en v1

- Asignar encargos a mano.
- Chat con el cliente o con el motorizado.
- Editar la lista de un encargo en curso: si se torció, se cancela y se crea otro.
- Panel para los aliados (`07` §5).
