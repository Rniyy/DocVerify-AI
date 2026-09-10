import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { config } from "../config/env";

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// Express recognizes this as an error handler because it takes 4 args.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `One of the files is larger than the ${config.maxUploadSizeMb}MB limit.`
        : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
        ? "Too many files in this upload."
        : err.message;
    res.status(400).json({ error: "UploadError", message });
    return;
  }

  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const message = err instanceof Error ? err.message : "Unexpected error";

  if (!isAppError) {
    // Unexpected errors are always worth logging server-side.
    console.error(err);
  }

  res.status(statusCode).json({
    error: isAppError ? "RequestError" : "InternalError",
    message: config.env === "development" || isAppError ? message : "Something went wrong",
  });
}
