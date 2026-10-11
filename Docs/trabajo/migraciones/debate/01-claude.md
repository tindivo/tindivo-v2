# Apertura de Claude

> Escrita antes de leer a Codex. Hechos en [`../00-contexto.md`](../00-contexto.md), más dos comprobaciones nuevas:
> **(a)** negocios, motorizados y admin tienen **9 rutas dinámicas** (`/menu/item/[id]`, `/pedido/[id]`, `/orders/[id]`…);
> **(b)** `playwright.config.ts` apunta solo a `localhost` y avisa de que «NUNCA apunta a producción».

## T1 · La mudanza de hosting es un «levantar y mover»: cero cambios funcionales

**Una variable cada vez.** Si en la misma semana se cambian el hosting y el código, cuando algo falle no se sabrá cuál
de las dos cosas fue. La mudanza se hace con **el mismo commit** que corre hoy en Vercel, las mismas variables y los
mismos dominios. Ni el paso 0 ni los estándares se mezclan con ella; van antes o después, en su propio despliegue.

## T2 · Qué necesita cada app fuera de Vercel

| App | Necesita | Lo que hay que cuidar |
|---|---|---|
| **admin, negocios, motorizados** | Node con `next start` (o `output: 'standalone'`). **No recomiendo `output: 'export'` todavía**: las 9 rutas dinámicas exigen `generateStaticParams` o pasar los ids por *query*, y eso es cambio funcional (rompe T1) | Variables `NEXT_PUBLIC_*` **en el build** (se incrustan al construir), `sw.js` servido en `/sw.js` con el mismo dominio |
| **customer** | Node con `next start` | Sesión en servidor por *cookies* (`auth/callback`, `app/page.tsx`): las cookies van por dominio, mismo dominio = sin cambios. Caché `revalidate` en disco de un solo nodo. `opengraph-image` y optimización de imágenes (`sharp`). Quitar o dejar inerte `@vercel/analytics` |
| **api** | Node con `next start` | PDF: cambiar `@sparticuz/chromium` por Chromium del sistema (la rama de producción del PDF no se puede probar en Windows, ya documentado). Inngest: mismo dominio y mismas claves, y **resincronizar la app en Inngest** tras el corte. Región del VPS cerca de Oregón (`us-west-2`) o la latencia API↔base empeora |

**Fuera del repo y que hay que revisar antes del corte:** la Site URL y las Redirect URLs de Supabase Auth, y el
cliente OAuth de Google. Con los mismos dominios no deberían cambiar, pero hay que **leerlas** antes.

## T3 · Cómo se corta y cómo se vuelve atrás

1. Montar el VPS con Docker (una imagen por app) y Caddy (HTTPS por subdominio), con las variables copiadas de Vercel.
2. Probar el VPS **sin DNS público**, con un `hosts` local o subdominios de prueba que **no** estén en CORS de
   producción, contra la base de producción y **solo con lecturas**.
3. Bajar el TTL de DNS 48 h antes.
4. Cortar **una app cada vez**, fuera de 18:00-23:00, en este orden: admin (lo usa Jesús), motorizados, negocios,
   customer y la API al final (la usan todas).
5. **Vuelta atrás = DNS de vuelta a Vercel.** Vercel se mantiene vivo y sin tocar al menos dos semanas.
6. Tras cada corte: humo automático (T6) + un pedido real de prueba de punta a punta + un push de prueba a un
   dispositivo de cada app.

## T4 · Notificaciones: mudar el hosting no las toca; mudar la base, sí

- **Hoy el push no depende del hosting**: lo envía la Edge Function de Supabase, llamada desde la base por `pg_net`.
  Del hosting solo salen `sw.js` y la clave pública VAPID.
- **Las ~39 suscripciones sobreviven a la mudanza si se conservan el dominio y la clave VAPID.** Cambiar cualquiera de
  las dos las invalida en silencio; ese es el riesgo número uno de la mudanza para los avisos.
- **Para hacerlas «más fáciles» y listas para nativo:** un módulo `notifications` en la API (Node) que lea el outbox y
  envíe por **un solo proveedor para todo: FCM** (web, Android e iOS, que entrega vía APNs con la clave de Apple
  cargada en Firebase). Un solo formato de *token*, una tabla `devices (user, platform, token, app, consent)`, envío con
  prioridad y caducidad, y registro de resultados. Mientras tanto, **Web Push VAPID convive** para las suscripciones
  actuales, que migran a FCM cuando el usuario vuelva a abrir la web.
- Ese módulo **saca el push de la base** (`pg_net` → Edge Function), que es justo lo que impide mudar la base después.

## T5 · Antes de mudar la base: desacoplar lo que la ata

En este orden, y **antes** de tocar la base:

1. el push sale de la base (T4);
2. los frontends dejan de leer y escribir tablas (paso 6 del plan acordado, empezando por Negocios, que tiene 99 llamadas);
3. Storage detrás de una interfaz en la API (URLs firmadas emitidas por la API);
4. los 12 `pg_cron` inventariados con su dueño;
5. un plan para `auth.uid()` (99 políticas): si se mantiene Supabase Auth, no cambia nada.

Con eso, mudar la base es mover Postgres y apuntar la API a otra cadena de conexión, no reescribir clientes.

## T6 · La red de seguridad contra «que luego no funcione como espero»

1. **Suite de humo aparte** (`e2e/smoke/`), parametrizada por `BASE_URL`, **solo lecturas**: abre cada app, la home,
   un negocio, el catálogo de Store, el seguimiento de un pedido de prueba, `/api/v1/health` y 5 GET públicos.
   **Nunca** crea pedidos en prod. Corre tras cada corte y cada noche.
2. **Contrato:** el OpenAPI generado (paso 1 acordado) se compara en CI contra `main`; un cambio incompatible falla.
   Los clientes de Swift y Kotlin se generan del mismo fichero, así que **si la web funciona contra el contrato, el
   nativo habla el mismo idioma**.
3. **La web es el primer cliente del contrato nativo** (paso 6): cada noche de operación real lo ejercita antes de
   que exista la app.
4. **Staging:** una segunda base (rama de Supabase o proyecto aparte) con el mundo e2e, donde corren las suites de
   escritura y se ensaya cada migración de base antes de prod.
5. **Monitoreo tras cada cambio:** errores por ruta, latencia, antigüedad del outbox y fallos de push, con una
   alerta.

## T7 · Orden propuesto

0. **Paso 0** (defectos de prod), desplegado en Vercel como hoy.
1. **Red de seguridad mínima**: humo por URL + monitoreo básico.
2. **Mudanza de hosting** (T1-T3), app por app.
3. **Desacoplamiento** según el plan acordado (contrato, rutas `/me`, `quote`), con **notificaciones** como primer
   módulo (T4).
4. **Mudanza de la base**, solo cuando T5 esté hecho.
5. **Apps nativas** sobre el contrato ya ejercitado por la web.

## Riesgos de mi propuesta

- El VPS **te convierte en operador**: certificados, actualizaciones, discos, reinicios y copias.
- Juntar todo en **FCM** para web te ata a Google en los avisos; a cambio, simplifica tres canales en uno.
- La suite de humo de solo lectura **no prueba las escrituras**, y eso solo lo cubre staging.
