-- Supabase hosts the scheduler. The Next.js endpoint runs the durable order queue.
-- Configure the secret after deploying the endpoint, using the service-only RPC.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create or replace function public.commerce_dispatch_jobs() returns bigint
language plpgsql security definer set search_path = '' as $$
declare job_secret text; request_id bigint;
begin
  select decrypted_secret into job_secret from vault.decrypted_secrets where name='tia_cris_commerce_cron';
  if job_secret is null then raise exception 'Commerce scheduler is not configured'; end if;
  select net.http_get(
    url := 'https://www.recursosdatiacris.com.br/api/jobs/orders',
    headers := jsonb_build_object('Authorization','Bearer ' || job_secret),
    timeout_milliseconds := 190000
  ) into request_id;
  return request_id;
end;
$$;

create or replace function public.commerce_configure_cron(cron_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare secret_id uuid;
begin
  if cron_secret !~ '^[a-f0-9]{64}$' then raise exception 'Invalid scheduler secret'; end if;
  select id into secret_id from vault.secrets where name='tia_cris_commerce_cron';
  if secret_id is null then
    perform vault.create_secret(cron_secret,'tia_cris_commerce_cron','Authentication for the private order queue endpoint');
  else
    perform vault.update_secret(secret_id,cron_secret);
  end if;
  perform cron.schedule('tia-cris-orders','*/5 * * * *','select public.commerce_dispatch_jobs();');
end;
$$;

create or replace function public.commerce_scheduler_status() returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
   'configured',exists(select 1 from vault.secrets where name='tia_cris_commerce_cron'),
   'active',coalesce((select active from cron.job where jobname='tia-cris-orders'),false),
   'schedule',(select schedule from cron.job where jobname='tia-cris-orders'),
   'pending_jobs',(select count(*) from public.order_jobs where not done),
   'last_run',(select max(start_time) from cron.job_run_details where jobid=(select jobid from cron.job where jobname='tia-cris-orders'))
 );
$$;
revoke all on function public.commerce_dispatch_jobs(), public.commerce_configure_cron(text), public.commerce_scheduler_status() from public,anon,authenticated;
grant execute on function public.commerce_dispatch_jobs(), public.commerce_configure_cron(text), public.commerce_scheduler_status() to service_role;
notify pgrst, 'reload schema';
commit;
