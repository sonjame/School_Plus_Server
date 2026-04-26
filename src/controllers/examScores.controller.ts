// controllers/examScores.controller.ts
import { Request, Response } from "express";
import {
  saveExamScores,
  getExamScores,
  updateExamSubject,
  deleteExamScore,
} from "../services/examScores.service";

function parseUserId(raw: string | undefined): bigint | null {
  if (!raw) return null;
  try { return BigInt(raw); } catch { return null; }
}

/* ================= 점수 저장 ================= */
export async function createExamScores(req: Request, res: Response) {
  try {
    const userId = parseUserId(req.user?.userId);
    if (!userId) {
      return res.status(401).json({ message: "인증 필요" });
    }

    const { year, semester, exam, scores } = req.body;

    if (!year || !semester || !exam || typeof scores !== "object") {
      return res.status(400).json({ message: "잘못된 요청" });
    }

    await saveExamScores(userId, year, semester, exam, scores);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
}

/* ================= 점수 조회 ================= */
export async function readExamScores(req: Request, res: Response) {
  try {
    const userId = parseUserId(req.user?.userId);
    if (!userId) {
      return res.status(401).json({ message: "인증 필요" });
    }

    const year = Number(req.query.year);

    if (!year) {
      return res.status(400).json({ message: "year 필요" });
    }

    const rows = await getExamScores(userId, year);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
}

/* ================= 과목명 수정 ================= */
export async function editExamSubject(req: Request, res: Response) {
  try {
    const userId = parseUserId(req.user?.userId);
    if (!userId) {
      return res.status(401).json({ message: "인증 필요" });
    }

    const { year, exam, oldSubject, newSubject } = req.body;

    if (!year || !exam || !oldSubject || !newSubject) {
      return res.status(400).json({ message: "잘못된 요청" });
    }

    await updateExamSubject(userId, year, exam, oldSubject, newSubject);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
}

/* ================= 점수 삭제 ================= */
export async function removeExamScore(req: Request, res: Response) {
  try {
    const userId = parseUserId(req.user?.userId);
    if (!userId) {
      return res.status(401).json({ message: "인증 필요" });
    }

    const { year, exam, subject } = req.query;

    if (!year || !exam || !subject) {
      return res.status(400).json({ message: "잘못된 요청" });
    }

    await deleteExamScore(userId, Number(year), String(exam), String(subject));

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
}
