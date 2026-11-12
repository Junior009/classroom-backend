import type { RequestHandler } from "express";

type ApplicationRole = "admin" | "teacher" | "student";

export const requireRole = (...allowedRoles: ApplicationRole[]): RequestHandler =>
  (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (!req.user.role || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({ message: "You do not have permission to access this resource" });
      return;
    }

    next();
  };
