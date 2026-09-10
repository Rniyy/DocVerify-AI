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

function lastPopulatedIndex(row: ExcelCellValue[]): number {
  for (let i = row.length - 1; i >= 0; i--) {
    if (row[i] !== null && row[i] !== undefined && row[i] !== "") return i;
  }
  return -1;
}

// A "form" row keeps its populated cells within columns A-C — column A is
// the label, column B the value, and column C (if present) is treated as
// an incidental note and ignored (e.g. "SHIPPER'S SEAL NO.: | 002547 |
// must be showed 2nd seal on MBL"). A row with anything populated further
// right than column C is treated as tabular instead — that's the signal
// that actually distinguishes a real data table (e.g. a VGM container
// list spanning 6 columns) from a label/value row with a stray note.
function looksLikeFormRow(row: ExcelCellValue[]): boolean {
  return cellToString(row[0]) !== "" && lastPopulatedIndex(row) <= 2;
}

// Guards against treating a sparse, mostly-empty row (e.g. leftover
// signature-block cells like "WEIGHING SCALE" / "SHIPPER" scattered far
// apart) as a table header just because it has a populated cell past
// column C. A genuine header row is mostly real labels, not placeholders.
function looksLikeRealHeader(headers: string[]): boolean {
  const placeholders = headers.filter((h) => h.startsWith("col_")).length;
  return placeholders <= headers.length / 2;
}

/**
 * Stage 6 — walks one sheet's rows (already produced by Stage 5's Excel
 * extractor) and splits it into flat label/value fields plus zero or more
 * data tables. A sheet can contain several distinct tables (e.g. a form
 * header block, then a container list, then unrelated trailing rows) —
 * each is collected independently rather than the last one overwriting
 * earlier ones.
 *
 * Known limitation: this only understands two shapes (label|value|note,
 * and header-row-followed-by-data-rows). Real-world templates that wrap a
 * label/value pair across a shifted column (e.g. a merged "marks" cell
 * pushing "Total CTNS: | 1450 CTNS" into columns B/C instead of A/B) won't
 * be picked up correctly — that needs the sheet's merged-cell layout,
 * which isn't part of Stage 5's plain row/column extraction.
 */
export function structureExcelSheet(sheet: ExcelSheetData): {
  fields: StructuredFieldMap;
  tables: StructuredTable[];
} {
  const rows = trimTrailingEmptyRows(sheet.rows);
  const fields: StructuredFieldMap = {};
  const tables: StructuredTable[] = [];

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

    // Candidate table header: something is populated past column C.
    const headers = row.map((c, idx) => cellToString(c) || `col_${idx + 1}`);

    if (!looksLikeRealHeader(headers)) {
      // Too sparse/placeholder-heavy to be a real header — most likely a
      // leftover layout artifact (signature line, etc.). Skip just this
      // row rather than risk consuming good rows below it as fake data.
      i++;
      continue;
    }

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
      tables.push({ sheetName: sheet.sheetName, headers, rows: tableRows });
    }
  }

  return { fields, tables };
}