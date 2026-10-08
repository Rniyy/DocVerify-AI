import { config } from "../../config/env";

export interface SemanticCompareResult {
  match: boolean;
  explanation: string;
}

/**
 * Asks the Python service whether two text values (e.g. descriptions)
 * refer to the same thing. Returns null on any failure — missing API key,
 * network issue, bad response — so a broken AI integration never breaks
 * the exact comparison it's layered on top of.
 */
export async function semanticCompare(
  field: string,
  values: string[]
): Promise<SemanticCompareResult | null> {
  try {
    const response = await fetch(`${config.pythonServiceUrl}/ai/semantic-compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, values }),
    });
    if (!response.ok) return null;
    return (await response.json()) as SemanticCompareResult;
  } catch {
    return null;
  }
}

export interface ExplainContext {
  field: string;
  documentNames: string[];
  values: (string | number | undefined)[];
  difference?: string;
  kind: "mismatch" | "calculation";
  rule?: string;
  expected?: number;
  actual?: number;
}

/** Same fail-soft contract as semanticCompare — null means "no AI explanation available". */
export async function explainDiscrepancy(context: ExplainContext): Promise<string | null> {
  try {
    const response = await fetch(`${config.pythonServiceUrl}/ai/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { explanation: string };
    return data.explanation || null;
  } catch {
    return null;
  }
}

/**
 * Asks the Python service to read structured fields out of raw document text
 * (Stage 20). The result is an untrusted *candidate*: callers must verify it
 * against the source text (see fieldMapping/aiFallback.ts). Same fail-soft
 * contract as the other AI calls — null means "no AI result available".
 */
export async function extractFieldsWithAi(text: string): Promise<unknown | null> {
  try {
    const response = await fetch(`${config.pythonServiceUrl}/ai/extract-fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
