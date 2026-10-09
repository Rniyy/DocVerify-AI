import { Router } from "express";
import { authenticate } from "./middleware/authenticate";
import { authRouter } from "./routes/auth.routes";
import { comparisonsRouter } from "./routes/comparisons.routes";
import { documentsRouter } from "./routes/documents.routes";
import { healthRouter } from "./routes/health.routes";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/documents", authenticate, documentsRouter);
apiRouter.use("/comparisons", authenticate, comparisonsRouter);
