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

## Para la iteración 2

Ordenado por impacto.

1. **Cuelgue al arrastrar en el paso B.** En Chrome con la extensión, arrastrar el
   mapa recién llegado a B congeló la pestaña dos veces (una tercera, con un arrastre
   corto antes, no). No se reproduce en Playwright (headless ni Chrome de escritorio,
   ni con iframe y dpr 1.2). Sospechosos: `flyTo` de distancia cero al sembrar B sobre
   A, y el foco que queda en el input al pasar de A a B. Medirlo con un trace antes de
   tocar nada.
2. **«Confirma tu pedido» es un formulario de 85 % de pantalla** que tapa el mapa: se
   pierde la ruta justo cuando se confirma. Partirlo (contacto de A / contacto de B) o
   dejar la ruta y el precio fijos arriba.
3. **B nace exactamente sobre A**: los dos pines se apilan y solo se lee la etiqueta
   «Recojo». Probar a sembrar B a un paso de distancia, o con un zoom más abierto.
4. **Teclado [teléfono].** Al enfocar la referencia el panel puede quedar tapado o el
   mapa cambiar de tamaño. Probar `interactive-widget=resizes-content` y que el mapa se
   re-mida sin mover el pin (ya observa su tamaño).
5. **Sin precio ni distancia en el mapa.** Mostrar «Desde S/ 3» y la distancia A→B en
   el panel de B, y trazar la línea mientras se mueve el pin de B.
6. **Referencias más rápidas.** Chips de sugerencia («Puerta azul», «Frente a la plaza»)
   y ofrecer las direcciones ya guardadas del cliente (`customer_addresses`) como A o B.
7. **GPS pendiente hasta 15 s [teléfono].** Con el permiso sin contestar se ve
   «Buscando tu ubicación…» mucho rato. Bajar el tiempo o ofrecer «Usar mi ubicación».
8. **Instrucción repetida.** La píldora de arriba y la línea de estado dicen lo mismo;
   dejar una.
9. **En B no se ve qué se puso en A.** Una fila compacta «Recojo: casa verde…» arriba del
   panel, tocable para volver.
10. **Atribución de Leaflet** ocupa una franja sobre el panel; compactarla.
11. **Tarjetas de «Confirma tu pedido»** dicen «Punto en el mapa»; un mapa mínimo o la
    referencia daría contexto.
12. **`/entregas`** (fuera de alcance por ahora): en móvil el botón de volver pisa el
    título «Negocios».
13. **Deuda técnica.** `MapCanvas` conserva el último `flyTarget` al desmontarse y
    remontarse: hoy cada siembra lo sobrescribe, pero un remonte sin siembra volaría a un
    punto viejo.
