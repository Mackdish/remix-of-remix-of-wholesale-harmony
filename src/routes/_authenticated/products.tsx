import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, formatQty } from "@/lib/format";
import { DeleteButton } from "@/components/delete-button";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

type ProductForm = {
  id?: string;
  code: string;
  barcode: string;
  name: string;
  description: string;
  category_id: string | null;
  supplier_id: string | null;
  brand: string;
  unit: string;
  buying_price: number;
  selling_price: number;
  wholesale_price: number;
  tax_rate: number;
  min_stock: number;
  max_stock: number;
  is_active: boolean;
};

const emptyForm: ProductForm = {
  code: "",
  barcode: "",
  name: "",
  description: "",
  category_id: null,
  supplier_id: null,
  brand: "",
  unit: "pcs",
  buying_price: 0,
  selling_price: 0,
  wholesale_price: 0,
  tax_rate: 16,
  min_stock: 0,
  max_stock: 0,
  is_active: true,
};

function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ProductForm | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*, categories(name), suppliers(name)").order("name");
      if (error) throw error;
      return data;
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories-list"],
    queryFn: async () => (await supabase.from("categories").select("id,name").order("name")).data ?? [],
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: async () => (await supabase.from("suppliers").select("id,name").order("name")).data ?? [],
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  const save = useMutation({
    mutationFn: async (p: ProductForm) => {
      const payload = {
        code: p.code,
        barcode: p.barcode || null,
        name: p.name,
        description: p.description,
        category_id: p.category_id || null,
        supplier_id: p.supplier_id || null,
        brand: p.brand,
        unit: p.unit,
        buying_price: p.buying_price,
        selling_price: p.selling_price,
        wholesale_price: p.wholesale_price,
        tax_rate: p.tax_rate,
        min_stock: p.min_stock,
        max_stock: p.max_stock,
        is_active: p.is_active,
      };
      if (p.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      setEditing(null);
      toast.success("Saved");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      <PageHeader
        title="Products"
        description="Complete database of all products."
        actions={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search name, code, barcode…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-64" />
            </div>
            <Button onClick={() => setEditing({ ...emptyForm, code: `SKU-${Date.now().toString().slice(-6)}` })}>
              <Plus className="h-4 w-4 mr-2" /> New product
            </Button>
          </>
        }
      />

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Buy</th>
                <th className="py-3 px-4 text-right">Sell</th>
                <th className="py-3 px-4 text-right">Stock</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const low = Number(p.stock_qty) <= Number(p.min_stock) && Number(p.min_stock) > 0;
                const out = Number(p.stock_qty) <= 0;
                return (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="py-3 px-4 font-mono text-xs">{p.code}</td>
                    <td className="py-3 px-4 font-medium">{p.name}</td>
                    <td className="py-3 px-4 text-muted-foreground">{p.categories?.name ?? "—"}</td>
                    <td className="py-3 px-4 text-right">{formatMoney(p.buying_price)}</td>
                    <td className="py-3 px-4 text-right">{formatMoney(p.selling_price)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={out ? "text-destructive font-medium" : low ? "text-warning-foreground font-medium" : ""}>
                        {formatQty(p.stock_qty)} {p.unit}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {!p.is_active ? <Badge variant="secondary">Inactive</Badge> : out ? <Badge variant="destructive">Out</Badge> : low ? <Badge className="bg-warning text-warning-foreground">Low</Badge> : <Badge variant="outline">OK</Badge>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditing({
                        id: p.id, code: p.code, barcode: p.barcode ?? "", name: p.name, description: p.description ?? "",
                        category_id: p.category_id, supplier_id: p.supplier_id, brand: p.brand ?? "", unit: p.unit,
                        buying_price: Number(p.buying_price), selling_price: Number(p.selling_price), wholesale_price: Number(p.wholesale_price),
                        tax_rate: Number(p.tax_rate), min_stock: Number(p.min_stock), max_stock: Number(p.max_stock), is_active: p.is_active,
                      })}><Pencil className="h-4 w-4" /></Button>
                      <DeleteButton kind="product" id={p.id} label={p.name} invalidate={[["products"]]} />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No products.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
          {editing && (
            <form
              className="grid grid-cols-2 gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(editing);
              }}
            >
              <div className="space-y-1.5"><Label>Code *</Label><Input required value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Barcode</Label><Input value={editing.barcode} onChange={(e) => setEditing({ ...editing, barcode: e.target.value })} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Name *</Label><Input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={editing.category_id ?? ""} onValueChange={(v) => setEditing({ ...editing, category_id: v || null })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Select value={editing.supplier_id ?? ""} onValueChange={(v) => setEditing({ ...editing, supplier_id: v || null })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Brand</Label><Input value={editing.brand} onChange={(e) => setEditing({ ...editing, brand: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Unit</Label><Input value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Buying price</Label><Input type="number" step="0.01" value={editing.buying_price} onChange={(e) => setEditing({ ...editing, buying_price: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Selling price</Label><Input type="number" step="0.01" value={editing.selling_price} onChange={(e) => setEditing({ ...editing, selling_price: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Wholesale price</Label><Input type="number" step="0.01" value={editing.wholesale_price} onChange={(e) => setEditing({ ...editing, wholesale_price: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Tax rate %</Label><Input type="number" step="0.01" value={editing.tax_rate} onChange={(e) => setEditing({ ...editing, tax_rate: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Min stock</Label><Input type="number" step="0.001" value={editing.min_stock} onChange={(e) => setEditing({ ...editing, min_stock: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Max stock</Label><Input type="number" step="0.001" value={editing.max_stock} onChange={(e) => setEditing({ ...editing, max_stock: Number(e.target.value) })} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Description</Label><Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="flex items-center gap-2 col-span-2">
                <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                <Label>Active</Label>
              </div>
              <div className="col-span-2 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" disabled={save.isPending}>Save</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
