import { Router, Request, Response } from 'express'
import db from '../db/mysql'
import { requireAuth } from '../middlewares/auth'
import { checkBanStats } from './posts.routes'

const router = Router()

/* PUT /comments/:id — 댓글 수정 */
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const commentId = req.params.id
    const { content } = req.body

    if (!content?.trim()) return res.status(400).json({ message: 'content required' })

    const { banned, message, user } = await checkBanStats(userId)
    if (banned) return res.status(403).json({ message })
    if (!user) return res.status(401).json({ message: 'User not found' })

    const [commentRows]: any = await db.query(`SELECT user_id FROM post_comments WHERE id=?`, [commentId])
    if (!commentRows.length) return res.status(404).json({ message: 'comment not found' })
    if (commentRows[0].user_id != userId) return res.status(403).json({ message: 'forbidden' })

    await db.query(`UPDATE post_comments SET content=? WHERE id=?`, [content, commentId])
    return res.json({ success: true })
  } catch (err) {
    return res.status(500).json({ message: 'server error' })
  }
})

/* DELETE /comments/:id — 댓글 삭제 */
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const commentId = req.params.id

    const { banned, message, user } = await checkBanStats(userId)
    if (banned) return res.status(403).json({ message })
    if (!user) return res.status(401).json({ message: 'User not found' })

    const [commentRows]: any = await db.query(`SELECT user_id FROM post_comments WHERE id=?`, [commentId])
    if (!commentRows.length) return res.status(404).json({ message: 'comment not found' })

    const isAdmin = user.level === 'admin'
    if (commentRows[0].user_id != userId && !isAdmin) return res.status(403).json({ message: 'forbidden' })

    await db.query(`DELETE FROM post_comments WHERE parent_id=?`, [commentId])
    await db.query(`DELETE FROM post_comments WHERE id=?`, [commentId])
    return res.json({ success: true })
  } catch (err) {
    return res.status(500).json({ message: 'server error' })
  }
})

/* POST /comments/:id/like — 댓글 좋아요 */
router.post('/:id/like', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const commentId = req.params.id

    const [exist]: any = await db.query(`SELECT id FROM comment_likes WHERE comment_id=? AND user_id=?`, [commentId, userId])
    if (exist.length) {
      await db.query(`DELETE FROM comment_likes WHERE comment_id=? AND user_id=?`, [commentId, userId])
    } else {
      await db.query(`INSERT INTO comment_likes (comment_id, user_id) VALUES (?,?)`, [commentId, userId])
    }
    const [countRows]: any = await db.query(`SELECT COUNT(*) AS count FROM comment_likes WHERE comment_id=?`, [commentId])
    return res.json({ likes: countRows[0].count })
  } catch (err) {
    return res.status(500).json({ message: 'server error' })
  }
})

export default router
