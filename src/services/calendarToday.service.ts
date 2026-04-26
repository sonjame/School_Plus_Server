import { prisma } from "../db/prisma";

/* ================= 오늘 일정 조회 ================= */
export async function fetchTodayCalendarEvents(userId: number) {
  return prisma.calendar_events.findMany({
    where: {
      user_id: userId,
      event_date: {
        equals: new Date(new Date().toISOString().split("T")[0]), // 오늘 날짜
      },
    },
    select: {
      id: true,
      title: true,
      start_time: true,
      end_time: true,
      color: true,
    },
    orderBy: {
      start_time: "asc",
    },
  });
}
