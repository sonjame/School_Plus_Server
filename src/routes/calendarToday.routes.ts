import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { getTodayCalendarEvents } from "../controllers/calendarToday.controller";

const router = Router();

router.get("/", requireAuth, getTodayCalendarEvents);

export default router;
