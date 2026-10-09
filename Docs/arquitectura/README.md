# Arquitectura y estándares de Tindivo

> 2026-10-08. Jesús pidió mejorar el código y las buenas prácticas **antes** de migrar a nativo, preparar el sistema
> para crecer (promociones, mototaxi, quizá microservicios) sin una gran refactorización después, auditar la base de
> datos y saber cuánto dependemos de Supabase y Vercel. Y fijó la prioridad: **desacoplamiento**.
>
> Medido en el repo (`develop`, `99d70a0`) y en `tindivo-prod` con consultas de solo lectura. Revisado por Codex
> ([`revision-codex.md`](revision-codex.md)) en dos rondas: en la primera rechazó la versión inicial de los estándares;
> en la segunda **firmó con cambios** README, 04 y 05. Todos sus cambios están aplicados.

## Documentos

| Documento | Responde a |
|---|---|
| [`01-codigo.md`](01-codigo.md) | ¿El código sigue un estándar? (C-01…C-11) |
| [`02-base-de-datos.md`](02-base-de-datos.md) | ¿La base está bien estructurada? (B-01…B-12) |
| [`03-proveedores-y-vps.md`](03-proveedores-y-vps.md) | ¿Dependemos siempre de Supabase y Vercel? ¿VPS? ¿Notificaciones? |
| [`04-arquitectura-objetivo.md`](04-arquitectura-objetivo.md) | Desacoplamiento, microservicios, promociones y mototaxi |
| [`05-estandares.md`](05-estandares.md) | **Las reglas**, por niveles y con cómo se verifica cada una |
| [`revision-codex.md`](revision-codex.md) | La crítica de Codex y cómo se aplicó |

## Tus preguntas, en corto

**¿Seguimos un estándar?** En el detalle sí: tipos estrictos, validación, errores bien formados, tests y un linter
casi limpio (0 errores). **En la arquitectura, no:**

- la mayoría de las 107 rutas mezclan controlador, reglas y consultas;
- el núcleo de dominio (`packages/core`) es casi nominal;
- las reglas de dinero están copiadas en varias capas.

**¿Qué es lo prioritario?** Lo que dijiste: **desacoplar**. Hoy cuestan cuatro acoplamientos medidos:

- **los clientes con la base:** 180 llamadas directas a Supabase, 99 de ellas en Negocios;
- **las rutas con las tablas:** 216 consultas dentro de los controladores;
- **el código con el proveedor:** 300 llamadas a Supabase en la API;
- **las reglas con la interfaz:** el checkout calcula dinero en React.

Desacoplar es poner una frontera entre dos cosas que hoy se tocan directamente, **al trabajar en ellas**. No es
montar infraestructura nueva.

**¿La base está bien?**

- **Cimientos sólidos:** RLS y clave primaria en las 52 tablas, dinero exacto, fechas con zona horaria y `search_path`
  fijado.
- **Organización con riesgos de mantenimiento:**
  - un solo esquema;
  - `orders` con 98 columnas;
  - funciones de hasta 39 KB **sin ningún test SQL**;
  - la base no protege su máquina de estados;
  - dos outbox.

**¿Dependemos de Vercel?** Poco. Es Next sobre Node: en un VPS puede funcionar igual, pero hay que probarlo (caché,
procesos, recuperación), y el PDF necesita un cambio.

**¿Y de Supabase?** Mucho, pero no por la base, que es Postgres estándar, sino por lo de alrededor:

- 480 llamadas a su cliente en código de producción;
- el login;
- Storage y Realtime;
- la función de push.

La salida no es mudarse ahora, sino **desacoplar**: que solo unos pocos adaptadores conozcan a Supabase.

**¿Las notificaciones son de Supabase?** No. Supabase no envía push; hoy lo hace una función propia (Web Push). Las
apps nativas necesitan **FCM y APNs** (Google y Apple; sin coste por envío, APNs requiere la cuenta de Apple
Developer) en cualquier caso.

**¿Microservicios?** **No todavía.** Para una persona costarían más de lo que resuelven. La dirección es un
**monolito modular**: los módulos se crean donde hay trabajo real, empezando por `ordering`. Eso abarata separar un
servicio el día que haga falta, aunque separarlo siempre exigirá diseño y pruebas propios.

**¿Promociones?** Ya hay varias modalidades (global, por plato, de lanzamiento), cada una cableada a su manera.
Propongo:

- empezar por **las dos o tres campañas concretas que quieras lanzar**;
- pasar a una tabla de campañas cuando necesites dos a la vez;
- especificar antes las reglas que hoy no existen: acumulación, prioridad, quién financia, reserva del presupuesto,
  devolución y la foto de las condiciones de cada canje;
- que el canje se reserve en la misma transacción que el pedido.

**¿Mototaxi independiente?** Hipótesis: un módulo propio (`rides`). Antes de decidir qué comparte (conductores,
vehículos, cobro, app) hay que definir su operación; no se generaliza nada por adelantado.

## Cómo se aplica sin una gran refactorización

1. **Lo nuevo nace desacoplado.**
2. **Lo que se toca, se deja mejor.**
3. **Lo que no se toca, no se toca.**

Los estándares tienen tres niveles:

- **obligatorio solo para código nuevo**;
- **alertas**;
- **una lista de excepciones** para lo existente, que solo puede encoger.

**El paso 0 (los defectos de producción) no espera**: los estándares mínimos se montan en paralelo.

| En paralelo | Qué |
|---|---|
| **Paso 0 · Corrección** | Lo acordado en `../customer_app_migration/debate-rest/conclusion.md`: comprobante, idempotencia y bucket, más **revocar `anon` en `expire_courier_orders`** comprobando los permisos efectivos. Los parches mínimos no requieren mover código; la extracción al módulo `ordering` se hace después, o junto al arreglo cuando no amplía su riesgo ni retrasa su entrega |
| **Paso E · Estándares mínimos** | Aprobar `05-estandares.md`; resumirlo en `CLAUDE.md`; reglas de lint para **código nuevo** (DES-1…4, TS-2); la lista de excepciones; las pruebas de integración en CI; `Docs/adr/` |

Después, los pasos 1-7 del plan acordado, cada uno aplicando los estándares al código que toca.

## Decisiones que te tocan

| # | Decisión | Recomendación |
|---|---|---|
| E-01 | Aprobar `05-estandares.md` (v2) | Revísalo regla por regla: cada una es negociable **antes** de entrar en la CI |
| A-01 | Monolito modular como dirección | Sí |
| A-02, A-03, A-04 | Esquema por módulo, framework HTTP, driver de base | **Ensayos opcionales** con criterio de aceptación (`04` §7), no requisitos |
| P-01 | Las próximas campañas de promoción | Dime cuáles quieres lanzar: el modelo sale de ahí |
| R-01 | Mototaxi | Cuando lo quieras, definimos primero la operación (conductores, vehículos, cobro, seguridad) |
