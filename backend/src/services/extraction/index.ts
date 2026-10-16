import path from "path";
import { ExtractionResult } from "../../types/extraction";
import { extractExcel } from "./excelExtractor";
import { extractPdf } from "./pdfExtractor";
import { extractPdfLayoutViaPython, extractViaPythonService } from "./pythonServiceClient";

/**
 * Returns structured content for every type the project supports.
 * PDF/Excel are parsed here in TypeScript (fast, no extra service needed);
 * Word and images are delegated to the Python service (Stage 10), which
 * owns OCR and .docx parsing per the architecture split.
 */
export async function extractDocument(
  filePath: string,
  originalName: string
): Promise<ExtractionResult | null> {
  const ext = path.extname(originalName).slice(1).toLowerCase();

  switch (ext) {
    case "pdf":
      // Stage 21: prefer the layout-aware extraction; plain pdf-parse text is
      // the fallback, so the app still works with the Python service down.
      return (await extractPdfLayoutViaPython(filePath, originalName)) ?? extractPdf(filePath);
    case "xlsx":
    case "xls":
      return extractExcel(filePath);
    case "docx":
    case "jpg":
    case "jpeg":
    case "png":
      return extractViaPythonService(filePath, originalName);
    default:
      return null;
  }
}
