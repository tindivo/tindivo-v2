# Tindivo Store — Prompt Maestro de Desarrollo Full-Stack

## Rol

Actúa como **Senior Full-Stack Engineer + Product Engineer** responsable de construir **Tindivo Store end-to-end** sobre el proyecto actual de `tindivo.com`.

Tu objetivo es entregar una implementación funcional, integrada con la base de datos, almacenamiento de imágenes, autenticación/admin existente, medición de eventos y flujo de WhatsApp.

No construyas solo un prototipo visual.

Debes entregar una funcionalidad utilizable en producción.

---

# 0. Fuentes y prioridad de verdad

Trabaja usando estas fuentes, en este orden de prioridad:

## 1. Diseño comprador FINAL — máxima prioridad visual
Artifact:
`https://claude.ai/artifact/PXTPotmzmVqzpwLQHcbWwS`

Este artifact contiene la última iteración y debe ser la **fuente principal del diseño customer-facing**:

- `/store`
- `/store/[slug]`
- estados disponible / reservado / vendido
- hero
- buscador
- categorías
- cards
- badges
- filtros
- vendidos recientemente
- relacionados
- visor de imágenes
- CTA WhatsApp
- estilos, spacing, color y jerarquía

### Regla

Cuando exista diferencia entre una pantalla antigua y este artifact:

**gana este artifact para todo lo visual del comprador.**

No regreses al look beige/crema anterior.

La dirección final es:

**Clean / Premium + ADN Tindivo**

con predominio de:

- blanco;
- negro / charcoal;
- naranja oficial Tindivo;
- verde solo para WhatsApp;
- coral/rojo para descuentos/remate.

---

## 2. Artifact V2 — referencia funcional y de Admin
Artifact:
`https://claude.ai/artifact/FNLpSEQqNmmEUfnQSMt4HP`

Este artifact contiene una versión anterior del diseño, pero desarrolla más funcionalidad y detalle, especialmente:

- `/admin/store`
- listado administrativo;
- dashboard del experimento;
- formulario de producto;
- estados;
- acciones rápidas;
- configuración;
- copiar links;
- copiar texto para redes;
- borradores;
- métricas.

### Regla

Usa V2 como referencia de:

**funcionalidad, cobertura y flujo administrativo.**

NO uses V2 como fuente visual principal para el comprador cuando contradiga el artifact final.

El admin puede conservar una estética funcional coherente con el sistema nuevo, pero la prioridad del rediseño visual está en customer.

---

## 3. PRD de Tindivo Store

Usa el PRD entregado como fuente de verdad de:

- alcance MVP;
- modelo de datos;
- reglas de negocio;
- políticas;
- eventos;
- métricas;
- estados;
- WhatsApp;
- Open Graph;
- performance;
- aceptación.

No inventes funcionalidades fuera del PRD salvo que sean estrictamente necesarias para implementar correctamente lo aprobado.

---

# 1. Objetivo del producto

Tindivo Store es una sección de `tindivo.com` para vender artículos nuevos y de segunda dentro de San Jacinto.

Flujo comprador:

**descubre → revisa → confía → toca WhatsApp → coordina → recibe → paga**

No existe:

- carrito;
- checkout;
- pago web;
- cuenta comprador;
- favoritos;
- reviews;
- marketplace multi-vendedor en MVP.

El MVP tiene un solo vendedor/admin.

---

# 2. Principios obligatorios

1. Mobile-first entre 360 y 414 px.
2. Del producto a WhatsApp en máximo 2 toques.
3. Publicar un producto desde celular debe ser rápido.
4. Condición, estado real, defectos y precio deben ser visibles.
5. Sin carrito ni cuenta comprador.
6. El frontend comprador debe verse como el artifact final.
7. Admin debe resolver la operación completa desde móvil.
8. No romper funcionalidades existentes de Tindivo.
9. Reutilizar infraestructura actual donde tenga sentido.
10. Código mantenible, tipado y consistente con el proyecto actual.

---

# 3. Antes de programar

Inspecciona el repositorio actual y determina:

- framework frontend/backend;
- router;
- ORM;
- DB;
- auth actual;
- estructura de migrations;
- storage actual de imágenes;
- sistema actual de entregas;
- estilos/design system existentes;
- sistema de analytics/logging;
- variables de entorno;
- convenciones de API;
- mecanismo de SSR/SSG/prerender;
- hosting/deploy.

No reemplaces el stack por preferencias personales.

Adáptate a las convenciones existentes.

