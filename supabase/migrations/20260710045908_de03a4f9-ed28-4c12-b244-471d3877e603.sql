
-- =========================
-- CUSTOMER RETURNS
-- =========================
create table public.sales_returns (
  id uuid primary key default gen_random_uuid(),
  return_no text not null unique,
  sale_id uuid references public.sales(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  return_date timestamptz not null default now(),
  subtotal numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  refund_method payment_method not null default 'cash',
  refund_amount numeric(14,2) not null default 0,
  restock boolean not null default true,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sales_returns(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  unit_cost numeric(14,2) not null default 0,
  line_total numeric(14,2) not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.sales_returns to authenticated;
grant all on public.sales_returns to service_role;
grant select, insert, update, delete on public.sales_return_items to authenticated;
grant all on public.sales_return_items to service_role;

alter table public.sales_returns enable row level security;
alter table public.sales_return_items enable row level security;

create policy "staff read returns" on public.sales_returns for select to authenticated
  using (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'cashier') or has_role(auth.uid(),'accountant'));
create policy "staff write returns" on public.sales_returns for all to authenticated
  using (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'cashier'))
  with check (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'cashier'));

create policy "staff read return items" on public.sales_return_items for select to authenticated
  using (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'cashier') or has_role(auth.uid(),'accountant'));
create policy "staff write return items" on public.sales_return_items for all to authenticated
  using (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'cashier'))
  with check (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'cashier'));

create trigger tg_sales_returns_updated before update on public.sales_returns
  for each row execute function public.tg_set_updated_at();

-- =========================
-- STOCK TAKE SESSIONS
-- =========================
create type stock_take_status as enum ('draft','counting','submitted','approved','cancelled');

create table public.stock_take_sessions (
  id uuid primary key default gen_random_uuid(),
  session_no text not null unique,
  name text,
  status stock_take_status not null default 'draft',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stock_take_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.stock_take_sessions(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  unit text,
  system_qty numeric(14,3) not null default 0,
  counted_qty numeric(14,3),
  variance numeric(14,3) generated always as (coalesce(counted_qty,0) - system_qty) stored,
  unit_cost numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(session_id, product_id)
);

grant select, insert, update, delete on public.stock_take_sessions to authenticated;
grant all on public.stock_take_sessions to service_role;
grant select, insert, update, delete on public.stock_take_items to authenticated;
grant all on public.stock_take_items to service_role;

alter table public.stock_take_sessions enable row level security;
alter table public.stock_take_items enable row level security;

create policy "staff read stocktake" on public.stock_take_sessions for select to authenticated
  using (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'storekeeper') or has_role(auth.uid(),'accountant'));
create policy "staff write stocktake" on public.stock_take_sessions for all to authenticated
  using (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'storekeeper'))
  with check (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'storekeeper'));

create policy "staff read stocktake items" on public.stock_take_items for select to authenticated
  using (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'storekeeper') or has_role(auth.uid(),'accountant'));
create policy "staff write stocktake items" on public.stock_take_items for all to authenticated
  using (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'storekeeper'))
  with check (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'storekeeper'));

create trigger tg_stock_take_sessions_updated before update on public.stock_take_sessions
  for each row execute function public.tg_set_updated_at();

-- =========================
-- FUNCTIONS
-- =========================

-- process_sales_return
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
      values (v_prod.id, 'return', v_qty, v_prod.buying_price, 'sales_return', v_id, 'Customer return', auth.uid());
    end if;
  end loop;

  v_total := v_subtotal + v_tax;
  update public.sales_returns set subtotal = v_subtotal, total = v_total where id = v_id;

  -- Adjust customer balance: refund reduces balance (if credit), or if refund_amount < total, remainder becomes store credit (negative balance)
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

-- start_stock_take: seeds a session with all active products' current qty
create or replace function public.start_stock_take(_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_no text;
begin
  if not (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'storekeeper')) then
    raise exception 'Forbidden';
  end if;
  v_no := 'ST-' || to_char(now(),'YYMMDDHH24MISS');
  insert into public.stock_take_sessions (id, session_no, name, status, created_by)
  values (v_id, v_no, coalesce(_name, 'Stock take ' || to_char(now(),'YYYY-MM-DD')), 'counting', auth.uid());

  insert into public.stock_take_items (session_id, product_id, product_name, unit, system_qty, unit_cost)
  select v_id, p.id, p.name, p.unit, p.stock_qty, p.buying_price
  from public.products p where p.is_active;

  return v_id;
end;
$$;

-- approve_stock_take: applies variances as stock adjustments
create or replace function public.approve_stock_take(_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  if not (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager')) then
    raise exception 'Forbidden'; end if;

  for v_item in
    select * from public.stock_take_items
    where session_id = _session_id and counted_qty is not null and (counted_qty - system_qty) <> 0
  loop
    insert into public.stock_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by)
    values (v_item.product_id, 'adjustment', v_item.variance, v_item.unit_cost, 'stock_take', _session_id,
      'Stock take variance', auth.uid());
  end loop;

  update public.stock_take_sessions
    set status='approved', approved_at=now(), approved_by=auth.uid()
    where id=_session_id;

  insert into public.audit_log (user_id, action, entity, entity_id, details)
  values (auth.uid(), 'stock_take.approve', 'stock_take_sessions', _session_id::text, '{}'::jsonb);
end;
$$;

-- P&L report
create or replace function public.pnl_report(_from date, _to date)
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  with s as (
    select coalesce(sum(subtotal),0) as revenue,
           coalesce(sum(tax),0) as sales_tax,
           coalesce(sum(cogs),0) as cogs,
           coalesce(sum(profit),0) as gross_profit,
           coalesce(sum(discount),0) as discounts
    from public.sales
    where status='completed' and sale_date::date between _from and _to
  ),
  r as (
    select coalesce(sum(subtotal),0) as returns_amt,
           coalesce(sum(tax),0) as returns_tax
    from public.sales_returns
    where return_date::date between _from and _to
  ),
  e as (
    select coalesce(sum(amount),0) as expenses
    from public.expenses
    where expense_date between _from and _to
  )
  select jsonb_build_object(
    'from', _from, 'to', _to,
    'revenue', s.revenue - r.returns_amt,
    'discounts', s.discounts,
    'cogs', s.cogs,
    'gross_profit', s.gross_profit - r.returns_amt,
    'expenses', e.expenses,
    'net_profit', (s.gross_profit - r.returns_amt) - e.expenses,
    'sales_tax_collected', s.sales_tax - r.returns_tax
  ) from s, r, e;
$$;

-- VAT report
create or replace function public.vat_report(_from date, _to date)
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  with s as (
    select coalesce(sum(subtotal),0) as net_sales,
           coalesce(sum(tax),0) as output_vat
    from public.sales
    where status='completed' and sale_date::date between _from and _to
  ),
  r as (
    select coalesce(sum(subtotal),0) as net_returns,
           coalesce(sum(tax),0) as output_vat_returns
    from public.sales_returns
    where return_date::date between _from and _to
  ),
  p as (
    select coalesce(sum(subtotal),0) as net_purchases,
           coalesce(sum(tax),0) as input_vat
    from public.purchases
    where purchase_date between _from and _to
  )
  select jsonb_build_object(
    'from', _from, 'to', _to,
    'net_sales', s.net_sales - r.net_returns,
    'output_vat', s.output_vat - r.output_vat_returns,
    'net_purchases', p.net_purchases,
    'input_vat', p.input_vat,
    'vat_payable', (s.output_vat - r.output_vat_returns) - p.input_vat
  ) from s, r, p;
$$;
