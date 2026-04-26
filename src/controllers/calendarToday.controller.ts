import { Request, Response } from "express";
import { fetchTodayCalendarEvents } from "../services/calendarToday.service";

export async function getTodayCalendarEvents(req: Request, res: Response) {
  try {
    const userIdStr = req.user?.userId;
    if (!userIdStr) {
      return res.status(401).json({ message: "인증 필요" });
    }

    const userId = Number(userIdStr);

    const events = await fetchTodayCalendarEvents(userId);

    return res.json({
      count: events.length,
      events,
    });
  } catch (err) {
    console.error("❌ GET today calendar error", err);
    return res.status(500).json({ message: "서버 오류" });
  }
}
