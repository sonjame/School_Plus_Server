import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const userId = BigInt(3) // Change this if needed
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT 
          p.id, p.title, p.content, p.category, p.likes, p.created_at AS createdAt,
          COALESCE(u.name, '알 수 없음') AS author
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
  `, userId.toString())

    console.log("My posts:", rows.length)

    const scraps: any[] = await prisma.$queryRawUnsafe(`
      SELECT 
          p.id, p.title, p.content, p.category, p.likes, p.created_at,
          COALESCE(u.name, '알 수 없음') AS author
      FROM post_scraps s
      JOIN posts p ON s.post_id = p.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE s.user_id = ?
      ORDER BY p.created_at DESC
  `, userId.toString())

    console.log("Scraps:", scraps.length)
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
