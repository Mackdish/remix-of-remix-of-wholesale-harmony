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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/suppliers")({
  component: SuppliersPage,
});

type SupplierForm = { id?: string; name: string; contact_person: string; phone: string; email: string; address: string; tax_number: string; bank_details: string };
const empty: SupplierForm = { name: "", contact_person: "", phone: "", email: "", address: "", tax_number: "", bank_details: "" };

function SuppliersPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<SupplierForm | null>(null);
  const { data = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await supabase.from("suppliers").select("*").order("name")).data ?? [],
  });
  const save = useMutation({
    mutationFn: async (s: SupplierForm) => {
      const payload = { name: s.name, contact_person: s.contact_person, phone: s.phone, email: s.email, address: s.address, tax_number: s.tax_number, bank_details: s.bank_details };
      const q = s.id ? supabase.from("suppliers").update(payload).eq("id", s.id) : supabase.from("suppliers").insert(payload);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); setEditing(null); toast.success("Saved"); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      <PageHeader title="Suppliers" description="Manage suppliers, payment history and balances."
        actions={<Button onClick={() => setEditing({ ...empty })}><Plus className="h-4 w-4 mr-2" />New supplier</Button>} />
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <th className="py-3 px-4">Name</th><th className="py-3 px-4">Contact</th><th className="py-3 px-4">Phone</th><th className="py-3 px-4">Email</th><th className="py-3 px-4 text-right">Balance</th><th></th>
          </tr></thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id} className="border-t hover:bg-muted/30">
                <td className="py-3 px-4 font-medium">{s.name}</td>
                <td className="py-3 px-4">{s.contact_person || "—"}</td>
                <td className="py-3 px-4">{s.phone || "—"}</td>
                <td className="py-3 px-4">{s.email || "—"}</td>
                <td className="py-3 px-4 text-right font-medium">{formatMoney(s.balance)}</td>
                <td className="py-3 px-4 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing({ id: s.id, name: s.name, contact_person: s.contact_person ?? "", phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "", tax_number: s.tax_number ?? "", bank_details: s.bank_details ?? "" })}><Pencil className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No suppliers.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit supplier" : "New supplier"}</DialogTitle></DialogHeader>
          {editing && (
            <form className="grid grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }}>
              <div className="space-y-1.5 col-span-2"><Label>Name *</Label><Input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Contact person</Label><Input value={editing.contact_person} onChange={(e) => setEditing({ ...editing, contact_person: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Email</Label><Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Address</Label><Textarea value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Tax number</Label><Input value={editing.tax_number} onChange={(e) => setEditing({ ...editing, tax_number: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Bank details</Label><Input value={editing.bank_details} onChange={(e) => setEditing({ ...editing, bank_details: e.target.value })} /></div>
              <div className="col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={save.isPending}>Save</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
