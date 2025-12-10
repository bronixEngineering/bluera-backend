import { Request, Response, NextFunction } from "express";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error("Error:", err.message);

  // Default server error
  res.status(500).json({ error: "Internal server error" });
};

