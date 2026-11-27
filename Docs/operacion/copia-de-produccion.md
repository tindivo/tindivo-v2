# Copia de producción (P0.5): sacarla, guardarla y comprobarla

> Verificado: 2026-11-26 · entorno: Windows de Jesús, Git Bash (`gpg 2.2.29`), Docker `29.6.2`, Node `24.17`, imagen
> `supabase/postgres` 17.6 · **probado completo contra la base LOCAL** (copia, cifrado, verificación, Storage).
> Contra `tindivo-prod` todavía no se ha corrido **(sin verificar)**: la primera vez es el 2026-11-27, con Jesús presente.
> La restauración (§7) está descrita, no ensayada: ensayarla es P0.6.

Guiones: `scripts/prod-backup/`. Plan: `Docs/planes/migraciones/plan-diario.md` (P0.5, nivel B + C).

**Decisiones de Jesús (2026-11-26):** la copia va **cifrada** a **su Google Drive**; la clave la guarda **solo él**;
se saca con él presente. Y, por la noche: esta entrega **no lleva el inventario de la configuración externa** (Auth,
Edge Functions, secretos de la plataforma). Ese inventario va en otra entrega, con capturas del panel.

> **La copia sale PARCIAL, y es lo esperado.** Le falta, a propósito, la configuración externa: Auth (URL del
> sitio, proveedores, plantillas, hooks), Edge Functions (versión y estado) y los nombres de los secretos. Por eso
> `copia.sh` y `verificar.sh` terminan siempre en **`COPIA PARCIAL` (código 3)** con el motivo
> `sin configuración externa (Auth, Edge Functions)…`. Si ese es **el único** motivo, la copia de base y Storage salió
> entera. **P0.5 no se cierra** hasta tener también ese inventario.

## 1. Qué hace y qué garantiza

`copia.sh` saca dos archivos cifrados. Cada parte se cifra por separado. Si se omite una parte o falta un archivo de
Storage, el resultado es **COPIA PARCIAL** (queda `PARCIAL.txt` con los motivos y el guion termina con código 3): sirve
como copia de lo que sí lleva, pero **no cierra P0.5**. Además, siempre figura el motivo de la configuración
externa (ver arriba), también en los ensayos contra la base local.

| Archivo | Qué lleva | Credencial que pide |
|---|---|---|
| `1-base.tar.gpg` | Roles y pertenencias (sin contraseñas); **esquema y datos** de `public`, `auth` (usuarios e identidades), `storage` (metadatos de los objetos), el historial de migraciones y cualquier otro esquema propio (hoy, `auth_hooks`); el esquema completo de la base (permisos, RLS, funciones, extensiones); **conteo y suma de verificación por tabla**; inventario en CSV: permisos efectivos, políticas RLS, cron, extensiones, buckets, publicaciones, disparadores y **solo los nombres** de Vault | Contraseña de la base |
| `2-storage.tar.gpg` | Los **archivos** de todos los buckets, con el sha256 de cada uno. La lista de qué bajar es la de `storage.objects` **en la misma foto que el dump** (viaja dentro de `1-base`); cada objeto que no se pueda bajar o que mida distinto queda anotado y deja la parte PARCIAL | Además, la clave `service_role` |

Lo que garantiza, y cómo:

- **Solo lectura.** Contra la base solo corren `pg_dump` y consultas de lectura (`SELECT` y `SHOW`), en sesiones que llegan
  con `default_transaction_read_only=on` (el guion lo comprueba antes de empezar y Postgres rechaza cualquier
  escritura); los conteos, el inventario y el listado van además dentro de una transacción `READ ONLY`. Contra
  Storage solo existe una función HTTP y su método es `GET` (`solo-get.mjs`). Hay pruebas que
  fallan si alguien añade una sentencia de escritura o una segunda llamada HTTP.
- **Una sola foto.** Los conteos, el inventario, la lista de objetos de Storage y los dos dumps salen del mismo
  snapshot (`pg_export_snapshot`): lo que dicen los conteos es exactamente lo que hay en el dump. `roles.sql`
  (roles, atributos, ajustes por rol y pertenencias, sin contraseñas) también: no se saca con `pg_dumpall`, que no
  admite snapshot, sino con consultas dentro de esa misma transacción.
