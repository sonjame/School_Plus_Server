import { Request, Response } from "express";
import {
  fetchCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "../services/calendar.service";

/* ================= 일정 조회 ================= */
export async function getCalendarEvents(req: Request, res: Response) {
  try {
    const userIdStr = req.user?.userId;
    if (!userIdStr) {
      return res.status(401).json({ ok: false, message: "인증 필요" });
    }

    const userId = Number(userIdStr);
    const rows = await fetchCalendarEvents(userId);

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "서버 오류" });
  }
}

/* ================= 일정 추가 ================= */
export async function addCalendarEvent(req: Request, res: Response) {
  try {
    const userIdStr = req.user?.userId;
    if (!userIdStr) {
      return res.status(401).json({ ok: false, message: "인증 필요" });
    }

    const { title, description, start_time, end_time, color, event_date } =
      req.body;

    if (!title || !event_date) {
      return res.status(400).json({ ok: false, message: "missing fields" });
    }

    await createCalendarEvent(
      Number(userIdStr),
      title,
      description ?? null,
      start_time ? new Date(start_time) : null,
      end_time ? new Date(end_time) : null,
      color ?? null,
      new Date(event_date),
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "저장 실패" });
  }
}

/* ================= 일정 수정 ================= */
export async function editCalendarEvent(req: Request, res: Response) {
  try {
    const userIdStr = req.user?.userId;
    if (!userIdStr) {
      return res.status(401).json({ ok: false, message: "인증 필요" });
    }

    const { id, title, description, start_time, end_time, color, event_date } =
      req.body;

    if (!id || !title || !event_date) {
      return res.status(400).json({ ok: false, message: "missing fields" });
    }

    await updateCalendarEvent(
      Number(id),
      Number(userIdStr),
      title,
      description ?? null,
      start_time ? new Date(start_time) : null,
      end_time ? new Date(end_time) : null,
      color ?? null,
      new Date(event_date),
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "수정 실패" });
  }
}

/* ================= 일정 삭제 ================= */
export async function removeCalendarEvent(req: Request, res: Response) {
  try {
    const userIdStr = req.user?.userId;
    if (!userIdStr) {
      return res.status(401).json({ ok: false, message: "인증 필요" });
    }

    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ ok: false, message: "missing id" });
    }

    await deleteCalendarEvent(Number(id), Number(userIdStr));

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "삭제 실패" });
  }
}
