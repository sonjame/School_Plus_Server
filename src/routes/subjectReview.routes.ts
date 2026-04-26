import { Router } from "express";
import {
  getSubjectReviews,
  postSubjectReview,
  deleteSubjectReview,
} from "../controllers/subjectReview.controller";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/", getSubjectReviews);
router.post("/", requireAuth, postSubjectReview);
router.delete("/", requireAuth, deleteSubjectReview);

export default router;
