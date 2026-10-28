
-- ============ ENUMS ============
create type public.app_role as enum ('admin','manager','cashier','storekeeper','accountant');
create type public.customer_type as enum ('wholesale','retail','cash','vip');
create type public.movement_type as enum ('purchase','sale','adjustment','return_in','return_out','transfer','damage','expiry','opening');
create type public.payment_method as enum ('cash','mpesa','bank','cheque','credit','mixed');
create type public.sale_status as enum ('completed','void','pending');

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ============ USER ROLES ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.current_user_roles()
returns setof app_role language sql stable security definer set search_path = public as $$
  select role from public.user_roles where user_id = auth.uid();
$$;

create policy "users read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin manage roles" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- ============ AUTO PROFILE + FIRST-USER ADMIN ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));

  select count(*) = 0 into is_first from public.user_roles;
  if is_first then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'cashier');
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============ UPDATED_AT TRIGGER ============
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ============ CATEGORIES ============
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "categories read" on public.categories for select to authenticated using (true);
create policy "categories write" on public.categories for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'storekeeper'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'storekeeper'));
create trigger tg_categories_updated before update on public.categories for each row execute function public.tg_set_updated_at();

-- ============ SUPPLIERS ============
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  tax_number text,
  bank_details text,
  balance numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.suppliers to authenticated;
grant all on public.suppliers to service_role;
alter table public.suppliers enable row level security;
create policy "suppliers read" on public.suppliers for select to authenticated using (true);
create policy "suppliers write" on public.suppliers for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'storekeeper') or public.has_role(auth.uid(),'accountant'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'storekeeper') or public.has_role(auth.uid(),'accountant'));
create trigger tg_suppliers_updated before update on public.suppliers for each row execute function public.tg_set_updated_at();

-- ============ CUSTOMERS ============
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_name text,
  phone text,
  email text,
  address text,
  type customer_type not null default 'retail',
  credit_limit numeric(14,2) not null default 0,
  balance numeric(14,2) not null default 0,
  discount_pct numeric(5,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;
create policy "customers read" on public.customers for select to authenticated using (true);
create policy "customers write" on public.customers for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'cashier') or public.has_role(auth.uid(),'accountant'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'cashier') or public.has_role(auth.uid(),'accountant'));
create trigger tg_customers_updated before update on public.customers for each row execute function public.tg_set_updated_at();

-- ============ PRODUCTS ============
create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  barcode text unique,
  name text not null,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  brand text,
  unit text not null default 'pcs',
  buying_price numeric(14,2) not null default 0,
  selling_price numeric(14,2) not null default 0,
  wholesale_price numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  min_stock numeric(14,3) not null default 0,
  max_stock numeric(14,3) not null default 0,
  stock_qty numeric(14,3) not null default 0,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_name_idx on public.products using gin (to_tsvector('simple', name));
create index products_code_idx on public.products (code);
create index products_barcode_idx on public.products (barcode);
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "products read" on public.products for select to authenticated using (true);
create policy "products write" on public.products for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'storekeeper'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'storekeeper'));
create trigger tg_products_updated before update on public.products for each row execute function public.tg_set_updated_at();

-- ============ STOCK MOVEMENTS ============
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  movement_type movement_type not null,
  quantity numeric(14,3) not null, -- signed: + adds stock, - removes
  unit_cost numeric(14,2) not null default 0,
  reference_type text, -- 'sale' | 'purchase' | 'adjustment' | 'return'
  reference_id uuid,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
grant select, insert on public.stock_movements to authenticated;
grant all on public.stock_movements to service_role;
alter table public.stock_movements enable row level security;
create policy "stock_movements read" on public.stock_movements for select to authenticated using (true);
create policy "stock_movements insert" on public.stock_movements for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'storekeeper') or public.has_role(auth.uid(),'cashier'));

create or replace function public.tg_stock_apply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.products set stock_qty = stock_qty + new.quantity where id = new.product_id;
  return new;
end;
$$;
create trigger tg_stock_movements_apply after insert on public.stock_movements
for each row execute function public.tg_stock_apply();

