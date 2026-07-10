import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Dashboard stats */
export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("dashboard_stats");
    if (error) throw new Error(error.message);
    return data as Record<string, number>;
  });

/** Sales trend for last N days */
export const getSalesTrend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => d ?? {})
  .handler(async ({ data, context }) => {
    const days = data.days ?? 14;
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("sales")
      .select("sale_date,total,profit")
      .gte("sale_date", since)
      .eq("status", "completed")
      .order("sale_date", { ascending: true });
    if (error) throw new Error(error.message);
    // aggregate by day
    const map = new Map<string, { date: string; sales: number; profit: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 86400_000);
      const key = d.toISOString().slice(0, 10);
      map.set(key, { date: key, sales: 0, profit: 0 });
    }
    for (const r of rows ?? []) {
      const key = (r.sale_date as string).slice(0, 10);
      const cur = map.get(key);
      if (cur) {
        cur.sales += Number(r.total);
        cur.profit += Number(r.profit);
      }
    }
    return Array.from(map.values());
  });

/** Top products by revenue for last 30 days */
export const getTopProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data, error } = await context.supabase
      .from("sale_items")
      .select("product_name,quantity,line_total,sales!inner(sale_date,status)")
      .gte("sales.sale_date", since)
      .eq("sales.status", "completed");
    if (error) throw new Error(error.message);
    const agg = new Map<string, { name: string; revenue: number; qty: number }>();
    for (const r of (data ?? []) as Array<{ product_name: string; quantity: number; line_total: number }>) {
      const cur = agg.get(r.product_name) ?? { name: r.product_name, revenue: 0, qty: 0 };
      cur.revenue += Number(r.line_total);
      cur.qty += Number(r.quantity);
      agg.set(r.product_name, cur);
    }
    return Array.from(agg.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  });

/** Recent sales */
export const getRecentSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sales")
      .select("id,receipt_no,sale_date,total,payment_method,status,customer_id,customers(name)")
      .order("sale_date", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Process sale via RPC */
export const processSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    items: Array<{ product_id: string; quantity: number; unit_price: number; discount?: number }>;
    customer_id?: string | null;
    payment_method: string;
    amount_paid: number;
    tax?: number;
    discount?: number;
    notes?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("process_sale", { payload: data });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

/** Process purchase via RPC */
export const processPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    items: Array<{ product_id: string; quantity: number; unit_cost: number }>;
    supplier_id?: string | null;
    invoice_no?: string;
    payment_method: string;
    amount_paid: number;
    tax?: number;
    transport?: number;
    discount?: number;
    notes?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("process_purchase", { payload: data });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

/** Get sale with items for receipt */
export const getSaleWithItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const [{ data: sale }, { data: items }, { data: settings }] = await Promise.all([
      context.supabase.from("sales").select("*, customers(name,phone,address)").eq("id", data.id).single(),
      context.supabase.from("sale_items").select("*").eq("sale_id", data.id),
      context.supabase.from("settings").select("*").eq("id", 1).single(),
    ]);
    return { sale, items: items ?? [], settings };
  });

/** Get current user roles */
export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.role as string);
  });

/** Stock adjustment */
export const createStockAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { product_id: string; quantity: number; movement_type: "adjustment" | "damage" | "expiry" | "opening" | "return_in" | "return_out" | "transfer"; notes?: string; unit_cost?: number }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("stock_movements").insert({
      product_id: data.product_id,
      movement_type: data.movement_type,
      quantity: data.quantity,
      unit_cost: data.unit_cost ?? 0,
      notes: data.notes,
      created_by: context.userId,
      reference_type: "adjustment",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Process customer return */
export const processSalesReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    items: Array<{ product_id: string; quantity: number; unit_price: number }>;
    sale_id?: string | null;
    customer_id?: string | null;
    tax?: number;
    refund_method: string;
    refund_amount: number;
    restock: boolean;
    notes?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("process_sales_return", { payload: data });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

/** Start stock take session */
export const startStockTake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name?: string }) => d ?? {})
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("start_stock_take", { _name: data.name ?? null });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

/** Approve stock take */
export const approveStockTake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { session_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("approve_stock_take", { _session_id: data.session_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** P&L report */
export const getPnlReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string; to: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("pnl_report", { _from: data.from, _to: data.to });
    if (error) throw new Error(error.message);
    return r as Record<string, number | string>;
  });

/** VAT report */
export const getVatReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string; to: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("vat_report", { _from: data.from, _to: data.to });
    if (error) throw new Error(error.message);
    return r as Record<string, number | string>;
  });

