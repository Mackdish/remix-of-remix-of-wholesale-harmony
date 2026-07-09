import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createStockAdjustment } from "@/lib/api.functions";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, formatQty, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/stock")({
  component: StockPage,
});

function StockPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<"adjustment" | "damage" | "expiry" | "return_in" | "return_out" | "opening" | "transfer">("adjustment");
  const [qty, setQty] = useState(0);
  const [notes, setNotes] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: ["stock-products"],
    queryFn: async () => (await supabase.from("products").select("id,name,code,unit,stock_qty,min_stock,buying_price,is_active").order("name")).data ?? [],
  });
  const { data: movements = [] } = useQuery({
    queryKey: ["stock-movements"],
    queryFn: async () => (await supabase.from("stock_movements").select("*, products(name,code,unit)").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });

  const adjust = useServerFn(createStockAdjustment);
  const submit = useMutation({
    mutationFn: async () => adjust({ data: { product_id: productId, movement_type: type, quantity: qty, notes } }),
    onSuccess: () => {
      toast.success("Adjustment recorded");
      qc.invalidateQueries({ queryKey: ["stock-products"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false); setProductId(""); setQty(0); setNotes("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      <PageHeader title="Stock" description="Live inventory quantities, movements and adjustments."
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />New adjustment</Button>} />

      <Tabs defaultValue="levels">
        <TabsList>
          <TabsTrigger value="levels">Stock levels</TabsTrigger>
          <TabsTrigger value="alerts">Low & out of stock</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
        </TabsList>

        <TabsContent value="levels">
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
                <th className="py-3 px-4">Code</th><th className="py-3 px-4">Product</th><th className="py-3 px-4 text-right">Qty</th><th className="py-3 px-4 text-right">Min</th><th className="py-3 px-4 text-right">Value</th><th className="py-3 px-4">Status</th>
              </tr></thead>
              <tbody>
                {products.filter((p) => p.is_active).map((p) => {
                  const out = Number(p.stock_qty) <= 0;
                  const low = !out && Number(p.min_stock) > 0 && Number(p.stock_qty) <= Number(p.min_stock);
                  return (
                    <tr key={p.id} className="border-t hover:bg-muted/30">
                      <td className="py-3 px-4 font-mono text-xs">{p.code}</td>
                      <td className="py-3 px-4">{p.name}</td>
                      <td className="py-3 px-4 text-right">{formatQty(p.stock_qty)} {p.unit}</td>
                      <td className="py-3 px-4 text-right">{formatQty(p.min_stock)}</td>
                      <td className="py-3 px-4 text-right">{formatMoney(Number(p.stock_qty) * Number(p.buying_price))}</td>
                      <td className="py-3 px-4">{out ? <Badge variant="destructive">Out</Badge> : low ? <Badge className="bg-warning text-warning-foreground">Low</Badge> : <Badge variant="outline">OK</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
                <th className="py-3 px-4">Code</th><th className="py-3 px-4">Product</th><th className="py-3 px-4 text-right">Qty</th><th className="py-3 px-4 text-right">Min</th><th className="py-3 px-4">Status</th>
              </tr></thead>
              <tbody>
                {products.filter((p) => p.is_active && (Number(p.stock_qty) <= 0 || (Number(p.min_stock) > 0 && Number(p.stock_qty) <= Number(p.min_stock)))).map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="py-3 px-4 font-mono text-xs">{p.code}</td>
                    <td className="py-3 px-4">{p.name}</td>
                    <td className="py-3 px-4 text-right">{formatQty(p.stock_qty)} {p.unit}</td>
                    <td className="py-3 px-4 text-right">{formatQty(p.min_stock)}</td>
                    <td className="py-3 px-4">{Number(p.stock_qty) <= 0 ? <Badge variant="destructive">Out</Badge> : <Badge className="bg-warning text-warning-foreground">Low</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="movements">
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
                <th className="py-3 px-4">Date</th><th className="py-3 px-4">Product</th><th className="py-3 px-4">Type</th><th className="py-3 px-4 text-right">Qty</th><th className="py-3 px-4">Notes</th>
              </tr></thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="py-3 px-4 text-xs">{formatDateTime(m.created_at)}</td>
                    <td className="py-3 px-4">{m.products?.name}</td>
                    <td className="py-3 px-4"><Badge variant="outline" className="capitalize">{m.movement_type}</Badge></td>
                    <td className={`py-3 px-4 text-right font-medium ${Number(m.quantity) > 0 ? "text-success" : "text-destructive"}`}>{Number(m.quantity) > 0 ? "+" : ""}{formatQty(m.quantity)}</td>
                    <td className="py-3 px-4 text-muted-foreground">{m.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Stock adjustment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="adjustment">Manual adjustment</SelectItem>
                  <SelectItem value="opening">Opening balance</SelectItem>
                  <SelectItem value="damage">Damage</SelectItem>
                  <SelectItem value="expiry">Expiry</SelectItem>
                  <SelectItem value="return_in">Return in</SelectItem>
                  <SelectItem value="return_out">Return out</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Quantity (use negative to decrease)</Label><Input type="number" step="0.001" value={qty} onChange={(e) => setQty(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submit.isPending || !productId} onClick={() => submit.mutate()}>Save</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
