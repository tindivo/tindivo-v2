# 03 · Notificaciones («avisos que no llegan» y «no puedo hacer marketing»)

> **Es el tema que más duele**, así que va con más detalle. Descripción del pipeline y del
> catálogo de eventos: [`../01-sistema-actual/05-notificaciones-hoy.md`](../01-sistema-actual/05-notificaciones-hoy.md).
> Requisitos de lo nuevo (marketing, Live Activities…): `../03-requisitos/NAT-capacidades-nativas.md`.
> Etiquetas y escalas: [`00-veredicto-y-metodo.md`](00-veredicto-y-metodo.md).

## La conclusión, con números

```
Cliente con cuenta ............................ 77
  └─ con al menos un dispositivo registrado ... 11   (14 %)   ← todos Android; 0 en iPhone
Clientes que han hecho un pedido ............... 32
  └─ con dispositivo registrado ................ 10   (31 %)
Envíos al servicio de push aceptados ........... 99,95 %  (7 764 ok · 4 errores 410, últimos ≤30 días)
Eventos de dominio marcados como publicados .... 0 de 5 620  (0 %)
```

Traducción: **cuando el sistema intenta avisar a un dispositivo registrado, casi siempre lo logra;
el problema es que casi nadie tiene un dispositivo registrado**, y que lo que existe está pensado
para Web Push, que es la tecnología con menos alcance que hay (sobre todo en iPhone). `[DB-PROD]`

Datos exactos, `tindivo-prod`, 2026-09-20:

| Rol | Usuarios con push | Suscripciones | iOS | Android | Otro |
|---|---|---|---|---|---|
| Cliente | 11 | 11 | **0** | 11 | 0 |
| Negocio | 4 | 9 | 1 | 3 | 5 |
| Motorizado | 3 | 5 | 4 | 1 | 0 |
| Admin | 1 | 1 | 0 | 1 | 0 |
| **Total** | **19** | **26** | 5 | 16 | 5 |

Dos suscripciones Android nunca tuvieron un envío exitoso. `[DB-PROD]`

**Por qué ningún cliente en iPhone.** En iOS, Web Push solo funciona si el usuario **instala la PWA
en la pantalla de inicio** (iOS 16.4+) y luego acepta el permiso. El propio código lo dice
(`apps/customer/hooks/use-pwa-install.ts`: «En iOS es REQUISITO. Safari solo entrega Web Push a
apps añadidas a la pantalla de inicio… no existe forma programática de ofrecerlo, solo explicar
los pasos») y por eso existe `features/tracking/components/tracking-install.tsx` («En iPhone hay
un paso más»). Tu observación («no saben cómo descargar una PWA») es exactamente el cuello de
botella.

---

## NOT-01 · El «outbox» no es un outbox: nada se marca como publicado y nada se reintenta

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | **Sí** (la fiabilidad de los avisos depende de esto) |
| **Esfuerzo** | M |

**En una frase.** El evento se guarda bien en la misma transacción (bien), pero el envío es un
*disparar y olvidar*: si falla, el aviso se pierde sin dejar rastro.

**Evidencia.**
- `domain_events`: **5 620 filas, las 5 620 con `published_at` vacío**, `retry_count = 0` en todas.
  `[DB-PROD]`
- El trigger `dispatch_event` hace `net.http_post(...)` y **no lee la respuesta** (la tabla
  `net._http_response` guarda los resultados unas horas y nadie los consulta). No hay ningún job que
  reintente eventos no publicados: `cron.job` lista 11 tareas y **ninguna reconcilia
  `domain_events`**. `[DB-PROD]`
- `DECISIONS.md:490-493` describe lo contrario («la Edge Function marca `published_at`; un cron de
  reconciliación reprocesa…»); **`DECISIONS.md:777-779` lo admite**: «hoy `dispatch_event` es
  `net.http_post` a fondo perdido… `published_at` no lo escribe nadie». `[CÓDIGO]`
- Existe un **segundo outbox** (`outbox_events` + `claim_outbox_events`) que sí reserva con
  `FOR UPDATE SKIP LOCKED`, con reintentos (`attempts < 5`) y *backoff*, pero **solo** lo usan dos
  eventos de apelaciones (`apps/api/lib/outbox/processor.ts`). Tras 5 fallos la fila queda en
  `failed` para siempre, sin alerta. `[CÓDIGO]`

**Por qué importa.** Cualquier fallo transitorio (Edge Function en frío, timeout de `pg_net`,
despliegue a medias) hace **desaparecer** un aviso, y no hay forma de saberlo después. Es la
receta de «el pedido se perdió y nadie sabe por qué».

