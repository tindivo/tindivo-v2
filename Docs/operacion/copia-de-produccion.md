# Copia de producción (P0.5): sacarla, guardarla y comprobarla

> Verificado: 2026-11-26 · entorno: Windows de Jesús, Git Bash (`gpg 2.2.29`), Docker `29.6.2`, Node `24.17`, imagen
> `supabase/postgres` 17.6 · **probado completo contra la base LOCAL** (copia, cifrado, verificación, Storage).
> Contra `tindivo-prod` todavía no se ha corrido **(sin verificar)**: la primera vez es el 2026-11-27, con Jesús presente.
> La restauración (§7) está descrita, no ensayada: ensayarla es P0.6.

Guiones: `scripts/prod-backup/`. Plan: `Docs/planes/migraciones/plan-diario.md` (P0.5, nivel B + C).

**Decisiones de Jesús (2026-11-26):** la copia va **cifrada** a **su Google Drive**; la clave la guarda **solo él**;
se saca con él presente.

## 1. Qué hace y qué garantiza

`copia.sh` saca hasta tres archivos cifrados. Cada parte se cifra por separado, así una parte omitida no invalida las otras.

| Archivo | Qué lleva | Credencial que pide |
|---|---|---|
| `1-base.tar.gpg` | Roles y pertenencias (sin contraseñas); **esquema y datos** de `public`, `auth` (usuarios e identidades), `storage` (metadatos de los objetos) y el historial de migraciones; el esquema completo de la base (permisos, RLS, funciones, extensiones); **conteo y suma de verificación por tabla**; inventario en CSV: permisos efectivos, políticas RLS, cron, extensiones, buckets, publicaciones, disparadores y **solo los nombres** de Vault | Contraseña de la base |
| `2-storage.tar.gpg` | Los **archivos** de todos los buckets, con el sha256 de cada uno | Además, la clave `service_role` |
| `3-config.tar.gpg` | Inventario de lo que no vive en la base: configuración de Auth, Edge Functions (versión y estado), nombres de los secretos, API, red y los respaldos de la plataforma. **Los valores secretos se tachan antes de empaquetar** | Un token personal de Supabase |

Lo que garantiza, y cómo:

- **Solo lectura.** Contra la base solo corren `pg_dump`, `pg_dumpall` y consultas de lectura, en sesiones que llegan
  con `default_transaction_read_only=on` (el guion lo comprueba antes de empezar y Postgres rechaza cualquier
  escritura); los conteos, el inventario y el listado van además dentro de una transacción `READ ONLY`. Contra
  Storage y la API de gestión solo existe una función HTTP y su método es `GET` (`solo-get.mjs`). Hay pruebas que
  fallan si alguien añade una sentencia de escritura o una segunda llamada HTTP.
- **Una sola foto.** Los conteos, el inventario y los dos dumps salen del mismo snapshot (`pg_export_snapshot`): lo
  que dicen los conteos es exactamente lo que hay en el dump.
- **Nada en claro en el disco.** El dump se arma en la memoria (`tmpfs`) de un contenedor efímero y sale por una
  tubería directo a `gpg`. Los archivos de Storage pasan por la memoria de Node, también directo a `gpg`. La
  verificación descifra hacia otra tubería. En la carpeta de salida solo quedan los `.gpg`, `SHA256SUMS`,
  `RESUMEN.txt` y registros con cifras (sin nombres ni datos personales).
- **Las credenciales no se guardan.** Se escriben a mano en la terminal (no se ven), viven en la memoria del proceso y
  no pasan por argumentos, archivos ni registros. Con `--destino prod` el guion se niega a correr sin una terminal de
  verdad e ignora cualquier credencial que venga del entorno: **ningún agente puede lanzarlo contra producción**.
- **Corre lo firmado.** Contra prod exige `--commit-firmado` y se niega si el checkout no está en ese commit o tiene
  cambios sin commit en `scripts/prod-backup/`.
