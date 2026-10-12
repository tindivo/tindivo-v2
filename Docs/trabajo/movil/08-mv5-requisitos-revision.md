# MV5 · Lo que exige la revisión de las tiendas: estado y pasos de Jesús

> 2026-10-11 · Trabajo, no canon. Sigue a [`07-publicacion-tiendas.md`](07-publicacion-tiendas.md) (§7, §8, D-44…D-47,
> todas **abiertas**). Rama `feat/mv5-requisitos-tiendas`. **Nada de esto está aplicado a `tindivo-prod`.**

## A. Borrado de cuenta (hecho en el repo, falta la revisión)

| Pieza | Dónde |
|---|---|
| Migración `0259` (`account_deletion_blockers`, `delete_customer_account`; solo `service_role`) | `supabase/migrations/0259_el_cliente_puede_borrar_su_cuenta.sql` |
| Ruta REST `DELETE /customer/account` (204; 409 con el motivo en español), en el OpenAPI | `apps/api/app/api/v1/customer/account/route.ts` |
| Página pública `/borrar-cuenta` (URL para la ficha de Google Play) y entrada «Borrar mi cuenta» en `/cuenta` | `apps/customer/app/borrar-cuenta/`, `features/account/components/delete-account-panel.tsx` |

**Qué hace** (una transacción): anonimiza los pedidos y las carreras de Entregas del cliente (importe, estado y fechas
intactos), borra perfil, direcciones, avisos, términos, canjes de promo, OTP y roles, deja la fila de `public.users`
como lápida sin correo ni nombre (`is_active = false`) y borra `auth.users` en la misma transacción. No toca
`business_charges` ni ningún saldo.

**Qué conserva** (recomendación de D-44, sin aprobar): `customer_strikes`, `customer_incidents`, `reports` y
`address_directory` (por teléfono), y la nota de las reseñas sin autor. **Comprobantes de `payment-proofs`: no se
borran** (el plazo de 90 días de D-44 no está decidido ni implementado).

### Preguntas abiertas para Jesús (no se asumieron)

1. **Pedido en curso o dinero pendiente.** El expediente no lo decide. Hoy la RPC **bloquea** (409, no cambia nada) si hay
   un pedido o carrera en curso, o una apelación / devolución abierta (`reports` `rejected_proof_disputed` pendiente o
   `prepay_refund_review` abierto), o un rol distinto de `customer`. Alternativas: (a) bloquear, como está; (b) cancelar
   los pedidos en curso y borrar; (c) diferir el borrado a «pendiente» y ejecutarlo al terminar. **Recomiendo (a):** es no
   destructivo y reversible; la cuenta se puede borrar al terminar.
2. **Plazo de los comprobantes** (D-44): recomendación 90 días; falta el trabajo programado que los borre del bucket.
3. **Antifraude y directorio** por teléfono (D-44): la RPC los conserva. Si se prefiere borrarlos, quien borra su cuenta
   para limpiar sus strikes lo logra; por eso recomiendo conservar y decirlo en la política.
4. **Canjes de promo** (`promo_redemptions`): se borran (el expediente lo manda), pero eso devuelve el «primer envío
   gratis» a quien se registre de nuevo. Alternativa: conservar el canje por teléfono verificado.
5. **Coordenadas en Entregas:** `courier_orders` las exige y limita al pueblo, así que el punto exacto se sustituye por
   el centro de San Jacinto (-9.15, -78.28) en vez de `NULL`.
6. **Cuenta de revisión que se borra a sí misma** (el revisor probará el flujo y se llevará la cuenta demo). Opciones: (a)
   dejar que se borre y volver a sembrarla; (b) que la cuenta demo conteste 204 sin borrar. **Recomiendo (b)** cuando
   exista la marca de demo (ver C).
7. **Apple exige revocar el token de Sign in with Apple al borrar la cuenta** (5.1.1(v)). Requiere la clave `.p8` y un
   código de autorización que mande la app en el momento del borrado: va con la app iOS, no con esta ruta.
8. Los textos de `/borrar-cuenta` y de la política los revisa Jesús (nivel C: responsable, correo de privacidad). La
   página solo ofrece WhatsApp como alternativa; Google pide un medio de contacto: falta el correo.

### Segunda ronda (revisión de Codex)

- **Inventario medido** (ver la tercera ronda: ahora se descubre por llaves foráneas). El test `account-deletion-coverage` obliga a que toda columna
  con pinta personal esté en la lista de **anonimizadas** o en la de **conservadas a propósito**; una columna nueva lo
  rompe. Faltaban `arrived_at_customer_lat/lng/accuracy_m` (0114), ahora cubiertas.
