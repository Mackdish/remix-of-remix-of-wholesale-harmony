import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type SettingsForm = {
  business_name: string;
  address: string;
  phone: string;
  email: string;
  tax_number: string;
  currency: string;
  tax_rate: number;
  receipt_footer: string;
};

function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings-page"],
    queryFn: async () => (await supabase.from("settings").select("*").eq("id", 1).single()).data,
  });
  const [form, setForm] = useState<SettingsForm | null>(null);
  useEffect(() => {
    if (data && !form) setForm({
      business_name: data.business_name ?? "",
      address: data.address ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      tax_number: data.tax_number ?? "",
      currency: data.currency ?? "KES",
      tax_rate: Number(data.tax_rate ?? 16),
      receipt_footer: data.receipt_footer ?? "",
    });
  }, [data, form]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { error } = await supabase.from("settings").update(form).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings-page"] }); qc.invalidateQueries({ queryKey: ["settings"] }); toast.success("Saved"); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!form) return <div>Loading…</div>;

  return (
    <>
      <PageHeader title="Settings" description="Business identity, tax, and receipt configuration." />
      <Card className="p-6 max-w-2xl">
        <form className="grid grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="col-span-2 space-y-1.5"><Label>Business name</Label><Input required value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Tax number</Label><Input value={form.tax_number} onChange={(e) => setForm({ ...form, tax_number: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Default tax rate %</Label><Input type="number" step="0.01" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) })} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Receipt footer</Label><Textarea value={form.receipt_footer} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} /></div>
          <div className="col-span-2 flex justify-end"><Button type="submit" disabled={save.isPending}>Save changes</Button></div>
        </form>
      </Card>
    </>
  );
}