- **Ningún archivo en claro.** El dump se arma en la memoria (`tmpfs`) de un contenedor efímero y sale por una
  tubería directo a `gpg`. Los archivos de Storage pasan por la memoria de Node, también directo a `gpg`. La
  verificación descifra hacia otra tubería. En la carpeta de salida solo quedan los `.gpg`, `SHA256SUMS`,
  `RESUMEN.txt` y registros con cifras (sin nombres ni datos personales): los mensajes de error de Postgres pasan por
  un filtro que solo deja los de forma conocida y sustituye el resto por «N líneas de diagnóstico omitidas», porque
  un error puede citar el valor de una fila. **Lo que el guion no controla** es que Windows pagine al disco la
  memoria de Docker o de Node: por eso contra prod exige que todos los discos fijos del PC tengan BitLocker activo, y
  si no lo puede acreditar se niega, salvo que Jesús acepte ese riesgo con `--acepto-disco-sin-cifrar` (queda en el resumen).
- **El servidor es el que dice ser.** Contra prod la conexión es `verify-full` con el certificado de la CA de Supabase
  (`--ca`, obligatorio) y libpq solo acepta SCRAM. Si el certificado no valida, no hay copia: no existe modo sin comprobar.
- **Las credenciales no se guardan.** Se escriben a mano en la terminal (no se ven), viven en la memoria del proceso y
  no pasan por argumentos, archivos ni registros; cada una llega solo al proceso que la usa (la contraseña, a `psql`
  y `pg_dump`; la `service_role`, a Node). Con `--destino prod` el guion se niega a correr sin
  una terminal. **Siempre se lanza con `bash -p`** (si no, se niega): así bash no ejecuta `BASH_ENV` ni importa
  funciones del entorno antes de la primera línea. Antes de lanzar ningún programa, el guion se relanza a sí mismo con
  `env -i` y solo una lista corta de variables permitidas, con nombres exactos (`PATH`, `HOME`, las del sistema), y
  vuelve a comprobar con `/usr/bin/env` que no quede nada más; si queda, no sigue (código 70). Una variable con otro
  nombre exportada en la terminal no llega a nadie; lo que la lista no puede validar es el *valor* de una permitida
  (un `PATH` con un secreto dentro seguiría pasando). Las credenciales de ensayo (`TINDIVO_COPIA_LOCAL_*`) no son
  permitidas: viajan por un descriptor, quedan sin exportar y contra prod se borran. Una terminal no demuestra que haya una persona:
  la garantía de que ningún agente ve las credenciales es que **solo Jesús las conoce y las escribe en su propia ventana**.
- **Docker de este PC.** Antes de pedir credenciales, el guion fija el motor de Docker: solo una tubería local
  (`npipe:////./pipe/…`) o un socket unix local; cualquier otro (otro equipo, `tcp://`, `ssh://`) se rechaza, y todas
  las llamadas usan ese motor con `-H` aunque alguien cambie el contexto a mitad.
- **Las partes son de la misma copia.** Lo que le falte a la base (historial de migraciones, esquema completo) va
  dentro del archivo cifrado y la verificación lo suma a los motivos. La parte 2 lleva la huella de la lista de
  objetos de la parte 1: una parte 2 de otra copia no se acepta.
- **Corre lo firmado.** Contra prod exige `--commit-firmado` y se niega si el checkout no está en ese commit o tiene
  cambios sin commit en `scripts/prod-backup/`.
- **Horario.** De 18:00 a 23:00, hora de Lima, se niega (nivel B).

Lo que **no** lleva, a propósito: la configuración externa (arriba), contraseñas de roles (la plataforma no las entrega), valores de Vault, valores de los
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
   - **No hace falta** un token personal de Supabase: esta copia no consulta la API de gestión.
4. **El certificado de la CA de Supabase (obligatorio):** *Database → Settings → SSL Configuration → Download
   certificate*. Se pasa con `--ca <archivo>` y sirve para comprobar que el servidor es el de Supabase.
5. **BitLocker activo** en los discos del PC (*Configuración → Privacidad y seguridad → Cifrado de dispositivo*). El
   guion lo comprueba solo; el 2026-11-26 este PC respondía `C=1 D=1` (activo en los dos).
6. El worktree en el **commit que firmó Codex** (te lo da Claude) y sin cambios: `git -C <worktree> status --short` no imprime nada.

## 3. Sacar la copia (unos 15 minutos)

Abre **tu propia ventana de Git Bash** (no la terminal de Claude: las credenciales no deben pasar por un agente).

