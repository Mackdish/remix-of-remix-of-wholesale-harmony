alter table public.sales_returns add column if not exists reason text;

create or replace function public.process_sales_return(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_no text; v_item jsonb; v_prod record;
  v_subtotal numeric(14,2) := 0;
  v_tax numeric(14,2) := coalesce((payload->>'tax')::numeric,0);
  v_line numeric(14,2); v_qty numeric(14,3); v_price numeric(14,2);
  v_customer uuid := nullif(payload->>'customer_id','')::uuid;
  v_sale uuid := nullif(payload->>'sale_id','')::uuid;
  v_method payment_method := coalesce((payload->>'refund_method')::payment_method,'cash');
  v_refund numeric(14,2) := coalesce((payload->>'refund_amount')::numeric,0);
  v_restock boolean := coalesce((payload->>'restock')::boolean, true);
  v_reason text := nullif(trim(payload->>'reason'),'');
  v_notes text := nullif(trim(payload->>'notes'),'');
  v_total numeric(14,2);
  v_mv_note text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'cashier')) then
    raise exception 'Forbidden';
  end if;
  v_no := 'RT-' || to_char(now(),'YYMMDDHH24MISS') || '-' || substr(v_id::text,1,4);
  v_mv_note := 'Customer return ' || v_no
    || coalesce(' | Reason: ' || v_reason, '')
    || coalesce(' | Notes: ' || v_notes, '');

  insert into public.sales_returns (id, return_no, sale_id, customer_id, subtotal, tax, total, refund_method, refund_amount, restock, reason, notes, created_by)
  values (v_id, v_no, v_sale, v_customer, 0, v_tax, 0, v_method, v_refund, v_restock, v_reason, v_notes, auth.uid());

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
      values (v_prod.id, 'return_in', v_qty, v_prod.buying_price, 'sales_return', v_id, v_mv_note, auth.uid());
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
  values (auth.uid(), 'return.create', 'sales_returns', v_id::text, jsonb_build_object('no', v_no, 'total', v_total, 'reason', v_reason));
  return v_id;
end;
$$;

create table if not exists public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_type text not null default 'daily',
  report_date date not null,
  data jsonb not null,
  generated_by text not null default 'schedule',
  created_at timestamptz not null default now(),
  unique (report_type, report_date)
);
grant select on public.report_snapshots to authenticated;
grant all on public.report_snapshots to service_role;
alter table public.report_snapshots enable row level security;
create policy "report snapshots read" on public.report_snapshots for select to authenticated
  using (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'accountant'));

create or replace function public.build_daily_report(_date date, _by text default 'schedule')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_data jsonb; v_id uuid;
begin
  select jsonb_build_object(
    'summary', (select jsonb_build_object(
        'count', count(*), 'revenue', coalesce(sum(total),0), 'tax', coalesce(sum(tax),0),
        'cogs', coalesce(sum(cogs),0), 'profit', coalesce(sum(profit),0), 'discount', coalesce(sum(discount),0))
      from sales where status='completed' and sale_date::date = _date),
    'returns', (select jsonb_build_object('count', count(*), 'total', coalesce(sum(total),0), 'refunded', coalesce(sum(refund_amount),0))
      from sales_returns where return_date::date = _date),
    'expenses', (select coalesce(sum(amount),0) from expenses where expense_date::date = _date),
    'by_method', (select coalesce(jsonb_agg(jsonb_build_object('method', payment_method, 'total', t)),'[]'::jsonb)
      from (select payment_method, sum(total) t from sales where status='completed' and sale_date::date=_date group by 1) m),
    'sales', (select coalesce(jsonb_agg(jsonb_build_object('receipt_no', s.receipt_no, 'time', to_char(s.sale_date,'HH24:MI'),
        'customer', coalesce(c.name,'Walk-in'), 'method', s.payment_method, 'total', s.total, 'profit', s.profit) order by s.sale_date),'[]'::jsonb)
      from sales s left join customers c on c.id = s.customer_id where s.status='completed' and s.sale_date::date=_date),
    'return_list', (select coalesce(jsonb_agg(jsonb_build_object('return_no', r.return_no, 'reason', coalesce(r.reason,''),
        'notes', coalesce(r.notes,''), 'total', r.total) order by r.return_date),'[]'::jsonb)
      from sales_returns r where r.return_date::date=_date)
  ) into v_data;

  insert into report_snapshots (report_type, report_date, data, generated_by)
  values ('daily', _date, v_data, _by)
  on conflict (report_type, report_date) do update set data = excluded.data, generated_by = excluded.generated_by, created_at = now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.build_daily_report(date, text) from public, anon, authenticated;

create or replace function public.generate_daily_report_now(_date date)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'accountant')) then
    raise exception 'Forbidden';
  end if;
  return build_daily_report(_date, 'manual');
end;
$$;
grant execute on function public.generate_daily_report_now(date) to authenticated;

create extension if not exists pg_cron;