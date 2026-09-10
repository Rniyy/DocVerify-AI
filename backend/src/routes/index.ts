import { Router } from "express";
import { healthRouter } from "./health.routes";

export const apiRouter = Router();

apiRouter.use(healthRouter);

// Future stages add more routers here, e.g.:
// apiRouter.use("/documents", documentsRouter);   // Stage 4+
// apiRouter.use("/comparisons", comparisonsRouter); // Stage 7+
// apiRouter.use("/auth", authRouter);              // Stage 13
