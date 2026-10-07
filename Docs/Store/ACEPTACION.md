# Tindivo Store — aceptación

Estado a 2 de octubre de 2026, rama `feat/store`. **Todo se probó contra la base LOCAL**; nada
se ha empujado a `tindivo-prod`.

Leyenda: ✅ verificado con una prueba automática o una medición · 🟡 verificado en parte ·
⬜ no se puede verificar fuera de producción o de un celular real.

## PRD v2 §12

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| En 390 px el primer viewport muestra al menos una fila completa de productos | ✅ | Captura a 390×844: header, hero, buscador, categorías y la 1.ª fila completa |
| Un link pegado en WhatsApp/Facebook muestra foto, título y precio | 🟡 | `og:title/description/image` con precio y PNG 1200×630 (≈400 KB) verificados (e2e). **Falta pegarlo en WhatsApp real** tras desplegar |
| Del listado a WhatsApp con mensaje y código en dos toques | ✅ | e2e `store.spec.ts`: tarjeta → botón; href con «Hola Tindivo, quiero: … (S/30) — código TS-… ¿Sigue disponible?» |
| Disponible a contraste total; reservado legible con insignia; vendido solo en «Vendidos recientemente» (máx. 6) | ✅ | e2e + API (`sold.length ≤ 6`) |
| Portada cuadrada y centrada en el punto elegido; el detalle muestra la foto completa | ✅ | CSS `object-fit: cover` + `object-position` (grilla) y `contain` (detalle); e2e del punto central guarda `coverFocusX/Y` |
| «casaca» encuentra «Casaca» y «movil» encuentra «móvil» | ✅ | API (3 variantes) y e2e |
| Los filtros quedan en la URL y se conservan al volver desde un detalle | ✅ | e2e «volver» (`categoria=ropa` sigue tras volver) |
| Desde un link externo, el botón volver lleva a /store | ✅ | e2e |
| Borradores y ocultos no se ven ni se abren por URL pública | ✅ | API (404) + e2e (HTTP 404 real) + base (sin lectura anónima) |
| Si se cierra la app a mitad, el borrador sigue con sus fotos | ✅ | e2e «un borrador sobrevive» |
| Cada cambio de estado se deshace en 5 s; deshacer «vendido» limpia la fecha | ✅ | e2e + base (`sold_at` solo lo decide el estado) |
| Se crea un artículo con 3 fotos desde el celular en menos de 2 minutos | ⬜ | Mecánica verificada (subida por foto, autosave); **el tiempo real hay que medirlo con un celular y 4G** |
| Ningún texto < 12 px; grises con contraste 4.5:1 | ✅ | Barrido de todos los nodos de texto en lista, detalle, admin y formulario (0 por debajo de 12 px). Gris tenue `#6b6762` ≈ 5,3:1 sobre blanco |
| «Nuevo artículo» nunca tapa la última fila | ✅ | e2e (la última fila termina por encima del botón) |
| Listado con 30 artículos carga en < 2 s con 4G | 🟡 | Con 41 artículos: API ≈ 50 ms, SSR ≈ 90 ms, HTML 97 KB sin comprimir; miniaturas diferidas. **4G real sin medir** |
| Cada clic a WhatsApp guarda un evento con el producto y la fuente | ✅ | e2e (`click_whatsapp` con `productId` y `ref=fb`) |

## Prompt maestro §46

| Criterio | Estado |
| --- | --- |
| `/store` coincide visualmente con el artifact final (v4) | 🟡 Hecho a partir de su CSS/medidas; la comparación pixel a pixel no se hizo. El **hero** usa iconos, no recortes (ver IMPLEMENTACION §4) |
| Customer usa el nuevo sistema visual (blanco / charcoal / naranja; verde solo WhatsApp; coral solo descuentos) | ✅ |
| Hero, cards/badges (una por tarjeta), reservado, vendidos separados, visor/zoom, relacionados | ✅ |
| WhatsApp genera el mensaje correcto (compra, reservado, búsqueda vacía) | ✅ |
| Admin CRUD completo; primera foto crea borrador en servidor; autosave; máx. 6 fotos; reordenar | ✅ |
| Reservar / vender / ocultar / volver a disponible; Undo | ✅ |
| Copiar link por fuente; copiar texto | ✅ (portapapeles real en e2e) |
| Settings persisten y los ve el comprador | ✅ |
| Eventos guardan fuente; embudo y resumen del experimento | ✅ |
| A 360 px no hay scroll horizontal (comprador, lista y formulario del admin) | ✅ |
| CTA sticky no tapa contenido | ✅ (es parte del flujo, al final de la página) |
| Accesibilidad mínima: foco visible, alt, HTML semántico, targets ≥ 44 px, iconos decorativos fuera del nombre accesible | 🟡 Revisado por barrido y e2e; sin auditoría con lector de pantalla |
| Migraciones ejecutables e idempotentes; seed idempotente | ✅ Aplicadas con el CLI y **re-ejecutadas** sin error ni duplicados |
| Tests | ✅ contratos 59 · API 40 · navegador 17 + 17 · imágenes 23 |

## Pendiente antes de producción
1. `supabase db push` (fuera del horario de pedidos) y `pnpm db:types`; revisar `get_advisors`.
2. Probar en un celular real: tiempo de publicar 3 fotos, la cámara, la vista previa en WhatsApp.
3. Fotos propias recortadas para el hero (opcional).
4. Decidir si el home enlaza a `/store`.
