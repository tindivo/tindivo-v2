# Prompt para Claude Design — Tindivo Store UI V3

## Rol

Actúa como **Senior Product Designer / UI Designer especializado en mobile commerce, marketplaces y design systems**.

Tu tarea es **rearmar visualmente la propuesta de Tindivo Store para compradores**, manteniendo prácticamente intacta la arquitectura UX y las funcionalidades ya aprobadas.

Esta iteración **NO busca rediscutir el producto ni agregar features**. El objetivo es elevar de forma clara la calidad visual, modernidad, atractivo comercial, jerarquía y capacidad de exploración de la interfaz.

---

# 1. Contexto del producto

Tindivo Store es una vitrina mobile-first dentro de tindivo.com para vender artículos nuevos y de segunda en San Jacinto.

El flujo principal es:

**descubrir producto → revisar información → confiar → escribir por WhatsApp → recibir y pagar**

No existe checkout web, carrito, cuentas de comprador ni pago online.

El comprador normalmente llegará desde Facebook, WhatsApp, Marketplace, TikTok o un enlace compartido.

La interfaz debe sentirse:

- moderna;
- rápida;
- visual;
- confiable;
- atractiva;
- local;
- sencilla;
- fácil de entender para usuarios de distintas edades.

Queremos que el usuario tenga ganas de **seguir haciendo scroll para descubrir qué más hay**.

---

# 2. Decisión importante de identidad

Esta dirección visual **reemplaza la regla anterior de “usar el mismo sistema visual actual de tindivo.com”**.

**Tindivo Store será el piloto del nuevo sistema visual de Tindivo.**

Si esta dirección funciona, posteriormente se extenderá a:

- tindivo.com;
- restaurantes;
- delivery;
- otras funcionalidades;
- futura app móvil.

Por tanto, diseña los componentes con intención de **reutilización futura como Design System de Tindivo**, no como un skin exclusivo de Store.

### Mantener obligatoriamente

- Logo de Tindivo.
- Naranja oficial de Tindivo como color de marca principal.
- Verde reservado para acciones vinculadas a WhatsApp/compra.

Se permite construir una escala de tintes y tonos a partir del naranja oficial.

Ejemplo conceptual:

- Orange 50
- Orange 100
- Orange 200
- Orange 500 = naranja oficial
- Orange 600
- Orange 700

No inventes una identidad completamente distinta.

---

# 3. Problema actual de la propuesta

La UX actual funciona, pero visualmente se siente:

- demasiado cálida;
- demasiado beige/crema;
- poco contrastada;
- plana;
- algo “muerta”;
- con demasiadas superficies del mismo tono;
- poco estimulante para explorar productos;
- más cercana a una interfaz funcional que a una experiencia de commerce moderna.

Queremos resolver eso **sin convertir Tindivo en una interfaz saturada o tipo AliExpress**.

“Más dopamínico” NO significa más colores ni más elementos.

La energía debe venir principalmente de:

1. fotografía;
2. precio;
3. descuentos;
4. jerarquía visual;
5. contraste;
6. ritmo;
7. microinteracciones;
8. descubrimiento de productos.

---

# 4. Referencias visuales

Usa las imágenes de referencia adjuntas como inspiración visual.

No copies sus layouts ni agregues sus funcionalidades.

Toma principalmente de ellas:

- limpieza visual;
- jerarquía tipográfica;
- fotografía protagonista;
- alto contraste;
- uso disciplinado del color;
- whitespace;
- cards refinadas;
- interfaces que parecen productos actuales y premium;
- sensación de commerce moderno.

La dirección buscada está más cerca de:

**limpieza tipo ASOS + energía comercial moderada + personalidad Tindivo**

y menos cerca de:

- dashboard;
- marketplace genérico;
- UI institucional;
- exceso de beige;
- interfaz muy cargada tipo AliExpress.

---

# 5. Sistema de color

## Base

La interfaz debe abandonar el beige/crema como superficie dominante.

Usa:

### Fondo general
Neutral muy claro:
- blanco roto;
- gris muy claro;
- neutral frío o ligeramente cálido.

### Superficies
- cards blancas;
- bottom sheets blancos;
- inputs claros.

### Texto
- charcoal / casi negro para texto principal;
- gris medio únicamente para información secundaria.

### Brand
- naranja Tindivo como accent.

### WhatsApp
- verde únicamente para CTA de compra/contacto.

### Sale
- rojo/coral para:
  - descuentos;
  - Remate.

