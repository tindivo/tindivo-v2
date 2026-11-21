# Diseño: la marca y cómo se ve Tindivo

> Verificado: 2026-11-19 · entorno: `develop@25a6d537` · Decisiones de Jesús del 19 y 20 de septiembre de 2026 y del 18 de
> noviembre de 2026 · Los **valores** (color, tipografía, radios, espaciados, sombras) están en `Docs/negocio/sistema-de-diseno.md`
> · Reglas técnicas del tema web: `DECISIONS.md §16`, `§21`, `§27`

## La marca

- **Un color de marca: el naranja** (`primary` `#EE6417` para botones y progreso, `primaryText` `#C2410C` para texto
  naranja sobre fondo claro; valores y contrastes en `Docs/negocio/sistema-de-diseno.md`). «Es esencial» (Jesús,
  2026-09-20). Las apps nativas salen de ese sistema de diseño (decisión de Jesús, 2026-11-18); `packages/ui/src/theme.css`
  y sus `#F97316` describen solo a la web, que se apaga.
- **Un solo naranja para todos los servicios:** Entregas, Store y restaurantes no llevan azul, tampoco en la moto
  (Jesús, 2026-09-20, confirmado el 2026-11-18).
- **Blanco sobre naranja**, aunque el manual de marca (edición 02) pida carbón sobre naranja: Jesús lo descartó. El
  contraste es de 3,25:1, así que el blanco sobre `primary` va solo en letra de 18 px en negrita o de 24 px o más;
  **la letra pequeña nunca va en blanco sobre naranja**.
- **Geist en todo**, en las apps, pesos 400 a 700: los títulos (`titleScreen`, `titleSection`) y el CTA en 700; los precios toman el peso de su
  contexto con cifras tabulares (`tnum`) (sistema de diseño del 16-nov, aprobado por Jesús; valores en
  `Docs/negocio/sistema-de-diseno.md`). La web conserva sus pesos (600-800) y se apaga.
- **El logo es un dibujo** (vectores del manual): nunca se escribe «Tindivo» con una fuente.
- Nada dorado, ámbar ni beige; el mapa, en gris frío.

## Cómo se escribe y se compone

- **Simplicidad es poder:** botones de 1 a 3 palabras, títulos de hasta 6, apoyo en una línea.
- **Nada se sale de su caja:** etiquetas en una línea; las filas de chips hacen scroll horizontal en vez de partirse.
- **Precio de Entregas: «Desde S/ 3»** en tarjetas y botones; el importe exacto solo con el pedido hecho.
- La vara de calidad es **«nivel inDrive», primero el celular**. Lo mejorable que se vea por el camino se anota para la
  siguiente iteración en `Docs/trabajo/entregas-ux/iteraciones-ux-pin.md`.

## Componentes

- Botones en píldora, blanco sobre naranja, en negrita (en las apps, 700, el peso de `cta`). En la web, los de `packages/ui` (extra-negrita, 800), que la CI vigila
  (`pnpm check:ds`).
- En `apps/negocios` y `apps/motorizados`, solo los iconos del subset cerrado (`apps/negocios/AGENTS.md`).
