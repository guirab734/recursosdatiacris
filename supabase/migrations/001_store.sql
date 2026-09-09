begin;
create extension if not exists pgcrypto;

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create policy admins_read_self on public.admins for select to authenticated using (user_id = auth.uid());
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

create function public.is_admin() returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.admins where user_id = auth.uid()); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 120),
  name text not null check(length(name) between 2 and 150),
  description text not null check(length(description) between 10 and 5000),
  price_cents integer not null check(price_cents between 1 and 10000000),
  category text not null check(category in ('Alfabetização','Números e contagem','Estimulação cognitiva','Coordenação motora','Linguagem e associação','Cores e percepção','Jogos')),
  stock integer not null default 0 check(stock between 0 and 100000),
  active boolean not null default false,
  badge text check(badge in ('Escolha da Tia Cris','Novidade','Mais vendido')),
  skills text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_active_category on public.products(active, category);
alter table public.products enable row level security;
create policy products_public_active on public.products for select to anon using(active);
create policy products_admin_read on public.products for select to authenticated using(public.is_admin());
create policy products_admin_insert on public.products for insert to authenticated with check(public.is_admin());
create policy products_admin_update on public.products for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy products_admin_delete on public.products for delete to authenticated using(public.is_admin());
revoke all on public.products from anon, authenticated;
-- Public sale prices are visible; exact inventory is not granted to anon.
grant select(id,slug,name,description,price_cents,category,badge,skills,created_at,updated_at) on public.products to anon;
grant select,insert,update,delete on public.products to authenticated;

create function public.touch_product() returns trigger language plpgsql set search_path=public as $$ begin new.updated_at=now(); return new; end; $$;
create trigger products_updated before update on public.products for each row execute function public.touch_product();

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  type text not null check(type in ('image','video')),
  url text not null check(length(url) <= 1500 and url ~ '^https://'),
  position integer not null default 0 check(position between 0 and 19)
);
create index product_media_product on public.product_media(product_id,position);
create table public.media_cleanup(url text primary key,not_before timestamptz not null default now(),state text not null default 'pending' check(state in ('pending','deleting','deleted')));
alter table public.media_cleanup enable row level security;
revoke all on public.media_cleanup from anon,authenticated;
grant all on public.media_cleanup to service_role;
create function public.queue_removed_media() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.media_cleanup(url,not_before) values(old.url,now()) on conflict(url) do update set not_before=now();
  return old;
end; $$;
revoke all on function public.queue_removed_media() from public,anon,authenticated;
create trigger removed_media_cleanup before delete on public.product_media for each row execute function public.queue_removed_media();
create function public.guard_media_reuse() returns trigger language plpgsql security definer set search_path=public as $$
declare item_state text;
begin
  select state into item_state from public.media_cleanup where url=new.url for update;
  if item_state in ('deleting','deleted') then raise exception 'Media expired; upload the file again' using errcode='23514'; end if;
  return new;
end; $$;
revoke all on function public.guard_media_reuse() from public,anon,authenticated;
create trigger guard_media_reuse before insert or update on public.product_media for each row execute function public.guard_media_reuse();
create function public.claim_media_cleanup() returns table(url text) language plpgsql security definer set search_path=public as $$
declare candidate record;
begin
  for candidate in select m.url,m.state from public.media_cleanup m where m.state<>'deleted' and m.not_before<=now() order by m.not_before for update skip locked limit 50 loop
    if exists(select 1 from public.product_media pm where pm.url=candidate.url) then
      delete from public.media_cleanup m where m.url=candidate.url and m.state='pending';
    else
      update public.media_cleanup m set state='deleting',not_before=now()+interval '5 minutes' where m.url=candidate.url;
      url=candidate.url;return next;
    end if;
  end loop;
end; $$;
revoke all on function public.claim_media_cleanup() from public,anon,authenticated;
grant execute on function public.claim_media_cleanup() to service_role;
alter table public.product_media enable row level security;
create policy media_public_active on public.product_media for select to anon using(exists(select 1 from public.products where products.id = product_id));
create policy media_admin_read on public.product_media for select to authenticated using(public.is_admin());
create policy media_admin_insert on public.product_media for insert to authenticated with check(public.is_admin());
create policy media_admin_update on public.product_media for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy media_admin_delete on public.product_media for delete to authenticated using(public.is_admin());
revoke all on public.product_media from anon,authenticated;
grant select on public.product_media to anon;
grant select,insert,update,delete on public.product_media to authenticated;

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('view','cart_add','whatsapp')),
  product_ids uuid[] not null check(cardinality(product_ids) between 1 and 50),
  created_at timestamptz not null default now()
);
create index analytics_date on public.analytics_events(created_at);
alter table public.analytics_events enable row level security;
create policy analytics_admin_read on public.analytics_events for select to authenticated using(public.is_admin());
revoke all on public.analytics_events from anon,authenticated;
grant select on public.analytics_events to authenticated;

