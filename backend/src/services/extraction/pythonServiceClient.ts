import fs from "fs/promises";
import path from "path";
import { config } from "../../config/env";
import { DocxExtractionResult, ImageExtractionResult, PdfExtractionResult } from "../../types/extraction";

/**
 * Sends a file to the Python service's /extract endpoint. Used for the
 * types Node/TypeScript can't parse itself — Word documents and images —
 * per the architecture rule that OCR and document parsing live in Python.
 */
export async function extractViaPythonService(
  filePath: string,
  originalName: string
): Promise<DocxExtractionResult | ImageExtractionResult> {
  const buffer = await fs.readFile(filePath);
  const formData = new FormData();
  formData.append("file", new Blob([buffer]), path.basename(originalName));

  let response: Response;
  try {
    response = await fetch(`${config.pythonServiceUrl}/extract`, {
      method: "POST",
      body: formData,
    });
  } catch (err) {
    throw new Error(
      `Could not reach the Python extraction service at ${config.pythonServiceUrl}. ` +
      `Is it running (see python-service/README)? Original error: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(errorBody.detail || `Python service returned HTTP ${response.status}.`);
  }

  return (await response.json()) as DocxExtractionResult | ImageExtractionResult;
}

// Text PDFs return in well under a second; scanned PDFs are OCR'd page by page
// (several seconds each, up to the Python service's page limit).
const PDF_LAYOUT_TIMEOUT_MS = 120_000;

/**
 * Layout-aware PDF extraction (Stage 21): the Python service rebuilds lines
 * from word positions. Returns null on any failure (service down, timeout,
 * unreadable PDF) so the caller can fall back to plain pdf-parse text.
 */
export async function extractPdfLayoutViaPython(
  filePath: string,
  originalName: string
): Promise<PdfExtractionResult | null> {
  try {
    const buffer = await fs.readFile(filePath);
    const formData = new FormData();
    formData.append("file", new Blob([buffer]), path.basename(originalName));

    const response = await fetch(`${config.pythonServiceUrl}/extract?layout=true`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(PDF_LAYOUT_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const result = (await response.json()) as PdfExtractionResult;
    // A scan with nothing readable still comes back (flagged `ocr`) so the user is told it was a scan.
    return result.type === "pdf" && Array.isArray(result.lines) && (result.text.trim() !== "" || result.ocr === true)
      ? result
      : null;
  } catch {
    return null;
  }
}
