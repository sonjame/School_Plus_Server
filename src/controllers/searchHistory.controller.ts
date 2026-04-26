import { Request, Response } from "express";
import {
  saveSearchKeyword,
  getRecentSearchHistory,
  getSearchSuggestions,
  deleteSearchHistory,
} from "../services/searchHistory.service";

/* ================= 저장 ================= */
export async function postSearchHistory(req: Request, res: Response) {
  try {
    const userIdStr = req.user?.userId;
    if (!userIdStr) {
      return res.status(401).json({ message: "인증 필요" });
    }

    const { keyword } = req.body;
    if (!keyword || typeof keyword !== "string") {
      return res.status(400).json({ message: "잘못된 요청" });
    }

    await saveSearchKeyword(BigInt(userIdStr), keyword);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
}

/* ================= 조회 ================= */
export async function getSearchHistory(req: Request, res: Response) {
  try {
    const userIdStr = req.user?.userId;
    if (!userIdStr) {
      return res.status(401).json({ message: "인증 필요" });
    }

    const q = req.query.q as string | undefined;
    const userId = BigInt(userIdStr);

    if (q) {
      const rows = await getSearchSuggestions(userId, q);
      return res.json(rows);
    }

    const rows = await getRecentSearchHistory(userId);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
}

/* ================= 삭제 ================= */
export async function removeSearchHistory(req: Request, res: Response) {
  try {
    const userIdStr = req.user?.userId;
    if (!userIdStr) {
      return res.status(401).json({ message: "인증 필요" });
    }

    const { id } = req.body;
    await deleteSearchHistory(BigInt(userIdStr), id ? Number(id) : undefined);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "서버 오류" });
  }
}
