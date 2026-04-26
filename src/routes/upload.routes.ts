import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import * as chatController from "../controllers/chat.controller";
import multer from "multer";

const uploadRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

uploadRouter.post("/chat", requireAuth, upload.single("file"), chatController.uploadChatFile);

export default uploadRouter;
