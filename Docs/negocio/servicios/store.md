# Tindivo Store: el catálogo de segunda mano de San Jacinto

> Verificado: 2026-10-10 · entorno: `tindivo-prod` (solo lectura: tablas `store_*`, `app_settings.store`) +
> `develop@7d00aa4` · Decisión: `DECISIONS.md §32` · Especificación: `Docs/Store/tindivo-store-prd-v2.md`

## Qué es

Un catálogo de **piezas únicas de segunda mano** en `tindivo.com/store`, con un solo vendedor: **Jesús**. No hay carrito
ni pago en la web: el comprador elige una pieza y la venta **se cierra por WhatsApp**. Jesús administra el catálogo desde
«Tienda» en el panel de admin.

## Reglas

- **Una pieza pasa por estados** (`STORE_STATUSES` en `packages/contracts/src/store.ts`): borrador → disponible →
  reservada → vendida, o oculta. **Nada vuelve a borrador.**
- Para publicar: al menos **1 foto** (máximo **6**) y los campos obligatorios. La misma regla vive en el contrato
  (`missingForPublish`) y en la base (`store_products_publishable_chk`), a sabiendas: si cambia una, cambia la otra.
- El enlace de una pieza (`slug`) queda fijo al publicarla.
- **Nadie lee las tablas sin pasar por la API**: un borrador no se puede pedir directamente a la base.
- El envío de una pieza se anuncia entre **S/ 2.00 y S/ 2.50** (`app_settings.store`), y el WhatsApp de contacto vive
  en la misma configuración.

Store se plantea como **experimento** (`0243_el_experimento_de_store_sabe_en_que_dia_va`). Al no cobrar en la web,
no toca el principio de no retener fondos.

## El dinero

Store **no registra cobros**: registra precio y estado vendido. Lo cobra Jesús al cerrar la venta por WhatsApp, fuera
de la plataforma (`Docs/negocio/dinero.md`).

## Lo que pasa de verdad (al 2026-10-10)

Construido y en producción, con **8 categorías y ningún producto cargado**, ni siquiera en borrador.
