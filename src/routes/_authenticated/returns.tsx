import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { processSalesReturn } from "@/lib/api.functions";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Printer } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/returns")({
  component: ReturnsPage,
});

type Line = { product_id: string; product_name: string; quantity: number; unit_price: number };

function ReturnsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saleId, setSaleId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [refundAmount, setRefundAmount] = useState(0);
  const [restock, setRestock] = useState(true);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const navigate = useNavigate();
  const [lines, setLines] = useState<Line[]>([]);

  const { data: returns = [] } = useQuery({
    queryKey: ["returns"],
    queryFn: async () => (await supabase.from("sales_returns")
      .select("*, customers(name), sales(receipt_no)")
      .order("return_date", { ascending: false }).limit(100)).data ?? [],
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["returns-sales-lookup"],
    queryFn: async () => (await supabase.from("sales")
      .select("id,receipt_no,total,customer_id,sale_date,customers(name)")
      .eq("status", "completed").order("sale_date", { ascending: false }).limit(200)).data ?? [],
  });

  const { data: products = [] } = useQuery({
    queryKey: ["returns-products"],
    queryFn: async () => (await supabase.from("products")
      .select("id,name,code,selling_price,unit").eq("is_active", true).order("name")).data ?? [],
  });

  async function loadSaleItems(id: string) {
    setSaleId(id);
    const sale = sales.find((s) => s.id === id);
    if (sale) setCustomerId(sale.customer_id ?? "");
    const { data } = await supabase.from("sale_items").select("*").eq("sale_id", id);
    setLines((data ?? []).map((r) => ({
      product_id: r.product_id as string,
      product_name: r.product_name as string,
      quantity: Number(r.quantity),
      unit_price: Number(r.unit_price),
    })));
  }

  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const submitFn = useServerFn(processSalesReturn);
  const submit = useMutation({
    mutationFn: async () => submitFn({ data: {
      items: lines.filter((l) => l.quantity > 0),
      sale_id: saleId || null,
      customer_id: customerId || null,
      refund_method: refundMethod,
      refund_amount: Number(refundAmount) || 0,
      restock,
      reason,
      notes,
    } }),
    onSuccess: (res) => {
      toast.success("Return processed");
      qc.invalidateQueries({ queryKey: ["returns"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false); setLines([]); setSaleId(""); setCustomerId(""); setRefundAmount(0); setNotes(""); setReason("");
      navigate({ to: "/return-receipt/$id", params: { id: res.id } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      <PageHeader title="Customer Returns" description="Record items returned by customers, restock and refund."
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />New return</Button>} />

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <th className="py-3 px-4">Return #</th>
            <th className="py-3 px-4">Date</th>
            <th className="py-3 px-4">Original sale</th>
            <th className="py-3 px-4">Customer</th>
            <th className="py-3 px-4">Reason</th>
            <th className="py-3 px-4">Refund</th>
            <th className="py-3 px-4 text-right">Total</th>
            <th className="py-3 px-4"></th>
          </tr></thead>
          <tbody>
            {returns.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-3 px-4 font-mono text-xs">{r.return_no}</td>
                <td className="py-3 px-4">{formatDateTime(r.return_date)}</td>
                <td className="py-3 px-4 font-mono text-xs">{(r.sales as { receipt_no?: string } | null)?.receipt_no ?? "—"}</td>
                <td className="py-3 px-4">{(r.customers as { name?: string } | null)?.name ?? "Walk-in"}</td>
                <td className="py-3 px-4" title={r.notes ?? ""}>{r.reason ?? "—"}</td>
                <td className="py-3 px-4 capitalize">{r.refund_method} · {formatMoney(r.refund_amount)}</td>
                <td className="py-3 px-4 text-right font-medium">{formatMoney(r.total)}</td>
                <td className="py-3 px-4 text-right">
                  <Link to="/return-receipt/$id" params={{ id: r.id }}><Button size="sm" variant="ghost"><Printer className="h-4 w-4" /></Button></Link>
                </td>
              </tr>
            ))}
            {returns.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">No returns yet.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>New customer return</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Original sale (optional)</Label>
              <Select value={saleId} onValueChange={loadSaleItems}>
                <SelectTrigger><SelectValue placeholder="Pick a sale to prefill items" /></SelectTrigger>
                <SelectContent>
                  {sales.map((s) => (<SelectItem key={s.id} value={s.id}>{s.receipt_no} — {formatMoney(s.total)}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Refund method</Label>
              <Select value={refundMethod} onValueChange={setRefundMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["cash","mpesa","bank","cheque","credit"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Returned items</Label>
              <Button variant="outline" size="sm" onClick={() => setLines([...lines, { product_id: "", product_name: "", quantity: 1, unit_price: 0 }])}>
                <Plus className="h-4 w-4 mr-1" /> Add line
              </Button>
            </div>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/40 text-xs uppercase text-muted-foreground text-left">
                  <th className="py-2 px-3">Product</th><th className="py-2 px-3 w-24">Qty</th><th className="py-2 px-3 w-32">Unit price</th><th className="py-2 px-3 w-24 text-right">Total</th><th className="w-8"></th>
                </tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-2 px-3">
                        <Select value={l.product_id} onValueChange={(v) => {
                          const p = products.find((x) => x.id === v);
                          const copy = [...lines]; copy[i] = { ...l, product_id: v, product_name: p?.name ?? "", unit_price: l.unit_price || Number(p?.selling_price ?? 0) }; setLines(copy);
                        }}>
                          <SelectTrigger><SelectValue placeholder={l.product_name || "Select product"} /></SelectTrigger>
                          <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-3"><Input type="number" min={0} step="0.001" value={l.quantity} onChange={(e) => { const c = [...lines]; c[i] = { ...l, quantity: Number(e.target.value) }; setLines(c); }} /></td>
                      <td className="py-2 px-3"><Input type="number" min={0} step="0.01" value={l.unit_price} onChange={(e) => { const c = [...lines]; c[i] = { ...l, unit_price: Number(e.target.value) }; setLines(c); }} /></td>
                      <td className="py-2 px-3 text-right">{formatMoney(l.quantity * l.unit_price)}</td>
                      <td className="py-2 px-3"><Button variant="ghost" size="icon" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></td>
                    </tr>
                  ))}
                  {lines.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No items — pick a sale or add lines.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div><Label>Refund amount</Label><Input type="number" min={0} step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(Number(e.target.value))} /></div>
            <label className="flex items-center gap-2 h-10 mt-6"><Checkbox checked={restock} onCheckedChange={(v) => setRestock(!!v)} /> Restock items</label>
            <div className="text-right"><div className="text-xs text-muted-foreground uppercase">Return total</div><div className="text-2xl font-semibold">{formatMoney(total)}</div></div>
          </div>
          <div>
            <Label>Reason for return</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
              <SelectContent>
                {["Damaged","Expired","Wrong item","Not as described","Customer changed mind","Excess quantity","Other"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Notes</Label><Textarea placeholder="Additional details" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={submit.isPending || lines.length === 0} onClick={() => submit.mutate()}>{submit.isPending ? "Processing…" : "Process return"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
