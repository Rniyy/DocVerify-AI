import { ExcelCellValue, ExcelSheetData } from "../../types/extraction";
import { StructuredFieldMap, StructuredTable } from "../../types/structured";

function isEmptyRow(row: ExcelCellValue[]): boolean {
  return row.every((cell) => cell === null || cell === undefined || cell === "");
}

function trimTrailingEmptyRows(rows: ExcelCellValue[][]): ExcelCellValue[][] {
  let end = rows.length;
  while (end > 0 && isEmptyRow(rows[end - 1])) end--;
  return rows.slice(0, end);
}

function cellToString(cell: ExcelCellValue): string {
  return cell === null || cell === undefined ? "" : String(cell).trim();
}

// A "form" row has a label in column A and its value in column B, with the
// rest of the row empty — the shape used throughout label/value style
// templates (shipping instructions, VGM declarations, etc.). A row with
// more populated columns than that is treated as tabular instead.
function looksLikeFormRow(row: ExcelCellValue[]): boolean {
  const populated = row.filter((c) => c !== null && c !== undefined && c !== "");
  return populated.length > 0 && populated.length <= 2 && cellToString(row[0]) !== "";
}

/**
 * Stage 6 — walks one sheet's rows (already produced by Stage 5's Excel
 * extractor) and splits it into flat label/value fields plus at most one
 * data table. Sheets can mix both: a form-style header block (shipper,
 * consignee, port, etc.) followed by a genuine table (e.g. a container
 * list) — this handles that by switching modes once it sees a row with
 * more than two populated columns.
 */
export function structureExcelSheet(sheet: ExcelSheetData): {
  fields: StructuredFieldMap;
  table: StructuredTable | null;
} {
  const rows = trimTrailingEmptyRows(sheet.rows);
  const fields: StructuredFieldMap = {};
  let table: StructuredTable | null = null;

  let i = 0;
  while (i < rows.length) {
    const row = rows[i];

    if (isEmptyRow(row)) {
      i++;
      continue;
    }

    if (looksLikeFormRow(row)) {
      const key = cellToString(row[0]).replace(/:$/, "").trim().toLowerCase();
      const value = cellToString(row[1]);
      if (key && value && !(key in fields)) fields[key] = value;
      i++;
      continue;
    }

    // First row with more than two populated columns: treat it as a table
    // header and consume rows until the table runs out (next empty row).
    const headers = row.map((c, idx) => cellToString(c) || `col_${idx + 1}`);
    const tableRows: Record<string, ExcelCellValue>[] = [];
    i++;
    while (i < rows.length && !isEmptyRow(rows[i])) {
      const dataRow = rows[i];
      const record: Record<string, ExcelCellValue> = {};
      headers.forEach((h, idx) => {
        if (dataRow[idx] !== null && dataRow[idx] !== undefined && dataRow[idx] !== "") {
          record[h] = dataRow[idx];
        }
      });
      if (Object.keys(record).length > 0) tableRows.push(record);
      i++;
    }
    if (tableRows.length > 0) {
      table = { sheetName: sheet.sheetName, headers, rows: tableRows };
    }
  }

  return { fields, table };
}