**Dirección.** Un **outbox transaccional real**: estado (`pending → processing → delivered |
failed | dead`), reserva con *lease*, reintento con *backoff*, *dead-letter* con alerta, y
`published_at` escrito por quien entrega. Las notificaciones son **un consumidor** de ese outbox,
no un trigger que dispara HTTP.

---

## NOT-02 · Todo el modelo es Web Push: el alcance depende del navegador

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | **Sí** |
| **Esfuerzo** | M |

**En una frase.** `push_subscriptions` guarda `endpoint / p256dh / auth` (Web Push); no puede
guardar un token de APNs ni de FCM.

**Evidencia.**
- Columnas de `push_subscriptions`: `id, user_id, endpoint, p256dh, auth, user_agent,
  last_successful_at, last_failed_at, failure_count, created_at, updated_at, install_id`. **No
  hay** plataforma, token nativo, versión de app, idioma, zona horaria, entorno (sandbox/prod), ni
  preferencias. `[DB-PROD]`
- El cliente PWA debe pedir permiso **dentro de un gesto**, **una sola vez por navegador**, y
  reconciliar cada 60 s si la suscripción del navegador coincide con la del servidor
  (`apps/customer/lib/push.ts:14-33, 158-233`): media aplicación de código existe para compensar
  las limitaciones del canal. `[CÓDIGO]`

**Por qué importa.** Con nativo desaparece toda esa fragilidad, **pero hay que construir el
registro de dispositivos desde cero** (`MOB-03`, `NOT-06`).

**Dirección.** Tabla `devices` (o generalizar la actual): `id, user_id, platform
(ios|android|web), token, environment, app_version, os_version, device_model, locale, timezone,
notifications_enabled, last_seen_at`, más las de `NOT-06`.

---

## NOT-03 · Los envíos Web Push no fijan TTL ni urgencia

| | |
|---|---|
| **Severidad** | Medio |
| **Bloquea el móvil** | No (pero enseña qué exigir a APNs/FCM) |
| **Esfuerzo** | S |

**Evidencia.** `supabase/functions/send-push/index.ts:1080-1083`:
`webpush.sendNotification({endpoint, keys}, body)` — **sin opciones**. La librería `web-push`, sin
ellas, usa su TTL por defecto (**4 semanas**) y sin cabecera `Urgency` (= `normal`). `[CÓDIGO]`

**Por qué importa.** Un «Tu pedido salió» puede llegar **días después** si el móvil estuvo apagado, y
en Android en modo ahorro (*Doze*) una urgencia `normal` puede diferirse. El código lo intuye
(«en Android con Doze, un aviso sin `requireInteraction` se clasifica como baja prioridad»,
`send-push/index.ts:830-833`), pero **confunde `requireInteraction` (cómo se muestra) con la
prioridad de entrega (cómo se transporta)**: son cosas distintas.

**Dirección (para nativo).** Cada evento debe declarar su **prioridad y su caducidad**:
APNs (`apns-priority`, `apns-expiration`, `apns-push-type`) y FCM (`android.priority`, `android.ttl`).
Un aviso de «tu motorizado está en la puerta» caduca en minutos; uno de «pedido entregado», en horas.

---

## NOT-04 · `send-push` acepta a cualquiera que tenga la clave pública

| | |
|---|---|
| **Severidad** | Medio (Alto en cuanto haya marketing) |
| **Bloquea el móvil** | Parcial (hay que cerrarlo antes de enviar marketing) |
| **Esfuerzo** | S |

