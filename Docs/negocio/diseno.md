# Diseño: la marca y cómo se ve Tindivo

> Verificado: 2026-10-10 · entorno: `develop` (`packages/ui/src/theme.css`, `apps/customer`) · Decisiones de Jesús del
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

## Componentes

- Botones en píldora (`rounded-full`), blanco sobre naranja, extra-negrita; los del sistema de diseño de `packages/ui`,
  que la CI vigila (`pnpm check:ds`).
- En `apps/negocios` y `apps/motorizados`, solo los iconos del subset cerrado (`apps/negocios/AGENTS.md`).

## Pendientes

- **¿Entregas lleva azul o no?** El 2026-09-20 Jesús decidió «sin azul, tampoco en la moto» (un solo color de marca).
  El código construido después pinta Entregas de azul en la tarjeta del inicio
  (`apps/customer/features/courier/components/courier-home.tsx`) y en la app del motorizado, para distinguirlo de la
  comida. Hasta que Jesús diga cuál vale, no se cambia ninguno de los dos.