```bash
cd "/d/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2-copia-prod"
bash -p scripts/prod-backup/copia.sh --destino prod --commit-firmado <sha-firmado> --ca ~/Downloads/prod-ca-2021.crt
```

Lo que vas a ver, en orden:

| Paso | Qué te pide o muestra | Qué debes ver |
|---|---|---|
| 0 | Comprobaciones | `guiones: commit <sha-firmado>` sin «(con cambios sin commit)» y `discos:  cifrado (BitLocker activo…)` |
| 1 | Host, puerto, usuario, contraseña de la base, `service_role` | Lo que pegas en los campos ocultos **no se ve**. Enter en `service_role` omite la parte 2 (no lo hagas: sin ella faltan los archivos) |
| 2 | La clave de cifrado, dos veces | Si no coinciden o es corta, la vuelve a pedir |
| 3 | Resumen y confirmación (`configuración externa = no (otra entrega)`) | Escribe exactamente `COPIAR tindivo-prod` |
| Parte 1 | `TLS: se verifica el certificado del servidor (verify-full)`, `sesión en solo lectura: default_transaction_read_only=on`, `snapshot exportado`, `RESUMEN tablas=… filas=…`, y luego la verificación | `Parte 1: OK · manifiesto …` |
| Parte 2 | `[storage] RESUMEN listados=… ok=… no_encontrados=…` y `ESTADO=…` | `Parte 2: COMPLETA` si `ok` es igual a `listados`: cada archivo se bajó con el tamaño y la huella (ETag) que la base tenía en la foto. Con cualquier `no_encontrados`, `nombre_no_valido`, `tamano_distinto`, `sin_huella` o `huella_distinta` mayor que 0 sale `PARCIAL` (una subida que nunca terminó, un archivo cambiado mientras corría la copia): se decide con Jesús si se acepta, se repite o se investiga |
| Cierre | `No quedó ningún archivo en claro…`, el `RESUMEN` con `RESULTADO: COPIA PARCIAL` y **un solo** motivo: `sin configuración externa (Auth, Edge Functions)…`; termina con `== LISTO: COPIA PARCIAL ESPERADA…` y código 3 | La carpeta: `~/tindivo-copias/prod-<fecha>Z`. Si `PARCIAL.txt` trae **otro** motivo además de ese, la base o Storage no salieron enteros: se decide con Jesús si se repite |

La copia de una base como la nuestra tarda uno o dos minutos; Storage depende de cuántos archivos haya.

**Si termina con `ERROR`**, no queda nada a medias en producción (solo se leyó). La carpeta queda con
`INCOMPLETA.txt`: no la subas. Mira §8.

## 4. Subirla a Google Drive y comprobarla

1. En `drive.google.com`, crea la carpeta `Tindivo · copias de producción` (privada, sin compartir) y **sube la carpeta
   entera** `prod-<fecha>Z` (los `.gpg`, `SHA256SUMS`, `RESUMEN.txt` y los `.log`).
2. **Comprueba lo subido.** Lo seguro: descarga la carpeta desde Drive a otra ruta y corre

   ```bash
   bash -p scripts/prod-backup/verificar.sh ~/Downloads/prod-<fecha>Z
   ```

   Debe terminar en `== PARCIAL ESPERADA` (antes lista **un solo** motivo, el de la configuración
   externa; código 3). Comprueba el sha256 de cada archivo, lo abre con tu clave hacia la memoria y lee
   el dump entero. Borra después la carpeta descargada (solo tiene archivos cifrados).
3. Pega en el expediente el contenido de `RESUMEN.txt` (no tiene secretos ni datos personales).

## 5. Al terminar

- La `service_role` y la contraseña no cambian (no se creó ningún token).
- Cierra la ventana de Git Bash (su historial de pantalla no tiene credenciales, pero sí el resumen).
- La carpeta local `~/tindivo-copias/prod-<fecha>Z` puede quedarse (está cifrada) hasta que P0.6 la use; «fuera del PC»
  se cumple con la de Drive.
- Anota en `Docs/planes/migraciones/cola.md` (P0.5): fecha, sha256 de `1-base.tar.gpg`, dónde está y que le falta
  la configuración externa (P0.5 sigue abierto por eso).

