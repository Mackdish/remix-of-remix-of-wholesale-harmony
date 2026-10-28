create table public.report_insights (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  model text not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  analysis jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.report_insights to authenticated;
grant all on public.report_insights to service_role;

alter table public.report_insights enable row level security;

create policy "insights read by roles" on public.report_insights
  for select to authenticated
  using (
    public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'manager')
    or public.has_role(auth.uid(),'accountant')
  );

create policy "insights insert by roles" on public.report_insights
  for insert to authenticated
  with check (
    public.has_role(auth.uid(),'admin')
    or public.has_role(auth.uid(),'manager')
    or public.has_role(auth.uid(),'accountant')
  );

create index report_insights_created_idx on public.report_insights (created_at desc);
create index report_insights_date_idx on public.report_insights (report_date);