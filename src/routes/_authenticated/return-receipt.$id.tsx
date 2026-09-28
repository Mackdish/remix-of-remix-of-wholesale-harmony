import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getReturnWithItems } from "@/lib/api.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney, formatDateTime, formatQty } from "@/lib/format";
import { Printer, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/return-receipt/$id")({
  head: () => ({ meta: [{ title: "Return Receipt — Wholesale ERP" }] }),
  component: ReturnReceiptPage,
});

function ReturnReceiptPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getReturnWithItems);
  const { data } = useQuery({ queryKey: ["return", id], queryFn: () => fn({ data: { id } }) });

  if (!data?.ret) return <div className="p-6">Loading return receipt…</div>;
  const { ret, items, settings } = data;
  const currency = settings?.currency ?? "KES";
  const r = ret as typeof ret & { customers?: { name?: string } | null; sales?: { receipt_no?: string } | null };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 no-print">
        <Link to="/returns"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back to returns</Button></Link>
        <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />Print</Button>
      </div>

      <Card className="max-w-2xl mx-auto p-8 print:shadow-none print:border-0">
        <div className="text-center border-b pb-4 mb-4">
          <h1 className="text-2xl font-bold">{settings?.business_name}</h1>
          {settings?.address && <div className="text-sm text-muted-foreground">{settings.address}</div>}
          {settings?.phone && <div className="text-sm text-muted-foreground">Tel: {settings.phone}</div>}
          {settings?.tax_number && <div className="text-xs text-muted-foreground">Tax PIN: {settings.tax_number}</div>}
          <div className="mt-2 text-sm font-semibold uppercase tracking-wide">Customer Return / Credit Note</div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div><div className="font-semibold">Return reference</div><div className="font-mono">{r.return_no}</div></div>
          <div className="text-right"><div className="font-semibold">Date</div><div>{formatDateTime(r.return_date)}</div></div>
          <div><div className="text-xs text-muted-foreground">Customer</div><div>{r.customers?.name ?? "Walk-in customer"}</div></div>
          <div className="text-right"><div className="text-xs text-muted-foreground">Original receipt</div><div className="font-mono">{r.sales?.receipt_no ?? "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Reason</div><div>{r.reason ?? "—"}</div></div>
          <div className="text-right"><div className="text-xs text-muted-foreground">Restocked</div><div>{r.restock ? "Yes" : "No"}</div></div>
        </div>

        <table className="w-full text-sm mb-4">
          <thead className="border-y"><tr className="text-left">
            <th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Total</th>
          </tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b">
                <td className="py-2">{it.product_name}</td>
                <td className="py-2 text-right">{formatQty(it.quantity)}</td>
                <td className="py-2 text-right">{formatMoney(it.unit_price, currency)}</td>
                <td className="py-2 text-right">{formatMoney(it.line_total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto max-w-xs text-sm space-y-1">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(r.subtotal, currency)}</span></div>
          <div className="flex justify-between"><span>Tax</span><span>{formatMoney(r.tax, currency)}</span></div>
          <div className="flex justify-between font-bold text-base border-t pt-1"><span>RETURN TOTAL</span><span>{formatMoney(r.total, currency)}</span></div>
          <div className="flex justify-between"><span className="capitalize">Refunded ({r.refund_method})</span><span>{formatMoney(r.refund_amount, currency)}</span></div>
        </div>

        {r.notes && <div className="text-sm mt-4"><span className="text-muted-foreground">Notes: </span>{r.notes}</div>}

        <div className="grid grid-cols-2 gap-8 text-xs text-muted-foreground mt-10">
          <div className="border-t pt-1">Customer signature</div>
          <div className="border-t pt-1">Served by</div>
        </div>
      </Card>
    </div>
  );
}