## Regla visual

La interfaz debe organizarse en 3 niveles:

### Nivel 1 — Neutral
Blanco / gris claro / charcoal.

### Nivel 2 — Marca
Naranja Tindivo:
- selección;
- filtros activos;
- iconos;
- highlights;
- pequeños detalles.

### Nivel 3 — Acción
Verde:
- únicamente CTA principal de WhatsApp.

---

# 6. No usar gradientes

En esta versión:

- NO usar gradientes;
- NO usar fondos promocionales con gradiente;
- NO usar efectos de brillo;
- NO usar neón;
- NO usar glassmorphism.

La identidad debe sostenerse mediante:

- color sólido;
- contraste;
- tipografía;
- fotografía;
- spacing;
- jerarquía.

---

# 7. Franja informativa permitida

No usar banners promocionales.

Sí se permite **una única franja compacta de servicio/confianza** debajo del header.

Ejemplo:

> 🚚 Entrega desde S/2 · Pagas al recibir

o

> 🚚 Desde S/2 · Revisas antes de pagar

Características:

- estática;
- una sola línea;
- 32–40 px aprox.;
- sin CTA;
- sin ilustraciones;
- sin fotografía;
- sin carrusel;
- sin gradiente;
- puede usar un tint muy suave del naranja.

No debe impedir que los productos aparezcan en el primer viewport.

---

# 8. Tratamiento obligatorio de fotografías

Las fotos son parte del sistema visual.

Todas las portadas de producto deben mostrar:

**producto real recortado + mismo fondo gris muy claro**

No usar:

- ilustraciones;
- dibujos;
- fotos con personas/modelos;
- fondos domésticos;
- fondos reales;
- fondos diferentes entre productos.

Queremos que la tienda se vea consistente aunque venda:

- ropa;
- zapatillas;
- perfumes;
- mochilas;
- plantas;
- cables;
- tecnología;
- otros objetos.

### Reglas

- La portada debe usar formato 1:1.
- El producto debe ocupar aproximadamente 75–85% del área útil cuando su forma lo permita.
- Mantener escala visual razonable.
- No ampliar objetos pequeños artificialmente hasta que pierdan proporción.
- El producto debe ser claramente reconocible.
- En admin existe reencuadre de portada.
- En detalle puede mostrarse la fotografía completa con más aire.

---

# 9. Regla de texto sobre imágenes

Nunca poner sobre la fotografía:

- precio;
- título;
- talla;
- medida;
- descripción;
- copy promocional.

### Única excepción

Se permite **una sola insignia compacta de estado/oferta** sobre la fotografía:

Prioridad visual sugerida:

1. −X%
2. Remate
3. Nuevo
4. Reservado

Una card nunca debe mostrar varias insignias simultáneamente.

---

# 10. /store — dirección visual

Mantener la arquitectura aprobada:

1. Header compacto.
2. Franja informativa.
3. Buscador.
4. Una fila horizontal de categorías.
5. Grid de productos inmediatamente.
6. Filtros dentro del buscador.
7. Vendidos recientemente al final.
8. Cómo funciona.
9. Enlace a restaurantes de Tindivo.

NO agregar:

- hero banner;
- carrusel promocional;
- favoritos;
- carrito;
- bottom navigation;
- sección “Trending”;
- “Recomendado para ti”;
- promociones inventadas.

---

# 11. Header

Debe sentirse ligero, moderno y editorial.

Ejemplo conceptual:

**Tindivo · Store**

El logo/nombre puede usar el naranja oficial.

El resto debe usar texto neutral oscuro.

Evitar llenar el header de naranja.

No usar icono de perfil.

---

# 12. Buscador

Debe ser uno de los componentes importantes del primer viewport.

Características:

- 48–52 px aprox. de alto;
- superficie clara;
- borde/sombra mínima;
- radio consistente con el sistema;
- icono de búsqueda visible;
- botón de filtros integrado.

Ejemplo:

> 🔍 Busca casaca, 38, perfume…   [filtros]

Si existen filtros activos:

- mostrar punto naranja;
- o contador pequeño.

No agregar filas adicionales permanentes para Nuevo/Segunda.

---

# 13. Categorías

Una sola fila horizontal deslizable.

Ejemplo:

- Todo
- Ropa
- Calzado
- Tecnología
- Hogar
- etc.

### Inactivos

- fondo neutral muy claro;
- texto charcoal;
- icono neutral.

### Activo

