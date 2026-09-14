import { Router } from "express";
import { comparisonsRouter } from "./comparisons.routes";
import { documentsRouter } from "./documents.routes";
import { healthRouter } from "./health.routes";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use("/documents", documentsRouter);
apiRouter.use("/comparisons", comparisonsRouter);

// Future stages add more routers here, e.g.:
// apiRouter.use("/auth", authRouter);              // Stage 13
