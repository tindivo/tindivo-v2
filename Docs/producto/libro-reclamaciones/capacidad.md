---
id: libro-reclamaciones
nombre: Libro de Reclamaciones virtual
actores: [CUS, ADM]
lineas: [pedidos-restaurante, entregas, store]
depende_de: [web-publica]
dinero: false
codigo:
  web: []
  android: []
  ios: []
  backend: []
operaciones: []
reglas: []
---

# Libro de Reclamaciones virtual

> Verificado: 2026-11-19 · entorno: develop@25a6d537 (código) · Aprobado por Jesús el AAAA-MM-DD (medio) — SPEC sin código: nada de esto existe aún; pendiente de su visto bueno

## Antes de tocar

- Marco legal: Ley 29571 (Código de Protección y Defensa del Consumidor), D.S. 011-2011-PCM y modificatorias; plazo de respuesta de la Ley 31435 y el D.S. 101-2022-PCM. Todo texto legal citado aquí se contrasta con la fuente antes de publicarse.
- El Libro es **de Tindivo**, no de cada negocio. Proveedor: Jesús como persona natural con RUC de la serie 10 y «Tindivo» como nombre comercial.
- **El RUC y el domicilio no se escriben en el repo.** Viven en `app_settings`, en una clave nueva (`complaints_book`, nombre por confirmar); la página solo acepta envíos cuando esos datos están llenos.
- Formulario público, sin sesión, en `apps/web`. Llama a un `POST` de `apps/api`; la lógica va en `packages/backend` (service role), la validación Zod en `packages/contracts`, y la web solo habla con la API.
- Tabla con RLS y **ninguna policy para `anon`**; lectura solo del admin. Contiene datos personales (Ley 29733): `domain_events` y los logs llevan solo el id de la hoja.
- Número de hoja: correlativo anual `AAAA-000001`, atómico en la base, con el año en hora de Lima. Nunca `Date.now()` (invariantes 2 y 10).
- El correo sale por Resend, detrás de un puerto en `infra/` (DES-2) y de la variable `RESEND_API_KEY`. Sin la variable, el reclamo se guarda igual.
- **Dispara Codex** (`codex-auditor.md` §2): datos personales (S04), secretos y claves (S03) y RLS en la migración (S01). No toca dinero (`dinero: false`); si un reclamo llegara a reembolsar algo, esa parte pasa por Jesús y por Codex (invariante 9).
- Nunca se cierra la puerta a reclamar: si Turnstile o el correo fallan, se ofrece el WhatsApp de soporte.
- Depende de `web-publica` (la página vive en `apps/web`). La app nativa solo enlaza a ella, y el enlace aparece cuando el Libro exista y esté configurado.
- iOS aún no empieza. El código de esta capacidad no existe, por eso `codigo` va vacío; se llena cuando nazca.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-LIB-001 | La web debe ofrecer un formulario público, sin sesión, para registrar un reclamo o una queja ante Tindivo. | Ley 29571 · D.S. 011-2011-PCM · Decisión de Jesús, 2026-11-19 | ★ |
| CUS-LIB-002 | El formulario debe pedir la identificación del consumidor (nombre, documento de identidad, domicilio, teléfono y correo) y, si es menor de edad, los datos de su padre, madre o representante. Los campos exactos se verifican contra el reglamento (POR VERIFICAR). | D.S. 011-2011-PCM (contenido de la hoja) · Decisión de Jesús, 2026-11-19 | ★ |
| CUS-LIB-003 | El formulario debe pedir la identificación del bien contratado (servicio de Tindivo y, si aplica, el negocio y el código del pedido), el monto reclamado (opcional), el tipo (reclamo o queja, con su definición legal a la vista), el detalle y el pedido del consumidor. | D.S. 011-2011-PCM · Decisión de Jesús, 2026-11-19 | ★ |
| CUS-LIB-004 | Al registrarse, la hoja debe recibir un número correlativo anual `AAAA-000001`, asignado de forma atómica en la base dentro de la misma transacción, con el año en hora de Lima. | `AGENTS.md` invariantes 2 y 10 · Decisión de Jesús, 2026-11-19 | ★ |
| CUS-LIB-005 | Un reintento con la misma `Idempotency-Key` no debe crear una segunda hoja: devuelve la ya creada. | Contrato REST v1 · Decisión de Jesús, 2026-11-19 | ★ |
| CUS-LIB-006 | El envío debe protegerse con Cloudflare Turnstile, un límite por IP holgado (las redes móviles comparten IP) y un campo trampa. Si Turnstile falla, la página ofrece el WhatsApp de soporte. | Decisión de Jesús, 2026-11-19 | |
| CUS-LIB-007 | El consumidor debe recibir copia de su hoja por correo (Resend), por una página imprimible con token no adivinable y por un botón «Compartir por WhatsApp» que abre el chat prellenado, sin envío automático. | Decisión de Jesús, 2026-11-19 | ★ |
| CUS-LIB-008 | La página del Libro y el envío deben estar cerrados mientras los datos del proveedor (RUC y domicilio en `app_settings`) estén vacíos. | Decisión de Jesús, 2026-11-19 | ★ |
| CUS-LIB-009 | La política de Privacidad debe mencionar el Libro, los datos que recoge y a Cloudflare Turnstile como tercero. | Ley 29733 · Decisión de Jesús, 2026-11-19 | |
| ADM-LIB-001 | El admin debe listar las hojas ordenadas por vencimiento, con su estado, tipo y fecha. | Decisión de Jesús, 2026-11-19 | ★ |
| ADM-LIB-002 | El admin debe poder escribir la respuesta de una hoja; la respuesta sale por el medio que pidió el consumidor (carta o correo) y queda guardada con su fecha. | Ley 31435 · Decisión de Jesús, 2026-11-19 | ★ |
| ADM-LIB-003 | El admin debe recibir alertas antes de que venza el plazo de respuesta: 15 días hábiles improrrogables como límite legal y 10 días calendario como meta interna. | Ley 31435 · D.S. 101-2022-PCM · Decisión de Jesús, 2026-11-19 | ★ |
| ADM-LIB-004 | Los datos personales de una hoja solo deben verlos el admin; ningún otro rol ni usuario anónimo puede leerlos. | Ley 29733 · `AGENTS.md` invariante 3 | ★ |
| SYS-LIB-001 | El sistema debe calcular el vencimiento en días hábiles peruanos, con los feriados como parámetro en `app_settings` (clave por confirmar), y no en el código. | `AGENTS.md` invariante 10 · Decisión de Jesús, 2026-11-19 | |
| SYS-LIB-002 | El sistema debe conservar los datos personales de una hoja el tiempo definido y luego anonimizarlos, conservando el número, el tipo y las fechas. Plazo propuesto: 2 años (POR VERIFICAR con fuente legal). | Ley 29733 · `Docs/operacion/retencion-de-datos.md` | |
| SYS-LIB-003 | `domain_events` y los logs deben llevar solo el id de la hoja, nunca nombre, documento, domicilio, correo ni teléfono. | Ley 29733 · `AGENTS.md` invariante 4 | ★ |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-LIB-01 | Dado un visitante sin sesión y con los datos del proveedor llenos, cuando envía un reclamo completo, entonces recibe 201 con el número de hoja y la hoja queda guardada. | CUS-LIB-001, CUS-LIB-002, CUS-LIB-003 |
| CA-LIB-02 | Dado un consumidor menor de edad, cuando marca esa opción, entonces el formulario exige los datos de su padre, madre o representante y no deja enviar sin ellos. | CUS-LIB-002 |
| CA-LIB-03 | Dadas dos hojas creadas el mismo año, entonces sus números son `AAAA-000001` y `AAAA-000002`; con envíos simultáneos no hay duplicados ni saltos; y a las 23:30 hora de Lima del 31 de diciembre el año es el de Lima, no el de UTC. | CUS-LIB-004 |
| CA-LIB-04 | Dado el mismo envío repetido con la misma `Idempotency-Key`, entonces existe una sola hoja y ambas respuestas traen el mismo número. | CUS-LIB-005 |
| CA-LIB-05 | Dado el campo trampa lleno, cuando se envía, entonces no se crea hoja; dado un fallo de Turnstile, entonces la página ofrece el WhatsApp y no queda sin salida. | CUS-LIB-006 |
| CA-LIB-06 | Dado un reclamo registrado, entonces el consumidor ve una página imprimible con una dirección de token no adivinable, un botón «Compartir por WhatsApp» y, si la variable `RESEND_API_KEY` existe, recibe el correo; sin la variable, la hoja se guarda igual. | CUS-LIB-007 |
| CA-LIB-07 | Dado un `app_settings` sin los datos del proveedor, cuando alguien abre la página o llama al `POST`, entonces la página no muestra el formulario y el `POST` rechaza el envío. | CUS-LIB-008 |
| CA-LIB-08 | Dado un cliente anónimo o un usuario de cualquier rol distinto de admin, cuando consulta la tabla de hojas, entonces no ve ninguna fila. | ADM-LIB-004 |
| CA-LIB-09 | Dadas hojas con distinto vencimiento, entonces la lista del admin las ordena de la más próxima a vencer a la más lejana. | ADM-LIB-001 |
| CA-LIB-10 | Dada una respuesta escrita por el admin, entonces sale por el medio que pidió el consumidor, queda con fecha y la hoja pasa a respondida. | ADM-LIB-002 |
| CA-LIB-11 | Dada una hoja abierta que llega al día diez calendario sin respuesta, entonces el admin recibe una alerta; con feriados peruanos de por medio, el vencimiento hábil los salta según el parámetro. | ADM-LIB-003, SYS-LIB-001 |
| CA-LIB-12 | Dado el evento y el log de una hoja creada, entonces solo contienen el id de la hoja y ningún dato personal. | SYS-LIB-003 |
| CA-LIB-P1 | Pendiente de verificar con fuente legal: la anonimización a los 2 años y la lista exacta de campos de la hoja. | SYS-LIB-002, CUS-LIB-002 |

## Matriz de paridad

| Plataforma | Papel | Estado |
|---|---|---|
| Backend (`apps/api` + `packages/backend`) | `POST` público, número de hoja, idempotencia, correo, plazos | por construir |
| Web pública (`apps/web`) | Formulario y página imprimible | por construir |
| Android | Solo enlace al Libro (aparece cuando exista) | por construir |
| iOS | Solo enlace al Libro (aparece cuando exista) | sin empezar |
| Admin (`apps/admin`) | Lista por vencimiento, respuesta y alertas | por construir |
| Negocios y motorizados | No aplica | no aplica |

## Por verificar y preguntas

- **POR VERIFICAR con fuente legal:** campos exactos de la hoja de reclamación virtual; definiciones literales de reclamo y queja; si hace falta firma o su equivalente virtual; avisos obligatorios en la web (letrero del Libro); retención de 2 años y luego anonimizar.
- Nombre final de las claves de `app_settings` (datos del proveedor y feriados) y valor del límite por IP: se fijan al implementar.
- Pregunta para Jesús: ¿el aviso del Libro debe aparecer también en el pie de la landing y en la app? Se asume que sí (enlace visible).
