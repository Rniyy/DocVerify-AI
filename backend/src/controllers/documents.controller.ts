import { Request, Response } from "express";
import path from "path";
import { AppError } from "../middleware/errorHandler";
import { extractDocument } from "../services/extraction";
import { mapExtractionToFields } from "../services/fieldMapping";

const MIN_DOCUMENTS_REQUIRED = 2;

export async function uploadDocuments(req: Request, res: Response): Promise<void> {
  const files = (req.files as Express.Multer.File[]) ?? [];

  if (files.length < MIN_DOCUMENTS_REQUIRED) {
    throw new AppError(
      `At least ${MIN_DOCUMENTS_REQUIRED} documents are required for a comparison (received ${files.length}).`,
      400
    );
  }

  // No database yet (Stage 12 adds the `documents` table). For now: store
  // the file, extract raw content (Stage 5), then map that raw content onto
  // the known business fields (Stage 6). Comparison logic (Stage 7+) will
  // consume `fields` from each document in this array.
  const documents = await Promise.all(
    files.map(async (file) => {
      const base = {
        originalName: file.originalname,
        storedName: file.filename,
        sizeBytes: file.size,
        mimeType: file.mimetype,
        extension: path.extname(file.originalname).slice(1).toLowerCase(),
      };

      try {
        const extracted = await extractDocument(file.path, file.originalname);
        const fields = mapExtractionToFields(extracted);
        return {
          ...base,
          extracted,
          fields,
          extractionError: null,
          extractionNote:
            extracted === null
              ? "Extraction for this file type isn't implemented yet (added in a later stage)."
              : null,
        };
      } catch (err) {
        return {
          ...base,
          extracted: null,
          fields: null,
          extractionError:
            err instanceof Error ? err.message : "Failed to extract this document's contents.",
          extractionNote: null,
        };
      }
    })
  );

  res.status(201).json({
    message: `${documents.length} document(s) uploaded successfully.`,
    documents,
  });
}
