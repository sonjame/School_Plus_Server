import { Request, Response } from "express";
import {
  fetchTimetable,
  replaceTimetable,
} from "../services/timetable.service";

export async function getTimetable(req: Request, res: Response) {
  try {
    const userIdStr = req.user?.userId;
    if (!userIdStr) {
      return res.status(401).json({ ok: false, message: "인증 필요" });
    }

    const { year, semester } = req.query;

    if (!year || !semester) {
      return res.status(400).json({ ok: false, message: "잘못된 요청" });
    }

    const userId = BigInt(userIdStr);

    const rows = await fetchTimetable(userId, Number(year), String(semester));

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "서버 오류" });
  }
}

export async function saveTimetable(req: Request, res: Response) {
  try {
    const userIdStr = req.user?.userId;
    if (!userIdStr) {
      return res.status(401).json({ ok: false, message: "인증 필요" });
    }

    const { year, semester, classes } = req.body;

    if (!year || !semester || !Array.isArray(classes)) {
      return res.status(400).json({ ok: false, message: "잘못된 요청" });
    }

    const userId = BigInt(userIdStr);

    await replaceTimetable(userId, year, semester, classes);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "저장 실패" });
  }
}
