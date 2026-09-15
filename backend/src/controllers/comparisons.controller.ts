import { Request, Response } from "express";
import { AppError } from "../middleware/errorHandler";
import { compareDocuments } from "../services/comparison";
import { StructuredDocument } from "../types/fields";

function isStructuredDocument(value: unknown): value is StructuredDocument {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.documentFields === "object" &&
    candidate.documentFields !== null &&
    Array.isArray(candidate.lineItems)
  );
}

export async function createComparison(req: Request, res: Response): Promise<void> {
  const { documents, documentNames } = req.body as { documents?: unknown; documentNames?: unknown };

  if (!Array.isArray(documents) || documents.length < 2) {
    throw new AppError(
      "At least 2 documents' worth of extracted fields are required to run a comparison.",
      400
    );
  }

  if (!documents.every(isStructuredDocument)) {
    throw new AppError(
      'Each item in "documents" must have the shape { documentFields, lineItems }, as returned by POST /api/documents.',
      400
    );
  }

  const names =
    Array.isArray(documentNames) && documentNames.every((n) => typeof n === "string")
      ? (documentNames as string[])
      : undefined;

  const report = await compareDocuments(documents, names);
  res.status(200).json(report);
}
