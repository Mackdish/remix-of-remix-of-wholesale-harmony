import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

type CustomerForm = { id?: string; name: string; business_name: string; phone: string; email: string; address: string; type: "wholesale" | "retail" | "cash" | "vip"; credit_limit: number; discount_pct: number };
const empty: CustomerForm = { name: "", business_name: "", phone: "", email: "", address: "", type: "retail", credit_limit: 0, discount_pct: 0 };

function CustomersPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CustomerForm | null>(null);
  const { data = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => (await supabase.from("customers").select("*").order("name")).data ?? [],
  });
  const save = useMutation({
    mutationFn: async (c: CustomerForm) => {
      const payload = { name: c.name, business_name: c.business_name, phone: c.phone, email: c.email, address: c.address, type: c.type, credit_limit: c.credit_limit, discount_pct: c.discount_pct };
      const q = c.id ? supabase.from("customers").update(payload).eq("id", c.id) : supabase.from("customers").insert(payload);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); setEditing(null); toast.success("Saved"); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      <PageHeader title="Customers" description="Wholesale, retail, cash and VIP customers."
        actions={<Button onClick={() => setEditing({ ...empty })}><Plus className="h-4 w-4 mr-2" />New customer</Button>} />
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <th className="py-3 px-4">Name</th><th className="py-3 px-4">Type</th><th className="py-3 px-4">Phone</th><th className="py-3 px-4 text-right">Limit</th><th className="py-3 px-4 text-right">Balance</th><th></th>
          </tr></thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id} className="border-t hover:bg-muted/30">
                <td className="py-3 px-4"><div className="font-medium">{c.name}</div>{c.business_name && <div className="text-xs text-muted-foreground">{c.business_name}</div>}</td>
                <td className="py-3 px-4"><Badge variant="outline" className="capitalize">{c.type}</Badge></td>
                <td className="py-3 px-4">{c.phone || "—"}</td>
                <td className="py-3 px-4 text-right">{formatMoney(c.credit_limit)}</td>
                <td className="py-3 px-4 text-right font-medium">{formatMoney(c.balance)}</td>
                <td className="py-3 px-4 text-right"><Button variant="ghost" size="sm" onClick={() => setEditing({ id: c.id, name: c.name, business_name: c.business_name ?? "", phone: c.phone ?? "", email: c.email ?? "", address: c.address ?? "", type: c.type, credit_limit: Number(c.credit_limit), discount_pct: Number(c.discount_pct) })}><Pencil className="h-4 w-4" /></Button></td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No customers.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit customer" : "New customer"}</DialogTitle></DialogHeader>
          {editing && (
            <form className="grid grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}>
              <div className="space-y-1.5 col-span-2"><Label>Name *</Label><Input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Business name</Label><Input value={editing.business_name} onChange={(e) => setEditing({ ...editing, business_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Address</Label><Textarea value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={editing.type} onValueChange={(v) => setEditing({ ...editing, type: v as CustomerForm["type"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="wholesale">Wholesale</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Discount %</Label><Input type="number" step="0.01" value={editing.discount_pct} onChange={(e) => setEditing({ ...editing, discount_pct: Number(e.target.value) })} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Credit limit</Label><Input type="number" step="0.01" value={editing.credit_limit} onChange={(e) => setEditing({ ...editing, credit_limit: Number(e.target.value) })} /></div>
              <div className="col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={save.isPending}>Save</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
