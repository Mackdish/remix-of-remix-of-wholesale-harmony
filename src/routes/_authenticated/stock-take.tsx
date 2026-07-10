import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { startStockTake, approveStockTake } from "@/lib/api.functions";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/stock-take")({
  component: StockTakePage,
});

function StockTakePage() {
  const qc = useQueryClient();
  const [openSession, setOpenSession] = useState<string | null>(null);

  const { data: sessions = [] } = useQuery({
    queryKey: ["stock-take-sessions"],
    queryFn: async () => (await supabase.from("stock_take_sessions").select("*").order("started_at", { ascending: false })).data ?? [],
  });

  const startFn = useServerFn(startStockTake);
  const start = useMutation({
    mutationFn: async () => startFn({ data: { name: `Stock take ${new Date().toLocaleDateString()}` } }),
    onSuccess: (r) => {
      toast.success("Session started");
      qc.invalidateQueries({ queryKey: ["stock-take-sessions"] });
      setOpenSession(r.id);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (openSession) return <StockTakeDetail id={openSession} onBack={() => setOpenSession(null)} />;

  return (
    <>
      <PageHeader title="Stock Taking" description="Freeze system quantities, count physical stock, review variances, then post adjustments."
        actions={<Button onClick={() => start.mutate()} disabled={start.isPending}><Plus className="h-4 w-4 mr-2" />Start new session</Button>} />

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <th className="py-3 px-4">Session #</th>
            <th className="py-3 px-4">Name</th>
            <th className="py-3 px-4">Started</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4"></th>
          </tr></thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="py-3 px-4 font-mono text-xs">{s.session_no}</td>
                <td className="py-3 px-4">{s.name}</td>
                <td className="py-3 px-4">{formatDateTime(s.started_at)}</td>
                <td className="py-3 px-4"><Badge variant={s.status === "approved" ? "default" : "secondary"} className="capitalize">{s.status}</Badge></td>
                <td className="py-3 px-4 text-right"><Button variant="outline" size="sm" onClick={() => setOpenSession(s.id)}>Open</Button></td>
              </tr>
            ))}
            {sessions.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">No sessions yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function StockTakeDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});

  const { data: session } = useQuery({
    queryKey: ["stock-take", id],
    queryFn: async () => (await supabase.from("stock_take_sessions").select("*").eq("id", id).single()).data,
  });
  const { data: items = [] } = useQuery({
    queryKey: ["stock-take-items", id],
    queryFn: async () => (await supabase.from("stock_take_items").select("*").eq("session_id", id).order("product_name")).data ?? [],
  });

  const isEditable = session?.status === "counting" || session?.status === "draft";

  async function saveCount(itemId: string, value: string) {
    const n = value === "" ? null : Number(value);
    const { error } = await supabase.from("stock_take_items").update({ counted_qty: n }).eq("id", itemId);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["stock-take-items", id] });
  }

  const approveFn = useServerFn(approveStockTake);
  const approve = useMutation({
    mutationFn: async () => approveFn({ data: { session_id: id } }),
    onSuccess: () => {
      toast.success("Stock take approved. Variances posted.");
      qc.invalidateQueries({ queryKey: ["stock-take-sessions"] });
      qc.invalidateQueries({ queryKey: ["stock-take", id] });
      qc.invalidateQueries({ queryKey: ["stock-take-items", id] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const filtered = items.filter((i) => !filter || (i.product_name as string).toLowerCase().includes(filter.toLowerCase()));
  const varianceTotal = items.reduce((s, i) => s + Number(i.variance ?? 0) * Number(i.unit_cost ?? 0), 0);
  const countedCount = items.filter((i) => i.counted_qty !== null).length;

  return (
    <>
      <PageHeader
        title={`Stock take · ${session?.session_no ?? ""}`}
        description={session?.name ?? ""}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
            {isEditable && (
              <Button onClick={() => approve.mutate()} disabled={approve.isPending || countedCount === 0}>
                <Check className="h-4 w-4 mr-2" />Approve & post variances
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Products</div><div className="text-2xl font-semibold mt-2">{items.length}</div></Card>
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Counted</div><div className="text-2xl font-semibold mt-2">{countedCount}/{items.length}</div></Card>
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Net variance value</div><div className={"text-2xl font-semibold mt-2 " + (varianceTotal < 0 ? "text-destructive" : "text-success")}>{formatMoney(varianceTotal)}</div></Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-3 border-b"><Input placeholder="Search products…" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <th className="py-2 px-4">Product</th>
            <th className="py-2 px-4 text-right">System qty</th>
            <th className="py-2 px-4 text-right w-40">Counted qty</th>
            <th className="py-2 px-4 text-right">Variance</th>
            <th className="py-2 px-4 text-right">Value impact</th>
          </tr></thead>
          <tbody>
            {filtered.map((i) => {
              const key = i.id as string;
              const local = counts[key] ?? (i.counted_qty === null ? "" : String(i.counted_qty));
              const variance = local === "" ? 0 : Number(local) - Number(i.system_qty);
              return (
                <tr key={key} className="border-t">
                  <td className="py-2 px-4">{i.product_name} <span className="text-xs text-muted-foreground">{i.unit}</span></td>
                  <td className="py-2 px-4 text-right">{Number(i.system_qty)}</td>
                  <td className="py-2 px-4 text-right">
                    <Input type="number" step="0.001" disabled={!isEditable}
                      className="text-right h-8"
                      value={local}
                      onChange={(e) => setCounts({ ...counts, [key]: e.target.value })}
                      onBlur={(e) => saveCount(key, e.target.value)}
                    />
                  </td>
                  <td className={"py-2 px-4 text-right " + (variance < 0 ? "text-destructive" : variance > 0 ? "text-success" : "")}>{variance ? variance.toFixed(3).replace(/\.?0+$/, "") : "—"}</td>
                  <td className="py-2 px-4 text-right">{variance ? formatMoney(variance * Number(i.unit_cost)) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
