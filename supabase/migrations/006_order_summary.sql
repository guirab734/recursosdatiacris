begin;

-- Cancelled orders leave the operational counters. Cancelling an order does
-- not refund a confirmed payment, so paid revenue keeps its existing meaning.
create or replace function public.commerce_order_summary() returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
   'total', count(*) filter(where fulfillment_status <> 'cancelled'),
   'paid_cents', coalesce(sum(total_cents) filter(where payment_status='paid'),0),
   'pending', count(*) filter(where fulfillment_status <> 'cancelled' and payment_status in ('pending','creating')),
   'to_post', count(*) filter(where payment_status='paid' and fulfillment_status in ('preparing','freight_pending','ready_to_post','local_contact')),
   'posted', count(*) filter(where fulfillment_status='posted'),
   'delivered', count(*) filter(where fulfillment_status='delivered'),
   'attention', count(*) filter(where fulfillment_status <> 'cancelled' and (needs_review or fulfillment_status='attention'))
 ) from public.orders;
$$;
revoke all on function public.commerce_order_summary() from public,anon,authenticated;
grant execute on function public.commerce_order_summary() to service_role;

notify pgrst, 'reload schema';
commit;
