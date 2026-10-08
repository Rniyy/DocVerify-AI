import { Router } from "express";
import {
  createComparison,
  exportComparisonCsv,
  getComparison,
  listComparisons,
} from "../controllers/comparisons.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const comparisonsRouter = Router();

// Body: { documents: StructuredDocument[], documentNames?: string[] }
// documentNames is optional — used only to make AI explanations read
// naturally (e.g. "invoice.pdf" instead of "Document 1").
comparisonsRouter.post("/", asyncHandler(createComparison));

// Stage 14: comparison history
comparisonsRouter.get("/", asyncHandler(listComparisons));
comparisonsRouter.get("/:id", asyncHandler(getComparison));

// Stage 17: download a saved comparison as CSV (opens in Excel / Google Sheets).
comparisonsRouter.get("/:id/export", asyncHandler(exportComparisonCsv));
