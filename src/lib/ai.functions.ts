import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth.middleware";
import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";
import type { Json } from "@/integrations/supabase/types";

const AI_MODEL = "openai/gpt-6-astra";

type ReportInsightAnalysis = {
  summary: string;
  unusual_trends: Array<{
    title: string;
    detail: string;
    severity: "low" | "medium" | "high";
    metric: string | null;
  }>;
  recommendations: Array<{
    title: string;
    detail: string;
    priority: "low" | "medium" | "high";
  }>;
};

const insightJsonSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "A short plain-language summary of how the day went, 2-4 sentences, using the actual figures provided.",
    },
    unusual_trends: {
      type: "array",
      description:
        "Unusual or notable trends and anomalies found in the data, most severe first. Empty array if nothing unusual.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short headline for the trend" },
          detail: {
            type: "string",
            description: "What is unusual, citing the concrete numbers from the report",
          },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          metric: {
            type: ["string", "null"],
            description: "The key figure or metric this is about, e.g. 'Revenue -38% vs 14-day average', or null",
          },
        },
        required: ["title", "detail", "severity", "metric"],
        additionalProperties: false,
      },
    },
    recommendations: {
      type: "array",
      description:
        "Concrete follow-up actions a manager or accountant should take, most urgent first.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short action headline" },
          detail: {
            type: "string",
            description: "What to do, who should do it, and why, grounded in the report data",
          },
          priority: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["title", "detail", "priority"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "unusual_trends", "recommendations"],
  additionalProperties: false,
};

const SYSTEM_INSTRUCTIONS = [
  "You are the analytics copilot for a wholesale trading business (currency: Kenyan Shillings, KES).",
  "You receive a daily sales report and an inventory snapshot as JSON, prepared by a manager or accountant.",
  "Compare the day against the recent history included in the data and identify unusual trends, anomalies and risks:",
  "sales spikes or drops, margin changes, unusual discounts, payment-method shifts, dead or slow-moving stock,",
  "low or out-of-stock items, stock value drifting, and anything else notable in the figures.",
  "Then recommend concrete, actionable follow-ups for a manager or accountant (e.g. reorder, investigate a drop,",
  "follow up a customer, adjust pricing, count stock). Ground every statement in the provided data;",
  "if the data is empty or too thin to judge, say so in the summary and return empty arrays.",
  "Do not invent figures, customers or products that are not in the data.",
  "Respond only with JSON matching the required schema.",
].join(" ");

function collectOutputText(response: { output: Array<{ type: string; content?: unknown }> }): string {
  let text = "";
  for (const item of response.output) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content as Array<{ type: string; text?: string }>) {
      if (part.type === "output_text" && typeof part.text === "string") text += part.text;
    }
  }
  return text;
}

export type AnalyzeReportInput = {
  report_date: string;
  sales_data: unknown;
  inventory_data: unknown;
  notes?: string;
};

export const analyzeDailyReport = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: AnalyzeReportInput) => d)
  .handler(async ({ data, context }) => {
    const allowed = new Set(["admin", "manager", "accountant"]);
    const { data: roles, error: rolesErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesErr) throw new Error(rolesErr.message);
    if (!(roles ?? []).some((r) => allowed.has(r.role as string))) {
      throw new Error("Only administrators, managers and accountants can run AI analysis");
    }

    const userMessage = [
      `Analyze the following report data for ${data.report_date}.`,
      "",
      "SALES REPORT:",
      JSON.stringify(data.sales_data ?? {}),
      "",
      "INVENTORY SNAPSHOT:",
      JSON.stringify(data.inventory_data ?? {}),
      "",
      `ADDITIONAL NOTES FROM THE USER:`,
      data.notes?.trim() ? data.notes.trim() : "(none)",
    ].join("\n");

    let analysis: ReportInsightAnalysis;
    try {
      const response = await generateResponse({
        model: AI_MODEL,
        instructions: SYSTEM_INSTRUCTIONS,
        input: userMessage,
        text: {
          format: {
            type: "json_schema",
            name: "daily_report_insight",
            strict: true,
            schema: insightJsonSchema,
          },
        },
        max_output_tokens: 4096,
      });
      const text = collectOutputText(response);
      analysis = JSON.parse(text) as ReportInsightAnalysis;
      if (typeof analysis.summary !== "string" || !Array.isArray(analysis.unusual_trends) || !Array.isArray(analysis.recommendations)) {
        throw new Error("The model returned an unexpected response shape");
      }
    } catch (error) {
      if (error instanceof GatewayError) {
        console.error("[ai-insights] gateway error", error);
        throw new Error(`AI analysis failed: ${error.message}`);
      }
      if (error instanceof SyntaxError) {
        console.error("[ai-insights] unparseable model output", error);
        throw new Error("The model returned an unreadable response. Please try again.");
      }
      console.error("[ai-insights] analysis failed", error);
      throw error instanceof Error ? error : new Error("AI analysis failed");
    }

    const { data: inserted, error: insertErr } = await context.supabase
      .from("report_insights")
      .insert({
        report_date: data.report_date,
        model: AI_MODEL,
        input_snapshot: {
          sales: data.sales_data ?? {},
          inventory: data.inventory_data ?? {},
          notes: data.notes ?? null,
        } as unknown as Json,
        analysis,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("id,report_date,model,analysis,input_snapshot,notes,created_by,created_at")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    await context.supabase.from("audit_log").insert({
      user_id: context.userId,
      action: "ai_insight_generated",
      entity: "report_insights",
      entity_id: inserted.id,
      details: { report_date: data.report_date, model: AI_MODEL },
    });

    return inserted;
  });

export const listReportInsights = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("report_insights")
      .select("id,report_date,model,analysis,notes,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
