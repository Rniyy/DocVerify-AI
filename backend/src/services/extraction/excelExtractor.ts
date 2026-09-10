import * as XLSX from "xlsx";
import { ExcelCellValue, ExcelExtractionResult, ExcelSheetData } from "../../types/extraction";

export function extractExcel(filePath: string): ExcelExtractionResult {
  const workbook = XLSX.readFile(filePath);

  const sheets: ExcelSheetData[] = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    // header: 1 => array-of-arrays (raw rows/columns) rather than guessing
    // object keys from a header row — that guessing happens in Stage 6
    // once we map raw cells onto known invoice/packing-list fields.
    const rows = XLSX.utils.sheet_to_json<ExcelCellValue[]>(worksheet, {
      header: 1,
      defval: null,
      raw: true,
    });
    return { sheetName, rows };
  });

  return { type: "excel", sheets };
}
