import { prisma } from "../db/prisma";

/* ================= 저장 ================= */
export async function saveSearchKeyword(userId: bigint, keyword: string) {
  await prisma.search_history.upsert({
    where: {
      user_id_keyword: {
        user_id: userId,
        keyword,
      },
    },
    update: {
      created_at: new Date(),
    },
    create: {
      user_id: userId,
      keyword,
      created_at: new Date(),
    },
  });
}

/* ================= 최근 검색어 ================= */
export async function getRecentSearchHistory(userId: bigint) {
  return prisma.search_history.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    take: 10,
    select: {
      id: true,
      keyword: true,
      created_at: true,
    },
  });
}

/* ================= 자동완성 ================= */
export async function getSearchSuggestions(userId: bigint, q: string) {
  return prisma.search_history.findMany({
    where: {
      user_id: userId,
      keyword: {
        contains: q,
      },
    },
    orderBy: { created_at: "desc" },
    take: 8,
    select: {
      id: true,
      keyword: true,
    },
  });
}

/* ================= 삭제 ================= */
export async function deleteSearchHistory(userId: bigint, id?: number) {
  if (!id) {
    await prisma.search_history.deleteMany({
      where: { user_id: userId },
    });
    return;
  }

  await prisma.search_history.deleteMany({
    where: {
      id,
      user_id: userId,
    },
  });
}