create table public.rate_limits (bucket text primary key, hits integer not null, expires_at timestamptz not null);
create index rate_limits_expiry on public.rate_limits(expires_at);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon,authenticated;
create function public.consume_rate_limit(bucket_key text,max_requests integer,window_seconds integer) returns boolean language plpgsql security definer set search_path=public as $$
declare current_hits integer;
begin
  if max_requests < 1 or window_seconds < 1 or window_seconds > 3600 then return false; end if;
  delete from public.rate_limits where expires_at < now();
  insert into public.rate_limits(bucket,hits,expires_at) values(bucket_key,1,now()+make_interval(secs=>window_seconds))
  on conflict(bucket) do update set hits=rate_limits.hits+1 returning hits into current_hits;
  return current_hits <= max_requests;
end; $$;
revoke all on function public.consume_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;

-- Product and its media are updated in one transaction. RLS also applies here.
create function public.save_product(payload jsonb) returns uuid language plpgsql security invoker set search_path=public as $$
declare product_uuid uuid; media_item jsonb;
begin
  if not public.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
  product_uuid=coalesce((payload->>'id')::uuid,gen_random_uuid());
  if jsonb_array_length(payload->'media') > 20 then raise exception 'Too many media'; end if;
  if (payload->>'active')::boolean and not exists(select 1 from jsonb_array_elements(payload->'media') item where item->>'type'='image') then raise exception 'Cover required'; end if;
  insert into public.products(id,slug,name,description,price_cents,category,stock,active,badge,skills)
  values(product_uuid,payload->>'slug',payload->>'name',payload->>'description',(payload->>'price_cents')::integer,payload->>'category',(payload->>'stock')::integer,(payload->>'active')::boolean,payload->>'badge',array(select jsonb_array_elements_text(payload->'skills')))
  on conflict(id) do update set slug=excluded.slug,name=excluded.name,description=excluded.description,price_cents=excluded.price_cents,category=excluded.category,stock=excluded.stock,active=excluded.active,badge=excluded.badge,skills=excluded.skills;
  delete from public.product_media where product_id=product_uuid;
  for media_item in select value from jsonb_array_elements(payload->'media') loop
    insert into public.product_media(id,product_id,type,url,position) values((media_item->>'id')::uuid,product_uuid,media_item->>'type',media_item->>'url',(media_item->>'position')::integer);
  end loop;
  return product_uuid;
end; $$;
revoke all on function public.save_product(jsonb) from public,anon;
grant execute on function public.save_product(jsonb) to authenticated;

create function public.admin_metrics() returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
  select jsonb_build_object(
    'total_products',(select count(*) from public.products),
    'active_products',(select count(*) from public.products where active),
    'views',(select count(*) from public.analytics_events where kind='view' and created_at>=now()-interval '30 days'),
    'cart_adds',(select count(*) from public.analytics_events where kind='cart_add' and created_at>=now()-interval '30 days'),
    'whatsapp_clicks',(select count(*) from public.analytics_events where kind='whatsapp' and created_at>=now()-interval '30 days'),
    'low_stock',coalesce((select jsonb_agg(x) from (select id,name,stock from public.products where active and stock<=5 order by stock,name) x),'[]'::jsonb),
    'popular',coalesce((select jsonb_agg(x) from (select p.id,p.name,count(*) filter(where e.kind='view') as views,count(*) filter(where e.kind='cart_add') as clicks from public.products p join public.analytics_events e on p.id=any(e.product_ids) where e.created_at>=now()-interval '30 days' group by p.id,p.name order by count(*) desc limit 6) x),'[]'::jsonb),
    'daily',coalesce((select jsonb_agg(x) from (select to_char(d.day,'YYYY-MM-DD') as date,count(e.id) as clicks from generate_series(current_date-13,current_date,interval '1 day') d(day) left join public.analytics_events e on e.created_at::date=d.day::date and e.kind='whatsapp' group by d.day order by d.day) x),'[]'::jsonb)
  ) into result;
  return result;
end; $$;
revoke all on function public.admin_metrics() from public,anon;
grant execute on function public.admin_metrics() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('products-media','products-media',true,20971520,array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Public catalog media only. No personal files or delivery addresses in this bucket.
create policy product_files_admin_insert on storage.objects for insert to authenticated with check(bucket_id='products-media' and public.is_admin());
create policy product_files_admin_update on storage.objects for update to authenticated using(bucket_id='products-media' and public.is_admin()) with check(bucket_id='products-media' and public.is_admin());
create policy product_files_admin_delete on storage.objects for delete to authenticated using(bucket_id='products-media' and public.is_admin());
create policy product_files_admin_select on storage.objects for select to authenticated using(bucket_id='products-media' and public.is_admin());
grant all on public.products,public.product_media,public.admins,public.analytics_events,public.rate_limits to service_role;
commit;
