# Diseño: la marca y cómo se ve Tindivo

> Verificado: 2026-11-18 (regla de Entregas) y 2026-10-10 (el resto) · entorno: `develop` (`packages/ui/src/theme.css`, `apps/customer`) · Decisiones de Jesús del
> 19 y 20 de septiembre de 2026 · Reglas técnicas del tema: `DECISIONS.md §16`, `§21`, `§27`

## La marca

- **Un color de marca: el naranja** del cliente real, la escala `orange` de Tailwind que ya está en
  `packages/ui/src/theme.css` (`--color-brand` `#F97316` para botones, pines y foco; `--color-brand-dark` `#C2410C`
  para texto naranja sobre fondo claro). «Es esencial» (Jesús, 2026-09-20).
- **Blanco sobre naranja**, aunque el manual de marca (edición 02) pida carbón sobre naranja: Jesús lo descartó. Como
  el contraste es bajo (2.8:1), el blanco sobre naranja va siempre en letra grande y gruesa; **la letra pequeña nunca
  va en blanco sobre naranja**.
- **Geist en todo**, títulos y botones en 600-800, también los precios.
- **El logo es un dibujo** (vectores del manual): nunca se escribe «Tindivo» con una fuente.
- Nada dorado, ámbar ni beige; el mapa, en gris frío.

## Cómo se escribe y se compone

- **Simplicidad es poder:** botones de 1 a 3 palabras, títulos de hasta 6, apoyo en una línea.
- **Nada se sale de su caja:** etiquetas en una línea; las filas de chips hacen scroll horizontal en vez de partirse.
- **Precio de Entregas: «Desde S/ 3»** en tarjetas y botones; el importe exacto solo con el pedido hecho.
- La vara de calidad es **«nivel inDrive», primero el celular**. Lo mejorable que se vea por el camino se anota para la
  siguiente iteración en `Docs/trabajo/entregas-ux/iteraciones-ux-pin.md`.
- **Entregas va sin azul, con un solo color de marca**, tampoco en la moto (decidido por Jesús el 2026-09-20 y ratificado el
  2026-11-18, conversación con Claude Code). Hoy el código aún pinta Entregas de azul (`apps/customer/features/courier/components/courier-home.tsx`
  y la app del motorizado): es una desviación por corregir en un cambio de código aparte, no una excepción.

## Componentes

- Botones en píldora (`rounded-full`), blanco sobre naranja, extra-negrita; los del sistema de diseño de `packages/ui`,
  que la CI vigila (`pnpm check:ds`).
- En `apps/negocios` y `apps/motorizados`, solo los iconos del subset cerrado (`apps/negocios/AGENTS.md`).