- **Horario.** De 18:00 a 23:00, hora de Lima, se niega (nivel B).

Lo que **no** lleva, a propósito: contraseñas de roles (la plataforma no las entrega), valores de Vault, valores de los
secretos de las funciones y de Auth (Twilio, Google OAuth, FCM, APNs: se vuelven a cargar desde su origen), y los
esquemas que administra la plataforma (`realtime`, `net`, `supabase_functions`…), salvo su definición en el esquema completo.

## 2. Antes de empezar (la víspera)

No hay nada que instalar: `gpg` viene con Git para Windows y la imagen de Postgres es la misma de la base local.

1. **Docker Desktop abierto.** Comprueba la imagen (debe responder con una línea que empieza por `sha256:`):

   ```bash
   docker image inspect --format '{{.Id}}' public.ecr.aws/supabase/postgres@sha256:80d7b27c3e8d77cfa7226eee9508671796da214781ff15a35b3670d7ad5ee453
   ```

   Si dice «No such image»: `docker pull` con ese mismo nombre.
2. **La clave de cifrado.** Elígela tú: mínimo 20 caracteres, sin tildes ni eñes (por ejemplo, seis palabras al azar
   separadas por espacios). Guárdala en tu gestor de contraseñas **y** en papel, **fuera de Google Drive**. Sin ella
   la copia no se abre y nadie puede recuperarla. No se la dictes a ningún agente.
3. **Ten a la mano, en el panel de Supabase de `tindivo-prod`:**
   - *Connect → Session pooler*: el host (termina en `.pooler.supabase.com`), puerto `5432` y usuario `postgres.zpnipajgwfthxhdtzhly`.
   - La **contraseña de la base**. Si no la tienes guardada, **no la restablezcas** por tu cuenta (eso sí cambia producción): avisa y se decide.
   - *Settings → API Keys*: la clave **`service_role`** (para los archivos de Storage).
   - *Account → Access Tokens*: crea un **token personal** con la caducidad más corta; lo revocas al terminar.
4. **Opcional, recomendado:** *Database → Settings → SSL Configuration → Download certificate*. Con `--ca <archivo>` la
   conexión comprueba además que el servidor es el de Supabase.
5. El worktree en el **commit que firmó Codex** (te lo da Claude) y sin cambios: `git -C <worktree> status --short` no imprime nada.

## 3. Sacar la copia (unos 15 minutos)

Abre **tu propia ventana de Git Bash** (no la terminal de Claude: las credenciales no deben pasar por un agente).

```bash
cd "/d/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2-copia-prod"
bash scripts/prod-backup/copia.sh --destino prod --commit-firmado <sha-firmado> --ca ~/Downloads/prod-ca-2021.crt
```

(Sin el certificado, quita `--ca …`.) Lo que vas a ver, en orden:

| Paso | Qué te pide o muestra | Qué debes ver |
|---|---|---|
| 0 | Comprobaciones | `guiones: commit <sha-firmado>` sin «(con cambios sin commit)» |
| 1 | Host, puerto, usuario, contraseña de la base, `service_role`, token personal | Lo que pegas en los campos ocultos **no se ve**. Enter en `service_role` o en el token omite esa parte |
| 2 | La clave de cifrado, dos veces | Si no coinciden o es corta, la vuelve a pedir |
| 3 | Resumen y confirmación | Escribe exactamente `COPIAR tindivo-prod` |
| Parte 1 | `sesión en solo lectura: default_transaction_read_only=on`, `snapshot exportado`, `RESUMEN tablas=… filas=…`, y luego la verificación | `Parte 1: OK · manifiesto …` |
| Parte 2 | `[storage] RESUMEN listados=… ok=… no_encontrados=…` | `Parte 2: OK`. `no_encontrados` mayor que 0 se anota (un objeto borrado mientras corría, o una subida que nunca terminó) |
| Parte 3 | `[config] auth: 200`, `edge-functions: 200`… | `Parte 3: OK`. Un `404` en una consulta secundaria no detiene nada: queda anotado |
| Cierre | `En claro no quedó nada…`, el `RESUMEN` y `== LISTO` | La carpeta: `~/tindivo-copias/prod-<fecha>Z` |

