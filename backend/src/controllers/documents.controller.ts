import { Request, Response } from "express";
import path from "path";
import { AppError } from "../middleware/errorHandler";

const MIN_DOCUMENTS_REQUIRED = 2;

export function uploadDocuments(req: Request, res: Response): void {
  const files = (req.files as Express.Multer.File[]) ?? [];

  if (files.length < MIN_DOCUMENTS_REQUIRED) {
    throw new AppError(
      `At least ${MIN_DOCUMENTS_REQUIRED} documents are required for a comparison (received ${files.length}).`,
      400
    );
  }

  // No database yet (Stage 12 adds the `documents` table) — for now we just
  // confirm what was stored on disk and hand back metadata the frontend can
  // display. Nothing here reads the file contents yet; that's Stage 5.
  const documents = files.map((file) => ({
    originalName: file.originalname,
    storedName: file.filename,
    sizeBytes: file.size,
    mimeType: file.mimetype,
    extension: path.extname(file.originalname).slice(1).toLowerCase(),
  }));

  res.status(201).json({
    message: `${documents.length} document(s) uploaded successfully.`,
    documents,
  });
}
