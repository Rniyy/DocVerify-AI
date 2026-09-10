import { ExcelCellValue } from "./extraction";

export type StructuredFieldMap = Record<string, string>;

export interface StructuredTable {
  sheetName: string;
  headers: string[];
  rows: Record<string, ExcelCellValue>[];
}

export interface StructuredDocument {
  // Flat label -> value pairs pulled from the document (ref/invoice/booking
  // numbers, ports, dates, etc.). Keys are lowercase, loosely normalized —
  // Stage 7 is responsible for matching equivalent keys across documents.
  fields: StructuredFieldMap;

  // Tabular data found in Excel sheets (line items, container lists, etc.).
  // Empty when a document has no table-shaped section.
  tables: StructuredTable[];

  // Currency amounts found in PDF text without a clear adjacent label
  // (common for "TOTAL" lines where the number precedes the word due to
  // column-order jumbling — see Stage 5 notes). Comparison logic can still
  // use these even though they aren't tied to a named field.
  amounts?: string[];
}
