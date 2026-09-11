# Reseñas — Fase A construida, y qué decide la Fase B

> **Estado al 2026-09-07.** La Fase A está **en producción**. Las reseñas se
> capturan, el negocio ve la nota y las etiquetas, el admin lee los comentarios,
> y **nada es público**. Este documento existe para que la decisión de publicar
> se tome con números y no con intuición.
>
> Migraciones: `0215`, `0216`, `0217`, `0218`. Commits `45a1f80`, `cb56f78`,
> `e57e4dc`, `1ba14b2`, `8fcaa5b`.

---

## 1. Por qué esto se hizo así (el dato que mandó)

Medido contra `tindivo-prod` el 2026-09-06, antes de escribir una línea:

```
423 pedidos entregados
 41 con cuenta de cliente  (9.7 %)
382 manuales, tecleados por la cajera — sin cuenta, sin app
 18 clientes distintos con cuenta
  0 tracking_link_sent_at   ← el enlace de seguimiento nunca se ha enviado
```

Por negocio:

| Negocio | Entregados | Con cuenta |
|---|---:|---:|
| Pizza Priamo | 268 | 24 |
| La Florencia | 78 | 13 |
| **Pollería Nadia** | **67** | **0** |
| Al Punto | 10 | 4 |

**Tres consecuencias que siguen vigentes:**

1. **La reseña solo alcanza al canal web**, que es el 10 % de las entregas. Los
   pedidos manuales no tienen a quién preguntarle: los avisos al cliente van
   solo por la app, y el enlace de seguimiento no se ha enviado nunca.
2. **Pollería Nadia tendría cero reseñas con 67 entregas.** Un «Sin reseñas» en
   la card del catálogo es peor señal que no mostrar nada, para un negocio que
   está funcionando bien.
3. **Publicar el juicio del 10 % como si fuera el del pueblo** es el riesgo de
   fondo, y no se arregla con más volumen: se arregla sabiendo si ese 10 % se
   parece al resto. Hoy no se sabe.

## 2. Por qué no se pregunta al entregar

Porque no funciona: el cliente cierra la app y se va a comer. La pregunta se
hace **la siguiente vez que pide**, mientras espera el pedido nuevo.

Medido en prod:

```
brecha entre pedidos del mismo cliente:  mediana 2 días · p90 7.4 · máx 14
```

De ahí salen los **21 días** de ventana (`app_settings.reviews.windowDays`):
cubren el 100 % de las brechas observadas con margen. Y de ahí sale también que
el sesgo de recuerdo —calificar de memoria, que solo guarda los desastres— **no
aplica aquí**: con mediana de 2 días el cliente se acuerda perfectamente. Con
una brecha de tres semanas esta decisión habría sido otra.

---

## 3. Qué está construido

| Quién | Ve | Dónde |
|---|---|---|
| Cliente | Deja nota (1-5), etiquetas y comentario opcional | Tarjeta en la espera del pedido nuevo + botón en `/pedidos` |
| Negocio | Nota y etiquetas, **nunca el texto** | `/resenas` en su panel |
| Admin | Todo, filtrado por restaurante | `/resenas` en Gestión |
| Público | **Nada** | — |

**Una sola nota, no dos.** Decisión del usuario (2026-09-07). La consecuencia es
que `tags` y `driver_id` cargan solos el diagnóstico: con una estrella única, un
2 puede ser cocina lenta o moto que tardó, y la etiqueta es lo único que los
distingue.

**Que el negocio no lea el comentario lo hace cumplir la base**, no la interfaz:
el `GRANT` por columna de la `0217` saca `comment` del rol `authenticated`. El
admin lo lee por la API con service-role. Si alguien «simplifica» el panel del
admin leyendo por RLS, el texto desaparece — hay tests que lo amarran.

### Lo que NO se construyó, a propósito

Ni columnas derivadas de promedio en `businesses`, ni trigger de recálculo, ni
estados de moderación, ni réplica del negocio, ni `updated_at`, ni índice GIN en
`tags`. Nada de eso tiene lector en Fase A. **La fuente de verdad es la tabla**:
cuando la Fase B necesite el promedio en la ruta caliente del catálogo, se
añaden columnas con su recálculo y su backfill, y no se pierde nada.

---

## 4. Las tres consultas que deciden

Se ejecutan contra **`tindivo-prod`** (`zpnipajgwfthxhdtzhly`). Verificadas el
2026-09-07: corren tal cual.

### 4.1 ¿Funciona el mecanismo? (el embudo)

Sin esto solo sabes cuántas reseñas tienes, no **cuántas veces preguntaste para
conseguirlas**. Es el número que decide si la Fase B tiene sentido siquiera.

