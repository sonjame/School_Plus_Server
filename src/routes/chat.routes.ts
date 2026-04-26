import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import * as chatController from "../controllers/chat.controller";
import multer from "multer";

const chatRouter = Router();

// Room Actions
chatRouter.get("/rooms", requireAuth, chatController.getRooms);
chatRouter.post("/create-room", requireAuth, chatController.createRoom);
chatRouter.patch("/messages/:roomId/name", requireAuth, chatController.renameRoom);
chatRouter.delete("/messages/:roomId/delete", requireAuth, chatController.deleteRoom);
chatRouter.post("/messages/:roomId/leave", requireAuth, chatController.leaveRoom);
chatRouter.get("/messages/:roomId/users", requireAuth, chatController.getRoomUsers);

// Message Actions
chatRouter.get("/messages/:roomId", requireAuth, chatController.getMessages);
chatRouter.post("/messages/:roomId/read", requireAuth, chatController.markAsRead);
chatRouter.post("/messages", requireAuth, chatController.sendMessage);
chatRouter.post("/messages/bulk", requireAuth, chatController.sendBulkMessages);
chatRouter.post("/messages/notice", requireAuth, chatController.sendNotice);
chatRouter.delete("/messages/delete/:messageId", requireAuth, chatController.deleteMessage);
chatRouter.delete("/notice/:noticeId", requireAuth, chatController.deleteNotice); // same logic as deleteMessage

// Poll Actions
chatRouter.post("/poll/vote", requireAuth, chatController.votePoll);
chatRouter.post("/poll/unvote", requireAuth, chatController.unvotePoll);
chatRouter.post("/poll/close", requireAuth, chatController.closePoll);

// Download Action
chatRouter.get("/download", requireAuth, chatController.downloadFile);


// === NEW MISSING FEATURES === //
chatRouter.get("/search/users", requireAuth, chatController.searchUsers);
chatRouter.post("/messages/:roomId/invite", requireAuth, chatController.inviteUsers);
chatRouter.post("/poll/create", requireAuth, chatController.createPoll);
chatRouter.get("/unread-count", requireAuth, chatController.getUnreadCount);
chatRouter.get("/unread-summary", requireAuth, chatController.getUnreadSummary);
chatRouter.post("/send", requireAuth, chatController.sendAdminMessage);
chatRouter.post("/report", requireAuth, chatController.reportMessage);

export default chatRouter;
