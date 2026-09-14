import { ExcelCellValue, ExcelSheetData } from "../../types/extraction";
import { ExtractedFields, StructuredDocument } from "../../types/fields";
import { findFieldKeyForLabel } from "./fieldDictionary";
import { assignParsedValue } from "./valueParsers";

const MIN_MATCHED_HEADER_CELLS = 2;

export function mapExcelSheetsToFields(sheets: ExcelSheetData[]): StructuredDocument {
  const documentFields: ExtractedFields = {};
  const lineItems: ExtractedFields[] = [];

  for (const sheet of sheets) {
    const headerRowIndex = findHeaderRowIndex(sheet.rows);

    sheet.rows.forEach((row, rowIndex) => {
      if (rowIndex === headerRowIndex) return;

      if (headerRowIndex !== -1 && rowIndex > headerRowIndex) {
        const item = mapRowByHeader(sheet.rows[headerRowIndex], row);
        if (Object.keys(item).length > 0) lineItems.push(item);
        return;
      }

      // Rows above (or with no) header: treat two-cell rows as label/value
      // pairs, e.g. ["Invoice Number:", "INV-2026-001"].
      const [labelCell, valueCell] = row;
      if (typeof labelCell === "string" && valueCell !== undefined && valueCell !== null) {
        const fieldKey = findFieldKeyForLabel(labelCell);
        if (fieldKey) assignParsedValue(documentFields, fieldKey, String(valueCell));
      }
    });
  }

  return { documentFields, lineItems };
}

/** A header row is any row with at least two cells that match a known field label. */
function findHeaderRowIndex(rows: ExcelCellValue[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const matchCount = rows[i].filter(
      (cell) => typeof cell === "string" && findFieldKeyForLabel(cell) !== null
    ).length;
    if (matchCount >= MIN_MATCHED_HEADER_CELLS) return i;
  }
  return -1;
}

function mapRowByHeader(headerRow: ExcelCellValue[], row: ExcelCellValue[]): ExtractedFields {
  const item: ExtractedFields = {};

  headerRow.forEach((headerCell, columnIndex) => {
    if (typeof headerCell !== "string") return;
    const fieldKey = findFieldKeyForLabel(headerCell);
    if (!fieldKey) return;

    const cellValue = row[columnIndex];
    if (cellValue === undefined || cellValue === null || cellValue === "") return;

    assignParsedValue(item, fieldKey, String(cellValue));
  });

  return item;
}
