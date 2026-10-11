# Las apps: qué puede hacer cada uno

> Verificado: 2026-10-10 · entorno: `develop@7d00aa4` (pantallas de cada app) y `tindivo-prod` (solo lectura) ·
> Cómo están construidas: `Docs/arquitectura/README.md` · Nombres: `Docs/glosario.md`

Cuatro apps web, una por rol, más la API que todas usan. El detalle de cada pantalla está en el código
(`apps/<app>/app/`); aquí, para qué sirve cada una y lo que no se ve en la interfaz.

## Cliente (`tindivo.com`)

Ve el catálogo de los negocios, pide (con entrega o recojo), paga contraentrega o prepago con captura, sigue su pedido
en un seguimiento de cuatro pasos (recibido, preparando, en camino, entregado) y reseña. También pide **Entregas**
(`/entregas`) y mira **Store** (`/store`). Entra con su cuenta y verifica su teléfono por SMS.

- El seguimiento simplifica los estados internos: lo define `STATUS_TO_TRACKING` (`packages/contracts`).
- Los avisos de estado le llegan **solo por la app** (push, la pantalla abierta, la pestaña, el pedido en curso al
  volver); la llamada de la cajera es antifraude, no aviso.

## Negocio, para la cajera

Tablero de pedidos en vivo (aceptar, cocina, listo, entregar en mostrador), **pedidos manuales** (`/nuevo`, solo el
total), carta (`/menu`, con franjas horarias por plato), **deuda** con Tindivo y devoluciones (`/deuda`), rendiciones
de **efectivo** de los motorizados, historial, rendimiento, reseñas y configuración (horario, Yape, vuelto disponible).

- **Si suena, se ve:** la alarma de pedido nuevo y el aviso en pantalla salen de una sola función
  (`apps/negocios/lib/orders/attention.ts`). Separarlas perdió un pedido en producción.
- Iconos: subset cerrado (`apps/negocios/AGENTS.md`).

## Motorizado

Cola de pedidos por tomar, su pedido en curso, **Entregas**, rendición de **efectivo** y de lo cobrado en Entregas
(`/efectivo`, `/deuda`), historial, restaurantes y perfil. Lleva hasta 3 pedidos de comida a la vez
(`app_settings.assignment_rules.maxOrdersPerDriver`) y hasta 2 entregas.

## Admin, para Jesús

Monitoreo y pedidos, negocios y motorizados (alta y configuración), **cobros** a los negocios, efectivo, deuda de
Entregas, apelaciones, casos, incidentes, strikes, reportes, reseñas, métricas, auditoría, zonas y referencias del mapa,
configuración (`app_settings`) y **Store**.

## Reseñas

Reglas en `DECISIONS.md §28`: se capturan desde el día 1 y **nada es público**; el negocio ve la nota y las etiquetas,
nunca el texto; la reseña no toca dinero ni asignación; se pide en el pedido siguiente, dentro de 21 días. En
`tindivo-prod`, al 2026-10-10: **41 reseñas, promedio 4.98**.

## Apps nativas

La migración a Swift + Kotlin está en curso; su análisis y el catálogo de requisitos por app, en
`Docs/trabajo/movil/`.
