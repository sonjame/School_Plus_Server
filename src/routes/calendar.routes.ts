import { Router } from "express";
import {
  getCalendarEvents,
  addCalendarEvent,
  editCalendarEvent,
  removeCalendarEvent,
} from "../controllers/calendar.controller";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/", requireAuth, getCalendarEvents);
router.post("/", requireAuth, addCalendarEvent);
router.put("/", requireAuth, editCalendarEvent);
router.delete("/", requireAuth, removeCalendarEvent);

export default router;
