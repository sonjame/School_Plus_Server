import { Request, Response } from "express";
import { loginWithPassword, getMe } from "../services/auth.service";

export async function login(req: Request, res: Response) {
    const { username, password } = req.body as {
        username?: string;
        password?: string;
    };

    if (!username || !password) {
        return res.status(400).json({ ok: false, message: "username/password required" });
    }

    const result = await loginWithPassword(username, password);

    if (!result.ok) {
        return res.status(401).json({ ok: false, message: result.message });
    }

    return res.json({ ok: true, token: result.token });
}

export async function me(req: Request, res: Response) {
    const userIdStr = req.user?.userId;
    if (!userIdStr) {
        return res.status(401).json({ ok: false, message: "Invalid auth payload" });
    }

    const result = await getMe(userIdStr);

    if (!result.ok) {
        return res.status(401).json({ ok: false, message: result.message });
    }

    return res.json({ ok: true, user: result.user });
}
