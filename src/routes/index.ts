import { Router } from "express";
import authRouter from "./auth.routes";
import postsRouter from "./posts.routes";
import healthRouter from "./health.routes";
import calendarRouter from "./calendar.routes";
import calendarTodayRouter from "./calendarToday.routes";
import chatRouter from "./chat.routes";
import commentsRouter from "./comments.routes";
import examScoresRouter from "./examScores.routes";
import searchHistoryRouter from "./searchHistory.routes";
import subjectReviewRouter from "./subjectReview.routes";
import timetableRouter from "./timetable.routes";
import uploadRouter from "./upload.routes";
import notificationsRouter from "./notifications.routes";
import friendsRouter from "./friends.routes";
import userRouter from "./user.routes";
import mealsRouter from "./meals.routes";
import academicEventsRouter from "./academicEvents.routes";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);

// Auth
apiRouter.use("/auth", authRouter);

// Posts (순서 중요: mine/scrap은 /:id 보다 먼저)
apiRouter.use("/posts", postsRouter);

// Comments
apiRouter.use("/comments", commentsRouter);

// Calendar
apiRouter.use("/calendar-events", calendarRouter);
apiRouter.use("/calendar-today", calendarTodayRouter);

// Chat
apiRouter.use("/chat", chatRouter);

// Exam Scores
apiRouter.use("/exam-score", examScoresRouter);

// Search History
apiRouter.use("/search-history", searchHistoryRouter);

// Subject Review
apiRouter.use("/subject-review", subjectReviewRouter);

// Timetable
apiRouter.use("/timetable", timetableRouter);

// Upload
apiRouter.use("/upload", uploadRouter);

// Notifications
apiRouter.use("/notifications", notificationsRouter);

// Friends
apiRouter.use("/friends", friendsRouter);

// User profile
apiRouter.use("/user", userRouter);

// School data (NEIS)
apiRouter.use("/meals", mealsRouter);
apiRouter.use("/academic-events", academicEventsRouter);

export default apiRouter;