La copia de una base como la nuestra tarda uno o dos minutos; Storage depende de cuántos archivos haya.

**Si termina con `ERROR`**, no queda nada a medias en producción (solo se leyó). La carpeta queda con
`INCOMPLETA.txt`: no la subas. Mira §8.

## 4. Subirla a Google Drive y comprobarla

1. En `drive.google.com`, crea la carpeta `Tindivo · copias de producción` (privada, sin compartir) y **sube la carpeta
   entera** `prod-<fecha>Z` (los `.gpg`, `SHA256SUMS`, `RESUMEN.txt` y los `.log`).
2. **Comprueba lo subido.** Lo seguro: descarga la carpeta desde Drive a otra ruta y corre

   ```bash
   bash scripts/prod-backup/verificar.sh ~/Downloads/prod-<fecha>Z
   ```

   Debe terminar en `== VERIFICADA`. Comprueba el sha256 de cada archivo, lo abre con tu clave hacia la memoria y lee
   el dump entero. Borra después la carpeta descargada (solo tiene archivos cifrados).
3. Pega en el expediente el contenido de `RESUMEN.txt` (no tiene secretos ni datos personales).

## 5. Al terminar

- **Revoca el token personal** (*Account → Access Tokens*). La `service_role` y la contraseña no cambian.
- Cierra la ventana de Git Bash (su historial de pantalla no tiene credenciales, pero sí el resumen).
- La carpeta local `~/tindivo-copias/prod-<fecha>Z` puede quedarse (está cifrada) hasta que P0.6 la use; «fuera del PC»
  se cumple con la de Drive.
- Anota en `Docs/planes/migraciones/cola.md` (P0.5): fecha, sha256 de `1-base.tar.gpg` y dónde está.

**Datos personales.** La copia lleva los datos del banco inscrito PN-2026-559 (clientes, teléfonos, direcciones,
comprobantes). Cifrada y con la clave fuera de Drive, quien entre a la cuenta de Google no puede leerla. Cuánto tiempo
se conserva cada copia y cuándo se borra es una decisión pendiente de Jesús (`Docs/operacion/retencion-de-datos.md` no
la cubre todavía).

## 6. Ensayar sin tocar producción

```bash
pnpm db:lock run -- "TINDIVO_COPIA_LOCAL_CLAVE='una clave de ensayo bien larga' bash scripts/prod-backup/copia.sh --destino local"
node --test scripts/prod-backup/__tests__/prod-backup.test.mjs
```

`--destino local` apunta a la base local (`host.docker.internal:54322`) y, si defines
`TINDIVO_COPIA_LOCAL_SERVICE_KEY`, también baja los archivos del Storage local. Va bajo el candado porque `pg_dump`
toma bloqueos de lectura que frenarían un `db reset` de otra sesión.

## 7. Restaurar (descrito; el ensayo es P0.6)

**Nunca se restaura sobre `tindivo-prod` desde este runbook.** Restaurar en producción es otra operación de nivel B,
con su propio plan firmado. Lo que sigue es para un contenedor aislado.

1. Baja la carpeta de Drive y corre `verificar.sh <carpeta> --conteos`: confirma que está entera e imprime las filas por tabla.
2. Levanta un Postgres aislado con la misma imagen, **sin red** (`--network none`): así cron, `pg_net` y los webhooks
   no pueden llamar a nada real. P0.6 exige además neutralizar cron y Vault antes de arrancar.
3. Mete la copia **directo al contenedor**, sin dejarla en claro en el disco del PC:

   ```bash
   gpg --decrypt 1-base.tar.gpg | docker exec -i <contenedor> tar -x -C /var/tmp/copia
   ```

