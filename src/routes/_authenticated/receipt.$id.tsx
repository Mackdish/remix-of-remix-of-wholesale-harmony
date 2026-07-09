import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSaleWithItems } from "@/lib/api.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney, formatDateTime, formatQty } from "@/lib/format";
import { Printer, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/receipt/$id")({
  component: ReceiptPage,
});

function ReceiptPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getSaleWithItems);
  const { data } = useQuery({ queryKey: ["sale", id], queryFn: () => fn({ data: { id } }) });

  if (!data?.sale) return <div className="p-6">Loading receipt…</div>;
  const { sale, items, settings } = data;
  const currency = settings?.currency ?? "KES";

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 no-print">
        <Link to="/sales"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back to sales</Button></Link>
        <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />Print</Button>
      </div>

      <Card className="max-w-2xl mx-auto p-8 print:shadow-none print:border-0">
        <div className="text-center border-b pb-4 mb-4">
          <h1 className="text-2xl font-bold">{settings?.business_name}</h1>
          {settings?.address && <div className="text-sm text-muted-foreground">{settings.address}</div>}
          {settings?.phone && <div className="text-sm text-muted-foreground">Tel: {settings.phone}</div>}
          {settings?.tax_number && <div className="text-xs text-muted-foreground">Tax PIN: {settings.tax_number}</div>}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div>
            <div className="font-semibold">Receipt</div>
            <div className="font-mono">{sale.receipt_no}</div>
          </div>
          <div className="text-right">
            <div className="font-semibold">Date</div>
            <div>{formatDateTime(sale.sale_date)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Customer</div>
            <div>{(sale as { customers?: { name: string } }).customers?.name ?? "Walk-in customer"}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Payment</div>
            <div className="capitalize">{sale.payment_method}</div>
          </div>
        </div>

        <table className="w-full text-sm mb-4">
          <thead className="border-y">
            <tr className="text-left">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
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
          <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(sale.subtotal, currency)}</span></div>
          <div className="flex justify-between"><span>Tax</span><span>{formatMoney(sale.tax, currency)}</span></div>
          {Number(sale.discount) > 0 && <div className="flex justify-between"><span>Discount</span><span>-{formatMoney(sale.discount, currency)}</span></div>}
          <div className="flex justify-between font-bold text-base border-t pt-1"><span>TOTAL</span><span>{formatMoney(sale.total, currency)}</span></div>
          <div className="flex justify-between"><span>Paid</span><span>{formatMoney(sale.amount_paid, currency)}</span></div>
          {Number(sale.change_due) > 0 && <div className="flex justify-between"><span>Change</span><span>{formatMoney(sale.change_due, currency)}</span></div>}
          {Number(sale.balance_due) > 0 && <div className="flex justify-between text-destructive"><span>Balance due</span><span>{formatMoney(sale.balance_due, currency)}</span></div>}
        </div>

        <div className="text-center text-sm text-muted-foreground mt-6 pt-4 border-t">
          {settings?.receipt_footer}
        </div>
      </Card>
    </div>
  );
}
