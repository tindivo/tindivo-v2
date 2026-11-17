# Diseño: la marca y cómo se ve Tindivo

> Verificado: 2026-11-17 · entorno: develop@0d0f7486 (código de `apps/android/core/designsystem` y `packages/ui/src/theme.css`; contrastes recalculados con la fórmula WCAG 2.x)
> Decisiones de Jesús del 19 y 20 de septiembre de 2026 (marca) y del 16 de noviembre de 2026 (sistema de diseño de las apps nativas: paleta, patrones v2, minimalismo y billetera agnóstica) · Reglas técnicas del tema web: `DECISIONS.md §16`, `§21`, `§27`
> **Qué manda:** la marca (§1) vale para todo. El sistema de las **apps nativas** (§2 en adelante) es el de la v2 del 16-nov; la web mantiene `packages/ui/src/theme.css` hasta que Jesús decida alinearla (ver «Pendientes»). Dónde está construido el design system de Android y cómo se replica en iOS: `Docs/arquitectura/apps-nativas.md`.

## 1. La marca

- **Un color de marca: el naranja.** En el logo es `#FA7020` (token `brand`). La web usa la escala `orange` de Tailwind
  (`--color-brand #F97316`, `--color-brand-dark #C2410C` en `packages/ui/src/theme.css`). «Es esencial» (Jesús,
  2026-09-20).
- **Blanco sobre naranja**, aunque el manual de marca (edición 02) pida carbón sobre naranja: Jesús lo descartó. Como el
  contraste es bajo, el blanco sobre naranja va **solo en letra grande y gruesa** (≥ 18 px en negrita o ≥ 24 px); **la
  letra pequeña nunca va en blanco sobre naranja** (regla de texto: `Docs/arquitectura/sistema-de-diseno.md` §2.2).
- **Geist en todo**, títulos y botones en 600-800, también los precios.
- **El logo es un dibujo** (vectores del manual): nunca se escribe «Tindivo» con una fuente.
- Nada dorado, ámbar ni beige; el mapa, en gris frío.

## 2. Principios de las apps nativas

Dirección (Jesús, 2026-11-16): **moderno, suave y amigable, con la energía de Rappi: nada plano.** Superficies blancas que
flotan sobre un fondo gris claro con sombras suaves, esquinas generosas, fotos grandes, íconos con fondo de color suave,
CTA vistosos que den ganas de tocarlos y microanimaciones bien hechas. Se sigue Material 3 / convenciones de Android (y de
iOS en su app) en navegación, objetivos táctiles y comportamiento. **No se copia la web**: se toma de ella lo que funciona
y se mejora para el móvil. La vara sigue siendo «nivel inDrive, primero el celular».

- **Simplicidad es poder:** botones de 1 a 3 palabras, títulos de 2 a 4, apoyo en una línea.
- **Nada se sale de su caja:** etiquetas en una línea; las filas de chips hacen scroll horizontal en vez de partirse.
- **Precio de Entregas: «Desde S/ 3»** en tarjetas y botones; el importe exacto solo con el pedido hecho.
- **El color nunca va solo:** un estado es color + palabra (y ícono si ayuda).
- **Nada de colores fuera de este documento.** Prohibido inventar un hex nuevo (se eliminaron `#F4C9A8`, `#F2D0D0`,
  `#C9DCF2`, `#FDBA74`).


> Los tokens (color, forma, tipografía, táctil, imágenes, componentes, movimiento) y lo que difiere en Android están en
> `Docs/arquitectura/sistema-de-diseno.md`. Aquí quedan la marca, los principios y las reglas de negocio de la interfaz.

## 3. Minimalismo y jerarquía (manda)

Jesús ve las pantallas con demasiado texto y abrumadoras. Reglas:

1. **Una sola tarea por pantalla y una sola acción primaria.** Lo secundario baja de peso (texto o tonal) o se esconde
   tras «Ver más» o una hoja.
2. **Escaneable en 3 segundos:** de arriba abajo, lo que la persona decide ahora; lo informativo, después o colapsado.
3. **Texto mínimo:** títulos de 2 a 4 palabras; ayudas de una línea (≈ 40 caracteres); nada de párrafos; si algo necesita
   explicación, un ícono con 3 palabras o una hoja «¿Cómo funciona?».
4. **Máximo 3 niveles tipográficos por tarjeta** (`sistema-de-diseno.md` §4).
5. **Menos tarjetas, más aire:** agrupa lo relacionado en una tarjeta; 24 entre grupos, 12 dentro. **Sin tarjetas dentro
   de tarjetas.**
6. **Color con intención:** el naranja solo para la acción principal y la selección; los estados con su par; el resto,
   neutro. Máximo un acento de color por tarjeta.
7. **Divulgación progresiva:** las opciones no elegidas se ven compactas (una línea); la elegida se expande.
8. **Ilustración en lugar de texto** cuando explique mejor.

## 4. Reglas de negocio que la interfaz debe respetar

- **Notificaciones:** un solo permiso «Notificaciones» (Sí/No), como Yape, que cubre estados del pedido y novedades. En
  Cuenta, un solo interruptor «Notificaciones» con la línea «Pedidos y novedades».
- **Pago según confianza:**
  - Confiable: «Efectivo al recibir» o «Yape o Plin». Con Yape o Plin puede pagar por adelantado cuando el negocio
    acepta (opcional) o al recibir.
  - No confiable (faltas o pedido sobre el umbral): «Efectivo» y «Al recibir» se ven en gris, deshabilitados, con el
    motivo en una línea; solo «Pago por adelantado».
- **Registro:** solo con Google. Un celular verificado por cuenta (SMS). Dirección, celular y nombre se piden en hojas
  dentro del checkout, nunca obligando a ir a Cuenta.

## 5. Billetera agnóstica

El pago por transferencia **no se presenta como «Yape» o «Plin» de marca**, sino como pago por **billetera digital**
(cualquiera que transfiera a ese número). Donde se muestre la cuenta (Seguimiento y demás), se enseña el **número del
negocio, el titular y «Copiar»** como acción principal. (Decisión de Jesús, 2026-11-16.)

## Pendientes

- **Alinear el código de Android con `sistema-de-diseno.md` §2 a §8** (tabla §9): es trabajo, no excepción aprobada.
- **¿Entregas lleva azul o no?** El 2026-09-20 Jesús decidió «sin azul, tampoco en la moto» (un solo color de marca). El
  código construido después pinta Entregas de azul en la tarjeta del inicio
  (`apps/customer/features/courier/components/courier-home.tsx`) y en la app del motorizado, para distinguirlo de la
  comida. Hasta que Jesús diga cuál vale, no se cambia ninguno de los dos.
- **La web sigue con `#F97316` y la tinta cálida** (`packages/ui/src/theme.css`): ¿se alinea con las apps nativas? Lo
  decide Jesús.
- **Ancho máximo en tablet** (propuesta D9 de la v1): sin decidir.
- **Validación en dispositivo real de gama media o baja, a la sombra y al sol**, de `#EE6417` con blanco en negrita
  (el riesgo lo marcó la decisión de paleta).
- **Test de contraste en CI** para `primary`, `primaryPressed` y `primaryText` (`sistema-de-diseno.md` §2.2): por crear.
- **Estilo de las ilustraciones y su ubicación definitiva** (`img/gen`, fuera del repo): sin verificar.
