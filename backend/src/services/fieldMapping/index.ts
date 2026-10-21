import { ExtractionResult } from "../../types/extraction";
import { ExtractedFields, StructuredDocument } from "../../types/fields";
import { mapExcelSheetsToFields } from "./excelFieldMapper";
import { mapLayoutLines } from "./layoutFieldMapper";
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
    // Stage 21: when the layout extractor ran, its table rows and totals fill
    // what explicit "Label: value" text didn't provide. Text-derived values
    // keep precedence, matching the "explicit beats inferred" rule.
    const layout = (extraction.type === "pdf" || extraction.type === "image") && extraction.lines ? mapLayoutLines(extraction.lines, { ocr: extraction.ocr === true }) : null;
    const textFields = mapTextToFields(extraction.text);
    const documentFields = { ...(layout?.documentFields ?? {}), ...textFields };

    if (layout && layout.lineItems.length > 0) {
      return { documentFields, lineItems: layout.lineItems };
    }

    const lineItem: ExtractedFields = {};
    // Mirror only what the text itself said — never a grand total that the
    // layout step derived for the document header.
    LINE_ITEM_KEYS.forEach((key) => {
      if (textFields[key] !== undefined) {
        (lineItem[key] as unknown) = textFields[key];
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
