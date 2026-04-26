import { prisma } from "../db/prisma";

/* ================= 조회 ================= */
export async function fetchSubjectReviews(
  year: number,
  semester: string,
  school: string,
) {
  const rows = await prisma.subject_reviews.findMany({
    where: {
      year,
      semester,
      school,
    },
    select: {
      id: true,
      rating: true,
      reason: true,
      created_at: true,
      teacher: true,
      user_id: true,
      subject: true,
    },
    orderBy: {
      created_at: "desc",
    },
  });

  const grouped: Record<string, any[]> = {};

  for (const r of rows) {
    const key = `${r.subject}|${r.teacher}`;
    grouped[key] ??= [];
    grouped[key].push({
      id: r.id,
      rating: r.rating,
      reason: r.reason,
      createdAt: r.created_at,
      teacher: r.teacher,
      userId: Number(r.user_id),
      subject: r.subject,
    });
  }

  return grouped;
}

/* ================= 저장 ================= */
export async function createSubjectReview(
  userId: bigint,
  year: number,
  semester: string,
  subject: string,
  teacher: string,
  rating: number,
  reason: string,
  school: string,
) {
  await prisma.subject_reviews.create({
    data: {
      year,
      semester,
      subject,
      teacher,
      rating,
      reason,
      school,
      user_id: userId,
      created_at: new Date(),
    },
  });
}

/* ================= 삭제 ================= */
export async function removeSubjectReview(id: number, userId: bigint) {
  const result = await prisma.subject_reviews.deleteMany({
    where: {
      id,
      user_id: userId,
    },
  });

  return result.count; // 삭제된 행 수
}
