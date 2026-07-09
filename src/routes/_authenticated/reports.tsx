import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate, downloadCSV } from "@/lib/format";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { data: salesByDay = [] } = useQuery({
    queryKey: ["report-sales-day"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase.from("sales").select("sale_date,total,profit,cogs").gte("sale_date", since).eq("status", "completed");
      const map = new Map<string, { date: string; revenue: number; profit: number; cogs: number; count: number }>();
      for (const r of data ?? []) {
        const k = (r.sale_date as string).slice(0, 10);
        const cur = map.get(k) ?? { date: k, revenue: 0, profit: 0, cogs: 0, count: 0 };
        cur.revenue += Number(r.total); cur.profit += Number(r.profit); cur.cogs += Number(r.cogs); cur.count += 1;
        map.set(k, cur);
      }
      return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
    },
  });

  const { data: byProduct = [] } = useQuery({
    queryKey: ["report-by-product"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase.from("sale_items").select("product_name,quantity,line_total,unit_cost,sales!inner(sale_date,status)").gte("sales.sale_date", since).eq("sales.status", "completed");
      const map = new Map<string, { name: string; qty: number; revenue: number; cost: number; profit: number }>();
      for (const r of (data ?? []) as Array<{ product_name: string; quantity: number; line_total: number; unit_cost: number }>) {
        const cur = map.get(r.product_name) ?? { name: r.product_name, qty: 0, revenue: 0, cost: 0, profit: 0 };
        cur.qty += Number(r.quantity); cur.revenue += Number(r.line_total); cur.cost += Number(r.quantity) * Number(r.unit_cost);
        cur.profit = cur.revenue - cur.cost;
        map.set(r.product_name, cur);
      }
      return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    },
  });

  const { data: stockValuation = [] } = useQuery({
    queryKey: ["report-stock-value"],
    queryFn: async () => (await supabase.from("products").select("code,name,unit,stock_qty,buying_price,selling_price").eq("is_active", true).order("name")).data ?? [],
  });

  const totalStockValue = stockValuation.reduce((s, p) => s + Number(p.stock_qty) * Number(p.buying_price), 0);
  const totalRevenue = salesByDay.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = salesByDay.reduce((s, r) => s + r.profit, 0);

  return (
    <>
      <PageHeader title="Reports" description="Analytical reports for decision-making." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Revenue (30d)</div><div className="text-2xl font-semibold mt-2">{formatMoney(totalRevenue)}</div></Card>
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Profit (30d)</div><div className="text-2xl font-semibold mt-2 text-success">{formatMoney(totalProfit)}</div></Card>
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Stock value</div><div className="text-2xl font-semibold mt-2">{formatMoney(totalStockValue)}</div></Card>
      </div>

      <Tabs defaultValue="by-day">
        <TabsList>
          <TabsTrigger value="by-day">Sales by day</TabsTrigger>
          <TabsTrigger value="by-product">Sales by product</TabsTrigger>
          <TabsTrigger value="stock-value">Stock valuation</TabsTrigger>
        </TabsList>

        <TabsContent value="by-day">
          <Card className="p-0 overflow-hidden">
            <div className="flex justify-end p-3 border-b"><Button variant="outline" size="sm" onClick={() => downloadCSV("sales-by-day.csv", salesByDay)}><Download className="h-4 w-4 mr-2" />CSV</Button></div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
                <th className="py-3 px-4">Date</th><th className="py-3 px-4 text-right">Sales #</th><th className="py-3 px-4 text-right">Revenue</th><th className="py-3 px-4 text-right">COGS</th><th className="py-3 px-4 text-right">Profit</th>
              </tr></thead>
              <tbody>
                {salesByDay.map((r) => (
                  <tr key={r.date} className="border-t">
                    <td className="py-3 px-4">{formatDate(r.date)}</td>
                    <td className="py-3 px-4 text-right">{r.count}</td>
                    <td className="py-3 px-4 text-right">{formatMoney(r.revenue)}</td>
                    <td className="py-3 px-4 text-right">{formatMoney(r.cogs)}</td>
                    <td className="py-3 px-4 text-right text-success">{formatMoney(r.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="by-product">
          <Card className="p-0 overflow-hidden">
            <div className="flex justify-end p-3 border-b"><Button variant="outline" size="sm" onClick={() => downloadCSV("sales-by-product.csv", byProduct)}><Download className="h-4 w-4 mr-2" />CSV</Button></div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
                <th className="py-3 px-4">Product</th><th className="py-3 px-4 text-right">Qty sold</th><th className="py-3 px-4 text-right">Revenue</th><th className="py-3 px-4 text-right">Cost</th><th className="py-3 px-4 text-right">Profit</th>
              </tr></thead>
              <tbody>
                {byProduct.map((r) => (
                  <tr key={r.name} className="border-t">
                    <td className="py-3 px-4">{r.name}</td>
                    <td className="py-3 px-4 text-right">{r.qty}</td>
                    <td className="py-3 px-4 text-right">{formatMoney(r.revenue)}</td>
                    <td className="py-3 px-4 text-right">{formatMoney(r.cost)}</td>
                    <td className="py-3 px-4 text-right text-success">{formatMoney(r.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="stock-value">
          <Card className="p-0 overflow-hidden">
            <div className="flex justify-end p-3 border-b"><Button variant="outline" size="sm" onClick={() => downloadCSV("stock-valuation.csv", stockValuation)}><Download className="h-4 w-4 mr-2" />CSV</Button></div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
                <th className="py-3 px-4">Code</th><th className="py-3 px-4">Product</th><th className="py-3 px-4 text-right">Qty</th><th className="py-3 px-4 text-right">Buying</th><th className="py-3 px-4 text-right">Value</th>
              </tr></thead>
              <tbody>
                {stockValuation.map((p) => (
                  <tr key={p.code} className="border-t">
                    <td className="py-3 px-4 font-mono text-xs">{p.code}</td>
                    <td className="py-3 px-4">{p.name}</td>
                    <td className="py-3 px-4 text-right">{Number(p.stock_qty)} {p.unit}</td>
                    <td className="py-3 px-4 text-right">{formatMoney(p.buying_price)}</td>
                    <td className="py-3 px-4 text-right font-medium">{formatMoney(Number(p.stock_qty) * Number(p.buying_price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