- tint suave del naranja;
- borde naranja;
- texto/icono naranja más oscuro.

No llenar todos los chips de colores.

---

# 14. Filtros

Abrir en bottom sheet.

Mantener:

### Condición
- Todo
- Nuevo
- Segunda

### Orden
- Recientes
- Menor precio
- Mayor precio

Acciones:

- Limpiar
- Ver X artículos

El bottom sheet debe sentirse moderno y ligero.

No añadir nuevos filtros en esta ronda.

---

# 15. Cards de producto — prioridad máxima

Las cards deben convertirse en uno de los componentes más trabajados del sistema.

Actualmente se sienten demasiado funcionales.

Queremos que el producto sea el héroe.

### Estructura

Foto grande arriba.

Luego:

**S/ 30** ~~S/60~~  
Casaca jean talla M  
Talla M

### Jerarquía

#### Imagen
Aproximadamente 65–70% del peso visual de la card.

#### Precio
18–20 px aprox., bold/semibold fuerte.

#### Precio anterior
12–13 px, gris, tachado.

#### Título
14–15 px, máximo 2 líneas.

#### Metadata
12–13 px.

Nada por debajo de 12 px.

### Estética

- fondo blanco;
- bordes mínimos;
- sombra casi imperceptible;
- radius 12–14 px aprox.;
- buen whitespace;
- evitar efecto “caja dentro de caja”.

---

# 16. Estados de card

En esta primera iteración de `/store`, incluye obligatoriamente:

- varios productos disponibles;
- al menos 1 reservado;
- 1 descuento;
- 1 Remate;
- 1 Nuevo.

Queremos validar visualmente los estados.

### Disponible

- 100% de contraste;
- imagen viva;
- card normal.

### Reservado

No debe parecer deshabilitado.

Aplicar:

- desaturación MUY ligera;
- insignia clara `Reservado`;
- precio/título todavía perfectamente legibles.

### Vendido

No aparece mezclado con disponibles.

Vive únicamente en:

**Vendidos recientemente**

Tratamiento:

- grayscale/desaturado;
- todavía legible y atractivo;
- franja o etiqueta `VENDIDO`.

---

# 17. Vendidos recientemente

Mostrar al final del listado.

Máximo inicial:

4–6 productos.

Objetivo:

- prueba social;
- demostrar movimiento;
- no competir visualmente con los disponibles.

Evitar que parezca que toda la tienda está agotada.

---

# 18. Detalle /store/[slug]

Rediseñar el detalle con una estética más editorial e inmersiva.

Queremos menos sensación de “formulario” y más sensación de producto.

### Prioridad visual

Aproximadamente 45–50% del primer viewport puede estar dedicado a fotografía.

Después:

1. título;
2. precio;
3. precio anterior;
4. badges;
5. metadata;
6. estado;
7. descripción;
8. entrega;
9. relacionados.

### Ejemplo conceptual

Casaca jean talla M

**S/30** ~~S/60~~

[Pieza única] [Acepta ofertas]

Usado · Talla M · Dama

Estado 9/10 · Muy buen estado

█████████░

Descripción...

---

# 19. CTA WhatsApp

El CTA principal debe ser el punto de máximo contraste accionable.

Texto:

> Lo quiero — pedir por WhatsApp

Color:

- verde WhatsApp.

Sticky/fijo abajo.

Debe conservar la frase de confianza:

> Revísalo antes de pagar · Si no es como en las fotos, no pagas nada.

El resto de la UI no debe competir cromáticamente con este CTA.

---

# 20. Reservado

En detalle reservado:

mostrar estado claramente.

Footer:

**RESERVADO**

y botón outlined:

> 🔔 Avísame si se libera

Usar borde/color de marca.

NO usar verde.

El botón debe parecer interactivo, nunca disabled.

---

# 21. Tipografía

Priorizar:

- alta legibilidad;
- sensación contemporánea;
- jerarquía fuerte.

No usar texto menor a 12 px.

Guía:

- precio: 18–20 px;
- títulos card: 14–15 px;
- cuerpo detalle: 15–16 px;
- metadata: 12–13 px;
- labels: mínimo 12 px.

Los textos grises deben mantener contraste mínimo **4.5:1**.

No usar gris excesivamente claro.

---

# 22. Accesibilidad

Además de contraste:

- el color nunca debe ser la única señal de estado;
- seleccionado debe usar color + borde + forma/check;
- reservado debe mostrar texto;
- vendido debe mostrar texto;
- foco/interacción debe ser reconocible.