Antes de hacer cambios grandes, identifica qué piezas ya existen y reutilízalas.

---

# 4. Rutas requeridas

## Públicas

- `/store`
- `/store/[slug]`

## Admin

- `/admin/store`
- `/admin/store/new` o flujo equivalente
- `/admin/store/[id]/edit` si la arquitectura lo requiere
- `/admin/store/settings`

Las rutas de admin deben quedar protegidas por el login administrativo existente.

---

# 5. Modelo de datos

Implementa las tablas/modelos equivalentes siguiendo las convenciones del proyecto.

## `store_products`

Campos mínimos:

- `id`
- `codigo` único, autogenerado, formato `TS-0001`
- `slug` único
- `titulo` ≤ 60
- `descripcion` ≤ 600, opcional
- `categoria_id`
- `para` enum opcional: `dama`, `caballero`, `ninos`, `unisex`
- `condicion`: `nuevo_con_etiqueta`, `nuevo_sin_uso`, `usado`
- `estado_puntaje` entero 1–10 si usado
- `talla_medida` ≤ 20, opcional
- `precio`
- `precio_original` opcional
- `es_remate`
- `negociable`
- `estado_publicacion`: `borrador`, `disponible`, `reservado`, `vendido`, `oculto`
- `destacado` si ya estaba previsto
- `vendido_en`
- `vendedor_id` nullable
- `creado_en`
- `actualizado_en`

### Validaciones

- `precio > 0`
- `precio_original` solo se muestra si `precio_original > precio`
- si usado → requiere `estado_puntaje`
- `estado_puntaje` entre 1 y 10
- borradores y ocultos nunca se sirven públicamente
- slug y código únicos

## `store_product_images`

Si el ORM lo permite, usar tabla separada:

- `id`
- `product_id`
- `url`
- `url_mini`
- `orden`
- `is_cover`
- opcional: `crop_x`, `crop_y`, `crop_zoom`
- `created_at`

Reglas:

- mínimo 1 foto para publicar
- máximo 6
- una sola portada
- reordenables
- primera = portada por defecto

## `store_categories`

Lista inicial:

1. Ropa
2. Calzado
3. Bolsos y accesorios
4. Perfumes y belleza
5. Tecnología
6. Hogar y plantas
7. Deporte
8. Otros

Campos:

- `id`
- `nombre`
- `slug`
- `icono`
- `orden`
- `activo`

Las categorías sin artículos públicos no deben mostrarse en `/store`.

## `store_events`

Campos:

- `id`
- `tipo`
- `product_id` nullable
- `termino_busqueda` nullable
- `ref` nullable
- `session_id` anónimo
- `metadata` opcional
- `creado_en`

Tipos mínimos:

- `view_list`
- `view_product`
- `search`
- `filter_open`
- `filter_condition_apply`
- `filter_order_apply`
- `click_whatsapp`
- `share`
- `nav_out`

## `store_settings`

- `whatsapp_numero`
- `delivery_min`
- `delivery_max`
- `texto_entrega`

Valores iniciales:

- `51906550166`
- `2.00`
- `2.50`

---

# 6. Migraciones y seed

Crear migraciones reales e idempotentes.

Seed de:

- categorías;
- settings por defecto.

No hardcodear categorías ni settings solo en frontend.

---

# 7. Backend / API

Implementar endpoints, server actions o handlers según el stack existente.

## Público

### Listado
Soportar:

- búsqueda;
- categoría;
- condición;
- orden.

Búsqueda en:

- título;
- descripción;
- categoría;
- talla/medida.

Debe ser:

- case-insensitive;
- accent-insensitive.

### Detalle

Resolver por slug.

Solo publicar:

- disponible;
- reservado;
- vendido.

Nunca:

- borrador;
- oculto.

### Relacionados

2–4 productos disponibles de la misma categoría cuando sea posible.

Excluir el producto actual.

## Admin

Operaciones:

- crear borrador;
- subir foto;
- actualizar campos;
- publicar;
- editar;
- duplicar;
- reservar;
- vender;
- volver a disponible;
- ocultar;
- settings;
- listar por estado;
- métricas.

---

# 8. Borrador automático en servidor

Al subir la primera foto:

crear producto `borrador` en servidor.

Después:

- subir fotos individualmente;
- autosave de campos;
- debounce razonable;
- indicador `Guardando…` / `Guardado`.

No depender exclusivamente de `localStorage`.

---

# 9. Manejo de borradores

