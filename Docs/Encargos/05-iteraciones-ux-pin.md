# 05 · Iteraciones de UX del flujo A → B (mapa primero)

Lista viva de lo que se ve mejorable en el flujo de fijar el punto A y el punto B.
Cada iteración cierra lo de arriba y deja anotado lo nuevo que se vea. Probado en
móvil (iframe de 390 px en Chrome de escritorio + Playwright); lo marcado
**[teléfono]** solo se puede verificar en un aparato real.

## Iteración 1 (2026-09-24) — hecha

- Mapa primero: «Otro lugar o persona» abre directo el pin del punto A. Sin hoja
  «Tu ruta», sin campo con teclado abierto y sin ventana «Entendido».
- La referencia se escribe en el mismo panel del pin (una pantalla por punto, con
  «Paso 1 de 2»), se valida con el mismo esquema que el servidor y `Enter` confirma.
- El mapa termina donde empieza el panel: el pin queda en el centro de lo que se ve.
- A sigue visible mientras se elige B; el pin de B es oscuro y el de A naranja.
- Al reabrir un punto ya fijado el mapa vuela hasta él (antes el pin y la coordenada
  guardada no coincidían).
- GPS fuera de San Jacinto: el mapa no vuela a una zona sin tiles y avisa. Si la
  persona ya movió el mapa, un GPS tardío no se lo quita.
- «Cambiar» en «Confirma tu pedido» reabre el mapa con la referencia escrita, sin popup.

## Iteración 1b (2026-09-24) — hecha

- Del paso 2 se vuelve al 1 sin salir del mapa con la flecha de atrás (la píldora
  «Recojo: …» se quitó: era redundante). Lo escrito en B, y su pin si ya estaba
  asentado dentro de la zona, se guarda; al confirmar A se vuelve a B donde se dejó.
  Si B ya estaba completo, confirmar A pasa directo a «Confirma tu pedido».

## Iteración 1c (2026-09-24) — hecha

- Pasar de A a B (o reabrir un punto) ya no anima el mapa: salta directo. Solo el GPS
  vuela.
- En B el botón sigue bloqueado hasta mover el mapa (B nace sobre A) y el pin de B es
  oscuro, distinto al de A.
- El globo del pin de A muestra la referencia escrita (no «Recojo»), y tocarlo en el
  paso 2 vuelve al paso 1. El globo se recorta con «…» si es largo.
- B guardado al saltar a A se ve en el mapa como pin fijo mientras se corrige A.

## Iteración 1d (2026-09-24) — hecha

- **Bug: el input del paso 2 perdía el foco al escribir una letra.** `useDialogFocus`
  re-enfoca el diálogo cuando cambia `onClose`, y en el paso 2 llegaba una función
  nueva en cada render. Ahora la identidad es fija y hay un e2e que escribe letra a letra.
- Flecha de atrás dentro del panel del paso 2 (además de la de arriba del mapa).
- Salir del paso 1 con algo escrito pide confirmación; volver al paso 1 desde el 2 no.
- B nace a ~30 m de A (hacia abajo, para no tapar el globo de A), no encima.
- El globo tocable del pin de A es más grande (≈ 34 px de alto).
- **«Confirma tu pedido» ya no rellena nada por su cuenta** (antes ponía «Yo» y tu
  celular en quien recibe). En cada tarjeta hay un chip «Soy yo» que completa nombre y
  celular, y chips con los contactos de tus entregas anteriores; lo que escribes en el
  nombre filtra esos chips. Los inputs llevan `autocomplete` para el autocompletado del
  navegador.

## Iteración 1e (2026-09-24) — hecha

- «Soy yo» y los contactos recientes son fichas que se **activan y se desactivan**: tocar
  una completa nombre y celular, volver a tocarla la apaga y vacía los dos campos. La
  activa se ve rellena, con un ✓. Van justo encima del nombre de cada tarjeta.
