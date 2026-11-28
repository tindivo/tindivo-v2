---
canvas: [Negocio, Negocio-secciones, Negocio-info]
requisitos: [CUS-CAT-004, CUS-CAT-005, CUS-CAT-006, CUS-CAT-010, CUS-CAT-011, CUS-CAT-012, CUS-CAT-013, CUS-CAT-014, CUS-CAT-015, CUS-CAT-016, CUS-CAT-017, CUS-CAT-018, CUS-CAT-021, CUS-CAT-022, CUS-CAT-026, CUS-CAT-027, CUS-CAT-028, CUS-CAT-029, CUS-CRT-001, CUS-CRT-005]
operaciones: [getBusiness]
textos: []
tokens: []
codigo:
  web: [apps/customer/features/catalog/components/negocio-shell.tsx, apps/customer/features/catalog/components/menu-section.tsx, apps/customer/features/catalog/components/menu-item-card.tsx, apps/customer/features/catalog/components/schedule-week.tsx, apps/customer/features/catalog/components/section-index-sheet.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/business/BusinessScreen.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/business/BusinessViewModel.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/business/BusinessHeader.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/business/MenuTopBar.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/business/MenuItemRow.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/business/MenuSearchResults.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/business/SectionIndexSheet.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/business/CartBar.kt]
  ios: []
---

# Negocio y carta

| | |
|---|---|
| **Tarea de la persona** | Ver la carta de un negocio, saber si puede pedirle y agregar platos a la bolsa. |
| **Se llega desde** | `catalogo/inicio` (tarjeta), un enlace `/negocio/{slug}` (CUS-CAT-022, diferido), «Volver a pedir» en pedidos, «Agregar más» en `bolsa/bolsa`. |
| **Se sale hacia** | Plato → `catalogo/plato`. «Ver bolsa» → `bolsa/bolsa`. Cuadrícula → hoja «Todas las secciones». Volver → origen. |

## Contenido, de arriba abajo

1. **Barra superior:** transparente sobre la portada; tras ~140 px de scroll se vuelve blanca con sombra y muestra el
   nombre y el estado. Volver · nombre · «Abierto · cierra [hora]» · buscar. Sin botón «i» (CUS-CAT-027).
2. **Portada y cabecera:** foto, nombre, rubro y estado. Sin fila «Información del negocio ›» (CUS-CAT-027) ni modos de
   entrega: el método se elige en el checkout (CUS-CAT-017). Decisión de Jesús, 2026-11-26: la carta toma la forma de
   Android v3.1.
3. **Selector de secciones**, pegado bajo la barra: «Destacados» y las demás, y un botón de cuadrícula con el total que
   abre «Todas las secciones». Tocar una sección lleva a ella; la visible se resalta sola al hacer scroll.
4. **Secciones de platos.** Cada una: título, «[N] productos» y sus filas. «Destacados» es una sección reutilizable cuyos
   productos y nombre elige el restaurante, en carrusel manual (CUS-CAT-028); su «+» abre la ficha y la tarjeta no dice cuánto hay en la bolsa. Una fila: nombre, descripción de una línea,
   precio y foto, **sin control**: tocarla abre la ficha del plato (CUS-CAT-029). El «+» solo está en «Destacados». Un
   plato con opciones obligatorias dice «Desde S/ [PRECIO]».
5. **Pastilla «Ver bolsa»** con contador y total, sobre el borde inferior; solo con la bolsa de este negocio.

### Hoja «Todas las secciones»

Título y «[N] productos en [negocio]». Una fila por sección con su cantidad; la actual dice «Estás aquí» y las demás «Ir a
la sección». Se cierra con la X, el scrim o deslizando; elegir una sección cierra la hoja y lleva a ella con scroll suave.

### Hoja «Información»

