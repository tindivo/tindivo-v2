# Migración de la app de clientes a nativo (Swift + Kotlin)

> **Estado:** análisis completo, medido el **2026-09-20** (`HEAD 09749a4`, rama `develop`; base `tindivo-prod`
> en la migración 0230) y **actualizado el mismo día con tus respuestas**: operación real, Customer en Android e iOS
> a la vez y **Negocios (cajera) en Android como lo más urgente**. Es la fase previa a la planificación: entender el
> backend, catalogar lo que hay que replicar y dejar listo el arranque. **No se modificó código ni base de datos.**

## Empieza aquí

0. **[`debate-rest/conclusion.md`](debate-rest/conclusion.md) (2026-10-08)** — conclusión común de Claude y Codex: REST como
   contrato del dominio de las apps, tres defectos de corrección primero, el orden de trabajo 0-7 y la postura sobre el
   squash de migraciones. **Manda sobre todo lo demás de esta carpeta.** Su respaldo:
   [`06-contrato-rest-movil.md`](06-contrato-rest-movil.md) (la puesta al día tras Entregas y Store) y las rondas en
   [`debate-rest/`](debate-rest/).
1. [`00-resumen-ejecutivo.md`](00-resumen-ejecutivo.md) — veredicto, novedades, bloqueadores, qué replicar, plan y qué necesito de ti.
2. [`04-decisiones-abiertas.md`](04-decisiones-abiertas.md) — lo decidido, lo que falta por decidir y mis supuestos.
3. [`05-arranque/`](05-arranque/03-plan-de-ejecucion.md) — **por dónde empezar**: cuentas de tienda, planes y región, plan de ejecución.

## Según lo que quieras hacer

| Quiero… | Lee |
|---|---|
| Crear las **cuentas de Apple, Google Play y Firebase** | [`05-arranque/01-cuentas-y-firmas.md`](05-arranque/01-cuentas-y-firmas.md) |
| Arreglar **lo urgente hoy** (copias de seguridad, región, planes) | [`05-arranque/02-planes-region-y-mejoras-rapidas.md`](05-arranque/02-planes-region-y-mejoras-rapidas.md) |
| Ver el **orden de trabajo** y el camino crítico | [`05-arranque/03-plan-de-ejecucion.md`](05-arranque/03-plan-de-ejecucion.md) |
| Entender **cómo funciona hoy** Tindivo | [`01-sistema-actual/01-mapa-del-sistema.md`](01-sistema-actual/01-mapa-del-sistema.md) y luego `02`…`05` |
| Saber **qué está mal** en el backend | [`02-auditoria-backend/00-veredicto-y-metodo.md`](02-auditoria-backend/00-veredicto-y-metodo.md) → [`registro-de-hallazgos.md`](02-auditoria-backend/registro-de-hallazgos.md) |
| Entender por qué **no llegan los avisos** | [`02-auditoria-backend/03-notificaciones.md`](02-auditoria-backend/03-notificaciones.md) y [`01-sistema-actual/05-notificaciones-hoy.md`](01-sistema-actual/05-notificaciones-hoy.md) |
| Saber qué le **falta al backend para el móvil** | [`02-auditoria-backend/07-preparacion-para-cliente-nativo.md`](02-auditoria-backend/07-preparacion-para-cliente-nativo.md) |
| **Construir la app** de clientes | [`03-requisitos/CUS-cliente.md`](03-requisitos/CUS-cliente.md) + [`01-sistema-actual/03-superficie-api.md`](01-sistema-actual/03-superficie-api.md) §4 (API móvil propuesta; para el primer *build* basta la versión mínima de [`04-decisiones-abiertas.md`](04-decisiones-abiertas.md) §3.1) |
| **Construir la app de la cajera** (Android) | [`03-requisitos/NEG-negocios.md`](03-requisitos/NEG-negocios.md) + alcance N1 en [`05-arranque/03-plan-de-ejecucion.md`](05-arranque/03-plan-de-ejecucion.md) §7 |
| Ver lo **nuevo** que habilita lo nativo | [`03-requisitos/NAT-capacidades-nativas.md`](03-requisitos/NAT-capacidades-nativas.md) |
| Saber **qué no se migra** | [`03-requisitos/matriz-disposicion-movil.md`](03-requisitos/matriz-disposicion-movil.md) §5 |
| Repetir una **medición** | [`anexos/C-consultas-de-medicion.md`](anexos/C-consultas-de-medicion.md) |

