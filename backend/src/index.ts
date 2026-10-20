import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { authRouter } from "./auth.routes";
import { comparisonsRouter } from "./comparisons.routes";
import { documentsRouter } from "./documents.routes";
import { healthRouter } from "./health.routes";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/documents", authenticate, documentsRouter);
apiRouter.use("/comparisons", authenticate, comparisonsRouter);
