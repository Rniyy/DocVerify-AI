/** One word with its horizontal extent, from the Python layout extractor (Stage 21). */
export interface LayoutWord {
  text: string;
  x0: number;
  x1: number;
}

/** One visual line of a PDF page, rebuilt from word coordinates. */
export interface LayoutLine {
  page: number;
  /** Vertical position on the page; larger = lower. */
  y: number;
  text: string;
  words: LayoutWord[];
}

export interface PdfExtractionResult {
  type: "pdf";
  pageCount: number;
  text: string;
  /** Present only when the layout-aware extractor ran (Stage 21). */
  lines?: LayoutLine[];
  /** True when at least one page had no text layer and was read with OCR (Stage 26). */
  ocr?: boolean;
  /** Mean Tesseract word confidence (0-100) over the OCR'd pages. */
  ocrConfidence?: number | null;
  /** Pages beyond the OCR page limit that were not read. */
  ocrSkippedPages?: number[];
}

export interface DocxExtractionResult {
  type: "docx";
  text: string;
}

export interface ImageExtractionResult {
  type: "image";
  text: string;
  /** Positioned OCR lines (Stage 27), same shape as a PDF's layout lines. */
  lines?: LayoutLine[];
  ocr?: boolean;
  ocrConfidence?: number | null;
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
