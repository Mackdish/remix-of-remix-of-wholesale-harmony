import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { analyzeDailyReport, listReportInsights } from "@/lib/ai.functions";
import { getMyRoles } from "@/lib/api.functions";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatMoney, formatDate } from "@/lib/format";
import { Sparkles, TriangleAlert, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ai-insights")({
  component: AiInsightsPage,
  head: () => ({
    meta: [
      { title: "AI Insights — Wholesale ERP" },
      { name: "description", content: "AI analysis of daily sales and inventory reports with unusual trend detection and recommended follow-ups." },
      { property: "og:title", content: "AI Insights — Wholesale ERP" },
      { property: "og:description", content: "Detect unusual trends in daily sales and inventory data and get actionable recommendations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Severity = "low" | "medium" | "high";

type Analysis = {
  summary: string;
  unusual_trends: Array<{ title: string; detail: string; severity: Severity; metric: string | null }>;
  recommendations: Array<{ title: string; detail: string; priority: Severity }>;
};

type InsightRow = {
  id: string;
  report_date: string;
  model: string;
  analysis: Analysis | null;
  notes: string | null;
  created_at: string;
};

const ALLOWED_ROLES = new Set(["admin", "manager", "accountant"]);

function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(n: number) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

const sevVariant: Record<Severity, "destructive" | "default" | "secondary"> = {
  high: "destructive",
  medium: "default",
  low: "secondary",
};

function AiInsightsPage() {
  const queryClient = useQueryClient();
  const analyzeFn = useServerFn(analyzeDailyReport);
  const listFn = useServerFn(listReportInsights);
  const rolesFn = useServerFn(getMyRoles);

  const [date, setDate] = useState(todayISO());
  const [salesJson, setSalesJson] = useState("");
  const [inventoryJson, setInventoryJson] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [latest, setLatest] = useState<InsightRow | null>(null);

  const { data: roles = [] } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => rolesFn(),
  });
  const canUse = (roles as string[]).some((r) => ALLOWED_ROLES.has(r));

  // ---- Auto-gather the day's sales data
  const { data: salesSource } = useQuery({
    queryKey: ["ai-sales-source", date],
    queryFn: async () => {
      const from = `${date}T00:00:00`;
      const to = `${date}T23:59:59.999`;
      const [{ data: daySales }, { data: dayItems }, { data: series }] = await Promise.all([
        supabase.from("sales").select("receipt_no,sale_date,payment_method,subtotal,tax,discount,total,cogs,profit,customers(name)")
          .gte("sale_date", from).lte("sale_date", to).eq("status", "completed").order("sale_date"),
        supabase.from("sale_items").select("product_name,quantity,line_total,sales!inner(sale_date,status)")
          .gte("sales.sale_date", from).lte("sales.sale_date", to).eq("sales.status", "completed"),
        supabase.from("sales").select("sale_date,total,profit").gte("sale_date", `${daysAgoISO(14)}T00:00:00`)
          .lt("sale_date", from).eq("status", "completed"),
      ]);
      const totals = (daySales ?? []).reduce((a, r) => ({
        transactions: a.transactions + 1,
        revenue: a.revenue + Number(r.total),
        tax: a.tax + Number(r.tax),
        discounts: a.discounts + Number(r.discount),
        cogs: a.cogs + Number(r.cogs),
        gross_profit: a.gross_profit + Number(r.profit),
      }), { transactions: 0, revenue: 0, tax: 0, discounts: 0, cogs: 0, gross_profit: 0 });
      const payments = new Map<string, number>();
      for (const r of daySales ?? []) {
        const m = r.payment_method as string;
        payments.set(m, (payments.get(m) ?? 0) + Number(r.total));
      }
      const productMap = new Map<string, { name: string; qty: number; revenue: number }>();
      for (const it of (dayItems ?? []) as Array<{ product_name: string; quantity: number; line_total: number }>) {
        const cur = productMap.get(it.product_name) ?? { name: it.product_name, qty: 0, revenue: 0 };
        cur.qty += Number(it.quantity); cur.revenue += Number(it.line_total);
        productMap.set(it.product_name, cur);
      }
      const seriesMap = new Map<string, { date: string; transactions: number; revenue: number; profit: number }>();
      for (let i = 13; i >= 1; i--) {
        const k = daysAgoISO(i);
        seriesMap.set(k, { date: k, transactions: 0, revenue: 0, profit: 0 });
      }
      for (const r of series ?? []) {
        const k = (r.sale_date as string).slice(0, 10);
        const cur = seriesMap.get(k);
        if (cur) { cur.transactions += 1; cur.revenue += Number(r.total); cur.profit += Number(r.profit); }
      }
      return {
        date,
        currency: "KES",
        day_totals: totals,
        payment_breakdown: Object.fromEntries(payments),
        transactions: (daySales ?? []).map((r) => ({
          receipt_no: r.receipt_no,
          time: (r.sale_date as string).slice(11, 16),
          customer: (r.customers as { name: string } | null)?.name ?? "Walk-in",
          payment_method: r.payment_method,
          total: Number(r.total),
          profit: Number(r.profit),
        })),
        top_products_by_revenue: Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 20),
        prior_14_days: Array.from(seriesMap.values()),
      };
    },
  });

  // ---- Auto-gather the inventory snapshot
  const { data: inventorySource } = useQuery({
    queryKey: ["ai-inventory-source", date],
    queryFn: async () => {
      const { data } = await supabase.from("products")
        .select("code,name,unit,stock_qty,min_stock,max_stock,buying_price,selling_price")
        .eq("is_active", true).order("name");
      const products = data ?? [];
      const low = products.filter((p) => Number(p.stock_qty) > 0 && Number(p.stock_qty) <= Number(p.min_stock));
      const out = products.filter((p) => Number(p.stock_qty) <= 0);
      const value = (price: "buying_price" | "selling_price") =>
        products.reduce((s, q) => s + Number(q.stock_qty) * Number(q[price]), 0);
      return {
        snapshot_date: date,
        currency: "KES",
        product_count: products.length,
        total_stock_cost_value: value("buying_price"),
        total_stock_retail_value: value("selling_price"),
        low_stock: low.map((p) => ({ code: p.code, name: p.name, stock: Number(p.stock_qty), min: Number(p.min_stock) })),
        out_of_stock: out.map((p) => ({ code: p.code, name: p.name })),
        top_products_by_stock_value: [...products]
          .sort((a, b) => Number(b.stock_qty) * Number(b.buying_price) - Number(a.stock_qty) * Number(a.buying_price))
          .slice(0, 20)
          .map((p) => ({ code: p.code, name: p.name, stock: Number(p.stock_qty), cost_value: Number(p.stock_qty) * Number(p.buying_price) })),
      };
    },
  });

  useEffect(() => {
    if (salesSource) setSalesJson(JSON.stringify(salesSource, null, 2));
  }, [salesSource]);
  useEffect(() => {
    if (inventorySource) setInventoryJson(JSON.stringify(inventorySource, null, 2));
  }, [inventorySource]);

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ["ai-insights-history"],
    queryFn: () => listFn() as Promise<InsightRow[]>,
    enabled: canUse,
  });

  async function runAnalysis() {
    setError(null);
    setLatest(null);
    setAnalyzing(true);
    try {
      let salesParsed: unknown;
      let inventoryParsed: unknown;
      try { salesParsed = JSON.parse(salesJson || "{}"); } catch { throw new Error("The sales report data is not valid JSON"); }
      try { inventoryParsed = JSON.parse(inventoryJson || "{}"); } catch { throw new Error("The inventory data is not valid JSON"); }
      const row = (await analyzeFn({
        data: { report_date: date, sales_data: salesParsed, inventory_data: inventoryParsed, notes: notes || undefined },
      })) as unknown as InsightRow;
      setLatest(row);
      await queryClient.invalidateQueries({ queryKey: ["ai-insights-history"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  const historyList = useMemo(
    () => (latest ? [latest, ...history.filter((h) => h.id !== latest.id)] : history),
    [history, latest],
  );

  if (roles.length > 0 && !canUse) {
    return (
      <div>
        <PageHeader title="AI Insights" description="AI analysis of daily sales and inventory reports." />
        <Alert>
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Not available for your role</AlertTitle>
          <AlertDescription>
            Only administrators, managers and accountants can run and view AI insights.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Insights"
        description="Review the day's report data, then let the AI analyst flag unusual trends and suggest follow-ups."
        actions={<Sparkles className="h-6 w-6 text-primary" />}
      />

      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="ai-date">Report date</Label>
            <Input id="ai-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
          <Button onClick={runAnalysis} disabled={analyzing || !canUse}>
            {analyzing ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing…</>) : (<><Sparkles className="h-4 w-4 mr-2" /> Analyze with AI</>)}
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="ai-sales">Daily sales report data (editable)</Label>
            <Textarea id="ai-sales" value={salesJson} onChange={(e) => setSalesJson(e.target.value)} rows={12} className="font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ai-inventory">Inventory snapshot data (editable)</Label>
            <Textarea id="ai-inventory" value={inventoryJson} onChange={(e) => setInventoryJson(e.target.value)} rows={12} className="font-mono text-xs" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ai-notes">Notes for the analyst (optional)</Label>
          <Textarea id="ai-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="e.g. M-Pesa was down for two hours today; expect catch-up sales tomorrow." />
        </div>

        {error && (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>Analysis failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </Card>

      {latest?.analysis && <AnalysisResult analysis={latest.analysis} />}

      <div>
        <h2 className="text-lg font-semibold mb-3">History</h2>
        {historyLoading ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : historyList.length === 0 ? (
          <p className="text-sm text-muted-foreground">No analyses yet. Run your first one above.</p>
        ) : (
          <div className="space-y-3">
            {historyList.map((row) => (
              <Card key={row.id} className="p-4">
                <details>
                  <summary className="flex flex-wrap items-center gap-3 cursor-pointer">
                    <span className="font-medium">{formatDate(row.report_date)}</span>
                    <Badge variant="outline">{row.model.split("/")[1] ?? row.model}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span>
                  </summary>
                  <div className="mt-3">
                    {row.analysis ? (
                      <AnalysisBody analysis={row.analysis} />
                    ) : (
                      <p className="text-sm text-muted-foreground">No analysis stored for this entry.</p>
                    )}
                    {row.notes && <p className="text-xs text-muted-foreground mt-2">Notes: {row.notes}</p>}
                  </div>
                </details>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AnalysisResult({ analysis }: { analysis: Analysis }) {
  return (
    <Card className="p-5 space-y-4 border-primary/40">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Latest analysis</h2>
      </div>
      <AnalysisBody analysis={analysis} />
    </Card>
  );
}

function AnalysisBody({ analysis }: { analysis: Analysis }) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed">{analysis.summary}</p>
      <div>
        <h3 className="text-sm font-semibold mb-2">Unusual trends</h3>
        {analysis.unusual_trends.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing unusual flagged.</p>
        ) : (
          <ul className="space-y-2">
            {analysis.unusual_trends.map((t, i) => (
              <li key={i} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Badge variant={sevVariant[t.severity]}>{t.severity}</Badge>
                  <span className="font-medium text-sm">{t.title}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t.detail}</p>
                {t.metric && <p className="text-xs font-mono text-muted-foreground mt-1">{t.metric}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2">Recommended follow-ups</h3>
        {analysis.recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No follow-ups suggested.</p>
        ) : (
          <ul className="space-y-2">
            {analysis.recommendations.map((r, i) => (
              <li key={i} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Badge variant={sevVariant[r.priority]}>priority: {r.priority}</Badge>
                  <span className="font-medium text-sm">{r.title}</span>
                </div>
                <p className="text-sm text-muted-foreground">{r.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
