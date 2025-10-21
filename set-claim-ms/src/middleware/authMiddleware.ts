import { Request, Response, NextFunction } from "express";
import * as dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.API_KEY || "";

export const apiKeyAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    res.status(401).json({ error: "API key is missing" });
    return;
  }

  if (apiKey !== API_KEY) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  // API key is valid, proceed to the next middleware or route handler
  next();
};