-- ============ PURCHASES ============
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_no text not null unique,
  supplier_id uuid references public.suppliers(id),
  invoice_no text,
  purchase_date date not null default current_date,
  subtotal numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  transport numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  payment_method payment_method not null default 'cash',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
grant select, insert, update on public.purchases to authenticated;
grant all on public.purchases to service_role;
alter table public.purchases enable row level security;
create policy "purchases read" on public.purchases for select to authenticated using (true);
create policy "purchases write" on public.purchases for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'storekeeper') or public.has_role(auth.uid(),'accountant'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'storekeeper') or public.has_role(auth.uid(),'accountant'));

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2) not null,
  line_total numeric(14,2) not null
);
grant select, insert on public.purchase_items to authenticated;
grant all on public.purchase_items to service_role;
alter table public.purchase_items enable row level security;
create policy "purchase_items read" on public.purchase_items for select to authenticated using (true);
create policy "purchase_items write" on public.purchase_items for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'storekeeper') or public.has_role(auth.uid(),'accountant'));

-- ============ SALES ============
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  customer_id uuid references public.customers(id),
  cashier_id uuid references auth.users(id),
  sale_date timestamptz not null default now(),
  subtotal numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  change_due numeric(14,2) not null default 0,
  balance_due numeric(14,2) not null default 0,
  cogs numeric(14,2) not null default 0,
  profit numeric(14,2) not null default 0,
  payment_method payment_method not null default 'cash',
  status sale_status not null default 'completed',
  notes text,
  created_at timestamptz not null default now()
);
create index sales_date_idx on public.sales (sale_date desc);
grant select, insert, update on public.sales to authenticated;
grant all on public.sales to service_role;
alter table public.sales enable row level security;
create policy "sales read" on public.sales for select to authenticated using (true);
create policy "sales insert" on public.sales for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'cashier'));
create policy "sales update" on public.sales for update to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  unit_cost numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  line_total numeric(14,2) not null
);
grant select, insert on public.sale_items to authenticated;
grant all on public.sale_items to service_role;
alter table public.sale_items enable row level security;
create policy "sale_items read" on public.sale_items for select to authenticated using (true);
create policy "sale_items insert" on public.sale_items for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'cashier'));

-- ============ PAYMENTS ============
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('customer','supplier')),
  customer_id uuid references public.customers(id),
  supplier_id uuid references public.suppliers(id),
  sale_id uuid references public.sales(id),
  purchase_id uuid references public.purchases(id),
  amount numeric(14,2) not null,
  method payment_method not null default 'cash',
  reference text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
grant select, insert on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "payments read" on public.payments for select to authenticated using (true);
create policy "payments insert" on public.payments for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'cashier') or public.has_role(auth.uid(),'accountant'));

-- ============ EXPENSES ============
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  description text,
  amount numeric(14,2) not null,
  expense_date date not null default current_date,
  payment_method payment_method not null default 'cash',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.expenses to authenticated;
grant all on public.expenses to service_role;
alter table public.expenses enable row level security;
create policy "expenses read" on public.expenses for select to authenticated using (true);
create policy "expenses write" on public.expenses for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'accountant'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'accountant'));

-- ============ SETTINGS ============
create table public.settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Wholesale Business',
  logo_url text,
  address text,
  phone text,
  email text,
  tax_number text,
  currency text not null default 'KES',
  tax_rate numeric(5,2) not null default 16,
  receipt_footer text default 'Thank you for your business!',
  updated_at timestamptz not null default now()
);
grant select on public.settings to authenticated;
grant update on public.settings to authenticated;
grant all on public.settings to service_role;
alter table public.settings enable row level security;
create policy "settings read" on public.settings for select to authenticated using (true);
create policy "settings write" on public.settings for update to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));
insert into public.settings (id) values (1) on conflict do nothing;

-- ============ AUDIT LOG ============
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  entity text,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
grant select, insert on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "audit read" on public.audit_log for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager'));
create policy "audit insert" on public.audit_log for insert to authenticated with check (true);

