#!/usr/bin/env bash
# Copia de producción P0.5: lo que corre DENTRO del contenedor efímero (imagen supabase/postgres).
# Nunca se ejecuta en el host. Lo lanzan copia.sh y verificar.sh, que pasan este texto en la variable
# TINDIVO_GUION; así la entrada estándar queda libre para la contraseña (una línea) o para el tar.
#
# Modos:
#   copiar      lee la contraseña de la base en la primera línea de stdin; escribe un tar en stdout
#   verificar   lee el tar en stdin; comprueba el manifiesto y que el dump se lee entero
#   filtrar     (pruebas) aplica a stdin el filtro de diagnósticos y lo escribe en stdout
#
# La contraseña NO se exporta: solo la reciben psql, pg_dump y pg_dumpall, uno por uno (función `pg`).
# Todo lo que sale por stderr pasa por `filtrar`: los mensajes del servidor que no tengan una forma conocida
# e inofensiva se sustituyen por un aviso, para que un valor de una fila no pueda acabar en un registro en claro.
#
# Solo lectura: este archivo no contiene ninguna sentencia que escriba en la base. Los conteos, el
# inventario y el listado van dentro de una transacción READ ONLY; pg_dump abre la suya, también READ ONLY.
# Además, toda sesión llega con default_transaction_read_only=on (PGOPTIONS), y eso se comprueba antes de empezar.
# Lo que queda en claro vive en /work, que es un tmpfs (memoria): desaparece con el contenedor.
set -euo pipefail
umask 077
export LC_ALL=C

MODO="${1:?falta el modo}"
W=/work
ESQUEMAS_OBLIGATORIOS=(public auth storage)
# Todo esquema propio que no sea de la plataforma entra también (hoy: supabase_migrations y auth_hooks).
# Esquemas que administra la plataforma: solo se excluyen en el segundo intento del esquema completo.
ESQUEMAS_PLATAFORMA=(vault pgsodium pgsodium_masks net supabase_functions realtime _realtime _analytics
  _supavisor pgbouncer graphql graphql_public extensions cron pgmq)

unset TINDIVO_GUION
CONTRASENA=''

# Huella de roles, pertenencias y ajustes por rol: se toma dentro del snapshot y otra vez después de pg_dumpall
# (que no admite snapshot). Si difieren, alguien cambió un rol mientras tanto y la copia se rechaza.
SQL_HUELLA_ROLES="select md5(
  coalesce((select string_agg(concat_ws(':', rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
      rolreplication, rolbypassrls, rolconnlimit, rolvaliduntil, rolconfig), '|' order by rolname) from pg_roles), '')
  || '#' ||
  coalesce((select string_agg(concat_ws(':', g.rolname, m.rolname, a.admin_option, a.inherit_option, a.set_option), '|'
      order by g.rolname, m.rolname, a.grantor)
    from pg_auth_members a join pg_roles g on g.oid = a.roleid join pg_roles m on m.oid = a.member), '')
  || '#' ||
  coalesce((select string_agg(concat_ws(':', s.setdatabase, s.setrole, s.setconfig), '|'
      order by s.setdatabase, s.setrole) from pg_db_role_setting s), ''))"

log() { printf '[contenedor] %s\n' "$*" >&2; }
fallo() {
  log "ERROR: $*"
  exit 1
}

