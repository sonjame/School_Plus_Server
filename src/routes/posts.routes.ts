import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import db from '../db/mysql'
import { requireAuth } from '../middlewares/auth'
import { moveTempToPost, deleteS3Url, BUCKET_URL } from '../utils/s3'
import { env } from '../config/env'

const router = Router()

/* ─────────────────────────────────────────
   BAN 체크 헬퍼
───────────────────────────────────────── */
export async function checkBanStats(userId: string | number) {
  const [rows]: any = await db.query(
    `SELECT id, is_banned, banned_at, banned_reason, level FROM users WHERE id = ?`,
    [userId],
  )
  const user = rows[0]
  if (!user) return { banned: false, message: '', user: null }

  if (user.is_banned) {
    return { banned: true, message: user.banned_reason ?? '계정이 정지되었습니다.', user }
  }

  if (user.banned_at) {
    const durations: Record<string, number> = {
      '24h': 24 * 3600 * 1000,
      '72h': 72 * 3600 * 1000,
      '7d': 7 * 24 * 3600 * 1000,
    }
    const duration = durations[user.banned_reason] ?? durations['24h']
    if (Date.now() < new Date(user.banned_at).getTime() + duration) {
      return { banned: true, message: '일시 정지된 계정입니다.', user }
    }
  }

  return { banned: false, message: '', user }
}

/* ─────────────────────────────────────────
   GET /posts  — 목록 조회
───────────────────────────────────────── */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const [userRows]: any = await db.query(`SELECT level, school_code FROM users WHERE id=?`, [userId])
    const { level, school_code } = userRows[0]
    const isAdmin = level === 'admin'

    const category = req.query.category as string | undefined

    let query = `
      SELECT p.id, p.title, p.content, p.category, p.images, p.attachments, p.thumbnail,
        CASE WHEN u.level='admin' THEN '관리자' ELSE u.name END AS author,
        p.likes, COUNT(DISTINCT c.id) AS commentCount,
        DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN post_comments c ON p.id = c.post_id
      WHERE 1=1`
    const params: any[] = []

    if (!isAdmin) {
      if (category !== 'admin') {
        query += ` AND p.school_code=? AND p.is_hidden=0`
        params.push(school_code)
      } else {
        query += ` AND p.is_hidden=0 AND (u.level='admin' OR p.school_code=?)`
        params.push(school_code)
      }
    }

    if (category) { query += ` AND p.category=?`; params.push(category) }
    query += ` GROUP BY p.id ORDER BY p.created_at DESC`

    const [rows]: any = await db.query(query, params)
    return res.json(rows.map((p: any) => ({
      ...p,
      images: typeof p.images === 'string' ? JSON.parse(p.images) : (p.images ?? []),
      attachments: typeof p.attachments === 'string' ? JSON.parse(p.attachments) : (p.attachments ?? []),
    })))
  } catch (e) {
    console.error('GET /posts error', e)
    return res.status(500).json({ message: 'server error' })
  }
})

