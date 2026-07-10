import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getPnlReport, getVatReport } from "@/lib/api.functions";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, formatDate, downloadCSV } from "@/lib/format";
import { buildReportPdf, savePdf } from "@/lib/pdf";
import { Download, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthStartISO() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }
function daysAgoISO(n: number) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

function ReportsPage() {
  const [pnlFrom, setPnlFrom] = useState(monthStartISO());
  const [pnlTo, setPnlTo] = useState(todayISO());
  const [vatFrom, setVatFrom] = useState(monthStartISO());
  const [vatTo, setVatTo] = useState(todayISO());
  const [dayDate, setDayDate] = useState(todayISO());
  const [monthDate, setMonthDate] = useState(todayISO().slice(0, 7));

  const { data: settings } = useQuery({
    queryKey: ["settings-report"],
    queryFn: async () => (await supabase.from("settings").select("*").eq("id", 1).maybeSingle()).data,
  });
  const businessName = settings?.business_name ?? "Wholesale ERP";

  // ---- 30-day aggregates (for existing tabs)
  const { data: salesByDay = [] } = useQuery({
    queryKey: ["report-sales-day"],
    queryFn: async () => {
      const since = daysAgoISO(30);
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
      const since = daysAgoISO(30);
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

  // ---- Daily report
  const { data: dailySales = [] } = useQuery({
    queryKey: ["report-daily", dayDate],
    queryFn: async () => {
      const from = `${dayDate}T00:00:00`;
      const to = `${dayDate}T23:59:59.999`;
      const { data } = await supabase.from("sales")
        .select("receipt_no,sale_date,payment_method,subtotal,tax,discount,total,cogs,profit,customers(name)")
        .gte("sale_date", from).lte("sale_date", to).eq("status", "completed").order("sale_date");
      return data ?? [];
    },
  });
  const dailyTotals = useMemo(() => dailySales.reduce((a, r) => ({
    count: a.count + 1, revenue: a.revenue + Number(r.total), profit: a.profit + Number(r.profit),
    tax: a.tax + Number(r.tax), cogs: a.cogs + Number(r.cogs), discount: a.discount + Number(r.discount),
  }), { count: 0, revenue: 0, profit: 0, tax: 0, cogs: 0, discount: 0 }), [dailySales]);

  // ---- Monthly report
  const { data: monthlySales = [] } = useQuery({
    queryKey: ["report-monthly", monthDate],
    queryFn: async () => {
      const start = `${monthDate}-01`;
      const startDate = new Date(start);
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
      const end = endDate.toISOString().slice(0, 10);
      const { data } = await supabase.from("sales")
        .select("sale_date,total,tax,cogs,profit,discount")
        .gte("sale_date", `${start}T00:00:00`).lte("sale_date", `${end}T23:59:59.999`).eq("status", "completed");
      const map = new Map<string, { date: string; count: number; revenue: number; tax: number; cogs: number; profit: number }>();
      for (let i = 1; i <= endDate.getDate(); i++) {
        const k = `${monthDate}-${String(i).padStart(2, "0")}`;
        map.set(k, { date: k, count: 0, revenue: 0, tax: 0, cogs: 0, profit: 0 });
      }
      for (const r of data ?? []) {
        const k = (r.sale_date as string).slice(0, 10);
        const cur = map.get(k); if (!cur) continue;
        cur.count += 1; cur.revenue += Number(r.total); cur.tax += Number(r.tax); cur.cogs += Number(r.cogs); cur.profit += Number(r.profit);
      }
      return Array.from(map.values());
    },
  });
  const monthlyTotals = useMemo(() => monthlySales.reduce((a, r) => ({
    count: a.count + r.count, revenue: a.revenue + r.revenue, tax: a.tax + r.tax, cogs: a.cogs + r.cogs, profit: a.profit + r.profit,
  }), { count: 0, revenue: 0, tax: 0, cogs: 0, profit: 0 }), [monthlySales]);

  // ---- P&L
  const pnlFn = useServerFn(getPnlReport);
  const { data: pnl } = useQuery({
    queryKey: ["pnl", pnlFrom, pnlTo],
    queryFn: () => pnlFn({ data: { from: pnlFrom, to: pnlTo } }),
  });

  // ---- VAT
  const vatFn = useServerFn(getVatReport);
  const { data: vat } = useQuery({
    queryKey: ["vat", vatFrom, vatTo],
    queryFn: () => vatFn({ data: { from: vatFrom, to: vatTo } }),
  });

  // ---- PDF exports
  function downloadDailyPdf() {
    const doc = buildReportPdf({
      business: businessName, title: "Daily Sales Report", from: dayDate, to: dayDate,
      summary: [
        { label: "Number of sales", value: String(dailyTotals.count) },
        { label: "Revenue", value: formatMoney(dailyTotals.revenue) },
        { label: "Discounts", value: formatMoney(dailyTotals.discount) },
        { label: "Tax", value: formatMoney(dailyTotals.tax) },
        { label: "COGS", value: formatMoney(dailyTotals.cogs) },
        { label: "Gross profit", value: formatMoney(dailyTotals.profit) },
      ],
      columns: [
        { header: "Time", key: "time" },
        { header: "Receipt", key: "receipt_no" },
        { header: "Customer", key: "customer" },
        { header: "Method", key: "payment_method" },
        { header: "Total", key: "total", money: true },
        { header: "Profit", key: "profit", money: true },
      ],
      rows: dailySales.map((r) => ({
        time: new Date(r.sale_date as string).toLocaleTimeString(),
        receipt_no: r.receipt_no,
        customer: (r.customers as { name?: string } | null)?.name ?? "Walk-in",
        payment_method: r.payment_method,
        total: Number(r.total),
        profit: Number(r.profit),
      })),
    });
    savePdf(doc, `daily-sales-${dayDate}.pdf`);
  }

  function downloadMonthlyPdf() {
    const doc = buildReportPdf({
      business: businessName, title: "Monthly Sales Report", subtitle: monthDate,
      summary: [
        { label: "Total sales", value: String(monthlyTotals.count) },
        { label: "Revenue", value: formatMoney(monthlyTotals.revenue) },
        { label: "Tax", value: formatMoney(monthlyTotals.tax) },
        { label: "COGS", value: formatMoney(monthlyTotals.cogs) },
        { label: "Gross profit", value: formatMoney(monthlyTotals.profit) },
      ],
      columns: [
        { header: "Date", key: "date" },
        { header: "Sales #", key: "count" },
        { header: "Revenue", key: "revenue", money: true },
        { header: "Tax", key: "tax", money: true },
        { header: "COGS", key: "cogs", money: true },
        { header: "Profit", key: "profit", money: true },
      ],
      rows: monthlySales.map((r) => ({ date: formatDate(r.date), count: r.count, revenue: r.revenue, tax: r.tax, cogs: r.cogs, profit: r.profit })),
    });
    savePdf(doc, `monthly-sales-${monthDate}.pdf`);
  }

  function downloadPnlPdf() {
    if (!pnl) return;
    const doc = buildReportPdf({
      business: businessName, title: "Profit & Loss", from: pnlFrom, to: pnlTo,
      summary: [
        { label: "Revenue (net of returns)", value: formatMoney(Number(pnl.revenue)) },
        { label: "Discounts", value: formatMoney(Number(pnl.discounts)) },
        { label: "Cost of goods sold", value: formatMoney(Number(pnl.cogs)) },
        { label: "Gross profit", value: formatMoney(Number(pnl.gross_profit)) },
        { label: "Operating expenses", value: formatMoney(Number(pnl.expenses)) },
        { label: "Net profit", value: formatMoney(Number(pnl.net_profit)) },
        { label: "Sales tax collected", value: formatMoney(Number(pnl.sales_tax_collected)) },
      ],
    });
    savePdf(doc, `pnl-${pnlFrom}-to-${pnlTo}.pdf`);
  }

  function downloadVatPdf() {
    if (!vat) return;
    const doc = buildReportPdf({
      business: businessName, title: "VAT / Tax Report", from: vatFrom, to: vatTo,
      summary: [
        { label: "Net sales", value: formatMoney(Number(vat.net_sales)) },
        { label: "Output VAT (sales)", value: formatMoney(Number(vat.output_vat)) },
        { label: "Net purchases", value: formatMoney(Number(vat.net_purchases)) },
        { label: "Input VAT (purchases)", value: formatMoney(Number(vat.input_vat)) },
        { label: "VAT payable", value: formatMoney(Number(vat.vat_payable)) },
      ],
      footNote: "Output VAT − Input VAT = amount payable to the tax authority.",
    });
    savePdf(doc, `vat-${vatFrom}-to-${vatTo}.pdf`);
  }

  return (
    <>
      <PageHeader title="Reports" description="Daily, monthly, P&L and VAT reports with PDF export." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Revenue (30d)</div><div className="text-2xl font-semibold mt-2">{formatMoney(totalRevenue)}</div></Card>
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Profit (30d)</div><div className="text-2xl font-semibold mt-2 text-success">{formatMoney(totalProfit)}</div></Card>
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Stock value</div><div className="text-2xl font-semibold mt-2">{formatMoney(totalStockValue)}</div></Card>
      </div>

      <Tabs defaultValue="daily">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="pnl">Profit & Loss</TabsTrigger>
          <TabsTrigger value="vat">VAT</TabsTrigger>
          <TabsTrigger value="by-day">Sales by day (30d)</TabsTrigger>
          <TabsTrigger value="by-product">By product (30d)</TabsTrigger>
          <TabsTrigger value="stock-value">Stock valuation</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <Card className="p-5 mb-4 flex flex-wrap gap-4 items-end">
            <div><Label>Date</Label><Input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} /></div>
            <Button onClick={downloadDailyPdf}><FileText className="h-4 w-4 mr-2" />Download PDF</Button>
            <Button variant="outline" onClick={() => downloadCSV(`daily-sales-${dayDate}.csv`, dailySales as unknown as Array<Record<string, unknown>>)}><Download className="h-4 w-4 mr-2" />CSV</Button>
          </Card>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
            <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Sales</div><div className="text-lg font-semibold mt-1">{dailyTotals.count}</div></Card>
            <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Revenue</div><div className="text-lg font-semibold mt-1">{formatMoney(dailyTotals.revenue)}</div></Card>
            <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Discounts</div><div className="text-lg font-semibold mt-1">{formatMoney(dailyTotals.discount)}</div></Card>
            <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Tax</div><div className="text-lg font-semibold mt-1">{formatMoney(dailyTotals.tax)}</div></Card>
            <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">COGS</div><div className="text-lg font-semibold mt-1">{formatMoney(dailyTotals.cogs)}</div></Card>
            <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Profit</div><div className="text-lg font-semibold mt-1 text-success">{formatMoney(dailyTotals.profit)}</div></Card>
          </div>
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
                <th className="py-3 px-4">Time</th><th className="py-3 px-4">Receipt</th><th className="py-3 px-4">Customer</th><th className="py-3 px-4">Method</th>
                <th className="py-3 px-4 text-right">Total</th><th className="py-3 px-4 text-right">Profit</th>
              </tr></thead>
              <tbody>
                {dailySales.map((r) => (
                  <tr key={r.receipt_no as string} className="border-t">
                    <td className="py-3 px-4">{new Date(r.sale_date as string).toLocaleTimeString()}</td>
                    <td className="py-3 px-4 font-mono text-xs">{r.receipt_no}</td>
                    <td className="py-3 px-4">{(r.customers as { name?: string } | null)?.name ?? "Walk-in"}</td>
                    <td className="py-3 px-4 capitalize">{r.payment_method}</td>
                    <td className="py-3 px-4 text-right">{formatMoney(r.total)}</td>
                    <td className="py-3 px-4 text-right text-success">{formatMoney(r.profit)}</td>
                  </tr>
                ))}
                {dailySales.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">No sales for this day.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="monthly">
          <Card className="p-5 mb-4 flex flex-wrap gap-4 items-end">
            <div><Label>Month</Label><Input type="month" value={monthDate} onChange={(e) => setMonthDate(e.target.value)} /></div>
            <Button onClick={downloadMonthlyPdf}><FileText className="h-4 w-4 mr-2" />Download PDF</Button>
            <Button variant="outline" onClick={() => downloadCSV(`monthly-sales-${monthDate}.csv`, monthlySales)}><Download className="h-4 w-4 mr-2" />CSV</Button>
          </Card>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Sales</div><div className="text-lg font-semibold mt-1">{monthlyTotals.count}</div></Card>
            <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Revenue</div><div className="text-lg font-semibold mt-1">{formatMoney(monthlyTotals.revenue)}</div></Card>
            <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Tax</div><div className="text-lg font-semibold mt-1">{formatMoney(monthlyTotals.tax)}</div></Card>
            <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">COGS</div><div className="text-lg font-semibold mt-1">{formatMoney(monthlyTotals.cogs)}</div></Card>
            <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Profit</div><div className="text-lg font-semibold mt-1 text-success">{formatMoney(monthlyTotals.profit)}</div></Card>
          </div>
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
                <th className="py-3 px-4">Date</th><th className="py-3 px-4 text-right">Sales</th><th className="py-3 px-4 text-right">Revenue</th>
                <th className="py-3 px-4 text-right">Tax</th><th className="py-3 px-4 text-right">COGS</th><th className="py-3 px-4 text-right">Profit</th>
              </tr></thead>
              <tbody>
                {monthlySales.map((r) => (
                  <tr key={r.date} className="border-t">
                    <td className="py-3 px-4">{formatDate(r.date)}</td>
                    <td className="py-3 px-4 text-right">{r.count}</td>
                    <td className="py-3 px-4 text-right">{formatMoney(r.revenue)}</td>
                    <td className="py-3 px-4 text-right">{formatMoney(r.tax)}</td>
                    <td className="py-3 px-4 text-right">{formatMoney(r.cogs)}</td>
                    <td className="py-3 px-4 text-right text-success">{formatMoney(r.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="pnl">
          <Card className="p-5 mb-4 flex flex-wrap gap-4 items-end">
            <div><Label>From</Label><Input type="date" value={pnlFrom} onChange={(e) => setPnlFrom(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={pnlTo} onChange={(e) => setPnlTo(e.target.value)} /></div>
            <Button onClick={downloadPnlPdf} disabled={!pnl}><FileText className="h-4 w-4 mr-2" />Download PDF</Button>
          </Card>
          {pnl && (
            <Card className="p-6 max-w-2xl">
              <h3 className="font-semibold text-lg mb-4">Profit & Loss Statement</h3>
              <table className="w-full text-sm">
                <tbody>
                  <PnlRow label="Revenue (net of returns)" value={Number(pnl.revenue)} />
                  <PnlRow label="Less: Discounts" value={-Number(pnl.discounts)} />
                  <PnlRow label="Cost of goods sold" value={-Number(pnl.cogs)} />
                  <PnlRow label="Gross profit" value={Number(pnl.gross_profit)} bold />
                  <PnlRow label="Operating expenses" value={-Number(pnl.expenses)} />
                  <PnlRow label="Net profit" value={Number(pnl.net_profit)} bold highlight />
                  <tr><td colSpan={2} className="pt-4 border-t text-xs text-muted-foreground">Sales tax collected (memo): {formatMoney(Number(pnl.sales_tax_collected))}</td></tr>
                </tbody>
              </table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="vat">
          <Card className="p-5 mb-4 flex flex-wrap gap-4 items-end">
            <div><Label>From</Label><Input type="date" value={vatFrom} onChange={(e) => setVatFrom(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={vatTo} onChange={(e) => setVatTo(e.target.value)} /></div>
            <Button onClick={downloadVatPdf} disabled={!vat}><FileText className="h-4 w-4 mr-2" />Download PDF</Button>
          </Card>
          {vat && (
            <Card className="p-6 max-w-2xl">
              <h3 className="font-semibold text-lg mb-4">VAT Return</h3>
              <table className="w-full text-sm">
                <tbody>
                  <PnlRow label="Net sales" value={Number(vat.net_sales)} />
                  <PnlRow label="Output VAT (collected on sales)" value={Number(vat.output_vat)} bold />
                  <PnlRow label="Net purchases" value={Number(vat.net_purchases)} />
                  <PnlRow label="Input VAT (paid on purchases)" value={Number(vat.input_vat)} bold />
                  <PnlRow label="VAT payable" value={Number(vat.vat_payable)} bold highlight />
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-4">Output VAT − Input VAT = amount payable to the tax authority.</p>
            </Card>
          )}
        </TabsContent>

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

function PnlRow({ label, value, bold, highlight }: { label: string; value: number; bold?: boolean; highlight?: boolean }) {
  return (
    <tr className={"border-t " + (highlight ? "bg-primary/5" : "")}>
      <td className={"py-2 " + (bold ? "font-semibold" : "")}>{label}</td>
      <td className={"py-2 text-right tabular-nums " + (bold ? "font-semibold" : "") + (value < 0 ? " text-destructive" : "")}>{formatMoney(value)}</td>
    </tr>
  );
}
