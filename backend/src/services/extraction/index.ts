import path from "path";
import { ExtractionResult } from "../../types/extraction";
import { extractExcel } from "./excelExtractor";
import { extractPdf } from "./pdfExtractor";

/**
 * Returns structured content for supported types, or null for types not
 * yet handled in this stage (Word, images). Word/image extraction moves
 * to the Python service in Stage 10, since OCR and .docx parsing belong
 * there per the architecture split — this stays PDF/Excel only for now.
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
    default:
      return null;
  }
}