```sql
with entregas as (
  select o.id, o.customer_user_id, o.delivered_at
    from public.orders o
   where o.status = 'delivered' and o.customer_user_id is not null
),
ventana as (
  select coalesce((value->>'windowDays')::int, 21) as dias
    from public.app_settings where key = 'reviews'
),
con_siguiente as (
  select e.id,
         exists (
           select 1 from public.orders o2
            where o2.customer_user_id = e.customer_user_id
              and o2.created_at > e.delivered_at
              and o2.created_at <= e.delivered_at + ((select dias from ventana) || ' days')::interval
         ) as volvio_a_pedir
    from entregas e
)
select
  (select count(*) from entregas)                                        as entregas_con_cuenta,
  (select count(*) from con_siguiente where volvio_a_pedir)              as se_le_pudo_preguntar,
  (select count(*) from public.order_reviews)                            as califico,
  (select count(*) from public.order_review_dismissals)                  as dijo_ahora_no,
  (select count(*) from public.order_reviews where comment is not null)  as escribio_texto;
```

**Línea base al 2026-09-07** (antes de que llegue ninguna reseña real):

```
entregas_con_cuenta   44
se_le_pudo_preguntar  26      ← el 59 % volvió a pedir dentro de la ventana
califico               0
dijo_ahora_no          0
escribio_texto         0
```

**Cómo leerlo:**

- `se_le_pudo_preguntar / entregas_con_cuenta` es el **alcance del mecanismo**:
  59 % hoy. Ojo con no confundirlo con el 83 % que se midió antes — aquel era
  «pedidos que pertenecen a alguien que volvió alguna vez», este es «tuvo un
  pedido siguiente **dentro de los 21 días**», que es lo que de verdad dispara
  la tarjeta. El segundo es el honesto.
- `califico + dijo_ahora_no` frente a `se_le_pudo_preguntar` es la **tasa de
  respuesta**. Lo que sobra es «ni miró».
- `escribio_texto / califico` es lo que dice si la bandeja del admin vale la
  pena mantener.

**Si la tasa de respuesta es < 15 %, la Fase B no se discute: no hay muestra.**
Lo que hay que arreglar antes es el mecanismo, no la vitrina.

### 4.2 ¿Está listo este negocio para publicarse?

```sql
select b.name,
       count(r.id)                                   as resenas,
       round(avg(r.rating)::numeric, 2)              as promedio,
       min(r.created_at)::date                       as primera,
       (count(r.id) >= 20
        and coalesce(now() - min(r.created_at), interval '0') >= interval '30 days')
                                                     as listo_para_publicar,
       count(*) filter (where o.status = 'delivered') as entregas_totales,
       round(100.0 * count(r.id)
             / nullif(count(*) filter (where o.status='delivered'), 0), 1) as pct_entregas_con_resena
  from public.businesses b
  left join public.orders o on o.business_id = b.id
  left join public.order_reviews r on r.order_id = o.id
 where b.is_active
 group by b.name
 order by resenas desc, entregas_totales desc;
```

`pct_entregas_con_resena` es la columna incómoda y la que hay que mirar: dice
qué fracción de las entregas reales está representada. Si es 3 %, el promedio no
es la opinión del pueblo — es la de tres personas.

### 4.3 ¿Se está degradando alguien? (operativa, no de publicación)

Esta se usa **ya**, sin esperar a nada. Es el valor real de la Fase A.

```sql
with por_semana as (
  select r.business_id,
         date_trunc('week', r.created_at)::date as semana,
         r.rating,
         r.tags
    from public.order_reviews r
),
resumen as (
  select business_id, semana,
         count(*)                            as resenas,
         round(avg(rating)::numeric, 2)      as promedio,
         count(*) filter (where rating <= 2) as bajas
    from por_semana
   group by business_id, semana
),
etiquetas as (
  select business_id, semana, t, count(*) as veces,
         row_number() over (partition by business_id, semana order by count(*) desc, t) as pos
    from por_semana, unnest(tags) as t
   group by business_id, semana, t
)
select b.name, s.semana, s.resenas, s.promedio, s.bajas,
       (select string_agg(e.t, ', ' order by e.veces desc)
          from etiquetas e
         where e.business_id = s.business_id and e.semana = s.semana and e.pos <= 3) as etiquetas_top
  from resumen s
  join public.businesses b on b.id = s.business_id
 order by s.semana desc, s.bajas desc;
```

> Las tres CTE no son adorno: la version directa —una subconsulta correlacionada
> contra `r.created_at` dentro de un `GROUP BY` por semana— **no compila**
> (`subquery uses ungrouped column`). Si alguien la "simplifica", volvera a
> romperse igual.

---

## 5. Las tres fases, y qué abre cada puerta

### Fase A — capturar (HECHA)

Nada público. El dato existe, la operación mejora, nadie paga reputación.

### Fase B — promedio público, con umbral

