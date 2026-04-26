import { prisma } from "../db/prisma";

/* ================= 일정 조회 ================= */
export async function fetchCalendarEvents(userId: number) {
  return prisma.calendar_events.findMany({
    where: {
      user_id: userId,
    },
    select: {
      id: true,
      title: true,
      description: true,
      event_date: true,
      start_time: true,
      end_time: true,
      color: true,
    },
    orderBy: {
      event_date: "asc",
    },
  });
}

/* ================= 일정 추가 ================= */
export async function createCalendarEvent(
  userId: number,
  title: string,
  description: string | null,
  start_time: Date | null,
  end_time: Date | null,
  color: string | null,
  event_date: Date,
) {
  return prisma.calendar_events.create({
    data: {
      user_id: userId,
      title,
      description,
      start_time,
      end_time,
      color,
      event_date,
    },
  });
}

/* ================= 일정 수정 ================= */
export async function updateCalendarEvent(
  id: number,
  userId: number,
  title: string,
  description: string | null,
  start_time: Date | null,
  end_time: Date | null,
  color: string | null,
  event_date: Date,
) {
  return prisma.calendar_events.updateMany({
    where: {
      id,
      user_id: userId,
    },
    data: {
      title,
      description,
      start_time,
      end_time,
      color,
      event_date,
    },
  });
}

/* ================= 일정 삭제 ================= */
export async function deleteCalendarEvent(id: number, userId: number) {
  return prisma.calendar_events.deleteMany({
    where: {
      id,
      user_id: userId,
    },
  });
}
