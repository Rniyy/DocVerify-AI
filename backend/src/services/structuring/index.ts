import { ExtractionResult } from "../../types/extraction";
import { StructuredDocument, StructuredFieldMap } from "../../types/structured";
import { extractTextFields } from "./textFields";
import { structureExcelSheet } from "./excelFields";

/**
 * Stage 6 — converts Stage 5's raw extraction (PDF text / Excel rows) into
 * a structured, comparable shape. Purely rule-based, no AI: exact field
 * comparison (Stage 7) and calculation validation (Stage 8) need something
 * deterministic to work against. Fuzzy/semantic matching is Python's job
 * later (Stage 11), on top of whatever this produces.
 */
export function structureDocument(extracted: ExtractionResult | null): StructuredDocument | null {
  if (!extracted) return null;

  if (extracted.type === "pdf") {
    const { fields, amounts } = extractTextFields(extracted.text);
    return { fields, tables: [], amounts: amounts.length > 0 ? amounts : undefined };
  }

  // extracted.type === "excel"
  const fields: StructuredFieldMap = {};
  const tables: StructuredDocument["tables"] = [];

  for (const sheet of extracted.sheets) {
    const result = structureExcelSheet(sheet);
    for (const [key, value] of Object.entries(result.fields)) {
      if (!(key in fields)) fields[key] = value;
    }
    tables.push(...result.tables);
  }

  return { fields, tables };
}