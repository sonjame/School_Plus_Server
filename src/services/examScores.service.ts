// services/examScores.service.ts
import { prisma } from "../db/prisma";

/* ================= 점수 저장 ================= */
export async function saveExamScores(
  userId: bigint,
  year: number,
  semester: string,
  exam: string,
  scores: Record<string, number>,
) {
  for (const subject of Object.keys(scores)) {
    const score = Number(scores[subject]);

    if (!Number.isFinite(score) || score < 0 || score > 100) continue;

    await prisma.exam_scores.upsert({
      where: {
        user_id_year_exam_subject: {
          user_id: userId,
          year,
          exam,
          subject,
        },
      },
      update: {
        score,
        updated_at: new Date(),
      },
      create: {
        user_id: userId,
        year,
        semester,
        exam,
        subject,
        score,
      },
    });
  }
}

/* ================= 점수 조회 ================= */
export async function getExamScores(userId: bigint, year: number) {
  return prisma.exam_scores.findMany({
    where: {
      user_id: userId,
      year,
    },
    select: {
      exam: true,
      subject: true,
      score: true,
    },
  });
}

/* ================= 과목명 수정 ================= */
export async function updateExamSubject(
  userId: bigint,
  year: number,
  exam: string,
  oldSubject: string,
  newSubject: string,
) {
  return prisma.exam_scores.updateMany({
    where: {
      user_id: userId,
      year,
      exam,
      subject: oldSubject,
    },
    data: {
      subject: newSubject,
      updated_at: new Date(),
    },
  });
}

/* ================= 점수 삭제 ================= */
export async function deleteExamScore(
  userId: bigint,
  year: number,
  exam: string,
  subject: string,
) {
  return prisma.exam_scores.deleteMany({
    where: {
      user_id: userId,
      year,
      exam,
      subject,
    },
  });
}
