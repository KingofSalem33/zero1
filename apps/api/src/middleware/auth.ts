/**
 * Authentication Middleware
 * Validates Supabase Auth JWT tokens and extracts user information
 */

import type { Request, Response, NextFunction } from "express";
import { supabase } from "../db";

// Extend Express Request to include userId
 
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      user?: {
        id: string;
        email?: string;
      };
    }
  }
}

/**
 * Middleware to require authentication
 * Validates JWT token from Authorization header
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Missing or invalid Authorization header",
      });
      return;
    }

    const token = authHeader.replace("Bearer ", "");

    // Verify token with Supabase Auth
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or expired token",
      });
      return;
    }

    // Attach user info to request
    req.userId = user.id;
    req.user = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch (error) {
    console.error("[Auth Middleware] Error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Authentication verification failed",
    });
    return; // ✅ Explicit return to prevent fall-through
  }
}

/**
 * Optional authentication - doesn't fail if no token provided
 * Useful for endpoints that work both authenticated and unauthenticated
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    // No token provided - continue without auth
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      next();
      return;
    }

    const token = authHeader.replace("Bearer ", "");

    // Try to verify token
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    // If valid, attach user info
    if (user) {
      req.userId = user.id;
      req.user = {
        id: user.id,
        email: user.email,
      };
    }

    next();
  } catch (error) {
    console.error("[Optional Auth Middleware] Error:", error);
    // Continue even if auth fails
    next();
  }
}
