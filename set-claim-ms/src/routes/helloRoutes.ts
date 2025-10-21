import { Router } from "express";
import { apiKeyAuth } from "../middleware/authMiddleware";
import { helloWorld } from "../controllers/helloController";

const router = Router();

router.get("/hello-world", apiKeyAuth, helloWorld);

export default router;

