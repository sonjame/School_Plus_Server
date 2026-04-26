import { Router, Request, Response } from 'express'
import db from '../db/mysql'
import { requireAuth } from '../middlewares/auth'

const router = Router()

/* GET /notifications */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const [rows]: any = await db.query(
      `SELECT id, type, title, message, link, is_read, created_at
       FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50`,
      [userId],
    )
    return res.json(rows.map((n: any) => ({
      id: n.id, type: n.type, title: n.title, message: n.message,
      link: n.link, isRead: !!n.is_read, created_at: n.created_at,
    })))
  } catch (e) {
    return res.json([])
  }
})

/* PATCH /notifications — 읽음 처리 */
router.patch('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const { notificationId } = req.body
    if (!notificationId) return res.status(400).json({ success: false })

    await db.query(`UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?`, [notificationId, userId])
    return res.json({ success: true })
  } catch (e) {
    return res.status(500).json({ success: false })
  }
})

/* GET /notifications/unread-count */
router.get('/unread-count', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const [rows]: any = await db.query(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND is_read=0`,
      [userId],
    )
    return res.json({ count: rows[0].count })
  } catch (e) {
    return res.json({ count: 0 })
  }
})

/* POST /notifications/delete */
router.post('/delete', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId
    const { notificationId } = req.body
    await db.query(`DELETE FROM notifications WHERE id=? AND user_id=?`, [notificationId, userId])
    return res.json({ success: true })
  } catch (e) {
    return res.status(500).json({ success: false })
  }
})

export default router
