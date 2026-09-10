import fs from "fs/promises";
import { PDFParse } from "pdf-parse";
import { PdfExtractionResult } from "../../types/extraction";

export async function extractPdf(filePath: string): Promise<PdfExtractionResult> {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return {
      type: "pdf",
      pageCount: result.total,
      text: result.text.trim(),
    };
  } finally {
    await parser.destroy();
  }
}
