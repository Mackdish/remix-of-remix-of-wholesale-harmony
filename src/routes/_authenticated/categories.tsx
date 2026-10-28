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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { DeleteButton } from "@/components/delete-button";

export const Route = createFileRoute("/_authenticated/categories")({
  component: CategoriesPage,
});

function CategoriesPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const [editing, setEditing] = useState<{ id?: string; name: string; description: string } | null>(null);

  const save = useMutation({
    mutationFn: async (c: { id?: string; name: string; description: string }) => {
      if (c.id) {
        const { error } = await supabase.from("categories").update({ name: c.name, description: c.description }).eq("id", c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories").insert({ name: c.name, description: c.description });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      setEditing(null);
      toast.success("Saved");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      <PageHeader
        title="Categories"
        description="Organize products into logical groups."
        actions={
          <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing({ name: "", description: "" })}>
                <Plus className="h-4 w-4 mr-2" /> New category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing?.id ? "Edit category" : "New category"}</DialogTitle></DialogHeader>
              {editing && (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save.mutate(editing);
                  }}
                >
                  <div className="space-y-1.5"><Label>Name</Label><Input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Description</Label><Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
                  <Button type="submit" disabled={save.isPending}>Save</Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
        }
      />
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
              <th className="py-3 px-4">Name</th>
              <th className="py-3 px-4">Description</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id} className="border-t hover:bg-muted/30">
                <td className="py-3 px-4 font-medium">{c.name}</td>
                <td className="py-3 px-4 text-muted-foreground">{c.description || "—"}</td>
                <td className="py-3 px-4"><Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Active" : "Inactive"}</Badge></td>
                <td className="py-3 px-4 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing({ id: c.id, name: c.name, description: c.description ?? "" })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <DeleteButton kind="category" id={c.id} label={c.name} invalidate={[["categories"], ["categories-list"]]} warning="Products in this category will be left without a category." />
                </td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No categories yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
