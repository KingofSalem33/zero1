/**
 * Refactored API Entry Point
 *
 * This is a demonstration of the new architecture.
 * Once validated, this will replace index.ts
 */

import "reflect-metadata"; // Must be first import for TSyringe
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

// Initialize DI container
import "./di/Container";
import { container } from "./di/Container";
import { TYPES } from "./di/types";
import { IConfig } from "./shared/config/IConfig";
import { ILogger } from "./infrastructure/logging/ILogger";

// Routes
import { createProjectsRouter } from "./presentation/http/routes/projects.v2.routes";

// Middleware
import { errorHandler } from "./presentation/http/middleware/ErrorHandler";

async function bootstrap() {
  const app = express();

  // Get configuration and logger from DI container
  const config = container.resolve<IConfig>(TYPES.Config);
  const logger = container.resolve<ILogger>(TYPES.Logger);

  logger.info("Starting refactored API server...");

  // Security middleware
  app.use(helmet());

  // CORS
  app.use(
    cors({
      origin: [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:4173",
      ],
    }),
  );

  // Logging
  app.use(morgan("combined"));

  // Body parsing
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "api-refactored",
      version: "2.0.0",
    });
  });

  // API Routes (v2)
  app.use("/api/v2/projects", createProjectsRouter());

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  // Centralized error handler (must be last)
  app.use(errorHandler);

  // Start server
  app.listen(config.port, () => {
    logger.info("Refactored API server started", {
      port: config.port,
      env: config.nodeEnv,
    });
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