**Datos personales.** La copia lleva los datos del banco inscrito PN-2026-559 (clientes, teléfonos, direcciones,
comprobantes). Cifrada y con la clave fuera de Drive, quien entre a la cuenta de Google no puede leerla. Cuánto tiempo
se conserva cada copia y cuándo se borra es una decisión pendiente de Jesús (`Docs/operacion/retencion-de-datos.md` no
la cubre todavía).

## 6. Ensayar sin tocar producción

```bash
pnpm db:lock run -- "TINDIVO_COPIA_LOCAL_CLAVE='una clave de ensayo bien larga' bash -p scripts/prod-backup/copia.sh --destino local"
node --test scripts/prod-backup/__tests__/prod-backup.test.mjs
```

`--destino local` apunta a la base local (`host.docker.internal:54322`) y, si defines
`TINDIVO_COPIA_LOCAL_SERVICE_KEY`, también baja los archivos del Storage local. Va bajo el candado porque `pg_dump`
toma bloqueos de lectura que frenarían un `db reset` de otra sesión.

## 7. Restaurar (descrito; el ensayo es P0.6)

**Nunca se restaura sobre `tindivo-prod` desde este runbook.** Restaurar en producción es otra operación de nivel B,
con su propio plan firmado. Lo que sigue es para un contenedor aislado.

1. Baja la carpeta de Drive y corre `bash -p scripts/prod-backup/verificar.sh <carpeta> --conteos`: confirma que está entera e imprime las filas por tabla.
2. Levanta un Postgres aislado con la misma imagen, **sin red** (`--network none`): así cron, `pg_net` y los webhooks
   no pueden llamar a nada real. P0.6 exige además neutralizar cron y Vault antes de arrancar.
3. Mete la copia **directo al contenedor**, sin pasar por una carpeta de Windows. Ojo: dentro del contenedor sí queda
   en claro (su disco es un archivo de Docker en el PC), igual que la base restaurada. Por eso el contenedor de
   restauración se **borra con sus volúmenes** al terminar (`docker rm -f -v`), y P0.6 decide si usa `tmpfs`:

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
7. Lo que hay que volver a cargar a mano porque la copia no lo lleva: la configuración de Auth y de las Edge
   Functions (del inventario de la otra entrega), contraseñas de roles, valores de Vault y de los secretos de las
   funciones, secretos de Auth (Twilio, Google OAuth), y desplegar `send-push` desde el repo.

## 8. Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `no se pudo conectar` nada más empezar la parte 1 | Host, usuario o contraseña mal copiados (la línea `diagnostico: no se pudo conectar: …` de arriba dice cuál); o el pooler no acepta las opciones de arranque | Revisa los tres datos. Si están bien, repite con `--sin-pgoptions`: la sesión deja de llevar `default_transaction_read_only`; quedan las transacciones `READ ONLY` del snapshot y del listado, y que `pg_dump` solo lee. Queda anotado en `RESUMEN.txt` |
| `no se pudo exportar el snapshot` | Puerto 6543 (modo transacción) | Usa el 5432 (modo sesión) |
| `el servidor es Postgres N y este pg_dump es 17` | Producción está en una versión mayor más nueva que la imagen | Para: hace falta fijar otra imagen y volver a firmar |
| `pg_dump de los datos falló` con `diagnostico: permiso denegado sobre un objeto de la base` | Una tabla de `auth` o `storage` que el rol `postgres` no puede leer en producción | Para. El nombre de la tabla no se muestra a propósito (ningún texto del servidor llega a la pantalla): se busca comparando los permisos de `auth` y `storage` de producción con los de la base local, se ajusta el guion y se vuelve a firmar. No lo fuerces con otro rol |
| `diagnostico: sin espacio en la memoria de trabajo` | El dump no cabe en la memoria reservada (2 GB) | Repite con `TINDIVO_COPIA_TMPFS_MB=6000` delante del comando; Docker Desktop necesita tener esa memoria asignada |
| `diagnostico: no se pudo conectar: el servidor no ofrecio SCRAM` | El servidor pidió la contraseña de una forma menos segura | Para y avisa: no se le entrega la contraseña. Se revisa antes de repetir |
| `diagnostico: no se pudo conectar: el certificado del servidor no lo firma la CA indicada` (o `…es de otro nombre`) | El certificado descargado no es el que firma al servidor, o alguien se interpuso | **Para.** No hay modo sin comprobar el certificado. Vuelve a bajarlo del panel; si sigue fallando, se investiga antes de repetir |
| `no se pudo acreditar que los discos estén cifrados` | BitLocker apagado, suspendido o no consultable | Actívalo y repite. `--acepto-disco-sin-cifrar` es una decisión de Jesús: queda escrita en `RESUMEN.txt` |
| `N linea(s) de diagnostico omitidas` | Un error de Postgres que el filtro no sabe clasificar (podría citar datos) | Ningún mensaje del servidor se muestra tal cual: los conocidos salen como `diagnostico: …` con un texto fijo y el resto se cuenta. El motivo exacto no se muestra a propósito. Reproduce el fallo contra la base local (§6) para verlo |
| Termina en `COPIA PARCIAL` (código 3) con **más** motivos que el de la configuración externa | Se omitió la parte 2, faltó un archivo de Storage, o a la base le falta algo (`base: sin historial de migraciones`, `base: el esquema completo salió sin los esquemas de la plataforma`) | Lee `PARCIAL.txt`. Se puede repetir entera, o guardar la parcial sabiendo qué le falta; P0.5 no se cierra |
| `Storage respondió HTTP 401/403` | `service_role` equivocada | Repite; la parte 1 se vuelve a sacar (es rápida) |
| `no se pudo limpiar el entorno: siguen exportadas …` | Una variable o función exportada en la terminal no se pudo quitar | Abre una ventana nueva de Git Bash, sin exportar nada, y repite |
| `son las N h en Lima` | Ventana de servicio | Espera a que pase |
| `lanza el guion con «bash -p»` | Se lanzó con `bash` a secas | Repite con `bash -p` (copia la orden del runbook) |
| `el contexto de Docker apunta a «…»` | El contexto de Docker no es el Docker Desktop de este PC | `docker context use default` (o `desktop-linux`) y repite |
| `la parte 2 no corresponde a la lista de objetos de la parte 1` | Las partes son de copias distintas | No uses esa carpeta: saca otra copia |
| `gpg: decryption failed` al verificar | Clave distinta de la usada al cifrar | Prueba la clave correcta; si no la hay, esa copia está perdida: saca otra |

