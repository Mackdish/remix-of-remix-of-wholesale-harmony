
create or replace function public.process_sales_return(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_no text;
  v_item jsonb;
  v_prod record;
  v_subtotal numeric(14,2) := 0;
  v_tax numeric(14,2) := coalesce((payload->>'tax')::numeric,0);
  v_line numeric(14,2);
  v_qty numeric(14,3);
  v_price numeric(14,2);
  v_customer uuid := nullif(payload->>'customer_id','')::uuid;
  v_sale uuid := nullif(payload->>'sale_id','')::uuid;
  v_method payment_method := coalesce((payload->>'refund_method')::payment_method,'cash');
  v_refund numeric(14,2) := coalesce((payload->>'refund_amount')::numeric,0);
  v_restock boolean := coalesce((payload->>'restock')::boolean, true);
  v_total numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'cashier')) then
    raise exception 'Forbidden';
  end if;

  v_no := 'RT-' || to_char(now(),'YYMMDDHH24MISS') || '-' || substr(v_id::text,1,4);

  insert into public.sales_returns (id, return_no, sale_id, customer_id, subtotal, tax, total, refund_method, refund_amount, restock, notes, created_by)
  values (v_id, v_no, v_sale, v_customer, 0, v_tax, 0, v_method, v_refund, v_restock, payload->>'notes', auth.uid());

  for v_item in select * from jsonb_array_elements(payload->'items') loop
    select id, name, buying_price into v_prod from public.products where id = (v_item->>'product_id')::uuid for update;
    if not found then raise exception 'Product not found'; end if;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    v_line := v_qty * v_price;
    v_subtotal := v_subtotal + v_line;

    insert into public.sales_return_items (return_id, product_id, product_name, quantity, unit_price, unit_cost, line_total)
    values (v_id, v_prod.id, v_prod.name, v_qty, v_price, v_prod.buying_price, v_line);

    if v_restock then
      insert into public.stock_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by)
      values (v_prod.id, 'return_in', v_qty, v_prod.buying_price, 'sales_return', v_id, 'Customer return', auth.uid());
    end if;
  end loop;

  v_total := v_subtotal + v_tax;
  update public.sales_returns set subtotal = v_subtotal, total = v_total where id = v_id;

  if v_customer is not null then
    update public.customers set balance = balance - v_total + v_refund where id = v_customer;
  end if;

  if v_refund > 0 then
    insert into public.payments (kind, customer_id, sale_id, amount, method, notes, created_by)
    values ('refund', v_customer, v_sale, -v_refund, v_method, 'Return refund ' || v_no, auth.uid());
  end if;

  insert into public.audit_log (user_id, action, entity, entity_id, details)
  values (auth.uid(), 'return.create', 'sales_returns', v_id::text, jsonb_build_object('no', v_no, 'total', v_total));

  return v_id;
end;
$$;