- **Carrera cerrada:** `users.deleted_at` marca la lápida y `reject_deleted_account` (BEFORE INSERT, `FOR SHARE` sobre
  `users`) rechaza pedidos, carreras de Entregas, perfil, direcciones, avisos, términos, reseñas, descartes y canjes
  sobre una cuenta borrada. Probado de forma determinista (test) y con dos sesiones `psql`: el insert esperó 5 s al
  `FOR UPDATE` de la RPC y fue rechazado al confirmarse (`cannot write because the account was deleted`).
- **Reseñas:** `customer_user_id` pasa a NULL dentro de la RPC (la FK `SET NULL` no dispara al borrar `auth.users`).
- **Notas y logs:** se vacían `business_notes`, `driver_notes`, `cancel_note`, `rejection_reason_text`, la nota de cada
  renglón y `order_status_history.notes`; `order_event_log.data`, `courier_order_events.data` y `domain_events` pasan por
  `redact_personal_json` (sustituye por `[eliminado]` el valor de toda clave con teléfono, nombre, dirección, referencia,
  nota, coordenadas…, y respeta booleanos e importes).

**Preguntas nuevas para Jesús (no se asumieron; la RPC hace hoy lo recomendado):**

9. **Texto libre del personal** (`business_notes`, `driver_notes`, `cancel_note`, `rejection_reason_text`): se vacía
   porque puede nombrar al cliente. Si la caja o los reclamos necesitan esas notas, alternativa: conservarlas. El motivo
   estructurado (`cancel_reason`, `rejection_reason_code`) se queda siempre. **Recomiendo vaciarlas.**
10. **Comentario de la reseña** (`order_reviews.comment`): se conserva sin autor, según el expediente §8, pero es texto libre
    y puede contener un nombre. Alternativa: conservar solo la nota numérica. **Recomiendo conservar el comentario**, y
    decirlo en la política.
11. **`comprobante_prepago_url`** y los antifraude (`customer_strikes`, `customer_incidents`, `reports`, `address_directory`)
    siguen conservados (D-44).
12. **Repetir el borrado por HTTP:** responde 401, no 204, porque la autenticación valida el JWT contra `auth.users` y
    esa fila ya no existe. Se documentó así en el OpenAPI (alternativa **a**). La alternativa **b** (aceptar un JWT válido
    sin fila viva) debilita `requireUser` para toda la API; **recomiendo mantener (a)**. Para la RPC, repetir sigue
    devolviendo `already_deleted`.

### Tercera ronda (PR `fix/mv5-borrado-completo`)

- **Registros con lista de PERMITIDAS:** `redact_personal_json` ya no busca claves "personales" (un motivo escrito a mano cabe
  en `reasonText`, `reason`, `motivo`…); solo conserva las claves declaradas seguras (ids, estados, enums, importes, fechas,
  contadores) y los booleanos. Toda clave nueva queda redactada hasta que alguien la añada a la lista, en la migración.
- **Inventario por llaves foráneas** (`personal_data_inventory`): descubre solas las tablas que cuelgan, directa o
  indirectamente, de `orders` y `courier_orders`, las que apuntan a `users` y `customer_otp_attempts`. El test exige una
  decisión por tabla (borrada / conservada / ajena / revisada por columna). Faltaban `order_transfer_requests.reason` y
  `order_assignment_rejections.reason` (texto libre del motorizado): ahora se vacían.
- **OTP en vuelo:** `customer_otp_attempts` tiene el mismo guard; `/phone/send-code` revisa el resultado del `INSERT` y
  responde 401 si la cuenta ya fue borrada mientras Twilio respondía.
- **Candados:** orden común en todo el borrado y la libreta: candado de aviso de la libreta → `users` → direcciones
  (`customer_address_save` ya tomaba el de aviso primero; la RPC de borrado ahora también). Probado con dos sesiones
  `psql` en los dos órdenes, sin `deadlock`.
- **Origen del directorio en Entregas:** con `directory_business_id`, el origen se sustituye por los datos canónicos del
  directorio (nombre, teléfono, punto y referencia), no por lo que mandó el cliente.
- **UPDATE:** el guard cubre también UPDATE: cambiar el vínculo hacia una cuenta borrada, o tocar datos personales de una fila
  ya anonimizada, se rechaza. El negocio puede seguir cerrando la caja de ese pedido. La RPC se salta el guard solo
  para su propio usuario y solo durante su transacción (`tindivo.deleting_account`).
- **Conservado a propósito, pregunta 13 para Jesús:** `fraud_coverage_claims` (`reason`, `resolution_note`: texto libre del
  negocio ligado al dinero) y `business_charges.description` (ledger). **Recomiendo conservarlas** hasta que el ledger tenga
  su plazo; si algún día se vacían, requiere revisión de dinero.

**Antes de aplicar a producción:** revisión de Jesús y de Codex (datos personales); `db push` fuera de 18:00-23:00;
`pnpm db:types` después; una llamada real por HTTP (ya cubierta en local por los tests).

## B. Sign in with Apple (casi todo es de Jesús)