Detalle y prueba en [`04-seguridad.md` → SEC-01](04-seguridad.md#sec-01--la-edge-function-send-push-acepta-la-anon-key-pública).
Resumen: `verify_jwt: true` solo exige *algún* JWT del proyecto; el que usa la base para llamarla
es **la *anon key* pública** (guardada en `app_settings.push_dispatch`), y la función **no
comprueba quién llama**. Cualquiera con la clave (está en el código de las PWA) y un UUID de pedido
válido puede hacer que se envíe, p. ej., «CANCELADO · no vayas al local» al motorizado asignado.

---

## NOT-05 · El texto y la lógica de aviso viven dentro de la Edge Function, con forma de Web Push

| | |
|---|---|
| **Severidad** | Medio |
| **Bloquea el móvil** | **Sí** (el modelo de payload hay que reemplazarlo) |
| **Esfuerzo** | M |

**Evidencia.** `supabase/functions/send-push/index.ts` (1 127 líneas): `[CÓDIGO]`
- **Los textos (es-PE) están escritos a mano** dentro del `if/else` de cada evento (decenas de
  mensajes distintos), incluidos emojis en los de motorizado y negocio.
- El *payload* es de Web Push: `{ title, body, tag, url, requireInteraction, renotify, vibrate }`.
  **`requireInteraction` y `vibrate` no existen en APNs ni en FCM**; `url` es una ruta web relativa
  (`/pedido/ABC12345`), no un *deep link*.
- **Duplica fórmulas** que viven en otro sitio y lo dice: `orderTotal` (= `get_tracking.total`,
  `:110-120`), `soles()` (`:179-196`), `HEADS_UP_MIN_PREP_MINUTES = 10` (`:336`).
- **`tag` que no cabe en APNs:** el identificador de colapso de APNs (`apns-collapse-id`) admite **64
  bytes como máximo**; `CashConfirmed-<uuid>-<uuid>` (`:989`) mide **87** y
  `TransferResolved-expired-from-<uuid>` (`:908`), 59. En un canal nativo el primero sería rechazado.

**Dirección.** **Modelo semántico de notificación**, independiente de la plataforma:
`{ event, audience, template_id, params, priority, ttl, collapse_key, deep_link, channel/category }`,
y un renderizador por plataforma (Web Push, APNs, FCM). Los textos, en un catálogo versionado
(servidor) o como `loc-key` con cadenas en la app (más barato, mejor accesibilidad y traducción).
`collapse_key` corto y derivado (hash de 16 caracteres, p. ej.).

---

## NOT-06 · No hay registro de preferencias, consentimiento ni segmentación

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | **Sí** (impide marketing y arriesga la revisión de tiendas) |
| **Esfuerzo** | M |

**Evidencia.** No existe tabla de preferencias ni de consentimiento de notificaciones; la única
tabla de aceptación es `terms_acceptance (user_id, version, accepted_at)`. No hay distinción entre
avisos **transaccionales** (tu pedido) y **de marketing**. `[DB-PROD]`

**Por qué importa.**
- **App Store, guía 4.5.4:** el push **no puede usarse para promociones o marketing directo salvo que el
  usuario haya optado explícitamente** con un texto de consentimiento en la UI de la app, y la app
  debe ofrecer **un modo de darse de baja**. Las notificaciones no pueden ser obligatorias para usar
  la app.
- **Google Play / Android 13+:** el permiso `POST_NOTIFICATIONS` es de ejecución y hay **canales de
  notificación**; separar «Estado del pedido» de «Promociones» en canales distintos permite al
  usuario silenciar el marketing sin perder los avisos que importan.
- **Ley 29733 (Perú)** de protección de datos personales: consentimiento previo, informado y
  expreso para tratar datos con fines comerciales. **Validar con asesoría legal** el texto y el
  registro.

**Dirección.** `notification_preferences (user_id, category, enabled, updated_at, source)`;
`consent_log` (versión del texto, fecha, canal, IP/dispositivo); categorías mínimas
`order_updates` (siempre, no desactivable salvo por el sistema), `promotions`, `news`; un endpoint
de baja **en un toque**; y `devices.notifications_enabled` sincronizado con el permiso real del SO.

---

## NOT-07 · No existe infraestructura de campañas

| | |
|---|---|
| **Severidad** | Alto (es una capacidad que hoy **no existe**, y es tu motivo principal) |
| **Bloquea el móvil** | No (es un nuevo requisito, no un bloqueador de publicación) |
| **Esfuerzo** | L |

**Evidencia.** No hay segmentación, programación, límite de frecuencia, horario silencioso, envío
por lotes, ni métricas de apertura o conversión. La Edge Function es serial (`PER-07`) y no
distingue destinatarios por segmento.

**Dirección.** Diseñada como capacidad nueva en `NAT-capacidades-nativas.md` (`NAT-PSH-*`):
segmentos (recencia, negocio favorito, sin pedidos en N días, zona), programación en hora
`America/Lima`, **tope de frecuencia** y **horas de silencio**, plantillas con variables, envío en
lotes con límite de concurrencia, *deep link* a negocio o promoción, y métricas
(enviado → entregado → abierto → pedido). Toda campaña respeta `NOT-06`.

---

## NOT-08 · No se puede saber si un aviso llegó, ni cuánto tardó

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | Parcial |
| **Esfuerzo** | M |

**En una frase.** El log dice «el servicio de push aceptó el mensaje», no «la persona lo vio». Y
la propia documentación del equipo ya se topó con el problema.

**Evidencia.**
- `push_delivery_log` registra `ok | error` por intento; `ok` = el endpoint devolvió 2xx.
  Aceptación **no es** entrega ni visualización. Tampoco hay latencia (evento → dispositivo) ni
  reintento. `[CÓDIGO]` `send-push/index.ts:1085-1114`
- Si **no hay destinatarios** (caso normal: el 86 % de los clientes no tiene suscripción), no queda
  ninguna fila: el evento es indistinguible de «no había a quién avisar». `[DB-PROD]`
- El equipo ya documentó tres incidentes de esta clase: VAPID mal pegada («**cero notificaciones
  enviadas y cero señal de la causa durante dos meses**», `send-push/index.ts:14-28`), consulta de
  motorizados que fallaba en silencio («**tres días de diagnóstico**», `:160-170`, `:552-559`) y
  avisos sin destinatario por falta de suscripción en negocios y clientes (`DECISIONS.md:730-732`).
  A eso se suma que el **sonido** de los avisos depende de un `AudioContext` que el navegador
  suspende (`apps/negocios/lib/use-audio-alert.ts`, `components/sound-check.tsx`): el aviso llega y
  puede no sonar. `[CÓDIGO]`

**Dirección.** (1) Métricas del pipeline: latencia evento→envío, tasa de error por
plataforma, eventos sin destinatario. (2) **Acuse desde el cliente**: la app notifica
`received`/`opened` (identificador de mensaje) para medir entrega real. (3) Alarma cuando la tasa
de error o el retraso pasen un umbral. (4) Aprovechar los *feedbacks* de APNs/FCM (`410
Unregistered`, `BadDeviceToken`) para purgar tokens.

---

## Qué cambia al pasar a APNs y FCM (para no diseñar a ciegas)

| Aspecto | Web Push (hoy) | APNs (iOS) | FCM (Android) |
|---|---|---|---|
| Identificador de destino | `endpoint` + `p256dh` + `auth` | *device token* (distinto en sandbox y producción) | *registration token* (rota; refrescar) |
| Autenticación del servidor | VAPID | Clave `.p8` (JWT firmado, válido ≤ 1 h) o certificado | HTTP v1 con OAuth2 de cuenta de servicio |
| Prioridad / caducidad | Cabeceras `Urgency`, `TTL` (hoy sin usar) | `apns-priority`, `apns-expiration`, `apns-push-type` | `android.priority`, `android.ttl` |
| Colapso | `tag` | `apns-collapse-id` (**≤ 64 bytes**) | `collapse_key` / `android.notification.tag` |
| Permiso | Un gesto, una vez por navegador | Aviso del sistema una vez; **autorización provisional** (sin diálogo, entrega silenciosa) | Android 13+: `POST_NOTIFICATIONS` en ejecución; **canales** obligatorios |
| Tamaño máximo | ~4 KB | 4 KB | 4 KB |
| Extras propios | — | **Live Activities** (`push-type: liveactivity`), nivel de interrupción, *Notification Service Extension* | Canales, acciones, `notification` vs `data` |
| Retroalimentación | 404/410 | `410 Unregistered`, `BadDeviceToken` | `UNREGISTERED`, `INVALID_ARGUMENT` |

(Los detalles finos de APNs y FCM cambian con el tiempo; al implementar hay que contrastarlos con la
documentación vigente de Apple y Google.)

## Resumen de este documento

| ID | Hallazgo | Sev. | Bloquea | Esf. |
|---|---|---|---|---|
| NOT-01 | Outbox de push a fondo perdido: 0 de 5 620 eventos publicados, sin reintento | Alto | Sí | M |
| NOT-02 | Todo el modelo es Web Push; 0 clientes iOS registrados | Alto | Sí | M |
| NOT-03 | Sin TTL ni urgencia en los envíos | Medio | No | S |
| NOT-04 | `send-push` acepta la *anon key* pública | Medio | Parcial | S |
| NOT-05 | Textos y lógica de aviso dentro de la Edge Function, con forma Web Push, tags > 64 B | Medio | Sí | M |
| NOT-06 | Sin preferencias, consentimiento ni segmentación | Alto | Sí | M |
| NOT-07 | Sin infraestructura de campañas de marketing | Alto | No | L |
| NOT-08 | Sin métricas de entrega ni acuse del cliente | Alto | Parcial | M |