4. Dentro del contenedor: `roles.sql` primero (crea los roles que falten; las contraseñas se ponen aparte), después
   `pg_restore --dbname=postgres datos.dump`. `auth` y `storage` ya existen en la imagen: el orden y las opciones
   exactas (`--clean --if-exists`, o restaurar sobre una base vacía) son lo que P0.6 tiene que dejar probado.
5. **Concilia:** corre sobre lo restaurado la misma consulta de `conteos.tsv` (está en `en-contenedor.sh`) y compara
   fila a fila: mismas tablas, mismo conteo, misma suma. Después, pedidos, cargos y saldos (P0.6).
6. Los archivos de Storage: `2-storage.tar.gpg` trae `MANIFEST.json` con bucket, nombre original y sha256 de cada
   objeto; el archivo va en `objetos/<bucket>/<id>`. Subirlos de vuelta es un guion que todavía no existe.
7. Lo que hay que volver a cargar a mano porque la copia no lo lleva: contraseñas de roles, valores de Vault y de los
   secretos de las funciones, secretos de Auth (Twilio, Google OAuth), y desplegar `send-push` desde el repo.

## 8. Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `no se pudo conectar` nada más empezar la parte 1 | Host, usuario o contraseña mal copiados; o el pooler no acepta las opciones de arranque | Revisa los tres datos. Si están bien, repite con `--sin-pgoptions`: la sesión deja de llevar `default_transaction_read_only`; quedan las transacciones `READ ONLY` del snapshot y del listado, y que `pg_dump` y `pg_dumpall` solo leen. Queda anotado en `RESUMEN.txt` |
| `no se pudo exportar el snapshot` | Puerto 6543 (modo transacción) | Usa el 5432 (modo sesión) |
| `el servidor es Postgres N y este pg_dump es 17` | Producción está en una versión mayor más nueva que la imagen | Para: hace falta fijar otra imagen y volver a firmar |
| `pg_dump de los datos falló` con `permission denied` | Una tabla de `auth` o `storage` que el rol `postgres` no puede leer en producción | Para y copia el mensaje: se ajusta el guion y se vuelve a firmar. No lo fuerces con otro rol |
| `No space left on device` en la parte 1 | El dump no cabe en la memoria reservada (2 GB) | Repite con `TINDIVO_COPIA_TMPFS_MB=6000` delante del comando; Docker Desktop necesita tener esa memoria asignada |
| `Storage respondió HTTP 401/403` | `service_role` equivocada | Repite; la parte 1 se vuelve a sacar (es rápida) |
| `la API de gestión no devolvió el proyecto…` | Token vencido o sin acceso | Crea otro token, o deja la parte 3 para después (Enter) |
| `son las N h en Lima` | Ventana de servicio | Espera a que pase |
| `gpg: decryption failed` al verificar | Clave distinta de la usada al cifrar | Prueba la clave correcta; si no la hay, esa copia está perdida: saca otra |

## 9. Lo que este procedimiento no resuelve

- **No sustituye a los respaldos de la plataforma** (los lista `3-config`): es la copia que controla Tindivo.
- Docker Desktop corre en una máquina virtual: su memoria puede pasar al archivo de intercambio de Windows. Si el
  disco del PC no está cifrado (BitLocker), ese es el único sitio donde podrían quedar restos en claro.
- La contraseña de la base viaja al contenedor por una tubería y vive en su entorno mientras dura (segundos); quien
  ya controle Docker en este PC podría leerla en ese rato.
- Sin `--ca`, la conexión va cifrada pero no comprueba la identidad del servidor.
- La lista de archivos de Storage se toma al empezar la parte 2, no en la foto de la parte 1: un archivo subido o
  borrado entre una y otra puede no cuadrar con `storage.objects` del dump. `MANIFEST.json` dice qué se bajó.
- Una copia sin restauración ensayada no es todavía un respaldo probado: eso lo cierra P0.6.
