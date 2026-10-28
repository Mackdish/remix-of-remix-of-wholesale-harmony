import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatMoney, downloadCSV } from "@/lib/format";
import { Download, Eye } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesPage,
});

function SalesPage() {
  const { data = [] } = useQuery({
    queryKey: ["sales-all"],
    queryFn: async () => (await supabase.from("sales").select("id,receipt_no,sale_date,total,profit,payment_method,status,balance_due,customers(name)").order("sale_date", { ascending: false }).limit(500)).data ?? [],
  });

  return (
    <>
      <PageHeader title="Sales" description="All sales transactions."
        actions={<Button variant="outline" onClick={() => downloadCSV("sales.csv", data.map((r) => ({ receipt: r.receipt_no, date: r.sale_date, customer: r.customers?.name ?? "Walk-in", method: r.payment_method, total: r.total, profit: r.profit, status: r.status })))}><Download className="h-4 w-4 mr-2" />Export CSV</Button>} />
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <th className="py-3 px-4">Receipt</th><th className="py-3 px-4">Date</th><th className="py-3 px-4">Customer</th><th className="py-3 px-4">Method</th><th className="py-3 px-4 text-right">Total</th><th className="py-3 px-4 text-right">Profit</th><th className="py-3 px-4 text-right">Balance</th><th className="py-3 px-4">Status</th><th></th>
          </tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="py-3 px-4 font-mono text-xs">{r.receipt_no}</td>
                <td className="py-3 px-4">{formatDateTime(r.sale_date)}</td>
                <td className="py-3 px-4">{r.customers?.name ?? "Walk-in"}</td>
                <td className="py-3 px-4 capitalize">{r.payment_method}</td>
                <td className="py-3 px-4 text-right font-medium">{formatMoney(r.total)}</td>
                <td className="py-3 px-4 text-right text-success">{formatMoney(r.profit)}</td>
                <td className="py-3 px-4 text-right">{Number(r.balance_due) > 0 ? formatMoney(r.balance_due) : "—"}</td>
                <td className="py-3 px-4"><Badge variant={r.status === "completed" ? "default" : "secondary"}>{r.status}</Badge></td>
                <td className="py-3 px-4 text-right whitespace-nowrap"><Link to="/receipt/$id" params={{ id: r.id }}><Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button></Link>
                  <DeleteButton kind="sale" id={r.id} label={`sale ${r.receipt_no}`} invalidate={[["sales-all"]]} warning="Items go back into stock and any customer balance from this sale is removed. This cannot be undone." /></td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">No sales yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
