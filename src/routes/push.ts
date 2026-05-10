import express from "express";

import { prisma } from "../db/prisma";
import { requireAuth } from "../middlewares/auth";

const router = express.Router();

router.post("/push-token", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const { expoPushToken } = req.body;

    if (!expoPushToken) {
      return res.status(400).json({
        message: "expoPushToken 필요",
      });
    }

    const existing = await prisma.push_tokens.findFirst({
      where: {
        user_id: Number(userId),
        expo_push_token: expoPushToken,
      },
    });

    if (!existing) {
      await prisma.push_tokens.create({
        data: {
          user_id: Number(userId),
          expo_push_token: expoPushToken,
        },
      });
    }

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "푸시 토큰 저장 실패",
    });
  }
});

export default router;
