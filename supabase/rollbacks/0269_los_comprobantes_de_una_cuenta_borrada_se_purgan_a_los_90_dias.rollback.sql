-- ROLLBACK de la 0269 · quita la purga de comprobantes de cuentas borradas
--
-- OJO: BORRA la columna `users.proofs_purged_at` (se pierde qué cuentas ya se purgaron) y la
-- clave `app_settings.account_deletion`. Los archivos y referencias ya purgados NO se
-- recuperan. Restaura `orders_proof_immutable` tal como estaba antes de la 0269.

drop function if exists public.finish_proof_purge(uuid);
drop function if exists public.list_user_proof_objects(uuid);
drop function if exists public.list_proof_purge_due(integer);

create or replace function public.orders_proof_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.comprobante_prepago_url is not null
     and new.comprobante_prepago_url is distinct from old.comprobante_prepago_url
     and new.proof_attempt <= old.proof_attempt then
    raise exception 'El comprobante registrado no se puede cambiar'
      using errcode = 'P0001', hint = 'proof_immutable';
  end if;
  return new;
end;
$$;

delete from public.app_settings where key = 'account_deletion';
alter table public.users drop column if exists proofs_purged_at;

do $check$
begin
  if exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
              where s.nspname = 'public'
                and p.proname in ('list_proof_purge_due', 'list_user_proof_objects', 'finish_proof_purge'))
     or exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'users'
                   and column_name = 'proofs_purged_at') then
    raise exception 'rollback 0269 abortado: quedan objetos de la 0269';
  end if;
end
$check$;
