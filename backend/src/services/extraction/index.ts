import path from "path";
import { ExtractionResult } from "../../types/extraction";
import { extractExcel } from "./excelExtractor";
import { extractPdf } from "./pdfExtractor";
import { extractViaPythonService } from "./pythonServiceClient";

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
      return extractPdf(filePath);
    case "xlsx":
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
