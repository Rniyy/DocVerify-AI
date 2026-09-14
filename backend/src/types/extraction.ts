export interface PdfExtractionResult {
  type: "pdf";
  pageCount: number;
  text: string;
}

export interface DocxExtractionResult {
  type: "docx";
  text: string;
}

export interface ImageExtractionResult {
  type: "image";
  text: string;
}

export type ExcelCellValue = string | number | boolean | null;

export interface ExcelSheetData {
  sheetName: string;
  rows: ExcelCellValue[][];
}

export interface ExcelExtractionResult {
  type: "excel";
  sheets: ExcelSheetData[];
}

export type ExtractionResult =
  | PdfExtractionResult
  | ExcelExtractionResult
  | DocxExtractionResult
  | ImageExtractionResult;
