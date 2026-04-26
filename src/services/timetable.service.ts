import { prisma } from "../db/prisma";

export async function fetchTimetable(
  userId: bigint,
  year: number,
  semester: string,
) {
  return prisma.timetables.findMany({
    where: {
      user_id: userId,
      year,
      semester,
    },
    orderBy: [{ day: "asc" }, { period: "asc" }],
    select: {
      day: true,
      period: true,
      subject: true,
      teacher: true,
      room: true,
    },
  });
}

export async function replaceTimetable(
  userId: bigint,
  year: number,
  semester: string,
  classes: any[],
) {
  return prisma.$transaction(async (tx) => {
    await tx.timetables.deleteMany({
      where: { user_id: userId, year, semester },
    });

    await tx.timetables.createMany({
      data: classes.map((c) => ({
        user_id: userId,
        year,
        semester,
        day: c.day,
        period: c.period,
        subject: c.subject,
        teacher: c.teacher,
        room: c.room,
      })),
    });
  });
}