# Deja pasar solo diagnósticos de forma conocida; el resto se cuenta y se omite.
filtrar() {
  awk '
    function pasa(l) {
      if (length(l) > 400) return 0
      if (l ~ /^\[contenedor\] /) return 1
      if (l ~ /^(psql|pg_dump|pg_dumpall): error: connection to server (at|on socket) "[^"]*"( \([0-9a-fA-F.:]+\))?, port [0-9]+ failed: /) return 1
      if (l ~ /^(psql|pg_dump|pg_dumpall): error: could not translate host name "[^"]*" to address: /) return 1
      if (l ~ /^(psql|pg_dump|pg_dumpall): error: (authentication method requirement|SSL error|server certificate|root certificate|certificate verify failed|private key|timeout expired)/) return 1
      if (l ~ /^(psql:[^ ]*: |pg_dump: error: query failed: |pg_dumpall: error: query failed: )?ERROR:  permission denied for [a-z ]+ [A-Za-z0-9_."]+$/) return 1
      if (l ~ /^(psql:[^ ]*: )?ERROR:  cannot execute [A-Z ]+ in a read-only transaction$/) return 1
      if (l ~ /^(psql:[^ ]*: |pg_dump: error: query failed: )?ERROR:  canceling statement due to (statement timeout|lock timeout|user request)$/) return 1
      if (l ~ /^pg_dump: detail: Query was: LOCK TABLE [A-Za-z0-9_.", ]+ IN ACCESS SHARE MODE$/) return 1
      if (l ~ /^pg_dump: error: (aborting because of server version mismatch|no matching schemas were found)$/) return 1
      if (l ~ /^pg_dump: detail: server version: [0-9.]+; pg_dump version: [0-9.]+$/) return 1
      if (l ~ /No space left on device$/ && l ~ /^(pg_dump|pg_dumpall|pg_restore|tar|sha256sum): /) return 1
      if (l ~ /^(psql|pg_dump|pg_dumpall): error: (server closed the connection unexpectedly|connection to server was lost)$/) return 1
      if (l ~ /^tar: (short read|invalid tar magic|unexpected end of file)$/) return 1
      if (l ~ /^sha256sum: WARNING: [0-9]+ (of [0-9]+ )?computed checksums? did NOT match$/) return 1
      return 0
    }
    { if (pasa($0)) print; else n++ }
    END { if (n) printf "[contenedor] %d linea(s) de diagnostico omitidas: no tienen una forma conocida y podrian llevar datos\n", n }
  '
}

# Corre un cliente de Postgres dándole la contraseña solo a ese proceso.
pg() { PGPASSWORD="$CONTRASENA" "$@"; }

leer_contrasena() {
  IFS= read -r CONTRASENA || true
  [ -n "$CONTRASENA" ] || fallo 'no llegó la contraseña de la base por la entrada estándar'
  exec 0</dev/null
  # Con el certificado de la CA de Supabase (público) se verifica además la identidad del servidor.
  if [ -n "${TINDIVO_CA_PEM:-}" ]; then
    printf '%s\n' "$TINDIVO_CA_PEM" >/tmp/ca.crt
    export PGSSLROOTCERT=/tmp/ca.crt PGSSLMODE=verify-full
    log 'TLS: se verifica el certificado del servidor (verify-full)'
  fi
}

q() { pg psql -X -A -t -q -v ON_ERROR_STOP=1 --no-password "$@" </dev/null; }

comprobar_conexion_y_solo_lectura() {
  local ro
  if ! ro="$(q -c 'show default_transaction_read_only')"; then
    fallo 'no se pudo conectar (revisa host, puerto, usuario y contraseña; si el pooler rechaza las opciones de arranque, lee el runbook: --sin-pgoptions)'
  fi
  if [ "${TINDIVO_SIN_PGOPTIONS:-0}" = 1 ]; then
    log "aviso: sin PGOPTIONS; la sesión dice default_transaction_read_only=$([ "$ro" = on ] && echo on || echo off). El snapshot y el listado van en transacciones READ ONLY; el resto son SHOW, SELECT, pg_dump y pg_dumpall, que solo leen."
  elif [ "$ro" != on ]; then
    fallo 'la sesión no quedó en solo lectura (default_transaction_read_only no es on)'
  else
    log 'sesión en solo lectura: default_transaction_read_only=on'
  fi
}

# Esquemas que existen y no son del sistema, uno por línea. Si la consulta falla, falla la copia.
esquemas_de_la_base() {
  q -c "select nspname from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema' order by 1"
}

contiene() { # aguja, pajar...
  local a="$1" x
  shift
  for x in "$@"; do [ "$x" = "$a" ] && return 0; done
  return 1
}

# Guion SQL de conteos e inventario. Corre en la MISMA transacción que exporta el snapshot que usa pg_dump.
sql_inventario() {
  local lista="$1"
  cat <<SQL
\\pset format unaligned
\\pset tuples_only on
\\pset fieldsep '\\t'
\\o $W/conteos.tsv
select format(
  'select %L, %L, count(*), coalesce(sum((''x'' || substr(md5(t::text), 1, 15))::bit(60)::bigint), 0) from %I.%I t',
  schemaname, tablename, schemaname, tablename)
from pg_tables where schemaname in ($lista) order by schemaname, tablename
\\gexec
\\o
\\pset format csv
\\pset tuples_only off
\\o $W/inventario/version.csv
select version() as version, current_setting('server_version_num') as server_version_num,
  current_database() as base, current_user as usuario, (now() at time zone 'utc') as tomado_utc,
  pg_database_size(current_database()) as bytes_base, pg_current_snapshot()::text as snapshot_txid;
\\o $W/inventario/extensiones.csv
select e.extname, e.extversion, n.nspname as esquema, r.rolname as dueno
from pg_extension e join pg_namespace n on n.oid = e.extnamespace join pg_roles r on r.oid = e.extowner order by 1;
\\o $W/inventario/esquemas.csv
select n.nspname, r.rolname as dueno, n.nspacl::text as acl
from pg_namespace n join pg_roles r on r.oid = n.nspowner order by 1;
\\o $W/inventario/roles.csv
select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls,
  rolconnlimit, rolvaliduntil, rolconfig::text as rolconfig from pg_roles order by 1;
\\o $W/inventario/membresias.csv
select g.rolname as rol, m.rolname as miembro, a.admin_option
from pg_auth_members a join pg_roles g on g.oid = a.roleid join pg_roles m on m.oid = a.member order by 1, 2;
\\o $W/inventario/ajustes-por-rol-y-base.csv
select coalesce(d.datname, '') as base, coalesce(r.rolname, '') as rol, s.setconfig::text as ajustes
from pg_db_role_setting s left join pg_database d on d.oid = s.setdatabase left join pg_roles r on r.oid = s.setrole
order by 1, 2;
\\o $W/inventario/permisos-relaciones.csv
select n.nspname as esquema, c.relname, c.relkind, r.rolname as dueno, c.relrowsecurity as rls,
  c.relforcerowsecurity as rls_forzado, c.relacl::text as acl
from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_roles r on r.oid = c.relowner
where c.relkind in ('r', 'p', 'v', 'm', 'S', 'f') and n.nspname not in ('pg_catalog', 'information_schema')
  and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%' order by 1, 2;
\\o $W/inventario/permisos-columnas.csv
select n.nspname as esquema, c.relname, a.attname, a.attacl::text as acl
from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
where a.attacl is not null and not a.attisdropped and n.nspname not in ('pg_catalog', 'information_schema')
order by 1, 2, 3;
\\o $W/inventario/permisos-funciones.csv
select n.nspname as esquema, p.proname, pg_get_function_identity_arguments(p.oid) as argumentos, p.prokind,
  r.rolname as dueno, p.prosecdef as security_definer, p.proconfig::text as proconfig, p.proacl::text as acl,
  md5(p.prosrc) as md5_cuerpo
from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner
where n.nspname not in ('pg_catalog', 'information_schema') order by 1, 2, 3;
\\o $W/inventario/permisos-por-defecto.csv
select coalesce(n.nspname, '') as esquema, r.rolname as rol, d.defaclobjtype as tipo, d.defaclacl::text as acl
from pg_default_acl d join pg_roles r on r.oid = d.defaclrole left join pg_namespace n on n.oid = d.defaclnamespace
order by 1, 2, 3;
\\o $W/inventario/politicas-rls.csv
select schemaname, tablename, policyname, permissive, roles::text as roles, cmd, qual, with_check
from pg_policies order by 1, 2, 3;
\\o $W/inventario/publicaciones.csv
select p.pubname, p.puballtables, p.pubinsert, p.pubupdate, p.pubdelete, p.pubtruncate,
  coalesce(t.schemaname, '') as esquema, coalesce(t.tablename, '') as tabla
from pg_publication p left join pg_publication_tables t on t.pubname = p.pubname order by 1, 7, 8;
\\o $W/inventario/disparadores.csv
select n.nspname as esquema, c.relname as tabla, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as definicion
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal order by 1, 2, 3;
\\o
select to_regclass('storage.buckets') is not null as hay_buckets \\gset
\\if :hay_buckets
\\o $W/inventario/storage-buckets.csv
select * from storage.buckets order by id;
\\o $W/inventario/storage-resumen.csv
select bucket_id, count(*) as objetos,
  coalesce(sum(case when metadata->>'size' ~ '^[0-9]{1,18}\$' then (metadata->>'size')::bigint end), 0) as bytes_declarados
from storage.objects group by 1 order by 1;
\\o
\\pset format unaligned
\\pset tuples_only on
\\o $W/storage-objetos.jsonl
select json_build_object('bucket', bucket_id, 'id', id, 'name', name,
  'size', case when metadata->>'size' ~ '^[0-9]{1,18}\$' then (metadata->>'size')::bigint end,
  'mimetype', metadata->>'mimetype', 'updated_at', updated_at)::text
from storage.objects order by bucket_id, name;
\\o
\\pset format csv
\\pset tuples_only off
\\endif
select to_regclass('supabase_migrations.schema_migrations') is not null as hay_migraciones \\gset
\\if :hay_migraciones
\\o $W/inventario/migraciones.csv
select version, name from supabase_migrations.schema_migrations order by version;
\\o
\\endif
select coalesce(has_table_privilege(to_regclass('cron.job'), 'select'), false) as hay_cron \\gset
\\if :hay_cron
\\o $W/inventario/cron-jobs.csv
select jobid, jobname, schedule, command, database, username, active from cron.job order by jobid;
\\o
\\endif
-- Vault: SOLO nombres. Nunca la columna cifrada ni la vista con los valores en claro.
select coalesce(has_column_privilege(to_regclass('vault.secrets'), 'name', 'select'), false) as hay_vault \\gset
\\if :hay_vault
\\o $W/inventario/vault-nombres.csv
select id, name, description, created_at, updated_at from vault.secrets order by name;
\\o
\\endif
\\pset format unaligned
\\pset tuples_only on
\\o $W/roles-huella.txt
$SQL_HUELLA_ROLES;
\\o
\\echo INVENTARIO_OK
SQL
}

esperar_linea() { # archivo, patrón, segundos, pid de la sesión
  local i=0
  while ! grep -q "$2" "$1" 2>/dev/null; do
    kill -0 "$4" 2>/dev/null || return 1
    i=$((i + 1))
    [ "$i" -le $(($3 * 5)) ] || return 1
    sleep 0.2
  done
}

copiar() {
  leer_contrasena
  cd "$W"
  mkdir -p inventario
  comprobar_conexion_y_solo_lectura

  local num mayor_srv mayor_cli
  num="$(q -c 'show server_version_num')"
  [[ "$num" =~ ^[0-9]{5,6}$ ]] || fallo 'el servidor no dijo su versión'
  mayor_srv=$((num / 10000))
  mayor_cli="$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
  log "servidor Postgres $num · pg_dump $(pg_dump --version | sed -E 's/.*\) //')"
  [ "$mayor_srv" -le "$mayor_cli" ] || fallo "el servidor es Postgres $mayor_srv y este pg_dump es $mayor_cli: hace falta una imagen con pg_dump $mayor_srv o más nuevo (variable TINDIVO_COPIA_IMAGEN)"

  local s esquemas=() lista=''
  local todos
  todos="$(esquemas_de_la_base)" || fallo 'no se pudo leer la lista de esquemas'
  mapfile -t todos <<<"$todos"
  for s in "${ESQUEMAS_OBLIGATORIOS[@]}"; do
    contiene "$s" "${todos[@]}" || fallo "falta el esquema obligatorio «$s»: esta base no es la esperada"
  done
  for s in "${todos[@]}"; do
    [[ "$s" =~ ^[a-z_][a-z0-9_]*$ ]] || fallo 'hay un esquema con un nombre inesperado (mayúsculas o símbolos): revísalo antes de copiar'
    contiene "$s" "${ESQUEMAS_PLATAFORMA[@]}" || esquemas+=("$s")
  done
  log "esquemas con datos en la copia: ${esquemas[*]}"
  contiene supabase_migrations "${esquemas[@]}" || log 'aviso: no existe supabase_migrations; la copia no lleva historial de migraciones'
  for s in "${esquemas[@]}"; do lista="${lista:+$lista, }'$s'"; done
  printf '%s\n' "${esquemas[@]}" >esquemas-con-datos.txt

  # 1. Una sesión abre la transacción de solo lectura y exporta su snapshot.
  mkfifo "$W/.ctl"
  pg psql -X -q -v ON_ERROR_STOP=1 --no-password -f "$W/.ctl" >"$W/.sesion.out" 2>"$W/.sesion.err" &
  local sesion=$!
  exec 9>"$W/.ctl"
  # Los tres SET LOCAL solo quitan límites de tiempo a ESTA transacción (pg_dump hace lo mismo con la suya).
  printf '%s\n' 'begin transaction isolation level repeatable read read only;' \
    'set local statement_timeout = 0;' 'set local lock_timeout = 0;' \
    'set local idle_in_transaction_session_timeout = 0;' \
    "select 'TX_RO=' || current_setting('transaction_read_only');" \
    "select 'SNAP=' || pg_export_snapshot();" >&9
  esperar_linea "$W/.sesion.out" 'SNAP=' 60 "$sesion" || {
    cat "$W/.sesion.err" >&2
    fallo 'no se pudo exportar el snapshot (¿pooler en modo transacción? usa el puerto 5432, modo sesión)'
  }
  local snap
  snap="$(grep -o 'SNAP=[0-9A-Fa-f-]*' "$W/.sesion.out" | head -n 1 | cut -d= -f2)"
  [ -n "$snap" ] || fallo 'snapshot vacío'
  grep -q 'TX_RO=on' "$W/.sesion.out" || fallo 'la transacción del snapshot no es de solo lectura'
  log 'snapshot exportado; conteos, inventario y dumps salen de la misma foto'

  # 2. Conteos y suma de verificación por tabla, e inventario, en esa misma transacción.
  sql_inventario "$lista" >&9
  esperar_linea "$W/.sesion.out" 'INVENTARIO_OK' 900 "$sesion" || {
    cat "$W/.sesion.err" >&2
    fallo 'fallaron los conteos o el inventario'
  }

  # 3. Datos y esquema de public, auth, storage y el historial de migraciones, con ese snapshot.
  local args=(--no-password --snapshot="$snap" --format=custom --compress=6 --file="$W/datos.dump")
  for s in "${esquemas[@]}"; do args+=(--schema="$s"); done
  pg pg_dump "${args[@]}" </dev/null ||
    fallo 'pg_dump de los datos falló (si dice «No space left on device», sube TINDIVO_COPIA_TMPFS_MB; lo explica el runbook)'
  log "datos.dump listo ($(wc -c <"$W/datos.dump") bytes)"

  # 4. Esquema completo de la base (referencia de permisos, RLS, extensiones). Dos intentos.
  local excl=()
  if pg pg_dump --no-password --snapshot="$snap" --schema-only --file="$W/esquema-completo.sql" </dev/null 2>"$W/.esq.err"; then
    echo 'esquema-completo.sql: base entera' >partes.txt
  else
    for s in "${ESQUEMAS_PLATAFORMA[@]}"; do excl+=(--exclude-schema="$s"); done
    if pg pg_dump --no-password --snapshot="$snap" --schema-only "${excl[@]}" --file="$W/esquema-completo.sql" </dev/null 2>>"$W/.esq.err"; then
      echo "esquema-completo.sql: sin los esquemas de la plataforma (${ESQUEMAS_PLATAFORMA[*]}); el primer intento falló" >partes.txt
      log 'aviso: el esquema completo salió sin los esquemas de la plataforma (queda anotado en partes.txt)'
    else
      cat "$W/.esq.err" >&2
      fallo 'pg_dump del esquema completo falló en los dos intentos'
    fi
  fi

  # 5. Cierre de la transacción del snapshot.
  printf '%s\n' 'commit;' '\q' >&9
  exec 9>&-
  wait "$sesion" || {
    cat "$W/.sesion.err" >&2
    fallo 'la sesión del snapshot terminó con error'
  }
  if [ -s "$W/.sesion.err" ]; then
    cat "$W/.sesion.err" >&2
    fallo 'la sesión del snapshot escribió errores'
  fi

  # 6. Roles y pertenencias, sin contraseñas (la plataforma no deja leerlas y no hacen falta).
  pg pg_dumpall --no-password --roles-only --no-role-passwords --file="$W/roles.sql" </dev/null || fallo 'pg_dumpall de roles falló'
  local huella_despues
  huella_despues="$(q -c "$SQL_HUELLA_ROLES")" || fallo 'no se pudo volver a leer la huella de roles'
  [ -s "$W/roles-huella.txt" ] || fallo 'falta la huella de roles del snapshot'
  [ "$huella_despues" = "$(cat "$W/roles-huella.txt")" ] ||
    fallo 'los roles o sus pertenencias cambiaron mientras se sacaba la copia: roles.sql no cuadraría con el inventario. Repite la copia'
  log 'roles.sql coincide con el inventario del snapshot (misma huella antes y después)'
  [ -e "$W/storage-objetos.jsonl" ] || : >"$W/storage-objetos.jsonl"

  # 7. Comprobaciones antes de empaquetar.
  pg_restore --list "$W/datos.dump" >"$W/datos.toc.txt" || fallo 'el dump recién hecho no se puede listar'
  [ -s "$W/conteos.tsv" ] || fallo 'conteos.tsv salió vacío'
  [ -s "$W/roles.sql" ] || fallo 'roles.sql salió vacío'
  local tablas filas con_datos
  tablas="$(wc -l <"$W/conteos.tsv")"
  filas="$(awk -F'\t' '{ s += $3 } END { printf "%d", s }' "$W/conteos.tsv")"
  con_datos="$(grep -c ' TABLE DATA ' "$W/datos.toc.txt" || true)"
  [ "$filas" -gt 0 ] || fallo 'la copia no tiene ninguna fila: no sirve para restaurar'
  log "RESUMEN tablas=$tablas filas=$filas entradas_de_datos=$con_datos"

  rm -f "$W/.ctl" "$W/.sesion.out" "$W/.sesion.err" "$W/.esq.err"
  CONTRASENA=''
  find . -type f ! -name MANIFEST.sha256 | sort | xargs sha256sum >MANIFEST.sha256
  log "MANIFEST_SHA256=$(sha256sum <MANIFEST.sha256 | cut -c1-64)"
  tar -cf - -C "$W" . >&3
  log 'tar entregado'
}

verificar() {
  cd "$W"
  tar -xf - || fallo 'el tar no se pudo leer (¿clave equivocada o archivo dañado?)'
  [ -s MANIFEST.sha256 ] || fallo 'falta MANIFEST.sha256'
  sha256sum -c MANIFEST.sha256 >/dev/null || fallo 'algún archivo no coincide con el manifiesto'
  local f
  for f in datos.dump roles.sql esquema-completo.sql conteos.tsv datos.toc.txt partes.txt storage-objetos.jsonl roles-huella.txt; do
    grep -q " \./$f\$" MANIFEST.sha256 || fallo "el manifiesto no incluye $f"
  done
  local fuera
  fuera="$(find . -type f ! -name MANIFEST.sha256 | sort | while IFS= read -r f; do grep -qF " $f" MANIFEST.sha256 || echo "$f"; done)"
  [ -z "$fuera" ] || fallo 'hay archivos dentro del tar que el manifiesto no lista'
  pg_restore --list datos.dump >/dev/null || fallo 'pg_restore no puede listar datos.dump'
  # Recorre el dump entero (descomprime cada bloque de datos) sin escribir en ninguna base.
  pg_restore --file=/dev/null datos.dump || fallo 'pg_restore no puede leer datos.dump entero'
  local tablas filas con_datos
  tablas="$(wc -l <conteos.tsv)"
  filas="$(awk -F'\t' '{ s += $3 } END { printf "%d", s }' conteos.tsv)"
  con_datos="$(pg_restore --list datos.dump | grep -c ' TABLE DATA ' || true)"
  [ "$filas" -gt 0 ] || fallo 'los conteos dicen cero filas'
  log "RESUMEN tablas=$tablas filas=$filas entradas_de_datos=$con_datos"
  if [ "${TINDIVO_MOSTRAR_CONTEOS:-0}" = 1 ]; then
    log 'conteos por tabla (esquema, tabla, filas, suma):'
    awk -F'\t' '$1 ~ /^[a-z_][a-z0-9_]*$/ && $2 ~ /^[A-Za-z_][A-Za-z0-9_]*$/ && $3 ~ /^[0-9]+$/ && $4 ~ /^[0-9]+$/ { print "[contenedor]   " $1 "." $2 " " $3 " " $4 }' conteos.tsv >&2
  fi
  log "MANIFEST_SHA256=$(sha256sum <MANIFEST.sha256 | cut -c1-64)"
  log 'verificación del contenedor: OK'
}

# stdout queda reservado para el resultado (fd 3); todo stderr del modo pasa por el filtro.
case "$MODO" in
  filtrar) filtrar ;;
  copiar | verificar)
    exec 4>&1
    "$MODO" 3>&4 2>&1 4>&- | filtrar >&2 4>&-
    ;;
  *)
    printf '[contenedor] ERROR: modo desconocido\n' >&2
    exit 1
    ;;
esac