## Estructura

```
Docs/customer_app_migration/
├─ README.md                              ← este índice
├─ 00-resumen-ejecutivo.md
├─ 01-sistema-actual/
│   ├─ 01-mapa-del-sistema.md             apps, proveedores, flujo de un pedido, glosario
│   ├─ 02-modelo-de-datos.md              45 tablas, enums, funciones, RLS, cron
│   ├─ 03-superficie-api.md               convenciones y PROPUESTA de API móvil v1
│   ├─ 04-estados-tiempos-y-reglas.md     máquina de estados, plazos, quién puede qué
│   └─ 05-notificaciones-hoy.md           pipeline actual y catálogo de eventos
├─ 02-auditoria-backend/
│   ├─ 00-veredicto-y-metodo.md           veredicto, lo que está bien, escala real, método
│   ├─ 01-arquitectura-y-contrato.md      ARQ-01…08
│   ├─ 02-rendimiento-y-latencia.md       PER-01…07 (con mediciones)
│   ├─ 03-notificaciones.md               NOT-01…08
│   ├─ 04-seguridad.md                    SEC-01…10
│   ├─ 05-datos-y-consistencia.md         DAT-01…08
│   ├─ 06-proceso-calidad-y-operacion.md  PRO-01…08
│   ├─ 07-preparacion-para-cliente-nativo.md  MOB-01…21
│   └─ registro-de-hallazgos.md           48 hallazgos, Ola A («ahora») y olas de ataque, tabla completa
├─ 03-requisitos/
│   ├─ 00-formato-y-convenciones.md       EARS, IDs, estados, disposiciones, fases
│   ├─ CUS-cliente.md                     140 requisitos (especificación) + criterios de aceptación
│   ├─ NEG-negocios.md · MOT-motorizados.md · ADM-admin.md   por capacidad
│   ├─ SYS-transversal.md                 reglas del servidor (dinero, estados, plazos, antifraude, avisos)
│   ├─ NAT-capacidades-nativas.md         58 capacidades nuevas
│   └─ matriz-disposicion-movil.md        (generada por script)
├─ 04-decisiones-abiertas.md              decidido / abierto / supuestos / riesgos
├─ 05-arranque/
│   ├─ 01-cuentas-y-firmas.md             Apple, Google Play y Firebase paso a paso; costes y plazos
│   ├─ 02-planes-region-y-mejoras-rapidas.md  planes gratuitos, región confirmada, Ola A
│   └─ 03-plan-de-ejecucion.md            carriles, dependencias, camino crítico, metas
└─ anexos/
    ├─ A-superficie-api.md                (generado) las 85 rutas
    ├─ B-orders-98-columnas.md            (generado) `orders` por preocupación
    ├─ C-consultas-de-medicion.md         cómo se midió
    └─ scripts/                           extractores regenerables
```

## Convenciones

- **Idioma:** español peruano. Identificadores, rutas y SQL, tal cual en inglés.
- **Etiquetas de evidencia** (auditoría): `[CÓDIGO]` `[DB-PROD]` `[ADVISOR]` `[PRUEBA]` `[DOC]` — ver
  [`00-veredicto-y-metodo.md §4`](02-auditoria-backend/00-veredicto-y-metodo.md). En `05-arranque/`: **✔** = contrastado con
  fuentes públicas el 2026-09-20; **◦** = por verificar.
- **IDs estables:** hallazgos `ARQ/PER/NOT/SEC/DAT/PRO/MOB-NN`; requisitos `CUS/NEG/MOT/ADM/SYS/NAT-ÁREA-NNN`;
  decisiones `D-NN`. No se reutilizan.
- **⚙** = valor configurable (viene de `app_settings`); **★** = crítico de paridad entre iOS y Android.
- **Los números son fotografías** del 2026-09-20. Cuando este material y la base discrepen, gana la base.

## Qué está generado por script (no editar a mano)

`03-requisitos/matriz-disposicion-movil.md`, `anexos/A-superficie-api.md`, `anexos/B-orders-98-columnas.md`
(ver `anexos/scripts/`; tienen rutas absolutas de esta máquina al inicio). Si cambia una tabla de requisitos,
se regenera la matriz.
