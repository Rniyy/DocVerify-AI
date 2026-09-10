import { Router } from "express";
import { documentUpload } from "../config/upload";
import { uploadDocuments } from "../controllers/documents.controller";
import { asyncHandler } from "../utils/asyncHandler";

export const documentsRouter = Router();

// Field name "documents" must match the frontend's FormData key (wired in Stage 5+).
documentsRouter.post("/", documentUpload.array("documents", 10), asyncHandler(uploadDocuments));
