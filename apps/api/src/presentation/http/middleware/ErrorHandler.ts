import { Request, Response, NextFunction } from "express";
import { AppError } from "../../../shared/errors/AppError";
import { HttpError } from "../../../shared/errors/HttpError";
import {
  ValidationError,
  EntityNotFoundError,
  DuplicateEntityError,
} from "../../../shared/errors/DomainError";
import { container } from "../../../di/Container";
import { ILogger } from "../../../infrastructure/logging/ILogger";
import { TYPES } from "../../../di/types";

/**
 * Centralized Error Handler Middleware
 *
 * Maps domain errors to HTTP errors and sends appropriate responses
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const logger = container.resolve<ILogger>(TYPES.Logger);

  // Log error
  logger.error("Error handler caught error", err, {
    path: req.path,
    method: req.method,
  });

  // Handle known error types
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    });
    return;
  }

  // Map domain errors to HTTP errors
  if (err instanceof ValidationError) {
    res.status(400).json({
      error: err.message,
      code: err.code,
      field: err.field,
    });
    return;
  }

  if (err instanceof EntityNotFoundError) {
    res.status(404).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  if (err instanceof DuplicateEntityError) {
    res.status(409).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(500).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Unknown error
  res.status(500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
    code: "INTERNAL_ERROR",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
}