-- ============ PROCESS SALE RPC ============
create or replace function public.process_sale(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_sale_id uuid := gen_random_uuid();
  v_receipt text;
  v_item jsonb;
  v_subtotal numeric(14,2) := 0;
  v_tax numeric(14,2) := coalesce((payload->>'tax')::numeric,0);
  v_discount numeric(14,2) := coalesce((payload->>'discount')::numeric,0);
  v_total numeric(14,2);
  v_paid numeric(14,2) := coalesce((payload->>'amount_paid')::numeric,0);
  v_cogs numeric(14,2) := 0;
  v_product record;
  v_line_total numeric(14,2);
  v_customer_id uuid := nullif(payload->>'customer_id','')::uuid;
  v_method payment_method := coalesce((payload->>'payment_method')::payment_method,'cash');
  v_change numeric(14,2) := 0;
  v_balance numeric(14,2) := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'cashier')) then
    raise exception 'Forbidden';
  end if;

  v_receipt := 'R-' || to_char(now(),'YYMMDDHH24MISS') || '-' || substr(v_sale_id::text,1,4);

  -- items
  for v_item in select * from jsonb_array_elements(payload->'items') loop
    select id, name, selling_price, buying_price, stock_qty into v_product
      from public.products where id = (v_item->>'product_id')::uuid for update;
    if not found then raise exception 'Product not found'; end if;

    v_line_total := (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric
                    - coalesce((v_item->>'discount')::numeric,0);
    v_subtotal := v_subtotal + v_line_total;
    v_cogs := v_cogs + (v_item->>'quantity')::numeric * v_product.buying_price;
  end loop;

  v_total := v_subtotal + v_tax - v_discount;
  if v_method = 'credit' then
    v_balance := v_total - v_paid;
  else
    if v_paid > v_total then v_change := v_paid - v_total; else v_change := 0; end if;
    if v_paid < v_total and v_customer_id is not null then v_balance := v_total - v_paid; end if;
  end if;

  insert into public.sales (id, receipt_no, customer_id, cashier_id, subtotal, tax, discount, total, amount_paid, change_due, balance_due, cogs, profit, payment_method, notes)
  values (v_sale_id, v_receipt, v_customer_id, auth.uid(), v_subtotal, v_tax, v_discount, v_total, v_paid, v_change, v_balance, v_cogs, v_total - v_cogs, v_method, payload->>'notes');

  for v_item in select * from jsonb_array_elements(payload->'items') loop
    select id, name, buying_price into v_product from public.products where id = (v_item->>'product_id')::uuid;
    v_line_total := (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric - coalesce((v_item->>'discount')::numeric,0);
    insert into public.sale_items (sale_id, product_id, product_name, quantity, unit_price, unit_cost, discount, line_total)
    values (v_sale_id, v_product.id, v_product.name, (v_item->>'quantity')::numeric, (v_item->>'unit_price')::numeric, v_product.buying_price, coalesce((v_item->>'discount')::numeric,0), v_line_total);

    insert into public.stock_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
    values (v_product.id, 'sale', -(v_item->>'quantity')::numeric, v_product.buying_price, 'sale', v_sale_id, auth.uid());
  end loop;

  if v_customer_id is not null and v_balance > 0 then
    update public.customers set balance = balance + v_balance where id = v_customer_id;
  end if;

  if v_paid > 0 then
    insert into public.payments (kind, customer_id, sale_id, amount, method, created_by)
    values ('customer', v_customer_id, v_sale_id, v_paid, v_method, auth.uid());
  end if;

  insert into public.audit_log (user_id, action, entity, entity_id, details)
  values (auth.uid(), 'sale.create', 'sales', v_sale_id::text, jsonb_build_object('receipt', v_receipt, 'total', v_total));

  return v_sale_id;
end;
$$;
grant execute on function public.process_sale(jsonb) to authenticated;

-- ============ PROCESS PURCHASE RPC ============
create or replace function public.process_purchase(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_no text;
  v_item jsonb;
  v_subtotal numeric(14,2) := 0;
  v_line numeric(14,2);
  v_supplier uuid := nullif(payload->>'supplier_id','')::uuid;
  v_method payment_method := coalesce((payload->>'payment_method')::payment_method,'cash');
  v_paid numeric(14,2) := coalesce((payload->>'amount_paid')::numeric,0);
  v_tax numeric(14,2) := coalesce((payload->>'tax')::numeric,0);
  v_transport numeric(14,2) := coalesce((payload->>'transport')::numeric,0);
  v_discount numeric(14,2) := coalesce((payload->>'discount')::numeric,0);
  v_total numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not (has_role(auth.uid(),'admin') or has_role(auth.uid(),'manager') or has_role(auth.uid(),'storekeeper') or has_role(auth.uid(),'accountant')) then
    raise exception 'Forbidden';
  end if;

  v_no := 'P-' || to_char(now(),'YYMMDDHH24MISS') || '-' || substr(v_id::text,1,4);
  for v_item in select * from jsonb_array_elements(payload->'items') loop
    v_subtotal := v_subtotal + (v_item->>'quantity')::numeric * (v_item->>'unit_cost')::numeric;
  end loop;
  v_total := v_subtotal + v_tax + v_transport - v_discount;

  insert into public.purchases (id, purchase_no, supplier_id, invoice_no, purchase_date, subtotal, tax, transport, discount, total, amount_paid, payment_method, notes, created_by)
  values (v_id, v_no, v_supplier, payload->>'invoice_no', coalesce((payload->>'purchase_date')::date,current_date), v_subtotal, v_tax, v_transport, v_discount, v_total, v_paid, v_method, payload->>'notes', auth.uid());

  for v_item in select * from jsonb_array_elements(payload->'items') loop
    v_line := (v_item->>'quantity')::numeric * (v_item->>'unit_cost')::numeric;
    insert into public.purchase_items (purchase_id, product_id, quantity, unit_cost, line_total)
    values (v_id, (v_item->>'product_id')::uuid, (v_item->>'quantity')::numeric, (v_item->>'unit_cost')::numeric, v_line);

    insert into public.stock_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
    values ((v_item->>'product_id')::uuid, 'purchase', (v_item->>'quantity')::numeric, (v_item->>'unit_cost')::numeric, 'purchase', v_id, auth.uid());

    -- optionally update buying_price to latest
    update public.products set buying_price = (v_item->>'unit_cost')::numeric where id = (v_item->>'product_id')::uuid;
  end loop;

  if v_supplier is not null and v_total > v_paid then
    update public.suppliers set balance = balance + (v_total - v_paid) where id = v_supplier;
  end if;

  if v_paid > 0 then
    insert into public.payments (kind, supplier_id, purchase_id, amount, method, created_by)
    values ('supplier', v_supplier, v_id, v_paid, v_method, auth.uid());
  end if;

  insert into public.audit_log (user_id, action, entity, entity_id, details)
  values (auth.uid(), 'purchase.create', 'purchases', v_id::text, jsonb_build_object('no', v_no, 'total', v_total));

  return v_id;
end;
$$;
grant execute on function public.process_purchase(jsonb) to authenticated;

-- ============ DASHBOARD STATS RPC ============
create or replace function public.dashboard_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sales_today', coalesce((select sum(total) from sales where sale_date::date = current_date and status='completed'),0),
    'sales_week', coalesce((select sum(total) from sales where sale_date >= date_trunc('week', now()) and status='completed'),0),
    'sales_month', coalesce((select sum(total) from sales where sale_date >= date_trunc('month', now()) and status='completed'),0),
    'profit_today', coalesce((select sum(profit) from sales where sale_date::date = current_date and status='completed'),0),
    'profit_month', coalesce((select sum(profit) from sales where sale_date >= date_trunc('month', now()) and status='completed'),0),
    'stock_value', coalesce((select sum(stock_qty * buying_price) from products where is_active),0),
    'low_stock_count', (select count(*) from products where is_active and stock_qty <= min_stock and min_stock > 0),
    'out_of_stock_count', (select count(*) from products where is_active and stock_qty <= 0),
    'products_count', (select count(*) from products where is_active),
    'customers_balance', coalesce((select sum(balance) from customers),0),
    'suppliers_balance', coalesce((select sum(balance) from suppliers),0)
  );
$$;
grant execute on function public.dashboard_stats() to authenticated;
