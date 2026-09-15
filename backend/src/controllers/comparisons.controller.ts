import { Request, Response } from "express";
import { AppError } from "../middleware/errorHandler";
import { compareDocuments } from "../services/comparison";
import {
  getDocumentOriginalName,
  getStructuredDocumentById,
  linkDocumentsToComparison,
} from "../services/persistence/documentsRepository";
import { saveComparison, saveComparisonResults } from "../services/persistence/comparisonsRepository";
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

async function loadFromDocumentIds(
  documentIds: number[]
): Promise<{ documents: StructuredDocument[]; documentNames: string[] }> {
  const loaded = await Promise.all(
    documentIds.map(async (id) => {
      const structured = await getStructuredDocumentById(id);
      if (!structured) {
        throw new AppError(`No stored document found with id ${id}.`, 404);
      }
      const name = (await getDocumentOriginalName(id)) ?? `Document ${id}`;
      return { structured, name };
    })
  );
  return {
    documents: loaded.map((l) => l.structured),
    documentNames: loaded.map((l) => l.name),
  };
}

export async function createComparison(req: Request, res: Response): Promise<void> {
  const body = req.body as { documents?: unknown; documentNames?: unknown; documentIds?: unknown };

  let documents: StructuredDocument[];
  let documentNames: string[] | undefined;
  let documentIds: number[] | undefined;

  if (Array.isArray(body.documentIds) && body.documentIds.length > 0) {
    if (!body.documentIds.every((id) => typeof id === "number")) {
      throw new AppError('"documentIds" must be an array of numbers.', 400);
    }
    documentIds = body.documentIds as number[];
    if (documentIds.length < 2) {
      throw new AppError("At least 2 documentIds are required to run a comparison.", 400);
    }
    const loaded = await loadFromDocumentIds(documentIds);
    documents = loaded.documents;
    documentNames = loaded.documentNames;
  } else {
    if (!Array.isArray(body.documents) || body.documents.length < 2) {
      throw new AppError(
        "At least 2 documents' worth of extracted fields (or 2 documentIds) are required to run a comparison.",
        400
      );
    }
    if (!body.documents.every(isStructuredDocument)) {
      throw new AppError(
        'Each item in "documents" must have the shape { documentFields, lineItems }, as returned by POST /api/documents.',
        400
      );
    }
    documents = body.documents;
    documentNames =
      Array.isArray(body.documentNames) && body.documentNames.every((n) => typeof n === "string")
        ? (body.documentNames as string[])
        : undefined;
  }

  const report = await compareDocuments(documents, documentNames);

  // Persist the run (Stage 12). This never blocks the response — if the
  // database is unreachable, the caller still gets their comparison.
  try {
    const comparisonId = await saveComparison(report.summary);
    await saveComparisonResults(comparisonId, report);
    if (documentIds) await linkDocumentsToComparison(documentIds, comparisonId);
  } catch (dbErr) {
    console.error("Persistence failed for comparison (continuing without it):", dbErr);
  }

  res.status(200).json(report);
}
