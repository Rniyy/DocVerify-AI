import { pool } from "../../config/db";
import { ExtractedFields, StructuredDocument } from "../../types/fields";

export interface DocumentMetaInput {
  originalName: string;
  storedName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  extractionStatus: "ok" | "error" | "unsupported";
  extractionError: string | null;
  userId: number;
}

export async function saveDocument(meta: DocumentMetaInput): Promise<number> {
  const [result] = await pool.execute(
    `INSERT INTO documents
       (original_name, stored_name, mime_type, extension, size_bytes, extraction_status, extraction_error, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      meta.originalName,
      meta.storedName,
      meta.mimeType,
      meta.extension,
      meta.sizeBytes,
      meta.extractionStatus,
      meta.extractionError,
      meta.userId,
    ]
  );
  return (result as { insertId: number }).insertId;
}

export async function saveDocumentFields(documentId: number, structured: StructuredDocument): Promise<void> {
  const rows: [number, number | null, string, string][] = [];

  for (const [fieldName, value] of Object.entries(structured.documentFields)) {
    if (value === undefined) continue;
    rows.push([documentId, null, fieldName, String(value)]);
  }

  structured.lineItems.forEach((item, lineItemIndex) => {
    for (const [fieldName, value] of Object.entries(item)) {
      if (value === undefined) continue;
      rows.push([documentId, lineItemIndex, fieldName, String(value)]);
    }
  });

  if (rows.length === 0) return;

  const placeholders = rows.map(() => "(?, ?, ?, ?)").join(", ");
  const flatValues = rows.flat();
  await pool.execute(
    `INSERT INTO document_fields (document_id, line_item_index, field_name, field_value)
     VALUES ${placeholders}`,
    flatValues
  );
}

/** Rebuilds a StructuredDocument from its stored field rows, scoped to its owner. */
export async function getStructuredDocumentById(
  documentId: number,
  userId: number
): Promise<StructuredDocument | null> {
  const [docRows] = await pool.execute("SELECT id FROM documents WHERE id = ? AND user_id = ?", [
    documentId,
    userId,
  ]);
  if ((docRows as unknown[]).length === 0) return null;

  const [fieldRows] = await pool.execute(
    "SELECT line_item_index, field_name, field_value FROM document_fields WHERE document_id = ?",
    [documentId]
  );

  const documentFields: ExtractedFields = {};
  const lineItemsMap = new Map<number, ExtractedFields>();

  for (const row of fieldRows as { line_item_index: number | null; field_name: string; field_value: string }[]) {
    const value = coerceFieldValue(row.field_name, row.field_value);
    if (row.line_item_index === null) {
      (documentFields as Record<string, unknown>)[row.field_name] = value;
    } else {
      const item = lineItemsMap.get(row.line_item_index) ?? {};
      (item as Record<string, unknown>)[row.field_name] = value;
      lineItemsMap.set(row.line_item_index, item);
    }
  }

  const maxIndex = lineItemsMap.size > 0 ? Math.max(...lineItemsMap.keys()) : -1;
  const lineItems: ExtractedFields[] = [];
  for (let i = 0; i <= maxIndex; i++) {
    lineItems.push(lineItemsMap.get(i) ?? {});
  }

  return { documentFields, lineItems };
}

export async function getDocumentOriginalName(documentId: number, userId: number): Promise<string | null> {
  const [rows] = await pool.execute("SELECT original_name FROM documents WHERE id = ? AND user_id = ?", [
    documentId,
    userId,
  ]);
  const row = (rows as { original_name: string }[])[0];
  return row?.original_name ?? null;
}

export async function linkDocumentsToComparison(documentIds: number[], comparisonId: number): Promise<void> {
  if (documentIds.length === 0) return;
  const placeholders = documentIds.map(() => "?").join(", ");
  await pool.execute(
    `UPDATE documents SET comparison_id = ? WHERE id IN (${placeholders})`,
    [comparisonId, ...documentIds]
  );
}

// quantity/unitPrice/totalAmount/etc were numbers before being stringified for storage.
const NUMERIC_FIELD_NAMES = new Set([
  "quantity",
  "unitPrice",
  "totalAmount",
  "subtotal",
  "tax",
  "grossWeight",
  "netWeight",
]);

function coerceFieldValue(fieldName: string, rawValue: string): string | number {
  if (NUMERIC_FIELD_NAMES.has(fieldName)) {
    const parsed = Number(rawValue);
    return Number.isNaN(parsed) ? rawValue : parsed;
  }
  return rawValue;
}
