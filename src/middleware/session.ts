import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";

const sessionMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (req.headers.cookie) {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      const role = session?.user.role;

      if (session && (role === "admin" || role === "teacher" || role === "student")) {
        req.user = { id: session.user.id, role };
      }
    }

    next();
  } catch (error) {
    console.error("Authentication session lookup failed:", error);
    res.status(503).json({ error: "Authentication service unavailable" });
  }
};

export default sessionMiddleware;
