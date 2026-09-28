import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { generateDailyReportNow } from "@/lib/api.functions";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { buildReportPdf, savePdf } from "@/lib/pdf";

export const Route = createFileRoute("/_authenticated/reports-history")({
  head: () => ({ meta: [{ title: "Report History — Wholesale ERP" }] }),
  component: ReportsHistoryPage,
});

type Snapshot = {
  summary: { count: number; revenue: number; tax: number; cogs: number; profit: number; discount: number };
  returns: { count: number; total: number; refunded: number };
  expenses: number;
  by_method: Array<{ method: string; total: number }>;
  sales: Array<{ receipt_no: string; time: string; customer: string; method: string; total: number; profit: number }>;
  return_list: Array<{ return_no: string; reason: string; notes: string; total: number }>;
};

function yesterdayISO() { return new Date(Date.now() - 86400000).toISOString().slice(0, 10); }

function ReportsHistoryPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(yesterdayISO());

  const { data: rows = [], error } = useQuery({
    queryKey: ["report-snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase.from("report_snapshots")
        .select("*").eq("report_type", "daily").order("report_date", { ascending: false }).limit(120);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("settings").select("*").eq("id", 1).single()).data,
  });

  const genFn = useServerFn(generateDailyReportNow);
  const gen = useMutation({
    mutationFn: () => genFn({ data: { date } }),
    onSuccess: () => { toast.success("Report generated"); qc.invalidateQueries({ queryKey: ["report-snapshots"] }); },
    onError: (e) => toast.error((e as Error).message),
  });

  function download(reportDate: string, d: Snapshot) {
    const s = d.summary;
    const doc = buildReportPdf({
      business: settings?.business_name ?? undefined,
      title: "Daily Sales Report", from: reportDate, to: reportDate,
      summary: [
        { label: "Number of sales", value: String(s.count) },
        { label: "Revenue", value: formatMoney(s.revenue) },
        { label: "Discounts", value: formatMoney(s.discount) },
        { label: "Tax", value: formatMoney(s.tax) },
        { label: "COGS", value: formatMoney(s.cogs) },
        { label: "Gross profit", value: formatMoney(s.profit) },
        { label: `Customer returns (${d.returns.count})`, value: formatMoney(d.returns.total) },
        { label: "Refunds paid", value: formatMoney(d.returns.refunded) },
        { label: "Expenses", value: formatMoney(d.expenses) },
      ],
      columns: [
        { header: "Time", key: "time" }, { header: "Receipt", key: "receipt_no" }, { header: "Customer", key: "customer" },
        { header: "Method", key: "method" }, { header: "Total", key: "total", money: true }, { header: "Profit", key: "profit", money: true },
      ],
      rows: d.sales,
      sections: [
        { title: "Sales by payment method", columns: [{ header: "Method", key: "method" }, { header: "Total", key: "total", money: true }], rows: d.by_method },
        { title: "Customer returns", columns: [
          { header: "Return #", key: "return_no" }, { header: "Reason", key: "reason" },
          { header: "Notes", key: "notes" }, { header: "Total", key: "total", money: true },
        ], rows: d.return_list },
      ],
    });
    savePdf(doc, `daily-report-${reportDate}.pdf`);
  }

  return (
    <>
      <PageHeader title="Report History" description="Daily reports are saved automatically every night just after midnight. Download any past day as PDF." />

      <Card className="p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Generate for a specific day</div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <Button onClick={() => gen.mutate()} disabled={gen.isPending}>
          <RefreshCw className="h-4 w-4 mr-2" />{gen.isPending ? "Generating…" : "Generate now"}
        </Button>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <th className="py-3 px-4">Report date</th><th className="py-3 px-4">Sales</th>
            <th className="py-3 px-4 text-right">Revenue</th><th className="py-3 px-4 text-right">Profit</th>
            <th className="py-3 px-4">Generated</th><th className="py-3 px-4"></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const d = r.data as unknown as Snapshot;
              return (
                <tr key={r.id} className="border-t">
                  <td className="py-3 px-4 font-medium">{formatDate(r.report_date)}</td>
                  <td className="py-3 px-4">{d.summary.count}</td>
                  <td className="py-3 px-4 text-right">{formatMoney(d.summary.revenue)}</td>
                  <td className="py-3 px-4 text-right">{formatMoney(d.summary.profit)}</td>
                  <td className="py-3 px-4 text-muted-foreground">{formatDateTime(r.created_at)} · {r.generated_by === "schedule" ? "Automatic" : "Manual"}</td>
                  <td className="py-3 px-4 text-right">
                    <Button size="sm" variant="outline" onClick={() => download(r.report_date, d)}><FileText className="h-4 w-4 mr-2" />PDF</Button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">
              {error ? "You don't have access to report history." : "No saved reports yet — the first one appears after midnight, or generate one now."}
            </td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
