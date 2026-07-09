import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { processSale } from "@/lib/api.functions";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Trash2, Plus, Minus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, formatQty } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pos")({
  component: POSPage,
});

type CartLine = { product_id: string; name: string; code: string; unit_price: number; quantity: number; discount: number; stock_qty: number };

function POSPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mpesa" | "bank" | "cheque" | "credit">("cash");
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [globalDiscount, setGlobalDiscount] = useState<number>(0);
  const [notes, setNotes] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: ["pos-products"],
    queryFn: async () => (await supabase.from("products").select("id,code,barcode,name,selling_price,wholesale_price,stock_qty,unit").eq("is_active", true)).data ?? [],
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["pos-customers"],
    queryFn: async () => (await supabase.from("customers").select("id,name,type").order("name")).data ?? [],
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("settings").select("*").eq("id", 1).single()).data,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products.slice(0, 30);
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q)).slice(0, 30);
  }, [products, search]);

  function addProduct(p: (typeof products)[number]) {
    const cust = customers.find((c) => c.id === customerId);
    const useWholesale = cust?.type === "wholesale" && Number(p.wholesale_price) > 0;
    const price = Number(useWholesale ? p.wholesale_price : p.selling_price);
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product_id === p.id);
      if (idx >= 0) {
        const cp = [...prev];
        cp[idx] = { ...cp[idx], quantity: cp[idx].quantity + 1 };
        return cp;
      }
      return [...prev, { product_id: p.id, name: p.name, code: p.code, unit_price: price, quantity: 1, discount: 0, stock_qty: Number(p.stock_qty) }];
    });
  }

  const subtotal = cart.reduce((s, l) => s + l.quantity * l.unit_price - l.discount, 0);
  const taxRate = Number(settings?.tax_rate ?? 0);
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax - globalDiscount;
  const balance = Math.max(0, total - amountPaid);
  const change = Math.max(0, amountPaid - total);

  const process = useServerFn(processSale);
  const submit = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Cart is empty");
      const paid = paymentMethod === "credit" ? 0 : amountPaid || total;
      const res = await process({
        data: {
          items: cart.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price, discount: l.discount })),
          customer_id: customerId || null,
          payment_method: paymentMethod,
          amount_paid: paid,
          tax,
          discount: globalDiscount,
          notes,
        },
      });
      return res.id;
    },
    onSuccess: (id) => {
      toast.success("Sale completed");
      navigate({ to: "/receipt/$id", params: { id } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      <PageHeader title="Point of Sale" description="Ring up customer purchases." />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <Card className="p-4">
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input autoFocus placeholder="Search product name, code, or scan barcode…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filtered.length === 1) { addProduct(filtered[0]); setSearch(""); }
                }} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[520px] overflow-y-auto">
              {filtered.map((p) => (
                <button key={p.id} onClick={() => addProduct(p)} disabled={Number(p.stock_qty) <= 0}
                  className="text-left rounded-md border p-3 hover:border-primary hover:bg-muted/30 transition disabled:opacity-50 disabled:cursor-not-allowed">
                  <div className="font-medium text-sm truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{p.code}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">{formatMoney(p.selling_price, settings?.currency)}</div>
                    <div className={`text-xs ${Number(p.stock_qty) <= 0 ? "text-destructive" : "text-muted-foreground"}`}>{formatQty(p.stock_qty)} {p.unit}</div>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <div className="col-span-full py-10 text-center text-muted-foreground text-sm">No matching products.</div>}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <ShoppingCart className="h-4 w-4" /> <div className="font-semibold">Cart ({cart.length})</div>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {cart.map((l, i) => (
                <div key={l.product_id} className="flex items-center gap-2 border-b pb-2 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{l.name}</div>
                    <div className="text-xs text-muted-foreground">{formatMoney(l.unit_price, settings?.currency)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setCart((c) => c.map((x, j) => j === i ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))}><Minus className="h-3 w-3" /></Button>
                    <Input type="number" value={l.quantity} onChange={(e) => setCart((c) => c.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) || 1 } : x))} className="h-7 w-14 text-center px-1" />
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setCart((c) => c.map((x, j) => j === i ? { ...x, quantity: x.quantity + 1 } : x))}><Plus className="h-3 w-3" /></Button>
                  </div>
                  <div className="w-20 text-right text-sm font-medium">{formatMoney(l.quantity * l.unit_price - l.discount, settings?.currency)}</div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setCart((c) => c.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              {cart.length === 0 && <div className="py-8 text-center text-muted-foreground text-sm">Cart is empty.</div>}
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Walk-in customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.type})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Payment method</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="credit" disabled={!customerId}>Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Discount</Label><Input type="number" step="0.01" value={globalDiscount} onChange={(e) => setGlobalDiscount(Number(e.target.value))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Amount received</Label><Input type="number" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(Number(e.target.value))} disabled={paymentMethod === "credit"} /></div>

            <div className="border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatMoney(subtotal, settings?.currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax ({taxRate}%)</span><span>{formatMoney(tax, settings?.currency)}</span></div>
              {globalDiscount > 0 && <div className="flex justify-between text-destructive"><span>Discount</span><span>-{formatMoney(globalDiscount, settings?.currency)}</span></div>}
              <div className="flex justify-between font-semibold text-lg pt-1 border-t"><span>Total</span><span>{formatMoney(total, settings?.currency)}</span></div>
              {paymentMethod !== "credit" && amountPaid > 0 && (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Change</span><span>{formatMoney(change, settings?.currency)}</span></div>
                  {balance > 0 && <div className="flex justify-between text-warning-foreground"><span>Balance due</span><span>{formatMoney(balance, settings?.currency)}</span></div>}
                </>
              )}
              {paymentMethod === "credit" && <div className="flex justify-between text-info"><span>On credit</span><span>{formatMoney(total, settings?.currency)}</span></div>}
            </div>

            <Button className="w-full" size="lg" disabled={submit.isPending || cart.length === 0} onClick={() => submit.mutate()}>
              Complete sale
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}