Cabecera fija (nombre, rubro) y contenido que desplaza: mapa de referencia · dirección y «Cómo llegar» (abre la app de
mapas) · **«Horarios»** (estado y los siete días, hoy resaltado, «Cerrado» el día sin turno) · **«Cómo lo recibes»**
(«Delivery» con su costo y «Recojo en el local») · **«Cómo pagas»** («Yape», «Plin», «Efectivo» y «Pagas directo al negocio. Tindivo no
retiene tu dinero»). **Sin contacto** (CUS-CAT-026): ni llamar, ni WhatsApp, ni teléfono.

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Cargando | Esqueleto de portada y filas | CUS-CAT-004 |
| Error | «No pudimos cargar el menú» · «Revisa tu señal e inténtalo otra vez.» · «Reintentar» | CUS-CAT-004 |
| Sin conexión con datos guardados | «Sin conexión. Te mostramos lo último guardado.» (por definir: no hay requisito de modo sin conexión) | CUS-CAT-004 |
| Negocio cerrado | «Cerrado ahora.» · «Abre hoy a las [hora].»; los platos se ven y agregar queda deshabilitado | CUS-CAT-012 |
| Negocio pausado o sin jornada confirmada | Pedido deshabilitado con aviso; no afecta al WhatsApp | CUS-CAT-013, CUS-CAT-014 |
| Negocio en modo catálogo | «Pedir por WhatsApp» y «Llamar» en lugar de la bolsa | CUS-CAT-015 |
| Plato agotado o fuera de franja | «No disponible» (y cuándo vuelve) y no se puede agregar | CUS-CAT-010, CUS-CAT-011 |
| Búsqueda activa | Resultados dentro de la carta; vacío: «No encontramos “[texto]” en [negocio]» y «Prueba con otro nombre, o con un ingrediente…» | CUS-CAT-006 |
| Pedido activo en este negocio | Se enlaza al pedido existente en vez de dejar crear otro | CUS-CAT-018 |
| Bolsa de otro negocio | «¿Empezar una bolsa nueva?» · «Mantener» / «Vaciar y empezar» | CUS-CRT-001 |
| Sin foto del negocio o del plato | Isotipo de Tindivo sobre `#FFF7ED` | CUS-CAT-007 |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-CAT-P4 | Dado la carta con 6 secciones, cuando se toca «Combos» en el selector o en la hoja «Todas las secciones», entonces la carta se desplaza a «Combos» y esa sección queda resaltada, y durante ~700 ms el resaltado automático por scroll no la cambia. | CUS-CAT-005 |
| CA-CAT-P5 | Dado la portada visible, cuando el scroll supera ~140 px, entonces la barra pasa de transparente a blanca con sombra y aparecen el nombre y el estado. | CUS-CAT-004 |
| CA-CAT-P6 | Dado un negocio con turnos por día, cuando se abre la hoja «Información», entonces los siete días se listan, hoy lleva «hoy» y el día sin turno dice «Cerrado». | CUS-CAT-021 |

## Movimiento

Barra superior y selector: 150–250 ms, `cubic-bezier(.2,.8,.2,1)`. Tocar una sección desplaza con scroll suave y apaga el
resaltado automático ~700 ms. Cualquier control: escala 0,97. Agregar: la miniatura vuela a «Ver bolsa» y el contador
rebota. Las hojas suben 250 ms con el scrim en fundido. Con «reducir movimiento»: sin animaciones.

## Pendiente

- Dónde se ofrece la hoja «Información» ahora que la carta no lleva su fila (CUS-CAT-027, decisión del 2026-11-26). Hasta
  decidirlo, ninguna app muestra el horario semanal (CUS-CAT-021, CA-CAT-P6): es deuda anotada, defecto 11 de
  `capacidad.md` (decisión de Jesús, 2026-11-27).
- «Para compartir» (distintivo): sin definir (DA-17 de `Docs/trabajo/decisiones-abiertas.md`); no entra.
- «Cómo pagas» mantiene los nombres Yape y Plin: es información, no una opción de pago (decisión de Jesús, 2026-11-19).
- La referencia «a una cuadra de la plaza» de la maqueta no tiene campo en el negocio.
- La búsqueda dentro de la carta existe en el código y la maqueta no la dibuja: se mantiene (CUS-CAT-006).
