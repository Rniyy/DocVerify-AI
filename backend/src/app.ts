import cors from "cors";
import express, { Express } from "express";
import helmet from "helmet";
import { errorHandler } from "./middleware/errorHandler";
import { notFoundHandler } from "./middleware/notFound";
import { apiRouter } from "./routes";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors()); // tightened to specific origins once the frontend has a real domain (Stage 15)
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
