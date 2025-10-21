import { Router } from "express";
import { healthCheck } from "../controllers/healthController";

const router = Router();

// Health check endpoint - no authentication required
router.get("/health", healthCheck);

export default router;