**Qué hay en el repo: nada que hacer.** `supabase/config.toml` solo tiene `project_id` y `[db]`: **no hay secciones
`[auth.external.*]`** (Google tampoco; se configura en el panel del proyecto). Ninguna ruta de la API participa en el
inicio de sesión: la web usa `signInWithOAuth` y las apps nativas hablan con Supabase Auth directamente. Ni el contrato
ni la API necesitan cambios, y `handle_new_user` sirve tal cual (crea `users` y el rol `customer` con el correo que
entregue Apple, que puede ser un correo de reenvío privado).

**Pasos exactos (Jesús, nivel C).** Datos verificados en la documentación de Supabase el 2026-10-11.

1. Apple Developer (US$ 99/año): crear el **App ID** (bundle id definitivo, p. ej. el del cliente) con la capacidad
   **Sign in with Apple** activada. El bundle id no se puede cambiar después.
2. App nativa iOS (solo con el App ID basta): en el panel de Supabase, *Authentication → Providers → Apple*, activar el
   proveedor y poner el **bundle id en «Client IDs»** (lista separada por comas: una por app, y `host.exp.Exponent` solo si se prueba con Expo Go).
   *No hace falta secret key para el flujo nativo.*
3. Web (opcional; Apple 4.8 solo obliga en iOS): crear un **Services ID**, asociarlo al App ID con el dominio de
   Supabase y la URL de retorno `https://zpnipajgwfthxhdtzhly.supabase.co/auth/v1/callback`; crear una **Key**
   (`.p8`) con Sign in with Apple; generar el **secret JWT** con el Team ID, Key ID y la `.p8`; ponerlo en «Secret Key
   (for OAuth)». **Ese secreto caduca cada 6 meses**: recordatorio de calendario y guardar la `.p8`.
4. Las apps nativas inician sesión con `signInWithIdToken({ provider: 'apple', token, nonce })`. Apple **solo entrega el
   nombre completo la primera vez**: la app debe guardarlo con `updateUser({ data: { full_name } })` en ese momento,
   o el perfil queda sin nombre (`handle_new_user` cae al correo).
5. Para Google Play no hace falta nada de esto; para App Store, sin esto la revisión rechaza por 4.8 (R2).
6. Al activarlo, el mensaje de `persistence.ts` «inicio con Google no está disponible» no cambia; el botón de Apple en
   la web no se añadió (no es requisito).
7. Revocación del token al borrar la cuenta: ver pregunta 7 de A.

## C. Cuenta y negocio de demostración (sembrado local hecho; el aislamiento NO)

`pnpm db:seed:review` / `pnpm db:seed:review:clean` (`apps/api/scripts/seed-review-account.ts`; solo `127.0.0.1`,
ids fijos, idempotente, no corre en `db:cycle`).

| | |
|---|---|
| Cliente de revisión | `revisor@review.tindivo.local` / `Revisor-Tindivo-2026` (**solo local**; en producción la contraseña la elige Jesús), teléfono ya verificado, dirección dentro de la cobertura |
| Negocio | «Tindivo · Demo para revisión» (`demo-revision`), abierto 7 días × 24 h, apertura de hoy declarada, QR de Yape, 3 platos |
| Probado | semilla dos veces sin duplicar; el revisor entra con contraseña y crea un pedido prepago de S/ 47 al negocio demo; la limpieza deja 0 filas |

**Lo que falta y no se hizo, porque toca dinero o el flujo de pedidos y necesita a Jesús y a Codex:**

1. **Marca de demo** (`businesses.is_demo` o rol `reviewer`) y que **solo la vean** las cuentas de revisión. Hoy es un
   negocio más: cualquiera lo ve.
2. **Fuera de la contabilidad**: `generate_delivery_charges`, liquidaciones, caja, estadísticas y comisiones deben
   excluirlo de forma explícita y con prueba.
3. **Sin avisos reales**: sus pedidos no deben notificar a la cajera ni a motorizados; hoy el pedido llega a
   `pending_acceptance` como cualquiera.
4. **Pedidos que avanzan solos hasta `delivered`** (hoy nadie los acepta).
5. **Horario de plataforma y corte de pedidos** (`platform_schedule`, `order_intake_cutoff`: 18:00-23:00 / 22:30 en
   producción) son globales: un revisor de día no podría pedir. En local el seed los abre; en producción hace falta un
   salto solo para el negocio demo dentro de `create_customer_order`.
6. **Zona de entrega «en cualquier punto»** para la cuenta demo.

Mientras eso no exista, el plan B del expediente (vídeo del recorrido grabado de noche en San Jacinto) sigue siendo el
respaldo, y **la cuenta demo no debe sembrarse en producción**.

### Nota al revisor (completar al tener lo anterior)

Plantilla en inglés en el expediente §9; sustituir `[email] / [password]` por la cuenta de producción que Jesús cree.
Añadir: borrar la cuenta está en *Cuenta → Borrar mi cuenta* y en `https://www.tindivo.com/borrar-cuenta`.
