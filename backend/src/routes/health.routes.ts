import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "ai-doc-comparison-backend",
    timestamp: new Date().toISOString(),
  });
});
