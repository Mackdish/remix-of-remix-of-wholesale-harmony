import jsPDF from "jspdf";
import autoTable, { type UserOptions } from "jspdf-autotable";
import { formatMoney, formatDate } from "@/lib/format";

export type PdfColumn = { header: string; key: string; align?: "left" | "right" | "center"; money?: boolean };

export function buildReportPdf(opts: {
  title: string;
  subtitle?: string;
  business?: string;
  from?: string | Date | null;
  to?: string | Date | null;
  summary?: Array<{ label: string; value: string }>;
  columns?: PdfColumn[];
  rows?: Array<Record<string, unknown>>;
  footNote?: string;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text(opts.business ?? "Wholesale ERP", 40, 48);
  doc.setFontSize(12); doc.setFont("helvetica", "normal");
  doc.text(opts.title, 40, 68);
  if (opts.subtitle) { doc.setFontSize(10); doc.setTextColor(120); doc.text(opts.subtitle, 40, 84); doc.setTextColor(0); }
  const range = opts.from || opts.to ? `Period: ${opts.from ? formatDate(opts.from) : "…"} — ${opts.to ? formatDate(opts.to) : "…"}` : "";
  doc.setFontSize(10);
  doc.text(range, pageWidth - 40, 48, { align: "right" });
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 40, 62, { align: "right" });

  let cursorY = 110;

  if (opts.summary?.length) {
    autoTable(doc, {
      startY: cursorY,
      head: [["Metric", "Value"]],
      body: opts.summary.map((s) => [s.label, s.value]),
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
      margin: { left: 40, right: 40 },
    });
    // @ts-expect-error lastAutoTable added by plugin
    cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 20;
  }

  if (opts.columns?.length && opts.rows?.length) {
    const cols = opts.columns;
    autoTable(doc, {
      startY: cursorY,
      head: [cols.map((c) => c.header)],
      body: opts.rows.map((r) => cols.map((c) => {
        const v = r[c.key];
        if (c.money) return formatMoney(v as number);
        return v == null ? "" : String(v);
      })),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      columnStyles: Object.fromEntries(cols.map((c, i) => [i, { halign: c.align ?? (c.money ? "right" : "left") }])) as UserOptions["columnStyles"],
      margin: { left: 40, right: 40 },
    });
  }

  if (opts.footNote) {
    // @ts-expect-error lastAutoTable added by plugin
    const y = (doc.lastAutoTable?.finalY ?? cursorY) + 20;
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(opts.footNote, 40, y);
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
  }

  return doc;
}

export function savePdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}
