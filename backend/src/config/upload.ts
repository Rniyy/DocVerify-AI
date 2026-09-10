import { randomUUID } from "crypto";
import fs from "fs";
import multer, { FileFilterCallback } from "multer";
import path from "path";
import { Request } from "express";
import { config } from "./env";
import { AppError } from "../middleware/errorHandler";

// Stored outside src/ so it survives `tsc` builds; excluded from git via .gitignore.
export const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "documents");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = ["pdf", "xlsx", "docx", "jpg", "jpeg", "png"];

// Checked alongside the extension so a renamed .exe can't sneak in as "invoice.pdf".
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

function sanitizeBaseName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Never trust the client's filename for the path on disk — generate our
    // own name and keep the original only as metadata in the response.
    const ext = path.extname(file.originalname).toLowerCase();
    const base = sanitizeBaseName(path.basename(file.originalname, ext));
    cb(null, `${randomUUID()}-${base}${ext}`);
  },
});

function fileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  const ext = path.extname(file.originalname).slice(1).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(
      new AppError(
        `"${file.originalname}" has an unsupported file type (.${ext || "unknown"}). Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`,
        400
      )
    );
  }

  // The extension check above is the real gate. MIME type from the client
  // is a secondary signal only — browsers and OSes are inconsistent about
  // it (zip-based .xlsx/.docx often arrive as "application/octet-stream"),
  // and it's trivially spoofable anyway. We still use it to catch a file
  // that's clearly the wrong kind of content for its extension.
  const isGenericFallback = file.mimetype === "application/octet-stream";
  if (!isGenericFallback && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(
      new AppError(
        `"${file.originalname}" has an unexpected content type (${file.mimetype}) for a .${ext} file.`,
        400
      )
    );
  }

  cb(null, true);
}

export const documentUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxUploadSizeMb * 1024 * 1024,
    files: 10,
  },
});
