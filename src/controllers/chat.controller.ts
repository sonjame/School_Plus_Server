import { Request, Response } from "express";
import * as chatService from "../services/chat.service";

// req.user is set by requireAuth middleware (userId is always a string)
type AuthRequest = Request;

export const getRooms = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });
        const rooms = await chatService.getRooms(userId);
        res.json(rooms);
    } catch (error) {
        console.error("[GET ROOMS ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const createRoom = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });
        const { isGroup, name, userIds } = req.body;
        const result = await chatService.createRoom(userId, isGroup, name, userIds);
        if ((result as any).error) {
            return res.status((result as any).status || 400).json(result);
        }
        res.json(result);
    } catch (error) {
        console.error("[CREATE ROOM ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const getMessages = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });
        const { roomId } = req.params;
        const messages = await chatService.getMessages(userId, Number(roomId));
        if ((messages as any).error) return res.status(400).json(messages);
        res.json(messages);
    } catch (error) {
        console.error("[GET MESSAGES ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });
        const { roomId, type, content, fileUrl, fileName, pollData } = req.body;
        const result = await chatService.sendMessage(userId, Number(roomId), type, content, fileUrl, fileName, pollData);
        if ((result as any)?.error) return res.status((result as any).status || 400).json(result);
        res.json({ success: true });
    } catch (error) {
        console.error("[SEND MESSAGE ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const sendBulkMessages = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });
        const { roomId, images } = req.body;
        const result = await chatService.sendBulkMessages(userId, Number(roomId), images);
        if ((result as any)?.error) return res.status((result as any).status || 400).json(result);
        res.json({ success: true });
    } catch (error) {
        console.error("[BULK MSG ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });
        const { roomId } = req.params;
        await chatService.markAsRead(userId, Number(roomId));
        res.json({ success: true });
    } catch (error) {
        console.error("[MARK Read ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const uploadChatFile = async (req: AuthRequest, res: Response) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: "NO_FILE" });
        // multer가 파일명을 latin1로 읽으므로 UTF-8로 재변환 (한글 파일명 깨짐 방지)
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const data = await chatService.uploadChatFile(file.buffer, file.mimetype, originalName);
        res.json(data);
    } catch (error) {
        console.error("[UPLOAD ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const renameRoom = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });
        const { roomId } = req.params;
        const { name } = req.body;
        const result = await chatService.renameRoom(userId, Number(roomId), name);
        if ((result as any)?.error) return res.status((result as any).status || 400).json(result);
        res.json({ success: true });
    } catch (error) {
        console.error("[RENAME ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const deleteRoom = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });
        const { roomId } = req.params;
        const result = await chatService.deleteRoom(userId, Number(roomId));
        if ((result as any)?.error) return res.status((result as any).status || 400).json(result);
        res.json({ success: true });
    } catch (error) {
        console.error("[DEL ROOM ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const leaveRoom = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });
        const { roomId } = req.params;
        await chatService.leaveRoom(userId, Number(roomId));
        res.json({ success: true });
    } catch (error) {
        console.error("[LEAVE ROOM ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const getRoomUsers = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });
        const { roomId } = req.params;
        const users = await chatService.getRoomUsers(userId, Number(roomId));
        res.json(users);
    } catch (error) {
        console.error("[ROOM USERS ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const deleteMessage = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });
        const { messageId } = req.params;
        const result = await chatService.deleteMessage(userId, Number(messageId));
        if ((result as any)?.error) return res.status((result as any).status || 400).json(result);
        res.json(result);
    } catch (error) {
        console.error("[DEL MSG ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const deleteNotice = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });
        const { noticeId } = req.params;
        // Notices are just messages. Reusing deleteMessage
        await chatService.deleteMessage(userId, Number(noticeId));
        res.json({ success: true });
    } catch (error) {
        console.error("[DEL NOTICE ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const votePoll = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });
        const { messageId, optionId } = req.body;
        const result = await chatService.votePoll(userId, Number(messageId), Number(optionId));
        if ((result as any)?.error) return res.status(400).json(result);
        res.json({ success: true });
    } catch (error) {
        console.error("[VOTE POLL ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const unvotePoll = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });
        const { messageId } = req.body;
        await chatService.unvotePoll(userId, Number(messageId));
        res.json({ success: true });
    } catch (error) {
        console.error("[UNVOTE POLL ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const closePoll = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });
        const { messageId } = req.body;
        await chatService.closePoll(userId, Number(messageId));
        res.json({ success: true });
    } catch (error) {
        console.error("[CLOSE POLL ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const downloadFile = async (req: AuthRequest, res: Response) => {
    try {
        const url = req.query.url as string;
        if (!url) return res.status(400).json({ error: "NO_URL" });

        const fileRes = await fetch(url);
        if (!fileRes.ok) throw new Error("Failed to fetch");

        const arrayBuffer = await fileRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        let filename = "downloaded_file";
        const urlParts = new URL(url).pathname.split("/");
        if (urlParts.length > 0) {
            filename = urlParts[urlParts.length - 1].replace(/^\d+-/, ""); // strip timestamp prefix
        }

        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.setHeader("Content-Type", fileRes.headers.get("content-type") || "application/octet-stream");
        res.send(buffer);
    } catch (error) {
        console.error("[DOWNLOAD ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const sendNotice = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });

        const { roomId, content } = req.body;
        const result = await chatService.sendNotice(userId, Number(roomId), content);
        if ((result as any)?.error) return res.status((result as any).status || 400).json(result);
        res.json({ ok: true });
    } catch (error) {
        console.error("[SEND NOTICE ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

// === NEW MISSING FEATURES === //

export const searchUsers = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });

        const { name, grade, classNum, schoolCode, onlyFriends } = req.query;
        if (!schoolCode) return res.json([]);

        const result = await chatService.searchUsers(
            userId,
            String(schoolCode),
            name ? String(name) : undefined,
            grade ? String(grade) : undefined,
            classNum ? String(classNum) : undefined,
            onlyFriends === 'true'
        );
        res.json(Array.isArray(result) ? result : []);
    } catch (error) {
        console.error("[SEARCH USERS ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const inviteUsers = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });

        const { roomId } = req.params;
        const { userIds } = req.body;
        
        const result = await chatService.inviteUsers(userId, Number(roomId), Array.isArray(userIds) ? userIds : []);
        if (result?.error) return res.status(result.status || 400).json(result);
        res.json({ ok: true });
    } catch (error) {
        console.error("[INVITE USERS ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const getUnreadCount = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });

        const count = await chatService.getUnreadCount(userId);
        res.json({ unreadCount: count });
    } catch (error) {
        console.error("[UNREAD COUNT ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const getUnreadSummary = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });

        const summary = await chatService.getUnreadSummary(userId);
        res.json(summary);
    } catch (error) {
        console.error("[UNREAD SUMMARY ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const sendAdminMessage = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });

        const { roomId, type, content, fileUrl, fileName } = req.body;
        await chatService.sendAdminMessage(userId, Number(roomId), type, content, fileUrl, fileName);
        res.json({ ok: true });
    } catch (error) {
        console.error("[SEND ADMIN MESSAGE ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const createPoll = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });

        const { roomId, title, options, anonymous, closedAt } = req.body;
        const result = await chatService.createPoll(userId, Number(roomId), title, options, anonymous, closedAt);
        if (result?.error) return res.status(result.status || 400).json(result);
        res.json({ ok: true });
    } catch (error) {
        console.error("[CREATE POLL ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};

export const reportMessage = async (req: AuthRequest, res: Response) => {
    try {
        const userId = Number(req.user?.userId);
        if (!userId) return res.status(401).json({ message: "NO_TOKEN" });

        const { roomId, messageId, reportedUserId, reason } = req.body;
        if (!roomId || !messageId || !reportedUserId || !reason?.trim()) {
            return res.status(400).json({ message: "필수 값이 누락되었습니다." });
        }

        const result = await chatService.reportMessage(userId, Number(roomId), Number(messageId), Number(reportedUserId), reason);
        if (result?.error) return res.status(result.status || 400).json(result);
        res.json({ success: true });
    } catch (error) {
        console.error("[REPORT MESSAGE ERROR]", error);
        res.status(500).json({ message: "SERVER_ERROR" });
    }
};