En `/admin/store`, si existen borradores:

> Tienes X borradores sin publicar

acción:

> Continuar

Mostrar última actualización cuando ayude.

No esconderlos únicamente en “Más”.

---

# 10. Imágenes

## Subida

- cámara;
- galería;
- máximo 6;
- compresión antes de subir.

## Derivados

- detalle: ~1080 px
- cards: ~400 px

Preferir WebP/AVIF según infraestructura.

## Portada pública

Sistema visual:

**producto real recortado + fondo gris muy claro uniforme**

No usar ilustraciones ni fondos reales.

## Crop

Permitir reencuadre/focal point para portada.

Grid:

- 1:1 consistente.

Detalle/visor:

- original completo.

---

# 11. `/store` — customer FINAL

Replicar con alta fidelidad el artifact final.

Elementos:

1. header compacto;
2. hero estático;
3. buscador;
4. filtros integrados;
5. categorías horizontales con iconos;
6. grid 2 columnas;
7. vendidos recientemente;
8. cómo funciona;
9. link a restaurantes.

---

# 12. Hero

Características:

- estático;
- compacto;
- sin carrusel;
- sin gradientes;
- sin modelos;
- puede usar productos reales recortados;
- comunica la propuesta de valor;
- no desplaza excesivamente el catálogo.

Dirección:

**Clean / Premium + ADN Tindivo**

---

# 13. Cards

Reglas:

- 2 columnas;
- fondo blanco;
- foto 1:1;
- imagen protagonista;
- precio y texto fuera de la foto;
- borde/sombra mínimos;
- buen whitespace.

Jerarquía:

- precio: 18–20 px
- título: 14–15 px
- metadata: 12–13 px
- nada < 12 px

---

# 14. Badges

Máximo una insignia por card.

Prioridad:

1. `-X%`
2. `Remate`
3. `Nuevo`
4. `Reservado`

Tratamiento:

- descuento: coral sólido / blanco
- Remate: negro/ink / blanco
- Nuevo: naranja suave / texto oscuro
- Reservado: neutral refinado

No usar bandas enormes.

---

# 15. Estados públicos

## Disponible
Full contrast.

## Reservado
Listado:

- ligera desaturación;
- badge `Reservado`;
- totalmente legible.

Detalle:

- aviso;
- footer:
  - `RESERVADO`
  - `Avísame si se libera`

Mensaje WhatsApp:

> Hola Tindivo, vi que {codigo} está reservado. Avísame si se libera.

## Vendido

No mezclar en grid principal.

Mostrar en:

**Vendidos recientemente**

Detalle:

- estado vendido;
- CTA `Ver parecidos`.

---

# 16. Vendidos recientemente

Al final.

Máximo 4–6.

- desaturados/grayscale;
- todavía atractivos;
- badge pequeño;
- precio/título legibles;
- sin franja negra pesada.

Objetivo: prueba social.

---

# 17. Search

Filtrar mientras escribe, con debounce.

Estado vacío:

> No lo tenemos aún. Escríbenos y te avisamos si llega.

CTA:

> Escribir por WhatsApp

Debajo:

**Mientras tanto**

con sugerencias disponibles.

Registrar `search`.

---

# 18. Filtros

Bottom sheet.

### Condición
- Todo
- Nuevo
- Segunda

### Orden
- Recientes
- Menor precio
- Mayor precio

### Acciones
- Limpiar
- Ver X artículos

Persistir en URL cuando sea razonable.

Registrar eventos de filtros.

---

# 19. Navegación

Desde detalle:

- si venía de `/store`, volver conservando filtros/búsqueda/scroll cuando sea viable;
- si llegó desde link externo sin historial interno, flecha vuelve a `/store`.

No depender únicamente de `history.back()`.

---

# 20. Detalle `/store/[slug]`

Debe incluir:

- galería;
- título;
- precio;
- precio original;
- badge;
- pieza única;
- acepta ofertas;
- condición;
- talla/medida;
- para quién;
- estado 1–10 si usado;
- descripción;
- entrega;
- relacionados;
- referencia secundaria;
- CTA sticky.

---

# 21. Descuento

Mostrar:

- `-X%` en imagen;
- precio actual;
- precio anterior tachado.

No mostrar además `Ahorras S/X`.

---

# 22. Confianza

Cerca del CTA:

> Revísalo antes de pagar · Si no es como en las fotos, no pagas nada.

Bloque entrega:

> Te lo llevamos en San Jacinto desde S/2  
> S/2.00–2.50 según distancia · Pagas al recibir: efectivo o Yape

---

# 23. Galería / visor

Mantener:

- swipe;
- `1/N`;
- fullscreen;
- zoom;
- miniaturas;
- compartir.

No duplicar dots + contador.

---

# 24. Compartir

Web Share API cuando exista.

Fallback: copiar URL.

Registrar `share`.

---

# 25. Open Graph

Cada producto debe generar en servidor:

- título;
- precio;
- foto;
- estado;
- canonical.

Debe verse correctamente al pegar en WhatsApp/Facebook.

---

# 26. WhatsApp

Número desde DB/settings.

CTA:

> Lo quiero — pedir por WhatsApp

Mensaje:

> Hola Tindivo, quiero: {titulo} (S/{precio}) — código {codigo}. {url} ¿Sigue disponible?

Registrar `click_whatsapp` antes de abrir.

---

# 27. `ref`

Aceptar fuentes conocidas:

- `fb`
- `mp`
- `wa_estado`
- `grupo`
- `tiktok`

Guardar en sesión y propagar a eventos.

---

# 28. `/admin/store`

Usar V2 como referencia funcional.

Debe incluir:

- resumen experimento;
- pestañas/estados;
- lista;
- vistas;
- clics WA;
- precio;
- estado;
- nuevo artículo;
- acciones rápidas.

Principales:

- Disponibles
- Reservados
- Vendidos

Además:

- Borradores visibles
- Ocultos secundarios

---

# 29. Dashboard del experimento

Mostrar:

- día X de 14;
- visitas;
- clics WhatsApp;
- ventas;
- monto vendido.

Metas:

- visitas: 150 mínimo / 250 meta
- clics WA: 20 / 40
- ventas: 5 / 8
- monto: S/150 / S/250

Usar datos reales.

---

# 30. Acciones rápidas admin

Contextuales.

## Disponible
Principal:
- Reservar

Secundarias:
- editar
- duplicar
- ocultar
- copiar link
- copiar texto

## Reservado
Principal:
- Marcar vendido

También:
- Volver a disponible
- editar
- ocultar
- copiar

## Vendido
- ver
- revertir si corresponde
- duplicar
- copiar

---

# 31. Undo

Después de:

- reservar;
- vender;
- ocultar;
- volver disponible;

mostrar snackbar:

> Marcado como vendido · Deshacer

~5 s.

Backend debe revertir correctamente.

---

# 32. Formulario admin

Orden:

1. Fotos
2. Título
3. Precio
4. Precio original
5. Categoría
6. Condición
7. Estado 1–10 si usado
8. Talla/medida
9. Para quién
10. Descripción
11. Remate
12. Acepta ofertas
13. Destacado si se conserva
14. Publicar

Fotos primero.

---

# 33. Duplicar

Duplicar campos, no fotos.

Crear:

- nuevo borrador;
- nuevo código;
- nuevo slug.

---

# 34. Copiar link con fuente

Fuentes:

- Facebook
- Marketplace
- Estado WhatsApp
- Grupo
- TikTok

Ejemplo:

`/store/casaca-jean-m-ts-0012?ref=fb`

---

# 35. Copiar texto para redes

Generar texto real según producto.

Ejemplo:

> Casaca jean M · Estado 9/10 · S/30 (antes S/60) · Te la llevo en San Jacinto, pagas al recibir · tindivo.com/store/...?...ref=fb

---

# 36. Settings

Editar:

- WhatsApp;
- delivery mínimo;
- delivery máximo;
- texto entrega.

Persistir en DB.

---

# 37. Flujo de venta

1. comprador abre producto;
2. WhatsApp;
3. admin confirma;
4. ubicación/hora;
5. delivery;
6. reservar;
7. registrar entrega en sistema existente;
8. motorizado entrega;
9. cobra producto + delivery;
10. marcar vendido.

Reserva MVP: 24 h manual.

---

# 38. Políticas

Implementar:

- cancela antes de salida → sin costo;
- rechaza al recibir → paga delivery;
- no coincide con fotos/descripción → no paga nada;
- ausencia → política del PRD;
- revisión hasta 5 min;
- ofertas antes del envío;
- reserva 24 h;
- efectivo o Yape.

---

# 39. CSS / animación

Sin librerías de animación.

Solo transiciones ligeras:

- transform;
- opacity;
- background;
- border-color.

150–250 ms.

Respetar `prefers-reduced-motion`.

---

# 40. Accesibilidad

