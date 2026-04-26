import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
        return res.status(401).json({ ok: false, message: "토큰 없음" });
    }

    const token = auth.split(" ")[1];

    try {
        // web(Next.js)은 { id, role, level, school_code }, server는 { userId } 형식으로 발급
        const decoded = jwt.verify(token, env.JWT_SECRET) as {
            userId?: string | number;
            id?: string | number;
        };
        const rawId = decoded.userId ?? decoded.id;
        if (rawId === undefined || rawId === null) {
            return res.status(401).json({ ok: false, message: "토큰 payload 오류" });
        }
        req.user = { userId: String(rawId) };
        next();
    } catch {
        return res.status(401).json({ ok: false, message: "토큰 유효하지 않음" });
    }
}
