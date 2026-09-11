begin;

create table if not exists public.shipping_quotes (
  id uuid primary key,
  guest_hash text not null,
  fingerprint text not null,
  snapshot jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists public.orders (
  id uuid primary key,
  number bigint generated always as identity unique,
  guest_hash text not null,
  owner_id uuid references auth.users(id) on delete set null,
  customer_email text not null,
  idempotency_key uuid not null,
  quote_id uuid unique references public.shipping_quotes(id),
  request_hash text not null,
  address jsonb not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  subtotal_cents integer not null check(subtotal_cents > 0),
  shipping_cents integer not null check(shipping_cents >= 0),
  total_cents integer not null check(total_cents = subtotal_cents + shipping_cents),
  local boolean not null,
  shipping jsonb,
  shipping_raw jsonb,
  payment_method text not null check(payment_method in ('pix','card','whatsapp')),
  payment_status text not null default 'pending' check(payment_status in ('pending','creating','paid','failed','expired','refunded','review')),
  fulfillment_status text not null default 'awaiting_payment' check(fulfillment_status in ('awaiting_payment','local_contact','preparing','freight_pending','ready_to_post','posted','delivered','cancelled','attention')),
  payment_provider_id text unique,
  payment_started_at timestamptz,
  payment_checked_at timestamptz,
  pix jsonb,
  shipping_provider_id text unique,
  shipping_started_at timestamptz,
  shipping_request jsonb,
  fiscal_document jsonb,
  label_url text,
  tracking_code text,
  tracking_url text,
  tracking_events jsonb not null default '[]',
  tracking_updated_at timestamptz,
  notes text not null default '',
  last_error text,
  needs_review boolean not null default false,
  paid_at timestamptz,
  posted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(guest_hash, idempotency_key)
);
create index if not exists orders_customer_email_idx on public.orders(customer_email, created_at desc);
create index if not exists orders_guest_idx on public.orders(guest_hash, created_at desc);
create index if not exists orders_fulfillment_idx on public.orders(fulfillment_status, created_at desc);
create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id),
  kind text not null,
  message text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.order_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  kind text not null check(kind in ('payment_sync','shipping_prepare','shipping_sync')),
  run_at timestamptz not null default now(),
  locked_until timestamptz,
  lock_token uuid,
  attempts integer not null default 0,
  done boolean not null default false,
  last_error text,
  unique(order_id,kind)
);
create index if not exists order_jobs_due_idx on public.order_jobs(run_at) where not done;

create or replace function public.commerce_schedule_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.payment_method = 'pix' then
    insert into public.order_jobs(order_id,kind) values(new.id,'payment_sync');
  end if;
  return new;
end;
$$;
drop trigger if exists commerce_schedule_payment on public.orders;
create trigger commerce_schedule_payment after insert on public.orders
for each row execute function public.commerce_schedule_payment();

create or replace function public.commerce_schedule_shipping() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.payment_status = 'paid' and not new.local and new.fulfillment_status <> 'cancelled' then
    insert into public.order_jobs(order_id,kind)
      values(new.id,case when new.shipping_provider_id is null then 'shipping_prepare' else 'shipping_sync' end)
      on conflict(order_id,kind) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists commerce_schedule_shipping on public.orders;
create trigger commerce_schedule_shipping after update of payment_status,shipping_provider_id on public.orders
for each row execute function public.commerce_schedule_shipping();

alter table public.shipping_quotes enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;
alter table public.order_jobs enable row level security;
-- All customer data and all mutations pass through authenticated server routes.
-- Even authenticated customers cannot query the order tables directly.
revoke all on public.shipping_quotes, public.orders, public.order_events, public.order_jobs from anon, authenticated;
grant all on public.shipping_quotes, public.orders, public.order_events, public.order_jobs to service_role;
grant usage,select on sequence public.orders_number_seq, public.order_events_id_seq to service_role;

create or replace function public.commerce_touch_order() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists commerce_touch_order on public.orders;
create trigger commerce_touch_order before update on public.orders
for each row execute function public.commerce_touch_order();

create or replace function public.confirm_order_payment(order_uuid uuid, provider_id text, paid_cents integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_order public.orders;
begin
  select * into current_order from public.orders where id = order_uuid for update;
  if not found or current_order.payment_method <> 'pix'
    or current_order.payment_provider_id is distinct from provider_id
    or current_order.total_cents <> paid_cents then
    raise exception 'payment_mismatch';
  end if;
  if current_order.payment_status = 'paid' then return false; end if;
  if current_order.payment_status = 'refunded' then raise exception 'payment_already_refunded'; end if;
  update public.orders set payment_status = 'paid', paid_at = now(), payment_checked_at = now(),
    fulfillment_status = case when fulfillment_status = 'cancelled' then 'attention'
       when local then 'local_contact' else 'preparing' end,
    needs_review = fulfillment_status = 'cancelled',
    last_error = case when fulfillment_status = 'cancelled' then 'Pagamento recebido após cancelamento. Conferir antes de enviar.' else null end
    where id = order_uuid;
  insert into public.order_events(order_id, kind, message) values(order_uuid, 'payment', 'Pix confirmado pela provedora.');
  if not current_order.local and current_order.fulfillment_status <> 'cancelled' then
    insert into public.order_jobs(order_id,kind) values(order_uuid,'shipping_prepare')
      on conflict(order_id,kind) do update set done=false,run_at=now();
  end if;
  return true;
end;
$$;
create or replace function public.claim_order_jobs(batch_size integer default 10)
returns setof public.order_jobs language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select id from public.order_jobs where not done and run_at <= now()
      and (locked_until is null or locked_until < now())
      order by run_at limit least(greatest(batch_size,1),20) for update skip locked
  )
  update public.order_jobs j set locked_until=now()+interval '5 minutes', lock_token=gen_random_uuid(), attempts=j.attempts+1
    from due where j.id=due.id returning j.*;
end;
$$;
revoke all on function public.commerce_touch_order() from public,anon,authenticated;
revoke all on function public.commerce_schedule_payment() from public,anon,authenticated;
revoke all on function public.commerce_schedule_shipping() from public,anon,authenticated;
revoke all on function public.confirm_order_payment(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.claim_order_jobs(integer) from public,anon,authenticated;
grant execute on function public.confirm_order_payment(uuid,text,integer), public.claim_order_jobs(integer) to service_role;

create or replace function public.commerce_order_summary() returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
   'total', count(*),
   'paid_cents', coalesce(sum(total_cents) filter(where payment_status='paid'),0),
   'pending',count(*) filter(where payment_status in ('pending','creating')),
   'to_post',count(*) filter(where payment_status='paid' and fulfillment_status in ('preparing','freight_pending','ready_to_post','local_contact')),
   'posted',count(*) filter(where fulfillment_status='posted'),
   'delivered',count(*) filter(where fulfillment_status='delivered'),
   'attention',count(*) filter(where needs_review or fulfillment_status='attention')
 ) from public.orders;
$$;
revoke all on function public.commerce_order_summary() from public,anon,authenticated;
grant execute on function public.commerce_order_summary() to service_role;

notify pgrst, 'reload schema';
commit;
