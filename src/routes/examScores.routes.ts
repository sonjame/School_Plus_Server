// routes/examScores.routes.ts
import { Router } from "express";
import {
  createExamScores,
  readExamScores,
  editExamSubject,
  removeExamScore,
} from "../controllers/examScores.controller";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.post("/", requireAuth, createExamScores);
router.get("/", requireAuth, readExamScores);
router.put("/", requireAuth, editExamSubject);
router.delete("/", requireAuth, removeExamScore);

export default router;