- nada < 12 px;
- contraste gris ≥ 4.5:1;
- tap targets ~44 px;
- color no como única señal;
- focus visible;
- alt text;
- HTML semántico.

---

# 41. Performance

Objetivo:

`/store` con ~30 productos < 2 s en 4G razonable.

Aplicar:

- imágenes responsive;
- lazy loading;
- miniaturas;
- cache;
- queries eficientes;
- evitar N+1;
- SSR/SSG/ISR según stack;
- bundle controlado.

---

# 42. Seguridad

- admin protegido;
- validación servidor;
- validar uploads y MIME;
- limitar tamaño;
- sanitizar;
- borradores/ocultos inaccesibles;
- no confiar en cliente para estados;
- storage siguiendo infraestructura actual.

---

# 43. SEO

Para productos públicos:

- title;
- meta description;
- canonical;
- Open Graph;
- imagen;
- contenido server-rendered cuando corresponda.

Borradores/ocultos no indexables.

---

# 44. Métricas

Embudo:

`view_list → view_product → click_whatsapp → vendido`

Separar por `ref`.

Registrar `nav_out` hacia restaurantes.

---

# 45. Tests mínimos

## Backend
- códigos/slugs únicos;
- no servir borrador/oculto;
- descuento;
- búsqueda sin tildes;
- transiciones;
- settings;
- eventos.

## UI
- card disponible;
- reservada;
- vendidos separados;
- empty search;
- filtros;
- CTA según estado;
- 360 px sin overflow.

## E2E si existe infraestructura
- store → producto → WhatsApp;
- admin → crear → publicar;
- reservar;
- vender;
- undo;
- link directo.

---

# 46. Criterios de aceptación

- [ ] `/store` coincide visualmente con el artifact final.
- [ ] Customer usa el nuevo sistema visual Tindivo.
- [ ] Hero implementado.
- [ ] Cards/badges corresponden a la última iteración.
- [ ] Reservado diferenciado correctamente.
- [ ] Vendidos separados al final.
- [ ] Detalle tiene visor/zoom.
- [ ] Relacionados funcionan.
- [ ] WhatsApp genera mensaje correcto.
- [ ] Borradores/ocultos no públicos.
- [ ] Admin CRUD completo.
- [ ] Primera foto crea borrador en servidor.
- [ ] Autosave funciona.
- [ ] Máximo 6 fotos.
- [ ] Reordenamiento funciona.
- [ ] Reservar/vender/ocultar funcionan.
- [ ] Undo funciona.
- [ ] Copiar link por fuente funciona.
- [ ] Copiar texto funciona.
- [ ] Settings persisten.
- [ ] OG funciona.
- [ ] Eventos guardan fuente.
- [ ] Búsqueda ignora tildes/case.
- [ ] A 360 px no hay scroll horizontal.
- [ ] CTA sticky no tapa contenido.
- [ ] 30 productos siguen siendo performantes.
- [ ] Accesibilidad mínima.
- [ ] Migraciones ejecutables.
- [ ] Seed idempotente.

---

# 47. Plan de ejecución

## Fase 1 — inspección
- repo
- stack
- integraciones

## Fase 2 — DB + dominio
- migrations
- modelos
- seed
- settings
- eventos

## Fase 3 — backend
- listado
- detalle
- admin
- uploads

## Fase 4 — customer
- `/store`
- filtros
- cards
- detalle
- visor
- WhatsApp
- OG

## Fase 5 — admin
- listado
- métricas
- formulario
- autosave
- estados
- copiar

## Fase 6 — calidad
- tests
- responsive
- accesibilidad
- performance
- errores

No dejar mocks cuando exista backend real.

---

# 48. Entrega final

Reportar:

1. archivos creados/modificados;
2. migrations;
3. variables de entorno nuevas;
4. cómo ejecutar;
5. cómo seedear;
6. cómo probar Store;
7. cómo probar Admin;
8. decisiones técnicas;
9. limitaciones;
10. checklist de aceptación;
11. pasos manuales de deploy.

---

# Regla final

**Diseño comprador = artifact final**  
`PXTPotmzmVqzpwLQHcbWwS`

**Funcionalidad/Admin = artifact V2 + PRD**  
`FNLpSEQqNmmEUfnQSMt4HP`

**Base de datos y reglas de negocio = PRD**

**Implementación técnica = adaptada al stack real de tindivo.com**

No entregues solo UI.

Entrega **Tindivo Store funcionando end-to-end**.