Pensar en:

- Android económicos;
- uso exterior;
- usuarios mayores;
- pantallas con brillo limitado.

---

# 23. Radio de bordes

Evitar que absolutamente todo use el mismo border-radius.

Crear escala.

Referencia:

- radius-sm: 8 px
- radius-md: 12 px
- radius-lg: 16 px
- radius-xl: 24 px
- pill: 999 px

Usarlos con intención.

Ejemplo:

- cards: md;
- search: lg;
- botones: lg;
- bottom sheet: xl arriba;
- chips: pill.

---

# 24. Sombras

Usar profundidad mínima.

Evitar:

- sombras grandes;
- blur excesivo;
- cards flotando artificialmente.

Preferir:

- border neutral sutil;
- sombra corta muy suave;
- separación mediante whitespace.

---

# 25. Microinteracciones

Solo CSS.

Permitido:

- transform;
- opacity;
- background;
- border-color.

Duración:

**150–250 ms**

Ejemplos:

- card press: scale 0.98–0.99;
- chips: transición de background/border;
- bottom sheet: translateY;
- botones: pressed state;
- filter indicator.

NO usar librerías de animación.

Respetar:

```css
@media (prefers-reduced-motion: reduce)
```

En ese modo:

- eliminar o minimizar transiciones.

---

# 26. Performance

El rediseño visual NO puede degradar los objetivos técnicos.

El listado con ~30 artículos debe seguir cargando en menos de 2 segundos bajo 4G.

Por tanto:

- no librerías visuales innecesarias;
- no animaciones JS;
- no imágenes gigantes;
- no videos;
- no blur costoso;
- no efectos gráficos pesados.

La apariencia premium debe lograrse principalmente con CSS, tipografía, imágenes optimizadas y layout.

---

# 27. No agregar funcionalidades

Esta iteración es exclusivamente visual.

NO agregar:

- carrito;
- checkout;
- login comprador;
- favoritos;
- wishlist;
- ratings;
- reviews;
- navegación inferior;
- recomendaciones personalizadas;
- cuentas;
- “Shop now”;
- promociones ficticias;
- categorías nuevas inventadas;
- notificaciones;
- banners comerciales.

Mantener el producto simple.

---

# 28. Primera entrega solicitada

NO rediseñes todavía todas las pantallas.

Primero queremos definir el nuevo lenguaje visual.

Entrega:

## A. Tres direcciones visuales para `/store`

Usa exactamente:

- mismos productos;
- mismo contenido;
- misma arquitectura;
- mismas funcionalidades.

Solo cambia el tratamiento visual.

### Dirección A — Clean / Premium

Inspiración:

- disciplina tipo ASOS;
- mucho blanco;
- charcoal;
- naranja muy controlado;
- fuerte protagonismo del producto.

### Dirección B — Fresh / Commerce

- un poco más de personalidad;
- más uso de tintes del naranja;
- badges algo más expresivos;
- mayor sensación de exploración.

### Dirección C — Bold Tindivo

- mayor presencia de identidad Tindivo;
- naranja más reconocible;
- contraste más fuerte;
- sin caer en saturación.

Las tres deben respetar TODAS las reglas anteriores.

---

# 29. Detalle de producto

Después de las 3 opciones de `/store`, crea **una propuesta de detalle disponible** utilizando la dirección que consideres más sólida.

No cambies funcionalidades.

Debe demostrar:

- fotografía protagonista;
- precio fuerte;
- metadata compacta;
- confianza;
- CTA WhatsApp;
- estilo reutilizable.

---

# 30. Cómo evaluaré las propuestas

No busco simplemente “la más bonita”.

La dirección elegida debe ganar en:

1. claridad;
2. atractivo;
3. confianza;
4. facilidad de exploración;
5. jerarquía;
6. percepción moderna;
7. legibilidad;
8. identidad Tindivo;
9. capacidad de reutilizarse en el resto del ecosistema;
10. rendimiento y simplicidad técnica.

---

# 31. Resultado esperado

Queremos que Tindivo Store deje de sentirse como:

> una web funcional con tarjetas

y empiece a sentirse como:

> un producto digital moderno, local, confiable y atractivo donde da ganas de seguir mirando qué hay.

No buscamos lujo artificial.

No buscamos copiar una gran tienda internacional.

Buscamos establecer **el nuevo lenguaje visual de Tindivo**.

Primero define correctamente ese lenguaje.

Después podremos extenderlo al resto de las pantallas.
