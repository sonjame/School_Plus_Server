import { Router } from "express";
import {
  postSearchHistory,
  getSearchHistory,
  removeSearchHistory,
} from "../controllers/searchHistory.controller";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/", requireAuth, getSearchHistory);
router.post("/", requireAuth, postSearchHistory);
router.delete("/", requireAuth, removeSearchHistory);

export default router;
