import cors from "cors";
import express, { Express } from "express";
import helmet from "helmet";
import { config } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { notFoundHandler } from "./middleware/notFound";
import { apiRouter } from "./routes";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  // Stage 18: set CORS_ORIGIN to restrict which sites may call the API;
  // left unset it allows any origin, as before.
  app.use(cors(config.corsOrigins.length > 0 ? { origin: config.corsOrigins } : undefined));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
