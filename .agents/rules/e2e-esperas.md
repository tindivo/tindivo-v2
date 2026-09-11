---
trigger: always_on
description: Una espera de e2e que se cumple con el estado viejo no es una espera. Cómo esperar de verdad en Playwright.
---

## Esperas en e2e

**Una espera que se cumple con el estado viejo no es una espera.**

Es la regla entera. El resto es por qué duele tanto y cómo se comprueba.

### El caso que la trajo

`e2e/negocios/rendimiento-eje.spec.ts` fijaba un rango de fechas y esperaba a
que el `<h3>` «Facturación por día» fuera visible, con un comentario diciendo
que eso marcaba que el rango nuevo ya estaba pintado. No lo marcaba: ese título
se pinta IGUAL en la rama de «ningún día con ventas» que en la del gráfico, y
el rango por defecto de esa pantalla también sale vacío. La condición ya se
cumplía con el DOM del rango anterior.

Consecuencias, todas silenciosas:

- Escondió durante meses una carrera real (`usePerformance` escribía con la
  última respuesta en llegar, no con la del rango pedido).
- Su test hermano pasaba **por la razón equivocada**: el rango por defecto
  también estaba vacío, así que habría pasado aunque el rango no se aplicara
  nunca.

### Qué hacer en su lugar

1. **Espera al hecho, no a su síntoma.** Lo que de verdad dice «los datos nuevos
   ya están» es la respuesta: `page.waitForResponse(r => ...)` con un predicado
   sobre la URL. Ármala ANTES de disparar la acción — si la armas después, la
   respuesta puede haber llegado ya y esperas para siempre.
2. **Si esperas por DOM, que la condición SOLO pueda cumplirla el estado nuevo.**
   Un texto o un rótulo que existe en los dos estados no vale. Sirve un dato que
   solo trae la respuesta nueva (un `aria-label` con el rango, un id de fila).
3. **Pregúntate qué pasaría si la petición no se enviara.** Si el test pasaría
   igual, no está probando lo que dice.

### Y la trampa gemela, al afirmar

Una aserción demasiado laxa deja pasar el fallo igual que una espera laxa.
Comprobar «¿hay gráfico?» no distingue el gráfico correcto del gráfico de un
rango que nadie pidió; comprobar «¿está el pedido viejo?» no distingue el rango
pedido de uno más ancho que también lo contiene. **Afirma sobre lo que
identifica la respuesta**, no sobre que haya respuesta.

### La comprobación que cierra el asunto

**Rompe el arreglo y mira si el test se pone rojo.** `git stash push -- <fichero>`,
corre el spec, `git stash pop`. Si sigue verde, el test no protege nada.

En un árbol compartido con otros agentes, acota el stash a TUS ficheros.
