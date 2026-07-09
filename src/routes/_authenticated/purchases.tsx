import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { processPurchase } from "@/lib/api.functions";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchases")({
  component: PurchasesPage,
});

type Line = { product_id: string; name: string; quantity: number; unit_cost: number };

function PurchasesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string>("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mpesa" | "bank" | "cheque" | "credit">("cash");
  const [amountPaid, setAmountPaid] = useState(0);
  const [tax, setTax] = useState(0);
  const [transport, setTransport] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");

  const { data: list = [] } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => (await supabase.from("purchases").select("*, suppliers(name)").order("purchase_date", { ascending: false }).limit(200)).data ?? [],
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-select"],
    queryFn: async () => (await supabase.from("suppliers").select("id,name").order("name")).data ?? [],
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products-select"],
    queryFn: async () => (await supabase.from("products").select("id,name,code,buying_price").order("name")).data ?? [],
  });

  const process = useServerFn(processPurchase);
  const submit = useMutation({
    mutationFn: async () => {
      if (lines.length === 0) throw new Error("Add at least one line");
      await process({
        data: {
          items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_cost: l.unit_cost })),
          supplier_id: supplierId || null,
          invoice_no: invoiceNo,
          payment_method: paymentMethod,
          amount_paid: amountPaid,
          tax, transport, discount, notes,
        },
      });
    },
    onSuccess: () => {
      toast.success("Purchase recorded");
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false); setLines([]); setSupplierId(""); setInvoiceNo(""); setAmountPaid(0); setTax(0); setTransport(0); setDiscount(0); setNotes("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);
  const total = subtotal + tax + transport - discount;

  return (
    <>
      <PageHeader title="Purchases" description="Record goods received from suppliers."
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />New purchase</Button>} />

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <th className="py-3 px-4">No.</th><th className="py-3 px-4">Date</th><th className="py-3 px-4">Supplier</th><th className="py-3 px-4">Invoice</th><th className="py-3 px-4">Method</th><th className="py-3 px-4 text-right">Total</th><th className="py-3 px-4 text-right">Paid</th>
          </tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="py-3 px-4 font-mono text-xs">{p.purchase_no}</td>
                <td className="py-3 px-4">{formatDate(p.purchase_date)}</td>
                <td className="py-3 px-4">{p.suppliers?.name ?? "—"}</td>
                <td className="py-3 px-4">{p.invoice_no || "—"}</td>
                <td className="py-3 px-4 capitalize">{p.payment_method}</td>
                <td className="py-3 px-4 text-right font-medium">{formatMoney(p.total)}</td>
                <td className="py-3 px-4 text-right">{formatMoney(p.amount_paid)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">No purchases yet.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New purchase</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Invoice #</Label><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></div>
          </div>

          <div className="space-y-2 mt-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button size="sm" variant="outline" onClick={() => setLines([...lines, { product_id: "", name: "", quantity: 1, unit_cost: 0 }])}><Plus className="h-3 w-3 mr-1" />Add line</Button>
            </div>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-6">
                  <Select value={l.product_id} onValueChange={(v) => {
                    const prod = products.find((p) => p.id === v);
                    setLines((c) => c.map((x, j) => j === i ? { ...x, product_id: v, name: prod?.name ?? "", unit_cost: prod?.buying_price ?? 0 } : x));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-2"><Input type="number" step="0.001" placeholder="Qty" value={l.quantity} onChange={(e) => setLines((c) => c.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} /></div>
                <div className="col-span-3"><Input type="number" step="0.01" placeholder="Unit cost" value={l.unit_cost} onChange={(e) => setLines((c) => c.map((x, j) => j === i ? { ...x, unit_cost: Number(e.target.value) } : x))} /></div>
                <div className="col-span-1"><Button size="icon" variant="ghost" onClick={() => setLines((c) => c.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-3 mt-3">
            <div><Label>Tax</Label><Input type="number" step="0.01" value={tax} onChange={(e) => setTax(Number(e.target.value))} /></div>
            <div><Label>Transport</Label><Input type="number" step="0.01" value={transport} onChange={(e) => setTransport(Number(e.target.value))} /></div>
            <div><Label>Discount</Label><Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
            <div><Label>Amount paid</Label><Input type="number" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(Number(e.target.value))} /></div>
            <div className="col-span-2">
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem><SelectItem value="mpesa">M-Pesa</SelectItem><SelectItem value="bank">Bank</SelectItem><SelectItem value="cheque">Cheque</SelectItem><SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 text-right pt-6">
              <div className="text-sm text-muted-foreground">Subtotal: {formatMoney(subtotal)}</div>
              <div className="text-lg font-semibold">Total: {formatMoney(total)}</div>
            </div>
          </div>
          <div className="mt-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={submit.isPending} onClick={() => submit.mutate()}>Save purchase</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
