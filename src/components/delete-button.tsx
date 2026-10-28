import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMyRoles } from "@/lib/api.functions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export type DeletableKind = "product" | "category" | "customer" | "supplier" | "expense" | "sale" | "purchase";

/** Admins and Managers may delete records. */
export function canDeleteWithRoles(roles: string[]) {
  return roles.includes("admin") || roles.includes("manager");
}

export function useCanDelete() {
  const rolesFn = useServerFn(getMyRoles);
  const { data: roles = [] } = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });
  return canDeleteWithRoles(roles as string[]);
}

export function DeleteButton({
  kind, id, label, invalidate, warning,
}: { kind: DeletableKind; id: string; label: string; invalidate: string[][]; warning?: string }) {
  const qc = useQueryClient();
  const canDelete = useCanDelete();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("delete_record", { _kind: kind, _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Deleted");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!canDelete) return null;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Delete ${label}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>{warning ?? "This cannot be undone."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => del.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
