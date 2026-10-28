CREATE OR REPLACE FUNCTION public.delete_record(_kind text, _id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
declare v_mv record; v_sale record; v_pur record;
begin
  if auth.uid() is null or not (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager')) then
    raise exception 'Only Admins and Managers can delete records';
  end if;

  if _kind = 'product' then
    if exists (select 1 from sale_items where product_id=_id) or exists (select 1 from purchase_items where product_id=_id)
       or exists (select 1 from sales_return_items where product_id=_id) then
      raise exception 'This product appears in sales, purchases or returns. Delete those first, or mark the product inactive instead.';
    end if;
    delete from stock_take_items where product_id=_id;
    delete from stock_movements where product_id=_id;
    delete from products where id=_id;
  elsif _kind = 'category' then
    update products set category_id=null where category_id=_id;
    delete from categories where id=_id;
  elsif _kind = 'supplier' then
    update products set supplier_id=null where supplier_id=_id;
    update purchases set supplier_id=null where supplier_id=_id;
    update payments set supplier_id=null where supplier_id=_id;
    delete from suppliers where id=_id;
  elsif _kind = 'customer' then
    update sales set customer_id=null where customer_id=_id;
    update sales_returns set customer_id=null where customer_id=_id;
    update payments set customer_id=null where customer_id=_id;
    delete from customers where id=_id;
  elsif _kind = 'expense' then
    delete from expenses where id=_id;
  elsif _kind = 'sale' then
    select * into v_sale from sales where id=_id;
    if not found then raise exception 'Sale not found'; end if;
    for v_mv in select * from stock_movements where reference_type='sale' and reference_id=_id loop
      update products set stock_qty = stock_qty - v_mv.quantity where id=v_mv.product_id;
    end loop;
    delete from stock_movements where reference_type='sale' and reference_id=_id;
    if v_sale.customer_id is not null and v_sale.balance_due > 0 then
      update customers set balance = balance - v_sale.balance_due where id=v_sale.customer_id;
    end if;
    update sales_returns set sale_id=null where sale_id=_id;
    delete from payments where sale_id=_id;
    delete from sale_items where sale_id=_id;
    delete from sales where id=_id;
  elsif _kind = 'purchase' then
    select * into v_pur from purchases where id=_id;
    if not found then raise exception 'Purchase not found'; end if;
    for v_mv in select * from stock_movements where reference_type='purchase' and reference_id=_id loop
      update products set stock_qty = stock_qty - v_mv.quantity where id=v_mv.product_id;
    end loop;
    delete from stock_movements where reference_type='purchase' and reference_id=_id;
    if v_pur.supplier_id is not null and v_pur.total > v_pur.amount_paid then
      update suppliers set balance = balance - (v_pur.total - v_pur.amount_paid) where id=v_pur.supplier_id;
    end if;
    delete from payments where purchase_id=_id;
    delete from purchase_items where purchase_id=_id;
    delete from purchases where id=_id;
  else
    raise exception 'Unknown record type %', _kind;
  end if;

  insert into audit_log (user_id, action, entity, entity_id, details)
  values (auth.uid(), _kind || '.delete', _kind, _id::text, '{}'::jsonb);
end;
$fn$;

CREATE OR REPLACE FUNCTION public.reset_all_data()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
begin
  if auth.uid() is null or not (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager')) then
    raise exception 'Only Admins and Managers can reset data';
  end if;
  delete from report_insights where true;
  delete from report_snapshots where true;
  delete from stock_take_items where true;
  delete from stock_take_sessions where true;
  delete from sales_return_items where true;
  delete from sales_returns where true;
  delete from payments where true;
  delete from sale_items where true;
  delete from sales where true;
  delete from purchase_items where true;
  delete from purchases where true;
  delete from stock_movements where true;
  delete from expenses where true;
  delete from products where true;
  delete from categories where true;
  delete from customers where true;
  delete from suppliers where true;
  insert into audit_log (user_id, action, entity, details)
  values (auth.uid(), 'data.reset', 'all', '{}'::jsonb);
end;
$fn$;

REVOKE EXECUTE ON FUNCTION public.delete_record(text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reset_all_data() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.delete_record(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_all_data() TO authenticated, service_role;