**Qué se construye:** `reviews_count` y `rating_avg numeric(3,2)` derivadas en
`businesses`, mantenidas por trigger de **recálculo** (nunca incremental — el
patrón de la `0124` con `balance_due` existe justamente porque el mantenimiento
a mano derivó). Se añaden a `PUBLIC_COLUMNS` en
`apps/api/app/api/v1/public/businesses/route.ts`, que ya tiene su caché de 15 s.

**Las cuatro condiciones. Se cumplen TODAS o no se abre:**

1. **Tasa de respuesta ≥ 25 %** (§4.1). Por debajo de eso, publicar es publicar
   ruido.
2. **≥ 20 reseñas y ≥ 30 días de historia por negocio** (§4.2). El negocio que
   no llegue **no muestra nada** — ni «Sin reseñas», que en una card lee como
   advertencia. El `rating_avg` en `NULL` ya da ese comportamiento gratis, sin
   lógica en el frontend.
3. **`pct_entregas_con_resena` ≥ 10 % en el negocio que se publique.** Esta es
   la que protege del sesgo del canal: si solo opina el 3 % que usa la app, el
   número no representa al pueblo.
4. **Mauri lo decide a la vista de los tres números anteriores.** No es
   automático y no debe serlo: es la reputación de un vecino.

**Lo que NO cambia en Fase B:** el comentario sigue sin ser público, y sigue sin
llegar al negocio. Publicar un agregado y publicar texto son decisiones
distintas y separadas a propósito.

**Cómo se revierte:** quitar los dos nombres de `PUBLIC_COLUMNS`. Eso es todo —
por eso la Fase B es barata de intentar y barata de deshacer.

### Fase C — comentarios públicos

**Solo si hay ≥ 8-10 negocios por pueblo.** Por debajo de eso no es información,
es un altavoz: el cliente ya conoce las cuatro puertas del pueblo, así que el
comentario público no le ayuda a elegir — le sirve al vecino para enterarse de
lo que dijeron de él.

Requiere además, y ninguna es opcional:

- **Moderación** (los estados que la `0215` deliberadamente no construyó).
- **Derecho de réplica** del negocio.
- **Una política escrita** de qué se oculta y por qué, antes del primer caso.

---

## 6. Lo que no se debe hacer, en ninguna fase

- **La reseña no toca dinero ni asignación. Nunca automáticamente.** Ni
  comisión, ni prioridad de despacho, ni visibilidad en el catálogo. En cuanto
  una nota mueve plata o pedidos, se convierte en algo que vale la pena
  manipular, y Tindivo pasa a arbitrar peleas que hoy no tiene. Es entrada para
  que un humano decida, como el antifraude.
- **La nota del motorizado no se publica jamás.** Cuatro motorizados en un
  pueblo: un promedio público sobre una persona identificable es otra cosa muy
  distinta de uno sobre un negocio. Se usa como señal interna del admin, y si
  hay que dársela al motorizado, se le da en palabras.
- **No se promete anonimato.** El pedido lleva el teléfono del cliente y el
  negocio lo tiene delante. Lo que sí se promete —y se cumple con un `GRANT`—
  es que el **texto** no le llega.
- **No se pide reseña por push.** El canal es operativo y es capital que se
  gasta rápido; usarlo para «califica tu pedido» enseña a ignorar el resto.

---

## 7. Dónde vive cada cosa

| Pieza | Ruta |
|---|---|
| Tablas, RPC, RLS | `supabase/migrations/0215_the_customer_gets_to_say_how_it_went.sql` |
| Catálogo de etiquetas en el payload | `supabase/migrations/0216_the_card_brings_its_own_words.sql` |
| `GRANT` por columna (el texto) | `supabase/migrations/0217_the_restaurant_reads_the_score_not_the_letter.sql` |
| `app_settings.reviews` legible | `supabase/migrations/0218_the_tag_names_are_not_a_secret.sql` |
| Regla de elegibilidad (pura, con tests) | `packages/core/src/review/eligibility.ts` |
| Captura en el cliente | `apps/customer/features/reviews/` |
| Panel del negocio | `apps/negocios/features/resenas/` |
| Bandeja del admin | `apps/admin/app/resenas/` + `apps/api/app/api/v1/admin/reviews/route.ts` |
| Tests | `apps/api/lib/__tests__/order-reviews.integration.test.ts` (23) · `admin-reviews.integration.test.ts` (6) · `packages/core/src/review/__tests__/` (15) |

**Parámetros operativos** (`app_settings.reviews`): `windowDays` (21),
`commentMaxLength` (400) y el catálogo `tags`. Se editan en vivo sin desplegar.
Una etiqueta retirada del catálogo sigue viva en las reseñas antiguas y se
muestra por su id: el conteo tiene que cuadrar con el total aunque el catálogo
cambie.
