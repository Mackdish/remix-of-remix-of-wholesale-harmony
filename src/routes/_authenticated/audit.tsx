import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

function AuditPage() {
  const { data = [] } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => (await supabase.from("audit_log").select("*, profiles:user_id(full_name)").order("created_at", { ascending: false }).limit(500)).data ?? [],
  });

  return (
    <>
      <PageHeader title="Audit log" description="Every significant activity within the system." />
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <th className="py-3 px-4">When</th><th className="py-3 px-4">User</th><th className="py-3 px-4">Action</th><th className="py-3 px-4">Entity</th><th className="py-3 px-4">Details</th>
          </tr></thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="py-3 px-4 text-xs">{formatDateTime(a.created_at)}</td>
                <td className="py-3 px-4">{(a as { profiles?: { full_name: string } }).profiles?.full_name ?? "—"}</td>
                <td className="py-3 px-4"><Badge variant="outline">{a.action}</Badge></td>
                <td className="py-3 px-4">{a.entity}</td>
                <td className="py-3 px-4 text-xs font-mono text-muted-foreground">{a.details ? JSON.stringify(a.details) : ""}</td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No activity yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