## 9. Lo que este procedimiento no resuelve

- **No sustituye a los respaldos de la plataforma**: es la copia que controla Tindivo.
- **No lleva la configuración externa** (Auth, Edge Functions, nombres de secretos): va en otra entrega, con
  capturas del panel. Hasta entonces P0.5 sigue abierto.
- Docker Desktop corre en una máquina virtual. El contenedor va sin intercambio propio (`--memory-swap` igual a
  `--memory`), pero la memoria de la máquina virtual y la de Node pueden pasar al archivo de paginación de Windows.
  Si el disco del PC no está cifrado (BitLocker), ese es el único sitio donde podrían quedar restos en claro.
- La contraseña de la base viaja al contenedor por una tubería y vive en su entorno mientras dura (segundos); quien
  ya controle Docker en este PC podría leerla en ese rato.
- Un archivo de Storage borrado o sustituido después de la foto de la parte 1 y antes de bajarlo deja la parte
  PARCIAL (`no_encontrado`, `tamano_distinto` o `huella_distinta`); uno subido después de la foto no entra (tampoco
  está en el dump). La huella es el ETag que guarda Storage: acredita que lo bajado es la versión de la foto, no su
  contenido byte a byte contra una copia anterior. `MANIFEST.json` dice qué se bajó.
- Los errores de Postgres que el filtro no reconoce no se muestran: se gana que ningún dato llegue a un registro en
  claro y se pierde detalle para depurar en vivo.
- `roles.sql` lleva roles, atributos, ajustes por rol y pertenencias de la foto, sin contraseñas. No lleva comentarios
  ni etiquetas de roles, permisos sobre parámetros (`pg_parameter_acl`) ni pertenencias de roles `pg_*`; el orden de
  los `GRANT` cubre el caso normal (primero lo que concede un superusuario y lo que da ADMIN), no cadenas largas de
  delegación. Restaurarlo sobre una base vacía es parte de P0.6.
- `BASH_ENV` y funciones exportadas: con `bash -p` no se ejecutan ni se importan. Sin `-p` el guion se niega,
  pero bash ya habría leído `BASH_ENV` al arrancar: por eso la orden se copia tal cual del runbook, en una ventana
  nueva de Git Bash.
- Una copia sin restauración ensayada no es todavía un respaldo probado: eso lo cierra P0.6.
