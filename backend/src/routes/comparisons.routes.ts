import { Router } from "express";
import { createComparison } from "../controllers/comparisons.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const comparisonsRouter = Router();

// Body: { documents: StructuredDocument[], documentNames?: string[] }
// documentNames is optional — used only to make AI explanations read
// naturally (e.g. "invoice.pdf" instead of "Document 1").
comparisonsRouter.post("/", asyncHandler(createComparison));
