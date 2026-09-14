import { Router } from "express";
import { createComparison } from "../controllers/comparisons.controller";

export const comparisonsRouter = Router();

// Body: { documents: StructuredDocument[] } — pass the `fields` object
// returned for each file by POST /api/documents.
comparisonsRouter.post("/", createComparison);
