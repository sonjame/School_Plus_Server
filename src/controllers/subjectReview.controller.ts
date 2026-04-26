import { Request, Response } from "express";
import {
  fetchSubjectReviews,
  createSubjectReview,
  removeSubjectReview,
} from "../services/subjectReview.service";

/* ================= 조회 ================= */
export async function getSubjectReviews(req: Request, res: Response) {
  try {
    const { year, semester, school } = req.query;

    if (!year || !semester || !school) {
      return res.status(400).json({ message: "missing fields" });
    }

    const data = await fetchSubjectReviews(
      Number(year),
      String(semester),
      String(school),
    );

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "server error" });
  }
}

/* ================= 저장 ================= */
export async function postSubjectReview(req: Request, res: Response) {
  try {
    const userIdStr = req.user?.userId;
    if (!userIdStr) {
      return res.status(401).json({ message: "login required" });
    }

    const { year, semester, subject, teacher, rating, reason, school } =
      req.body;

    if (!year || !semester || !subject || !teacher || !rating || !school) {
      return res.status(400).json({ message: "missing fields" });
    }

    await createSubjectReview(
      BigInt(userIdStr),
      year,
      semester,
      subject,
      teacher,
      rating,
      reason ?? "",
      school,
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "server error" });
  }
}

/* ================= 삭제 ================= */
export async function deleteSubjectReview(req: Request, res: Response) {
  try {
    const userIdStr = req.user?.userId;
    if (!userIdStr) {
      return res.status(401).json({ message: "login required" });
    }

    const { id } = req.body;

    const affected = await removeSubjectReview(id, BigInt(userIdStr));

    if (affected === 0) {
      return res.status(403).json({ message: "not allowed" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "server error" });
  }
}
