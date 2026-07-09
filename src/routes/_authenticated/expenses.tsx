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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatMoney, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/expenses")({
  component: ExpensesPage,
});

const CATEGORIES = ["Rent", "Electricity", "Water", "Internet", "Transport", "Fuel", "Salaries", "Maintenance", "Advertising", "Packaging", "Other"];

function ExpensesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "Other", description: "", amount: 0, expense_date: new Date().toISOString().slice(0, 10), payment_method: "cash" as const });

  const { data = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => (await supabase.from("expenses").select("*").order("expense_date", { ascending: false }).limit(500)).data ?? [],
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("expenses").insert(form);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); setOpen(false); toast.success("Saved"); },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });

  const total = data.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <>
      <PageHeader title="Expenses" description={`Total logged: ${formatMoney(total)}`}
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />New expense</Button>} />
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <th className="py-3 px-4">Date</th><th className="py-3 px-4">Category</th><th className="py-3 px-4">Description</th><th className="py-3 px-4">Method</th><th className="py-3 px-4 text-right">Amount</th><th></th>
          </tr></thead>
          <tbody>
            {data.map((e) => (
              <tr key={e.id} className="border-t hover:bg-muted/30">
                <td className="py-3 px-4">{formatDate(e.expense_date)}</td>
                <td className="py-3 px-4">{e.category}</td>
                <td className="py-3 px-4 text-muted-foreground">{e.description}</td>
                <td className="py-3 px-4 capitalize">{e.payment_method}</td>
                <td className="py-3 px-4 text-right font-medium">{formatMoney(e.amount)}</td>
                <td className="py-3 px-4 text-right"><Button variant="ghost" size="sm" onClick={() => del.mutate(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No expenses.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New expense</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date</Label><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
              <div><Label>Amount</Label><Input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment method</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v as typeof form.payment_method })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="mpesa">M-Pesa</SelectItem><SelectItem value="bank">Bank</SelectItem><SelectItem value="cheque">Cheque</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={save.isPending}>Save</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
