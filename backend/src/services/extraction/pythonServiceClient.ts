import fs from "fs/promises";
import path from "path";
import { config } from "../../config/env";
import { DocxExtractionResult, ImageExtractionResult } from "../../types/extraction";

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
