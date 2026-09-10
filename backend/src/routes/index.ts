import { Router } from "express";
import { documentsRouter } from "./documents.routes";
import { healthRouter } from "./health.routes";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use("/documents", documentsRouter);

// Future stages add more routers here, e.g.:
// apiRouter.use("/comparisons", comparisonsRouter); // Stage 7+
// apiRouter.use("/auth", authRouter);              // Stage 13
