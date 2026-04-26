import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma";
import { env } from "../config/env";

export async function loginWithPassword(username: string, password: string) {
    const user = await prisma.users.findFirst({
        where: { username },
        select: { id: true, username: true, password: true },
    });

    if (!user || !user.password) {
        return { ok: false as const, message: "아이디 또는 비밀번호 오류" };
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
        return { ok: false as const, message: "아이디 또는 비밀번호 오류" };
    }

    const token = jwt.sign(
        { userId: user.id.toString() }, // ✅ BIGINT -> string
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN }
    );

    return { ok: true as const, token };
}

export async function getMe(userIdStr: string) {
    let userId: bigint;
    try {
        userId = BigInt(userIdStr);
    } catch {
        return { ok: false as const, message: "Invalid userId" };
    }

    const user = await prisma.users.findUnique({
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
            created_at: true,
        },
    });

    if (!user) return { ok: false as const, message: "User not found" };
    return { ok: true as const, user };
}
