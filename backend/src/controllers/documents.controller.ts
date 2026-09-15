import { Request, Response } from "express";
import path from "path";
import { AppError } from "../middleware/errorHandler";
import { extractDocument } from "../services/extraction";
import { mapExtractionToFields } from "../services/fieldMapping";
import { saveDocument, saveDocumentFields } from "../services/persistence/documentsRepository";
import { StructuredDocument } from "../types/fields";

const MIN_DOCUMENTS_REQUIRED = 2;

export async function uploadDocuments(req: Request, res: Response): Promise<void> {
  const files = (req.files as Express.Multer.File[]) ?? [];

  if (files.length < MIN_DOCUMENTS_REQUIRED) {
    throw new AppError(
      `At least ${MIN_DOCUMENTS_REQUIRED} documents are required for a comparison (received ${files.length}).`,
      400
    );
  }

  // Extract (Stage 5/10) + map to fields (Stage 6), then persist metadata
  // and parsed fields to MySQL (Stage 12). Persistence failures don't fail
  // the upload — a missing/unreachable database shouldn't block someone
  // from getting their comparison, it just won't be saved to history.
  const documents = await Promise.all(
    files.map(async (file) => {
      const base = {
        originalName: file.originalname,
        storedName: file.filename,
        sizeBytes: file.size,
        mimeType: file.mimetype,
        extension: path.extname(file.originalname).slice(1).toLowerCase(),
      };

      let extracted;
      let fields: StructuredDocument | null = null;
      let extractionError: string | null = null;

      try {
        extracted = await extractDocument(file.path, file.originalname);
        fields = mapExtractionToFields(extracted);
      } catch (err) {
        extracted = null;
        extractionError = err instanceof Error ? err.message : "Failed to extract this document's contents.";
      }

      let documentId: number | null = null;
      try {
        documentId = await saveDocument({
          ...base,
          extractionStatus: extractionError ? "error" : extracted === null ? "unsupported" : "ok",
          extractionError,
        });
        if (fields) await saveDocumentFields(documentId, fields);
      } catch (dbErr) {
        console.error("Persistence failed for uploaded document (continuing without it):", dbErr);
      }

      return {
        ...base,
        documentId,
        extracted,
        fields,
        extractionError,
        extractionNote:
          extracted === null && !extractionError
            ? "Extraction for this file type isn't implemented yet (added in a later stage)."
            : null,
      };
    })
  );

  res.status(201).json({
    message: `${documents.length} document(s) uploaded successfully.`,
    documents,
  });
}
