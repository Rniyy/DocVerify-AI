import { Router } from "express";
import { createComparison, getComparison, listComparisons } from "../controllers/comparisons.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const comparisonsRouter = Router();

// Body: { documents: StructuredDocument[], documentNames?: string[] }
// documentNames is optional — used only to make AI explanations read
// naturally (e.g. "invoice.pdf" instead of "Document 1").
comparisonsRouter.post("/", asyncHandler(createComparison));

// Stage 14: comparison history
comparisonsRouter.get("/", asyncHandler(listComparisons));
comparisonsRouter.get("/:id", asyncHandler(getComparison));
