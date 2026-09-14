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

  if (extraction.type === "pdf") {
    const documentFields = mapTextToFields(extraction.text);

    // A single-page invoice usually describes one line item inline with
    // the header fields. Pull the line-item-shaped fields out into their
    // own entry so PDF and Excel results share the same lineItems shape.
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