- **«Continuar» fijo abajo**, con flecha, en un pie que no se pierde al final de la lista.
  Con datos incompletos no se apaga en silencio: una línea dice qué falta («Falta el
  nombre y el celular de quien recibe») y tocarlo lleva al primer campo vacío.
- Descartado a propósito: guardar contactos con nombre («overengineering»).

## Estado (2026-09-24)

El flujo A → B está completo y probado en móvil de escritorio (390 px) y con e2e: mapa
del punto A, mapa del punto B, «Confirma tu pedido» con contactos. Lo de abajo es lo
que **falta**; lo ya resuelto está arriba y no se repite.

## Antes de publicar (hay que probarlo en un teléfono)

Se puede hacer con un preview de Vercel desde `develop`.

- [ ] **Cuelgue al arrastrar en el paso B.** En Chrome con la extensión, arrastrar el mapa
      recién llegado a B congeló la pestaña dos veces (con un arrastre corto antes, no). No
      se reproduce en Playwright (headless, Chrome de escritorio, iframe, dpr 1.2) ni deja
      error en el log. Sospechosos: el `flyTo`/`setView` de distancia cero al sembrar B, y el
      foco que pasa del input de A al de B. Si vuelve a pasar, sacar un trace de rendimiento
      antes de tocar código.
- [ ] **Teclado.** Al enfocar la referencia, ¿el panel queda visible y el pin no se mueve?
      Si el teclado lo tapa, probar `interactive-widget=resizes-content`.
- [ ] **GPS.** Con el permiso sin contestar se lee «Buscando tu ubicación…» hasta 15 s.
      ¿Es tolerable? Si no, bajar el tiempo o mostrar «Usar mi ubicación».
- [ ] **Tacto.** Arrastrar y pellizcar el mapa, tocar el globo del recojo (≈ 34 px) y las
      fichas «Soy yo».
- [ ] **Pantallas angostas (320 px).** El pie de «Continuar» y las fichas de contactos.

## Pendiente, por prioridad

**Alta**

1. **«Confirma tu pedido» ocupa ~85 % de la pantalla** y tapa el mapa justo cuando se
   confirma la ruta. Dejar la ruta y el precio fijos arriba, o partirlo en contacto de A y
   contacto de B.
2. **Sin precio ni distancia en el mapa.** Mostrar «Desde S/ 3» y la distancia A → B en el
   panel de B, y trazar la línea mientras se mueve el pin de B.
3. **No se revisaron las pantallas de después:** «¿Quién paga?», «¿Qué llevamos?» y el
   seguimiento. Falta la misma pasada de UX móvil (objetivos táctiles, botón de continuar,
   teclado).

**Media**

4. **Referencias más rápidas.** Sugerencias («Puerta azul», «Frente a la plaza») y ofrecer
   las direcciones ya guardadas del cliente (`customer_addresses`) como A o B.
5. **Instrucción repetida.** La píldora oscura de arriba y la línea de estado dicen lo
   mismo («Mueve el mapa hasta la puerta…»); dejar una.
6. **Tarjetas de «Confirma tu pedido»** dicen «Punto en el mapa»; la referencia o un mapa
   mínimo daría contexto.

**Baja**

7. **Atribución de Leaflet** ocupa una franja sobre el panel; compactarla sin perder el
   crédito.
8. **Inferir «Soy yo».** Si el punto A se fijó con el GPS de la persona, casi seguro quien
   entrega es ella: dejar la ficha «Soy yo» marcada de entrada en esa tarjeta.
9. **Más fuentes de contactos recientes.** Hoy salen de `courier_orders`; sumar los de
   pedidos a restaurantes (`orders`).
10. **`/entregas`** (fuera de alcance por ahora): en móvil el botón de volver pisa el
    título «Negocios».
11. **Deuda técnica.** `MapCanvas` conserva el último `flyTarget` al desmontarse y
    remontarse: hoy cada siembra lo sobrescribe, pero un remonte sin siembra volaría a un
    punto viejo.

## Descartado a propósito

- Guardar contactos con nombre y guardar borradores del pedido: overengineering para el
  piloto.
