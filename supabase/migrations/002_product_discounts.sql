begin;

-- price_cents remains the original price. Existing products have no discount.
alter table public.products
  add column sale_price_cents integer,
  add constraint products_sale_price_valid check (
    sale_price_cents is null or
    (sale_price_cents > 0 and sale_price_cents < price_cents)
  );

-- Both advertised prices are public, subject to the existing active-product RLS.
grant select(sale_price_cents) on public.products to anon;

-- Preserve admin validation, RLS and the atomic product/media transaction.
create or replace function public.save_product(payload jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare product_uuid uuid; media_item jsonb;
begin
  if not public.is_admin() then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  product_uuid=coalesce((payload->>'id')::uuid,gen_random_uuid());
  if jsonb_array_length(payload->'media') > 20 then
    raise exception 'Too many media';
  end if;
  if (payload->>'active')::boolean and not exists(
    select 1 from jsonb_array_elements(payload->'media') item
    where item->>'type'='image'
  ) then
    raise exception 'Cover required';
  end if;

  insert into public.products(
    id,slug,name,description,price_cents,sale_price_cents,
    category,stock,active,badge,skills
  ) values (
    product_uuid,payload->>'slug',payload->>'name',payload->>'description',
    (payload->>'price_cents')::integer,(payload->>'sale_price_cents')::integer,
    payload->>'category',coalesce((payload->>'stock')::integer,0),
    (payload->>'active')::boolean,payload->>'badge',
    array(select jsonb_array_elements_text(payload->'skills'))
  )
  on conflict(id) do update set
    slug=excluded.slug,name=excluded.name,description=excluded.description,
    price_cents=excluded.price_cents,sale_price_cents=excluded.sale_price_cents,
    category=excluded.category,active=excluded.active,
    badge=excluded.badge,skills=excluded.skills;

  delete from public.product_media where product_id=product_uuid;
  for media_item in select value from jsonb_array_elements(payload->'media') loop
    insert into public.product_media(id,product_id,type,url,position)
    values(
      (media_item->>'id')::uuid,product_uuid,media_item->>'type',
      media_item->>'url',(media_item->>'position')::integer
    );
  end loop;
  return product_uuid;
end; $$;

revoke all on function public.save_product(jsonb) from public,anon;
grant execute on function public.save_product(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
