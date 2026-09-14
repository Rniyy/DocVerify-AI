import { ExtractionResult } from "../../types/extraction";
import { ExtractedFields, StructuredDocument } from "../../types/fields";
import { mapExcelSheetsToFields } from "./excelFieldMapper";
import { mapTextToFields } from "./textFieldMapper";

const LINE_ITEM_KEYS: (keyof ExtractedFields)[] = [
  "description",
  "quantity",
  "unit",
  "unitPrice",
  "totalAmount",
  "hsCode",
];

export function mapExtractionToFields(extraction: ExtractionResult | null): StructuredDocument | null {
  if (!extraction) return null;

  // PDF, Word, and OCR'd images all reduce to "lines of text" — the same
  // label/value line matcher handles all three.
  if (extraction.type === "pdf" || extraction.type === "docx" || extraction.type === "image") {
    const documentFields = mapTextToFields(extraction.text);

    const lineItem: ExtractedFields = {};
    LINE_ITEM_KEYS.forEach((key) => {
      if (documentFields[key] !== undefined) {
        (lineItem[key] as unknown) = documentFields[key];
      }
    });

    return {
      documentFields,
      lineItems: Object.keys(lineItem).length > 0 ? [lineItem] : [],
    };
  }

  if (extraction.type === "excel") {
    return mapExcelSheetsToFields(extraction.sheets);
  }

  return null;
}
