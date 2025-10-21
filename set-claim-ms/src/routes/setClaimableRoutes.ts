import { Router } from "express";
import { apiKeyAuth } from "../middleware/authMiddleware";
import { setClaimable } from "../controllers/setClaimableController";

const router = Router();

router.post("/set-claimable", apiKeyAuth, setClaimable);

export default router;

