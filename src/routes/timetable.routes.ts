import { Router } from "express";
import {
  getTimetable,
  saveTimetable,
} from "../controllers/timetable.controller";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/", requireAuth, getTimetable);
router.post("/", requireAuth, saveTimetable);

export default router;
