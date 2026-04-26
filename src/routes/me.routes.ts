import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middlewares/auth";

const router = Router();

/**
 * GET /auth/me
 * - Authorization: Bearer <token>
 * - req.user.userId 를 BigInt로 변환하여 users 조회
 */
router.get("/", requireAuth, async (req, res, next) => {
    try {
        const rawUserId = (req as any).user?.userId;
        

        if (rawUserId === undefined || rawUserId === null) {
            return res.status(401).json({ ok: false, message: "Invalid auth payload" });
        }

        let userId: bigint;
        try {
            userId = BigInt(String(rawUserId)); // ✅ string/number 모두 대응
        } catch {
            return res.status(401).json({ ok: false, message: "Invalid userId" });
        }

        const me = await prisma.users.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                name: true,
                email: true,
                school: true,
                school_code: true,
                edu_code: true,
                level: true,
                grade: true,
            },
        });

        if (!me) {
            return res.status(404).json({ ok: false, message: "user not found" });
        }

        // ✅ JSON으로 내려갈 때 BigInt는 string 변환 필요
        return res.json({
            ok: true,
            me: { ...me, id: me.id.toString() },
        });
    } catch (e) {
        return next(e);
    }
});

export default router;