/* ─────────────────────────────────────────
   POST /posts  — 게시글 생성
───────────────────────────────────────── */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const { banned, message, user } = await checkBanStats(userId)
    if (banned) return res.status(403).json({ message })

    const { title, content, category, images = [], attachments = [], thumbnail = null, vote } = req.body
    if (!title || !content || !category) return res.status(400).json({ message: '필수 값 누락' })

    const postId = uuidv4()
    const finalImages = await moveTempToPost(images, postId)
    const isAdmin = user?.level === 'admin'
    const authorName = isAdmin ? '관리자' : user?.name

    let finalThumbnail = thumbnail
    if (!finalThumbnail && finalImages.length > 0) finalThumbnail = finalImages[0]

    await db.query(
      `INSERT INTO posts (id, user_id, category, title, content, images, attachments, thumbnail, likes, school_code, author)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [postId, userId, category, title, content,
        JSON.stringify(finalImages), JSON.stringify(attachments ?? []),
        finalThumbnail, user?.school_code ?? null, authorName],
    )

    // 알림: 관리자 공지
    if (category === 'admin' && isAdmin) {
      const [users]: any = await db.query(`SELECT id FROM users WHERE level != 'admin'`)
      if (users.length > 0) {
        const values = users.map((u: any) => [u.id, 'admin_notice', '📢 관리자 공지사항', title, `/board/post/${postId}`])
        await db.query(`INSERT INTO notifications (user_id, type, title, message, link) VALUES ?`, [values])
      }
    }

    // 알림: 학생 문의
    if (category === 'admin' && !isAdmin) {
      const [admins]: any = await db.query(`SELECT id FROM users WHERE level = 'admin'`)
      if (admins.length > 0) {
        const values = admins.map((a: any) => [a.id, 'admin_question', '📩 새 관리자 문의',
          `${user?.name || '학생'}님이 관리자 문의를 등록했습니다.`, `/board/post/${postId}`])
        await db.query(`INSERT INTO notifications (user_id, type, title, message, link) VALUES ?`, [values])
      }
    }

    // 투표
    if (vote?.enabled && Array.isArray(vote.options)) {
      await db.query(`INSERT INTO post_votes (post_id, end_at) VALUES (?, ?)`, [postId, vote.endAt || null])
      for (const opt of vote.options) {
        await db.query(`INSERT INTO post_vote_options (post_id, option_text) VALUES (?, ?)`, [postId, opt.text ?? opt])
      }
    }

    return res.status(201).json({ success: true, id: postId })
  } catch (e) {
    console.error('POST /posts error', e)
    return res.status(500).json({ message: 'server error' })
  }
})

/* ─────────────────────────────────────────
   GET /posts/:id  — 상세 조회
───────────────────────────────────────── */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const postId = req.params.id
    let userId: any = null
    let isAdmin = false
    let decodedSchool: string | null = null

    const auth = req.headers.authorization
    if (auth) {
      try {
        const decoded: any = jwt.verify(auth.replace('Bearer ', ''), env.JWT_SECRET)
        userId = decoded.id
        isAdmin = decoded.level === 'admin'
        decodedSchool = decoded.school_code
      } catch { /* token optional */ }
    }

    const [postRows]: any = await db.query(
      `SELECT p.id, p.title, p.content, p.category, p.likes, p.images, p.attachments, p.thumbnail,
         p.is_hidden, p.is_reported, DATE_FORMAT(CONVERT_TZ(p.created_at,'+00:00','+09:00'),'%Y-%m-%d %H:%i:%s') AS created_at,
         p.user_id, CASE WHEN u.level='admin' THEN '관리자' ELSE COALESCE(u.name,'알 수 없음') END AS author
       FROM posts p JOIN users u ON p.user_id = u.id
       WHERE p.id = ? ${isAdmin ? '' : 'AND p.is_hidden=0'}`,
      [postId],
    )
    if (!postRows || postRows.length === 0) return res.status(404).json({ message: '존재하지 않는 게시글' })
    const post = postRows[0]

    // 투표
    const [voteMetaRows]: any = await db.query(
      `SELECT DATE_FORMAT(CONVERT_TZ(end_at,'+00:00','+09:00'),'%Y-%m-%d %H:%i:%s') AS end_at FROM post_votes WHERE post_id=?`,
      [postId],
    )
    let vote = null
    if (voteMetaRows.length > 0) {
      const [options]: any = await db.query(
        `SELECT o.id AS optionId, o.option_text AS text, COUNT(l.id) AS votes
         FROM post_vote_options o LEFT JOIN post_vote_logs l ON o.id=l.option_id
         WHERE o.post_id=? GROUP BY o.id ORDER BY o.id ASC`,
        [postId],
      )
      let myVoteIndex: number | null = null
      if (userId) {
        const [myVoteRows]: any = await db.query(
          `SELECT option_id FROM post_vote_logs WHERE post_id=? AND user_id=?`,
          [postId, userId],
        )
        if (myVoteRows.length > 0) {
          myVoteIndex = options.findIndex((o: any) => o.optionId === myVoteRows[0].option_id)
        }
      }
      vote = { enabled: true, endAt: voteMetaRows[0].end_at, options, myVoteIndex }
    }

    return res.json({
      ...post,
      images: typeof post.images === 'string' ? JSON.parse(post.images) : (post.images ?? []),
      attachments: typeof post.attachments === 'string' ? JSON.parse(post.attachments) : (post.attachments ?? []),
      vote,
    })
  } catch (e) {
    console.error('GET /posts/:id error', e)
    return res.status(500).json({ message: 'server error' })
  }
})

/* ─────────────────────────────────────────
   PUT /posts/:id  — 게시글 수정
───────────────────────────────────────── */
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const postId = req.params.id
    const userId = req.user!.userId
    const { banned, message, user } = await checkBanStats(userId)
    if (banned) return res.status(403).json({ message })

    const isAdmin = user?.level === 'admin'
    const [postRows]: any = await db.query(`SELECT user_id FROM posts WHERE id=?`, [postId])
    if (!postRows.length || (postRows[0].user_id != userId && !isAdmin)) {
      return res.status(403).json({ message: 'forbidden' })
    }

    const { title, content, images = [], attachments = [], thumbnail = null, vote } = req.body
    const finalImages = await moveTempToPost(images, postId)

    await db.query(
      `UPDATE posts SET title=?, content=?, images=?, attachments=?, thumbnail=? WHERE id=?`,
      [title, content, JSON.stringify(finalImages), JSON.stringify(attachments ?? []), thumbnail, postId],
    )

    // 투표 재설정
    await db.query(`DELETE FROM post_vote_logs WHERE post_id=?`, [postId])
    await db.query(`DELETE FROM post_vote_options WHERE post_id=?`, [postId])
    await db.query(`DELETE FROM post_votes WHERE post_id=?`, [postId])

    if (vote?.enabled && Array.isArray(vote.options)) {
      await db.query(`INSERT INTO post_votes (post_id, end_at) VALUES (?,?)`, [postId, vote.endAt || null])
      for (const opt of vote.options) {
        await db.query(`INSERT INTO post_vote_options (post_id, option_text) VALUES (?,?)`, [postId, opt])
      }
    }

    return res.json({ success: true })
  } catch (e) {
    return res.status(500).json({ message: 'server error' })
  }
})

/* ─────────────────────────────────────────
   DELETE /posts/:id  — 게시글 삭제
───────────────────────────────────────── */
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const postId = req.params.id
    const userId = req.user!.userId
    const { banned, message, user } = await checkBanStats(userId)
    if (banned) return res.status(403).json({ message })

    const isAdmin = user?.level === 'admin'
    const [postRows]: any = await db.query(`SELECT user_id, images, is_reported FROM posts WHERE id=?`, [postId])
    if (!postRows.length || (postRows[0].user_id != userId && !isAdmin)) {
      return res.status(403).json({ message: 'forbidden' })
    }
    if (postRows[0].is_reported && !isAdmin) {
      return res.status(403).json({ message: '신고된 게시글은 삭제할 수 없습니다.' })
    }

    // S3 이미지 삭제
    let images: string[] = []
    try { images = typeof postRows[0].images === 'string' ? JSON.parse(postRows[0].images) : postRows[0].images } catch { }
    for (const url of images) await deleteS3Url(url)

    await db.query(`DELETE FROM post_vote_logs WHERE post_id=?`, [postId])
    await db.query(`DELETE FROM post_vote_options WHERE post_id=?`, [postId])
    await db.query(`DELETE FROM post_votes WHERE post_id=?`, [postId])
    await db.query(`DELETE FROM post_comments WHERE post_id=?`, [postId])
    await db.query(`DELETE FROM posts WHERE id=?`, [postId])

    return res.json({ success: true })
  } catch (e) {
    return res.status(500).json({ message: 'server error' })
  }
})

/* ─────────────────────────────────────────
   POST /posts/:id/like  — 좋아요 토글
───────────────────────────────────────── */
router.post('/:id/like', requireAuth, async (req: Request, res: Response) => {
  try {
    const postId = req.params.id
    const userId = req.user!.userId

    const [exist]: any = await db.query(
      `SELECT id FROM post_likes WHERE post_id=? AND user_id=?`, [postId, userId])
    if (exist.length) {
      await db.query(`DELETE FROM post_likes WHERE post_id=? AND user_id=?`, [postId, userId])
    } else {
      await db.query(`INSERT INTO post_likes (post_id, user_id) VALUES (?,?)`, [postId, userId])
    }
    const [countRows]: any = await db.query(`SELECT COUNT(*) AS count FROM post_likes WHERE post_id=?`, [postId])
    const count = countRows[0].count
    await db.query(`UPDATE posts SET likes=? WHERE id=?`, [count, postId])
    return res.json({ likes: count })
  } catch (e) {
    return res.status(500).json({ message: 'server error' })
  }
})

/* ─────────────────────────────────────────
   POST /posts/:id/vote  — 투표
───────────────────────────────────────── */
router.post('/:id/vote', requireAuth, async (req: Request, res: Response) => {
  try {
    const postId = req.params.id
    const userId = req.user!.userId
    const { optionId } = req.body

    const [already]: any = await db.query(
      `SELECT id FROM post_vote_logs WHERE post_id=? AND user_id=?`, [postId, userId])
    if (already.length) return res.status(400).json({ message: '이미 투표했습니다.' })

    await db.query(`INSERT INTO post_vote_logs (post_id, user_id, option_id) VALUES (?,?,?)`, [postId, userId, optionId])
    return res.json({ success: true })
  } catch (e) {
    return res.status(500).json({ message: 'server error' })
  }
})

/* ─────────────────────────────────────────
   GET /posts/mine  — 내 게시글
───────────────────────────────────────── */
router.get('/mine', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId
    if (!userId) return res.json([])

    const [rows]: any = await db.query(
      `SELECT p.id, p.title, p.content, p.category, p.likes,
         COALESCE(u.name,'알 수 없음') AS author, p.created_at AS createdAt
       FROM posts p JOIN users u ON p.user_id=u.id
       WHERE p.user_id=? ORDER BY p.created_at DESC`,
      [userId],
    )
    return res.json(rows)
  } catch (e) {
    return res.json([])
  }
})

/* ─────────────────────────────────────────
   GET  /posts/:id/scrap  — 스크랩 여부
   POST /posts/:id/scrap  — 스크랩 토글
───────────────────────────────────────── */
router.get('/:id/scrap', async (req: Request, res: Response) => {
  try {
    const postId = req.params.id
    const auth = req.headers.authorization
    if (!auth) return res.json({ scrapped: false })
    const decoded: any = jwt.verify(auth.replace('Bearer ', ''), env.JWT_SECRET)
    const [exist]: any = await db.query(`SELECT id FROM post_scraps WHERE post_id=? AND user_id=?`, [postId, decoded.id])
    return res.json({ scrapped: !!exist.length })
  } catch { return res.json({ scrapped: false }) }
})

router.post('/:id/scrap', requireAuth, async (req: Request, res: Response) => {
  try {
    const postId = req.params.id
    const userId = req.user!.userId
    const [exist]: any = await db.query(`SELECT id FROM post_scraps WHERE post_id=? AND user_id=?`, [postId, userId])
    if (exist.length) {
      await db.query(`DELETE FROM post_scraps WHERE post_id=? AND user_id=?`, [postId, userId])
      return res.json({ scrapped: false })
    }
    await db.query(`INSERT INTO post_scraps (post_id, user_id) VALUES (?,?)`, [postId, userId])
    return res.json({ scrapped: true })
  } catch (e) {
    return res.status(500).json({ message: 'server error' })
  }
})

/* ─────────────────────────────────────────
   GET /posts/scrap  — 스크랩 목록
───────────────────────────────────────── */
router.get('/scrap', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId
    if (!userId) return res.json([])
    const [rows]: any = await db.query(
      `SELECT p.id, p.title, p.content, p.category, p.likes, p.created_at,
         COALESCE(u.name,'알 수 없음') AS author
       FROM post_scraps s JOIN posts p ON s.post_id=p.id LEFT JOIN users u ON p.user_id=u.id
       WHERE s.user_id=? ORDER BY p.created_at DESC`,
      [userId],
    )
    return res.json(rows)
  } catch (e) {
    return res.json([])
  }
})

/* ─────────────────────────────────────────
   GET  /posts/:id/comments  — 댓글 목록
   POST /posts/:id/comments  — 댓글 작성
───────────────────────────────────────── */
router.get('/:id/comments', async (req: Request, res: Response) => {
  try {
    const postId = req.params.id
    let myUserId: any = null
    let isAdmin = false
    let mySchoolCode: string | null = null

    const auth = req.headers.authorization
    if (auth) {
      try {
        const decoded: any = jwt.verify(auth.replace('Bearer ', ''), env.JWT_SECRET)
        myUserId = decoded.id; isAdmin = decoded.level === 'admin'; mySchoolCode = decoded.school_code
      } catch { }
    }

    const adminFilter = isAdmin ? '' : `AND c.is_hidden=0 AND (c.school_code IS NULL OR c.school_code=?)`
    const params = isAdmin ? [myUserId ?? -1, postId] : [myUserId ?? -1, postId, mySchoolCode]

    const [rows]: any = await db.query(
      `SELECT c.id, c.content, c.author, c.parent_id, c.user_id, c.created_at, c.is_deleted,
         COUNT(cl.id) AS likes, MAX(cl.user_id=?) AS likedByMe
       FROM post_comments c LEFT JOIN comment_likes cl ON c.id=cl.comment_id
       WHERE c.post_id=? ${adminFilter}
       GROUP BY c.id, c.content, c.author, c.parent_id, c.user_id, c.created_at
       ORDER BY c.created_at ASC`,
      params,
    )

    return res.json(rows.map((c: any) => ({
      id: c.id, content: c.content, is_deleted: !!c.is_deleted,
      author: c.author, parent: c.parent_id, user_id: c.user_id,
      created_at: c.created_at, likes: Number(c.likes), likedByMe: !!c.likedByMe,
    })))
  } catch (e) {
    return res.json([])
  }
})

router.post('/:id/comments', requireAuth, async (req: Request, res: Response) => {
  try {
    const postId = req.params.id
    const userId = req.user!.userId
    const { content, parent } = req.body

    if (!content) return res.status(400).json({ message: 'content required' })

    const { banned, message, user } = await checkBanStats(userId)
    if (banned) return res.status(403).json({ message })

    const isAdmin = user?.level === 'admin'
    const commentAuthor = isAdmin ? '관리자' : user?.name

    const [postRows]: any = await db.query(
      `SELECT p.user_id, p.category, u.level AS author_level FROM posts p JOIN users u ON p.user_id=u.id WHERE p.id=?`,
      [postId],
    )
    if (!postRows.length) return res.status(404).json({ message: '게시글 없음' })
    const post = postRows[0]

    // 관리자 게시판 권한 체크
    if (post.category === 'admin') {
      const isAuthor = post.user_id == userId
      const postAuthorIsAdmin = post.author_level === 'admin'
      if (!postAuthorIsAdmin && !isAuthor && !isAdmin) {
        return res.status(403).json({ message: '작성자 또는 관리자만 댓글을 작성할 수 있습니다.' })
      }
    }

    // school_code 결정
    let commentSchoolCode: string | null = null
    const [userRows]: any = await db.query(`SELECT school_code FROM users WHERE id=?`, [userId])
    const mySchoolCode = userRows[0]?.school_code ?? null

    if (post.category === 'admin') {
      if (post.author_level === 'admin') {
        commentSchoolCode = isAdmin ? null : mySchoolCode
      } else {
        const [postAuthorRows]: any = await db.query(`SELECT school_code FROM users WHERE id=?`, [post.user_id])
        commentSchoolCode = postAuthorRows[0]?.school_code ?? null
      }
    } else {
      commentSchoolCode = mySchoolCode
    }

    const id = crypto.randomUUID()
    await db.query(
      `INSERT INTO post_comments (id, post_id, user_id, author, content, parent_id, school_code) VALUES (?,?,?,?,?,?,?)`,
      [id, postId, userId, commentAuthor, content, parent ?? null, commentSchoolCode],
    )

    const [postInfoRows]: any = await db.query(`SELECT title FROM posts WHERE id=?`, [postId])
    const postTitle = postInfoRows[0]?.title ?? ''

    // 알림들
    if (!parent && post.user_id != userId) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, link) VALUES (?,?,?,?,?)`,
        [post.user_id, 'post_commented', '💬 내 게시글에 댓글', `"${postTitle}" 글에 새로운 댓글이 달렸습니다.`, `/board/post/${postId}`],
      )
    }

    if (!parent && post.author_level === 'admin' && !isAdmin) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, link) VALUES (?,?,?,?,?)`,
        [post.user_id, 'admin_post_commented', '💬 내 게시글에 댓글', `"${postTitle}" 글에 새로운 댓글이 달렸습니다.`, `/board/post/${postId}`],
      )
    }

    if (parent) {
      const [parentRows]: any = await db.query(
        `SELECT c.id, c.content, c.user_id, u.level FROM post_comments c JOIN users u ON c.user_id=u.id WHERE c.id=?`,
        [parent],
      )
      const parentComment = parentRows[0] ?? null
      if (parentComment && parentComment.user_id != userId) {
        const preview = parentComment.content.length > 30 ? parentComment.content.slice(0, 30) + '...' : parentComment.content
        await db.query(
          `INSERT INTO notifications (user_id, type, title, message, link) VALUES (?,?,?,?,?)`,
          [parentComment.user_id, 'comment_reply', '↪ 내 댓글에 답글', `내 댓글 "${preview}"에 답글이 달렸습니다.`, `/board/post/${postId}#comment-${parentComment.id}`],
        )
      }
    }

    if (post.category === 'admin' && post.author_level !== 'admin' && !isAdmin) {
      const [admins]: any = await db.query(`SELECT id FROM users WHERE level='admin'`)
      if (admins.length > 0) {
        const values = admins.map((a: any) => [a.id, 'admin_question_followup', '📩 관리자 문의 추가 댓글',
          `"${postTitle}" 문의글에 새로운 댓글이 추가되었습니다.`, `/board/post/${postId}`])
        await db.query(`INSERT INTO notifications (user_id, type, title, message, link) VALUES ?`, [values])
      }
    }

    if (post.category === 'admin' && isAdmin && post.user_id != userId) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, link) VALUES (?,?,?,?,?)`,
        [post.user_id, 'admin_reply', '관리자 답변이 등록되었습니다', '질문하신 글에 관리자가 답변을 남겼습니다.', `/board/post/${postId}`],
      )
    }

    return res.json({ id, content, author: commentAuthor, parent: parent ?? null, user_id: userId, created_at: new Date().toISOString(), likes: 0, likedByMe: false })
  } catch (e) {
    console.error('POST comments error', e)
    return res.status(500).json({ message: 'server error' })
  }
})

export default router
