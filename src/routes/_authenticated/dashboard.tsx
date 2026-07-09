import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStats, getRecentSales, getSalesTrend, getTopProducts } from "@/lib/api.functions";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDateTime } from "@/lib/format";
import { TrendingUp, DollarSign, Package, AlertTriangle, Users, Truck, ShoppingCart, Wallet } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Stat({ icon: Icon, label, value, tone = "default", sub }: { icon: React.ElementType; label: string; value: string; tone?: "default" | "success" | "warning" | "danger" | "info"; sub?: string }) {
  const tones: Record<string, string> = {
    default: "bg-secondary text-secondary-foreground",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning-foreground",
    danger: "bg-destructive/10 text-destructive",
    info: "bg-info/10 text-info",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold tracking-tight mt-2">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-md ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function Dashboard() {
  const stats = useServerFn(getDashboardStats);
  const trend = useServerFn(getSalesTrend);
  const top = useServerFn(getTopProducts);
  const recent = useServerFn(getRecentSales);

  const { data: s } = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => stats() });
  const { data: trendData = [] } = useQuery({ queryKey: ["sales-trend"], queryFn: () => trend({ data: { days: 14 } }) });
  const { data: topData = [] } = useQuery({ queryKey: ["top-products"], queryFn: () => top() });
  const { data: recentData = [] } = useQuery({ queryKey: ["recent-sales"], queryFn: () => recent() });

  return (
    <>
      <PageHeader title="Dashboard" description="Real-time overview of your business performance." />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={DollarSign} label="Sales today" value={formatMoney(s?.sales_today)} tone="success" />
        <Stat icon={TrendingUp} label="Sales this month" value={formatMoney(s?.sales_month)} tone="info" sub={`Week: ${formatMoney(s?.sales_week)}`} />
        <Stat icon={Wallet} label="Profit this month" value={formatMoney(s?.profit_month)} tone="success" sub={`Today: ${formatMoney(s?.profit_today)}`} />
        <Stat icon={Package} label="Stock value" value={formatMoney(s?.stock_value)} sub={`${s?.products_count ?? 0} active products`} />
        <Stat icon={AlertTriangle} label="Low stock items" value={String(s?.low_stock_count ?? 0)} tone="warning" />
        <Stat icon={AlertTriangle} label="Out of stock" value={String(s?.out_of_stock_count ?? 0)} tone="danger" />
        <Stat icon={Users} label="Receivables" value={formatMoney(s?.customers_balance)} tone="info" sub="Customer credit balances" />
        <Stat icon={Truck} label="Payables" value={formatMoney(s?.suppliers_balance)} tone="warning" sub="Supplier balances" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Sales trend — last 14 days</h2>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Line type="monotone" dataKey="sales" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="Sales" />
                <Line type="monotone" dataKey="profit" stroke="var(--chart-3)" strokeWidth={2} dot={false} name="Profit" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Top products (30d)</h2>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topData} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(v: number) => formatMoney(v)} />
                <Bar dataKey="revenue" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-5 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Recent sales</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                <th className="py-2 px-2">Receipt</th>
                <th className="py-2 px-2">Date</th>
                <th className="py-2 px-2">Customer</th>
                <th className="py-2 px-2">Method</th>
                <th className="py-2 px-2 text-right">Total</th>
                <th className="py-2 px-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(recentData as Array<{ id: string; receipt_no: string; sale_date: string; total: number; payment_method: string; status: string; customers: { name: string } | null }>).map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="py-2 px-2 font-mono text-xs">{r.receipt_no}</td>
                  <td className="py-2 px-2">{formatDateTime(r.sale_date)}</td>
                  <td className="py-2 px-2">{r.customers?.name ?? "Walk-in"}</td>
                  <td className="py-2 px-2 capitalize">{r.payment_method}</td>
                  <td className="py-2 px-2 text-right font-medium">{formatMoney(r.total)}</td>
                  <td className="py-2 px-2"><Badge variant={r.status === "completed" ? "default" : "secondary"}>{r.status}</Badge></td>
                </tr>
              ))}
              {recentData.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No sales yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
